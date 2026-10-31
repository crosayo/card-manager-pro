-- D3: requests・request_items・request_edit_logs の「Allow public insert」ポリシーの確認（読み取り専用）
-- 2026-10-31 作成。SELECT のみで、データ・設定は変更しない。
-- Supabase の SQL Editor で、上から1つずつ（または全部まとめて）実行し、各結果を貼ってください。

-- ① 3つの表のポリシー一覧（誰に・どの操作を・どの条件で許可しているか）
--    roles が {public} なら anon と authenticated の両方に効く。
--    with_check が true（または空）の INSERT ポリシーは、条件なしで追加できる。
select tablename, policyname, permissive, roles, cmd, qual, with_check
from pg_policies
where schemaname = 'public'
  and tablename in ('requests', 'request_items', 'request_edit_logs')
order by tablename, cmd, policyname;

-- ② RLS が有効か（relrowsecurity が true なら有効）
select c.relname as table_name, c.relrowsecurity as rls_enabled, c.relforcerowsecurity as rls_forced
from pg_class c
join pg_namespace n on n.oid = c.relnamespace
where n.nspname = 'public'
  and c.relname in ('requests', 'request_items', 'request_edit_logs')
order by c.relname;

-- ③ 表の権限（anon・authenticated に INSERT 権限があるか。権限がなければポリシーがあっても追加できない）
select table_name, grantee, string_agg(privilege_type, ', ' order by privilege_type) as privileges
from information_schema.role_table_grants
where table_schema = 'public'
  and table_name in ('requests', 'request_items', 'request_edit_logs')
  and grantee in ('anon', 'authenticated')
group by table_name, grantee
order by table_name, grantee;

-- ④ 申請者が使うDB関数が存在し、SECURITY DEFINER（RLSを迂回）で、anon が実行できるか
select p.proname as function_name,
       pg_get_function_identity_arguments(p.oid) as args,
       p.prosecdef as security_definer,
       has_function_privilege('anon', p.oid, 'EXECUTE') as anon_can_execute,
       has_function_privilege('authenticated', p.oid, 'EXECUTE') as authenticated_can_execute
from pg_proc p
join pg_namespace n on n.oid = p.pronamespace
where n.nspname = 'public'
  and p.proname in ('create_request', 'edit_request_by_token', 'swap_request_item_by_token', 'resolve_request_token')
order by p.proname;
