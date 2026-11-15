-- Q-2026-11-06-2: requests の管理者メモ（admin_memo）を、招待リンクの閲覧者（anon）の閲覧権限から外す
-- 2026-11-14 作成。元に戻すときは「管理者メモ非公開戻し_2026-11-14.sql」を実行する。
-- 順番: ①「管理者メモ非公開確認_2026-11-14.sql」 → ② この「変更」 → ① をもう一度 → 問題があれば ③「戻し」。
--
-- ■ 必ず、admin_memo を招待リンクの画面で読まない新しいアプリ（統合ブランチ improve/batch-2026-11-14）を
--   デプロイしてから実行する。古いアプリのまま実行すると、招待リンクのリクエスト一覧が権限エラーで出なくなる。
--
-- やること（全体が1つの DO ブロック。途中で失敗すれば何も変わらない）:
--   anon の requests の SELECT を、admin_memo を除く7列（id, requester_name, message, status, price_total, created_at, resolved_at）にする。
--   token はこれまでどおり読めない。管理者（authenticated）の権限は変えない。

do $$
begin
  revoke select on public.requests from anon;
  revoke select (admin_memo) on public.requests from anon;
  grant select (id, requester_name, message, status, price_total, created_at, resolved_at)
    on public.requests to anon;

  if has_column_privilege('anon', 'public.requests', 'admin_memo', 'SELECT') then
    raise exception '中止: anon がまだ admin_memo を読めます（public ロールへの権限が残っている可能性。何も変更していません）';
  end if;
  if has_column_privilege('anon', 'public.requests', 'token', 'SELECT') then
    raise exception '中止: anon が token を読めます（何も変更していません）';
  end if;
end;
$$;

-- 結果（読み取りのみ）: anon が読める requests の列（admin_memo と token がないこと）
select column_name as anon_が読める列
from information_schema.column_privileges
where table_schema = 'public' and table_name = 'requests' and grantee = 'anon' and privilege_type = 'SELECT'
order by column_name;
