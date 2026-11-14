-- Q-2026-11-06-5: 管理者のカード変更（D8）を1つの DB 関数 change_request_item_as_admin にまとめる
-- 2026-11-14 作成。元に戻すときは「カード変更関数戻し_2026-11-14.sql」を実行する。
-- 順番: ①「カード変更関数確認_2026-11-14.sql」 → ② この「変更」 → ① をもう一度 → アプリをデプロイ → 問題があれば ③「戻し」。
-- ■ 「管理者判定変更_2026-11-14.sql」（is_admin）を先に実行しておくこと。is_admin() がなければ何も変えずに中止する。
-- ■ 新しいアプリはこの関数を呼ぶので、アプリのデプロイより先に実行する（古いアプリはこの関数を使わないので、先に入れても影響なし）。
--
-- 以前は画面から「差し替え → 枚数変更 → 編集履歴 → 在庫の増減 → 在庫ログ」を順に呼んでいたため、途中で失敗すると
-- 在庫と明細が食い違った。この関数は全部を1つのトランザクションで行い、失敗すれば何も変わらない。
-- 関数を1つ追加するだけ（表・データ・既存の関数・権限は変えない）。全体が1つの DO ブロック。
-- supabase/schema.sql（13-6）と同じ定義。

do $$
begin
  if to_regprocedure('public.is_admin()') is null then
    raise exception '中止: is_admin() がありません。先に「管理者判定変更_2026-11-14.sql」を実行してください（何も変更していません）';
  end if;

  create or replace function public.change_request_item_as_admin(p_request_item_id bigint, p_new_item_id bigint, p_quantity integer)
  returns bigint
  language plpgsql
  security definer
  set search_path = public, pg_temp
  as $fn$
  declare
    v_req record;
    v_ri record;
    v_old record;
    v_new record;
    v_adj record;
    v_stock integer;
  begin
    if not public.is_admin() then
      raise exception '権限エラー: 管理者のみ実行できます' using errcode = '42501';
    end if;
    if p_quantity is null or p_quantity < 1 then
      raise exception '枚数は1以上で指定してください' using errcode = '22023';
    end if;

    select ri.id, ri.request_id, ri.item_id, ri.quantity into v_ri
    from public.request_items ri where ri.id = p_request_item_id
    for update;
    if not found then
      raise exception '対象のカードがリクエストに見つかりません' using errcode = '22023';
    end if;
    if v_ri.item_id is null then
      raise exception 'カードの明細だけ変更できます' using errcode = '22023';
    end if;
    select r.id, r.status into v_req from public.requests r where r.id = v_ri.request_id for update;

    select i.id, i.name, i.card_id, i.rarity into v_old from public.items i where i.id = v_ri.item_id;
    if not found then
      raise exception '元のカードが見つかりません（削除された可能性があります）' using errcode = '22023';
    end if;
    select i.id, i.name, i.card_id, i.rarity into v_new from public.items i where i.id = p_new_item_id;
    if not found or v_new.name is distinct from v_old.name then
      raise exception '同じカードの別型番・別レアリティのみ選択できます' using errcode = '22023';
    end if;

    if v_new.id = v_old.id and p_quantity = v_ri.quantity then
      return v_req.id;  -- 変更なし
    end if;

    update public.request_items set item_id = v_new.id, quantity = p_quantity where id = v_ri.id;

    if v_new.id <> v_old.id then
      insert into public.request_edit_logs (request_id, editor_name, field_changed, old_value, new_value)
      values (v_req.id, '管理者', 'カード変更',
              v_old.name || ' ' || coalesce(v_old.card_id, '') || ' ' || coalesce(v_old.rarity, ''),
              v_new.name || ' ' || coalesce(v_new.card_id, '') || ' ' || coalesce(v_new.rarity, ''));
    end if;
    if p_quantity <> v_ri.quantity then
      insert into public.request_edit_logs (request_id, editor_name, field_changed, old_value, new_value)
      values (v_req.id, '管理者', '数量', v_old.name || ': ' || v_ri.quantity || '枚', v_new.name || ': ' || p_quantity || '枚');
    end if;

    -- 完了済みなら、元のカードの在庫を戻し、変更先の在庫を減らす（同じカードなら枚数の差分だけ）。行は id 順にロックする
    if v_req.status = 'completed' then
      for v_adj in
        select a.item_id, sum(a.delta)::integer as delta
        from (values (v_old.id, v_ri.quantity), (v_new.id, -p_quantity)) as a(item_id, delta)
        group by a.item_id
        having sum(a.delta) <> 0
        order by a.item_id
      loop
        update public.items
        set stock = greatest(0, stock + v_adj.delta), updated_at = now()
        where id = v_adj.item_id
        returning stock into v_stock;
        insert into public.stock_logs (item_id, delta, stock_after, source, request_id, note)
        values (v_adj.item_id, v_adj.delta, v_stock, 'request', v_req.id, '完了済みリクエストの編集');
      end loop;
    end if;

    return v_req.id;
  end;
  $fn$;
  revoke execute on function public.change_request_item_as_admin(bigint, bigint, integer) from public, anon;
  grant execute on function public.change_request_item_as_admin(bigint, bigint, integer) to authenticated;
end;
$$;

-- 結果（読み取りのみ）: 関数ができ、anon は実行できず、authenticated は実行できること
select p.proname as 関数, p.prosecdef as security_definer,
       has_function_privilege('anon', p.oid, 'EXECUTE') as anon_実行可,
       has_function_privilege('authenticated', p.oid, 'EXECUTE') as authenticated_実行可
from pg_proc p join pg_namespace n on n.oid = p.pronamespace
where n.nspname = 'public' and p.proname = 'change_request_item_as_admin';
