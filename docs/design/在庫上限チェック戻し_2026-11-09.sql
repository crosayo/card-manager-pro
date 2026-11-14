-- B7 の戻し: 「在庫上限チェック変更_2026-11-09.sql」を実行する前の create_request に戻す（T-2026-11-04-B）
-- 2026-11-09 作成（2026-11-14 適用）。2026-11-08 時点の設定画面 SQL 13-1 と同じ定義。
-- 在庫が足りないのに送信できる元の動きに戻る。リクエスト送信でエラーが続くときなどに実行する。

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
    v_qty := (v_item->>'quantity')::integer;
    if v_qty is null or v_qty < 1 then
      raise exception '枚数は1以上で指定してください' using errcode = '22023';
    end if;
    if v_item->>'item_id' is null and v_item->>'supply_id' is null then
      raise exception 'リクエスト対象が指定されていません' using errcode = '22023';
    end if;
    insert into public.request_items (request_id, item_id, supply_id, quantity)
    values (v_request_id, (v_item->>'item_id')::bigint, (v_item->>'supply_id')::bigint, v_qty);
  end loop;

  return json_build_object('id', v_request_id, 'token', v_token);
end;
$$;
