-- 全カード一括登録の準備（2026-11-14）。企画書「全カード・全パックの一括登録」の「必要な改修」の DB 部分。
--   1. 一意索引の前提を整える: 型番欄の誤り 4 行を直す（「none」「None」→ 空、型番のあとにパック名が続いた1行 → 型番だけ）。型番修正一覧.csv。
--   2. 一意索引 items_card_rarity_category_key（型番×レアリティ×収録パック。型番が空の行はカード名で区別）。同じ行を二重に入れられなくなる（P-1-03）。
--   3. 検索の索引（pg_trgm。P-1-05）: 拡張 pg_trgm と、search_key の GIN 索引。今の search_items は strpos で探すため索引を使えないので、
--      索引を使える条件（3文字以上でいちばん長い検索語の LIKE。今の条件の一部なので結果は同じ）を1つ足し、plan_cache_mode を force_custom_plan にする。
--      関数の他の部分は本番の今の定義をそのまま使う（書き換え前の定義は記録表に保存し、戻しで元に戻す）。
--   4. 投入用の取込表 public.bulk_import_items を作る（RLS 有効・ポリシーなし＝API からは読めない。一括登録の変更 SQL の最後に削除する）。
-- 順番: ① N修正 → ② 一括登録準備（この SQL）→ ③ 一括登録。
-- バッチ名: prep-2026-11-14（maintenance.bulk_import_log に記録し、戻しはこの記録を使う）。
-- ③ 戻し。② の変更を記録（バッチ prep-2026-11-14）を使って元に戻す: 取込表の削除、索引2つの削除、search_items を元の定義に、
--    pg_trgm を（② で入れた場合だけ）外す、型番を元に戻す。ファイルの中身をすべて貼り付けて1回で実行する。
-- 一括登録（③）を実行済みなら、先に「一括登録戻し」を実行すること（中止する）。

do $body$
declare
  bad text; v jsonb; n_before bigint; s_before bigint; n_now bigint; s_now bigint;
begin
  if not exists (select 1 from maintenance.bulk_import_log where batch = 'prep-2026-11-14') then
    raise exception 'バッチ prep-2026-11-14 の記録がないので中止';
  end if;
  if exists (select 1 from maintenance.bulk_import_log where batch = 'bulk-2026-11-14') then
    raise exception '一括登録（bulk-2026-11-14）が実行済みです。先に「一括登録戻し」を実行してください';
  end if;
  select count(*), coalesce(sum(stock), 0) into n_before, s_before from public.items;

  select string_agg(l.item_id::text, ', ') into bad from maintenance.bulk_import_log l left join public.items i on i.id = l.item_id
  where l.batch = 'prep-2026-11-14' and l.step = 'cardid' and (i.id is null or i.card_id is distinct from l.new_value->>'card_id');
  if bad is not null then raise exception '② のあとに型番が変わった行があるので中止: %', bad; end if;

  drop table if exists public.bulk_import_items;
  drop index if exists public.items_search_key_trgm;
  drop index if exists public.items_card_rarity_category_key;

  select old_value into v from maintenance.bulk_import_log where batch = 'prep-2026-11-14' and step = 'function';
  if v is not null then execute v->>'def'; end if;

  select new_value into v from maintenance.bulk_import_log where batch = 'prep-2026-11-14' and step = 'extension';
  if v is not null and (v->>'created')::boolean then drop extension if exists pg_trgm; end if;

  -- 型番を戻す（重複を避けるため、索引を外したあとに行う）
  update public.items i set card_id = l.old_value->>'card_id'
  from maintenance.bulk_import_log l where l.batch = 'prep-2026-11-14' and l.step = 'cardid' and i.id = l.item_id;

  select count(*), coalesce(sum(stock), 0) into n_now, s_now from public.items;
  if n_now <> n_before or s_now <> s_before then raise exception '行数か在庫合計が変わった'; end if;

  update maintenance.bulk_import_log set batch = batch || '-rolled-back-' || to_char(now(), 'YYYYMMDDHH24MISS')
  where batch = 'prep-2026-11-14';
  raise notice '戻し完了: 行数 %・在庫合計 %（変わらず）', n_now, s_now;
end
$body$;

select '全体の行数' as 項目, count(*)::text as 値 from public.items
union all select '全体の在庫合計', coalesce(sum(stock), 0)::text from public.items
union all select '索引（残っていないこと）', coalesce(string_agg(indexname, ', '), 'なし') from pg_indexes
  where schemaname = 'public' and indexname in ('items_card_rarity_category_key', 'items_search_key_trgm');
