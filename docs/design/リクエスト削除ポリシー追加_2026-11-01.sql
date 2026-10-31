-- request_items・request_edit_logs に、管理者（authenticated）だけの DELETE ポリシーを追加する
-- 2026-11-01 作成。元に戻すときは「リクエスト削除ポリシー戻し_2026-11-01.sql」を実行する。
--
-- 背景（2026-11-01 の確認SQL ①の結果）:
--   - 2つの表に DELETE ポリシーがなく、authenticated に DELETE 権限はあっても RLS で0件になる。
--   - そのため、管理者がリクエスト管理の編集でカードを外すと、削除件数の不一致でエラーになる（api.ts の editRequestAsAdmin）。
--   - 申請者の編集（edit_request_by_token）は SECURITY DEFINER の DB関数なので、この変更とは無関係に動く。
--   - requests には「Authenticated users can delete requests」があり、リクエスト自体の削除は ON DELETE CASCADE で明細・履歴も消える。
--
-- 全体を1つのトランザクションで実行する（途中で失敗したら何も変わらない）。

begin;

create policy "Allow authenticated delete" on public.request_items
  for delete to authenticated using (true);
create policy "Allow authenticated delete" on public.request_edit_logs
  for delete to authenticated using (true);

commit;

-- 実行後の確認（読み取りのみ）: 3つの表に DELETE ポリシーが1行ずつ（すべて {authenticated}）あること
select tablename, policyname, roles, cmd, qual
from pg_policies
where schemaname = 'public'
  and tablename in ('requests', 'request_items', 'request_edit_logs')
  and cmd = 'DELETE'
order by tablename;
