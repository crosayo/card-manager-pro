-- Q-2026-11-06-6 の戻し: get_dashboard_stats・get_distinct_rarities の search_path の固定を外す（変更前の状態）
-- 2026-11-14 作成。ダッシュボードの集計やレアリティ一覧がエラーになるときなどに実行する。

do $$
begin
  alter function public.get_dashboard_stats() reset search_path;
  alter function public.get_distinct_rarities() reset search_path;
end;
$$;

-- 結果（読み取りのみ）: 2行とも設定が空
select p.proname as 関数, coalesce(array_to_string(p.proconfig, ', '), '') as 設定
from pg_proc p join pg_namespace n on n.oid = p.pronamespace
where n.nspname = 'public' and p.proname in ('get_dashboard_stats', 'get_distinct_rarities')
order by 1;
