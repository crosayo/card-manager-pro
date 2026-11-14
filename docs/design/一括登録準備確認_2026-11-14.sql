-- 全カード一括登録の準備（2026-11-14）。企画書「全カード・全パックの一括登録」の「必要な改修」の DB 部分。
--   1. 一意索引の前提を整える: 型番欄の誤り 4 行を直す（「none」「None」→ 空、型番のあとにパック名が続いた1行 → 型番だけ）。型番修正一覧.csv。
--   2. 一意索引 items_card_rarity_category_key（型番×レアリティ×収録パック。型番が空の行はカード名で区別）。同じ行を二重に入れられなくなる（P-1-03）。
--   3. 検索の索引（pg_trgm。P-1-05）: 拡張 pg_trgm と、search_key の GIN 索引。今の search_items は strpos で探すため索引を使えないので、
--      索引を使える条件（3文字以上でいちばん長い検索語の LIKE。今の条件の一部なので結果は同じ）を1つ足し、plan_cache_mode を force_custom_plan にする。
--      関数の他の部分は本番の今の定義をそのまま使う（書き換え前の定義は記録表に保存し、戻しで元に戻す）。
--   4. 投入用の取込表 public.bulk_import_items を作る（RLS 有効・ポリシーなし＝API からは読めない。一括登録の変更 SQL の最後に削除する）。
-- 順番: ① N修正 → ② 一括登録準備（この SQL）→ ③ 一括登録。
-- バッチ名: prep-2026-11-14（maintenance.bulk_import_log に記録し、戻しはこの記録を使う）。
-- ① 確認（読み取りのみ）。判定が「要確認」の行がないこと。

with fix(id, old_card_id, new_card_id) as (values
    (107159, 'none', ''),
    (107270, 'none', ''),
    (107300, '23TP-JP212 トーナメントパック 2023 Vol.2', '23TP-JP212'),
    (108798, 'None', '')),
fix_bad as (select f.id from fix f left join public.items i on i.id = f.id where i.id is null or i.card_id is distinct from f.old_card_id),
after as (
  select i.id, coalesce(nullif(coalesce(f.new_card_id, i.card_id), ''), '名前:' || i.name) as k, coalesce(i.rarity, '') as r, coalesce(i.category, '') as c
  from public.items i left join fix f on f.id = i.id),
dup as (select k, r, c, count(*) n from after group by k, r, c having count(*) > 1),
fn as (select pg_get_functiondef(p.oid) as def from pg_proc p join pg_namespace n on n.oid = p.pronamespace
       where n.nspname = 'public' and p.proname = 'search_items')
select 1 as 順, '全体の行数' as 項目, (select count(*) from public.items) as 件数, null::text as 詳細, 'メモ' as 判定
union all select 2, '全体の在庫合計', (select coalesce(sum(stock), 0) from public.items), null, 'メモ'
union all select 3, 'N修正（nfix-2026-11-14）を実行済み', (select count(*) from maintenance.rarity_fix_log where batch = 'nfix-2026-11-14'), null,
  case when exists (select 1 from maintenance.rarity_fix_log where batch = 'nfix-2026-11-14') then 'OK' else '要確認（先に N修正）' end
union all select 4, 'このバッチの実行記録（0 であること）',
  (select count(*) from pg_tables where schemaname = 'maintenance' and tablename = 'bulk_import_log'),
  case when to_regclass('maintenance.bulk_import_log') is null then '記録表なし（初回）' else '記録表あり' end, '参考'
union all select 5, '型番を直す行が想定と違う（4行中）', (select count(*) from fix_bad), (select string_agg(id::text, ', ') from fix_bad),
  case when (select count(*) from fix_bad) = 0 then 'OK' else '要確認' end
union all select 6, '直したあとも残る重複（一意索引を作れない組）', (select count(*) from dup),
  (select string_agg(k || ' ' || r || ' ' || c || ' ×' || n, ' / ') from (select * from dup limit 20) t),
  case when (select count(*) from dup) = 0 then 'OK' else '要確認' end
union all select 7, '一意索引がすでにある', (select count(*) from pg_indexes where schemaname = 'public' and indexname = 'items_card_rarity_category_key'), null,
  case when (select count(*) from pg_indexes where schemaname = 'public' and indexname = 'items_card_rarity_category_key') = 0 then 'OK' else '要確認' end
union all select 8, 'pg_trgm（入っていれば入れたスキーマ）', (select count(*) from pg_extension where extname = 'pg_trgm'),
  (select n.nspname from pg_extension e join pg_namespace n on n.oid = e.extnamespace where e.extname = 'pg_trgm'), '参考'
union all select 9, 'search_items の書き換え箇所（1 であること）', (select count(*) from fn),
  (select case when def ~ 'strpos\(i\.search_key, tok\) = 0\s*\)' then 'あり' else 'なし' end from fn),
  case when (select count(*) from fn) = 1 and (select def ~ 'strpos\(i\.search_key, tok\) = 0\s*\)' and def !~ 'v_like' from fn) then 'OK' else '要確認' end
union all select 10, '取込表 public.bulk_import_items がすでにある', (select count(*) from pg_tables where schemaname = 'public' and tablename = 'bulk_import_items'), null,
  case when to_regclass('public.bulk_import_items') is null then 'OK' else '要確認' end
order by 1;
