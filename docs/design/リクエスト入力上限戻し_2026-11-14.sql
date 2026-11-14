-- Q-2026-11-06-3 の戻し: 「リクエスト入力上限変更_2026-11-14.sql」を実行する前の create_request（B7 の定義）と edit_request_by_token に戻す
-- 2026-11-14 作成。リクエストの送信・編集が「…文字以内」「…件まで」で通らず困るときなどに実行する。
-- 戻しても B7（在庫上限チェック）は残る。B7 も戻すときは、このあとに「在庫上限チェック戻し_2026-11-09.sql」を実行する。
-- 全体が1つの DO ブロックなので、失敗すれば何も変わらない。

do $$
begin
  create or replace function public.create_request(p_requester_name text, p_message text, p_items jsonb)
  returns json
  language plpgsql
  security definer
  set search_path = public
  as $fn$
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
  $fn$;

  create or replace function public.edit_request_by_token(
    p_token text,
    p_message text default null,
    p_item_changes jsonb default null,
    p_remove_item_ids bigint[] default null
  )
  returns bigint
  language plpgsql
  security definer
  set search_path = public
  as $fn$
  declare
    v_req record;
    v_change jsonb;
    v_old record;
    v_qty integer;
    v_new_message text;
    v_remove_id bigint;
  begin
    if not public.can_view() then
      raise exception '招待リンクが無効か、有効期限が切れています' using errcode = '42501';
    end if;
    select id, requester_name, message, status into v_req
    from public.requests where token::text = p_token
    for update;
    if not found then
      raise exception '編集用リンクが無効です' using errcode = '42501';
    end if;
    if v_req.status <> 'pending' then
      raise exception '受付中のリクエストのみ編集できます' using errcode = '22023';
    end if;

    if p_message is not null then
      v_new_message := nullif(btrim(p_message), '');
      if v_new_message is distinct from v_req.message then
        update public.requests set message = v_new_message where id = v_req.id;
        insert into public.request_edit_logs (request_id, editor_name, field_changed, old_value, new_value)
        values (v_req.id, v_req.requester_name, 'メモ', v_req.message, v_new_message);
      end if;
    end if;

    if p_item_changes is not null then
      for v_change in select * from jsonb_array_elements(p_item_changes) loop
        v_qty := (v_change->>'quantity')::integer;
        if v_qty is null or v_qty < 1 then
          raise exception '枚数は1以上で指定してください' using errcode = '22023';
        end if;

        select ri.id, ri.quantity, coalesce(i.name, s.name, '不明') as name into v_old
        from public.request_items ri
        left join public.items i on i.id = ri.item_id
        left join public.supplies s on s.id = ri.supply_id
        where ri.id = (v_change->>'request_item_id')::bigint and ri.request_id = v_req.id;
        if not found then
          raise exception '対象のカードがこのリクエストに見つかりません' using errcode = '22023';
        end if;

        if v_old.quantity <> v_qty then
          update public.request_items set quantity = v_qty where id = v_old.id;
          insert into public.request_edit_logs (request_id, editor_name, field_changed, old_value, new_value)
          values (v_req.id, v_req.requester_name, '数量',
                  v_old.name || ': ' || v_old.quantity || '枚', v_old.name || ': ' || v_qty || '枚');
        end if;
      end loop;
    end if;

    if p_remove_item_ids is not null and array_length(p_remove_item_ids, 1) > 0 then
      -- すべてのカードを削除することはできない（その場合はキャンセルを依頼してもらう）
      if not exists (
        select 1 from public.request_items
        where request_id = v_req.id and not (id = any(p_remove_item_ids))
      ) then
        raise exception 'すべてのカードは削除できません。リクエスト自体を取り消す場合は管理者に連絡してください' using errcode = '22023';
      end if;

      foreach v_remove_id in array p_remove_item_ids loop
        select ri.id, ri.quantity, coalesce(i.name, s.name, '不明') as name into v_old
        from public.request_items ri
        left join public.items i on i.id = ri.item_id
        left join public.supplies s on s.id = ri.supply_id
        where ri.id = v_remove_id and ri.request_id = v_req.id;
        if not found then
          raise exception '対象のカードがこのリクエストに見つかりません' using errcode = '22023';
        end if;

        delete from public.request_items where id = v_old.id;
        insert into public.request_edit_logs (request_id, editor_name, field_changed, old_value, new_value)
        values (v_req.id, v_req.requester_name, '削除', v_old.name || ': ' || v_old.quantity || '枚', null);
      end loop;
    end if;

    return v_req.id;
  end;
  $fn$;
end;
$$;

-- 結果（読み取りのみ）: 2つの関数から上限のチェックが外れたこと（どちらも false）
select p.proname as 関数, p.prosrc like '%1000文字以内%' as 上限チェックあり
from pg_proc p join pg_namespace n on n.oid = p.pronamespace
where n.nspname = 'public' and p.proname in ('create_request', 'edit_request_by_token')
order by 1;
