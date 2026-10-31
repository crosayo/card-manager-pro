-- D3: requests・request_items・request_edit_logs の「Allow public insert」を、管理者（authenticated）だけの INSERT ポリシーに置き換える
-- 2026-11-01 作成。元に戻すときは「リクエスト挿入ポリシー戻し_2026-11-01.sql」を実行する。
--
-- 背景（2026-11-01 の確認SQLの結果）:
--   - 「Allow public insert」は roles {public}・with_check true（条件なし）。
--   - anon には3つの表とも INSERT 権限がないため、現状でも招待なしの直接追加はできない。権限が付け直されたときに開かないよう、ポリシーでも閉じる。
--   - 申請者の送信・編集・差し替えは DB関数（create_request・edit_request_by_token・swap_request_item_by_token。いずれも SECURITY DEFINER）経由のため、このポリシーは不要。
--   - 管理者は request_edit_logs（編集履歴）・request_items へ直接 INSERT するため、authenticated 用の INSERT ポリシーを代わりに作る。
--
-- 全体を1つのトランザクションで実行する（途中で失敗したら何も変わらない）。

begin;

drop policy if exists "Allow public insert" on public.requests;
drop policy if exists "Allow public insert" on public.request_items;
drop policy if exists "Allow public insert" on public.request_edit_logs;

create policy "Allow authenticated insert" on public.requests
  for insert to authenticated with check (true);
create policy "Allow authenticated insert" on public.request_items
  for insert to authenticated with check (true);
create policy "Allow authenticated insert" on public.request_edit_logs
  for insert to authenticated with check (true);

commit;

-- 実行後の確認（読み取りのみ）: INSERT ポリシーが「Allow authenticated insert」・roles {authenticated} の3行だけになっていること
select tablename, policyname, roles, cmd, with_check
from pg_policies
where schemaname = 'public'
  and tablename in ('requests', 'request_items', 'request_edit_logs')
  and cmd = 'INSERT'
order by tablename;
