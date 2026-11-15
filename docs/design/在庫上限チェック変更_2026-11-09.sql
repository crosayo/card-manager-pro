-- B7: リクエスト送信の DB 関数 create_request で、登録の前に在庫の上限を確かめる（T-2026-11-04-B）
-- 2026-11-09 作成（2026-11-14 適用）。元に戻すときは「在庫上限チェック戻し_2026-11-09.sql」を実行する。
-- 順番: ①「在庫上限チェック確認_2026-11-09.sql」 → ② この「変更」 → ① をもう一度 → 問題があれば ③「戻し」。
--
-- カード: 明細をカードごとに合計し、「在庫 − 受付中の枚数」（fetchPendingQuantities と同じ数え方）を超えたら送信全体を取り消す。
-- サプライ: 在庫数まで（受付中の枚数は引かない。05 B8・2026-11-01 のオーナー判断）。
-- 同時送信: 対象の items・supplies の行を id 順に FOR UPDATE でロックしてから数える。
-- 関数の置き換え 1 文だけ（表・データ・権限は変えない）。失敗すれば何も変わらない。
-- 設定画面の SQL（13-1）と同じ定義。

create or replace function public.create_request(p_requester_name text, p_message text, p_items jsonb)
returns json
language plpgsql
security definer
set search_path = public
as $$
declare
  v_request_id bigint;
  v_token text;
  v_item jsonb;
  v_qty integer;
  v_need record;
  v_stock integer;
  v_name text;
  v_pending integer;
begin
  if not public.can_view() then
    raise exception '招待リンクが無効か、有効期限が切れています' using errcode = '42501';
  end if;
  if coalesce(btrim(p_requester_name), '') = '' then
    raise exception 'お名前を入力してください' using errcode = '22023';
  end if;
  if p_items is null or jsonb_typeof(p_items) <> 'array' or jsonb_array_length(p_items) = 0 then
    raise exception 'リクエストするカードがありません' using errcode = '22023';
  end if;

  -- B7: 在庫の上限を確かめる（登録の前に、明細をカード・サプライごとに合計して判定する）
  for v_item in select * from jsonb_array_elements(p_items) loop
    v_qty := (v_item->>'quantity')::integer;
    if v_qty is null or v_qty < 1 then
      raise exception '枚数は1以上で指定してください' using errcode = '22023';
    end if;
    if v_item->>'item_id' is null and v_item->>'supply_id' is null then
      raise exception 'リクエスト対象が指定されていません' using errcode = '22023';
    end if;
  end loop;

  -- カード: 在庫 − 受付中の枚数（fetchPendingQuantities と同じ数え方）を超えないこと
  -- 同時に送信されても上限を超えないよう、対象のカード行を id 順にロックしてから数える
  for v_need in
    select (e->>'item_id')::bigint as item_id, sum((e->>'quantity')::integer) as qty
    from jsonb_array_elements(p_items) e
    where e->>'item_id' is not null
    group by 1
    order by 1
  loop
    select i.stock, i.name into v_stock, v_name
    from public.items i where i.id = v_need.item_id
    for update;
    if not found then
      raise exception 'リクエストしたカードが見つかりません（削除された可能性があります）' using errcode = '22023';
    end if;
    select coalesce(sum(ri.quantity), 0) into v_pending
    from public.request_items ri
    join public.requests r on r.id = ri.request_id
    where ri.item_id = v_need.item_id and r.status = 'pending';
    if v_need.qty > greatest(coalesce(v_stock, 0) - v_pending, 0) then
      raise exception '在庫が足りません: % （リクエストできるのは残り %枚）',
        v_name, greatest(coalesce(v_stock, 0) - v_pending, 0) using errcode = '22023';
    end if;
  end loop;

  -- サプライ: 在庫数まで（受付中の枚数は引かない。05 B8・2026-11-01 のオーナー判断）
  for v_need in
    select (e->>'supply_id')::bigint as supply_id, sum((e->>'quantity')::integer) as qty
    from jsonb_array_elements(p_items) e
    where e->>'supply_id' is not null
    group by 1
    order by 1
  loop
    select s.stock, s.name into v_stock, v_name
    from public.supplies s where s.id = v_need.supply_id
    for update;
    if not found then
      raise exception 'リクエストしたサプライが見つかりません（削除された可能性があります）' using errcode = '22023';
    end if;
    if v_need.qty > greatest(coalesce(v_stock, 0), 0) then
      raise exception '在庫が足りません: % （在庫は %個）',
        v_name, greatest(coalesce(v_stock, 0), 0) using errcode = '22023';
    end if;
  end loop;

  insert into public.requests (requester_name, message)
  values (btrim(p_requester_name), nullif(btrim(coalesce(p_message, '')), ''))
  returning id, token::text into v_request_id, v_token;

  -- 既存の token 列にデフォルト値が無い環境向け
  if v_token is null then
    update public.requests set token = gen_random_uuid()
    where id = v_request_id
    returning token::text into v_token;
  end if;

  for v_item in select * from jsonb_array_elements(p_items) loop
    insert into public.request_items (request_id, item_id, supply_id, quantity)
    values (v_request_id, (v_item->>'item_id')::bigint, (v_item->>'supply_id')::bigint, (v_item->>'quantity')::integer);
  end loop;

  return json_build_object('id', v_request_id, 'token', v_token);
end;
$$;
