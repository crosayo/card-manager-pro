-- 「リクエスト削除ポリシー追加_2026-11-01.sql」の戻し: 追加した DELETE ポリシーを消して、実行前の状態に戻す
-- 2026-11-01 作成。

begin;

drop policy if exists "Allow authenticated delete" on public.request_items;
drop policy if exists "Allow authenticated delete" on public.request_edit_logs;

commit;

-- 実行後の確認（読み取りのみ）: DELETE ポリシーが requests の「Authenticated users can delete requests」1行だけに戻っていること
select tablename, policyname, roles, cmd, qual
from pg_policies
where schemaname = 'public'
  and tablename in ('requests', 'request_items', 'request_edit_logs')
  and cmd = 'DELETE'
order by tablename;
