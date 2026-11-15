-- Q-2026-11-06-5: 管理者のカード変更の DB 関数（change_request_item_as_admin）の確認。読み取りのみ。何も変更しない。
-- 2026-11-14 作成。「カード変更関数変更_2026-11-14.sql」の前と後に実行する。
-- Supabase の SQL エディタは最後の結果しか表示しないため、1つの SELECT で「項目・件数・詳細・判定」の表を1つ返す。
-- 見るところ:
--   - 変更前: 「1.」が 1（is_admin がある）、「2.」が 0。
--   - 変更後: 「2.」〜「4.」が OK。
--   - 「5.」は参考（完了済みリクエストのカード変更で付く在庫ログの件数。変更の前後で、カード変更をしていなければ同じ）。

with fn as (
  select p.oid, p.prosecdef, p.proconfig
  from pg_proc p join pg_namespace n on n.oid = p.pronamespace
  where n.nspname = 'public' and p.proname = 'change_request_item_as_admin'
)
select '1. is_admin() があるか（先に 管理者判定変更 を実行）' as 項目,
       case when to_regprocedure('public.is_admin()') is null then 0 else 1 end as 件数,
       '1 であること' as 詳細,
       case when to_regprocedure('public.is_admin()') is null then '要確認' else 'OK' end as 判定
union all
select '2. change_request_item_as_admin',
       (select count(*) from fn),
       '変更前は 0、変更後は 1',
       case when (select count(*) from fn) = 1 then 'OK' else '参考（変更前）' end
union all
select '3. SECURITY DEFINER・search_path 固定',
       (select count(*) from fn where prosecdef and array_to_string(proconfig, ',') like 'search_path=%'),
       '変更後は 1',
       case when (select count(*) from fn where prosecdef and array_to_string(proconfig, ',') like 'search_path=%') = 1 then 'OK' else '参考（変更前）' end
union all
select '4. anon は実行できない',
       (select count(*) from fn where has_function_privilege('anon', oid, 'EXECUTE')),
       '0 であること',
       case when (select count(*) from fn where has_function_privilege('anon', oid, 'EXECUTE')) = 0 then 'OK' else '要確認' end
union all
select '5. 完了済みリクエストの編集による在庫ログ',
       (select count(*) from public.stock_logs where note = '完了済みリクエストの編集'),
       '参考',
       '参考';
