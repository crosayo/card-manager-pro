-- D3 の戻し: 「リクエスト挿入ポリシー変更_2026-11-01.sql」を実行する前の状態に戻す
-- 2026-11-01 作成。リクエストの送信・編集で権限エラーが出たときなどに実行する。
--
-- ■ 注意（2026-11-14 追記。点検 2026-11-06 の指摘）: 実行すると、requests・request_items・request_edit_logs に
--   **条件なし（with check true）・全員（public。anon を含む）向けの INSERT ポリシー「Allow public insert」が復活する**。
--   いまは anon にこの3表の INSERT 権限がないため直接の追加はできないが、権限が付け直されると、招待リンクなしで
--   誰でもリクエストを作れるようになる。申請者の送信は DB関数 create_request 経由で、このポリシーは使わない。
--   権限エラーの原因がこのポリシーだと確かめられたときだけ実行し、終わったら変更SQLをもう一度実行して閉じる。
--   また、2026-11-14 の「管理者判定変更_2026-11-14.sql」のあとに実行すると、管理者判定（is_admin）を通らない
--   ポリシーができる。その場合は管理者判定の変更SQLをもう一度実行すると is_admin() に置き換わる。

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
