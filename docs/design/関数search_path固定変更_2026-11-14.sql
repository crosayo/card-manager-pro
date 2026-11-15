-- Q-2026-11-06-6: SECURITY DEFINER の get_dashboard_stats・get_distinct_rarities に search_path を固定する
-- 2026-11-14 作成。元に戻すときは「関数search_path固定戻し_2026-11-14.sql」を実行する。
-- 順番: ①「関数search_path固定確認_2026-11-14.sql」 → ② この「変更」 → ① をもう一度 → 問題があれば ③「戻し」。
-- 関数の中身は変えず、設定（search_path = public, pg_temp）だけを足す。表は public. で修飾済みなので動きは変わらない。
-- アプリのデプロイとは無関係（前後どちらでもよい）。全体が1つの DO ブロック。supabase/schema.sql（6・8）と同じ。

do $$
begin
  alter function public.get_dashboard_stats() set search_path = public, pg_temp;
  alter function public.get_distinct_rarities() set search_path = public, pg_temp;
end;
$$;

-- 結果（読み取りのみ）: 2行とも search_path=public, pg_temp
select p.proname as 関数, array_to_string(p.proconfig, ', ') as 設定
from pg_proc p join pg_namespace n on n.oid = p.pronamespace
where n.nspname = 'public' and p.proname in ('get_dashboard_stats', 'get_distinct_rarities')
order by 1;
