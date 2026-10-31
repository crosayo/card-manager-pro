-- D3 の戻し: 「リクエスト挿入ポリシー変更_2026-11-01.sql」を実行する前の状態に戻す
-- 2026-11-01 作成。リクエストの送信・編集で権限エラーが出たときなどに実行する。

begin;

drop policy if exists "Allow authenticated insert" on public.requests;
drop policy if exists "Allow authenticated insert" on public.request_items;
drop policy if exists "Allow authenticated insert" on public.request_edit_logs;

create policy "Allow public insert" on public.requests
  for insert to public with check (true);
create policy "Allow public insert" on public.request_items
  for insert to public with check (true);
create policy "Allow public insert" on public.request_edit_logs
  for insert to public with check (true);

commit;

-- 実行後の確認（読み取りのみ）: INSERT ポリシーが「Allow public insert」・roles {public}・with_check true の3行に戻っていること
select tablename, policyname, roles, cmd, with_check
from pg_policies
where schemaname = 'public'
  and tablename in ('requests', 'request_items', 'request_edit_logs')
  and cmd = 'INSERT'
order by tablename;
