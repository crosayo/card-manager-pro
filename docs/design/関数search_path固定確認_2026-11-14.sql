-- Q-2026-11-06-6: SECURITY DEFINER 関数の search_path 固定の確認。読み取りのみ。何も変更しない。
-- 2026-11-14 作成。「関数search_path固定変更_2026-11-14.sql」の前と後に実行する。
-- 見るところ: public の SECURITY DEFINER 関数の一覧。「search_path」が空の行がないこと（変更前は get_dashboard_stats・get_distinct_rarities の2行が空）。
-- 判定が「要確認」で、この2つ以外の関数が出たら報告してください（この変更SQLでは直さない）。

select p.proname as 関数,
       pg_get_function_identity_arguments(p.oid) as 引数,
       coalesce((select c from unnest(p.proconfig) c where c like 'search_path=%'), '') as search_path,
       case when exists (select 1 from unnest(p.proconfig) c where c like 'search_path=%') then 'OK'
            when p.proname in ('get_dashboard_stats', 'get_distinct_rarities') then '参考（変更前。この変更で固定する）'
            else '要確認' end as 判定
from pg_proc p
join pg_namespace n on n.oid = p.pronamespace
where n.nspname = 'public' and p.prosecdef
order by 4 desc, 1;
