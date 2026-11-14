-- 全カード一括登録 第3段階（2026-11-14）。YGOJSON（MIT、データ日付 2026-04-07）由来の「まだ DB にない行」を在庫0で登録する。
--   取込表 public.bulk_import_items（7,268 行。Table Editor の CSV インポートで入れる）から、items に「同じ型番×レアリティの行がまだない」ものだけを入れる。
--   新しいパック（products にない収録パック名、732 件の見込み）は products に足す（発売日つき、サイドバー表示はオフ）。
--   既存の行・在庫数には触れない。入れた行の id と足したパック名を maintenance.bulk_import_log に残し、戻しはこれを使う（在庫0・参照なしの行だけ消せる）。
-- 順番: ① N修正 → ② 一括登録準備 → CSV インポート → ③ 一括登録（この SQL）。
-- バッチ名: bulk-2026-11-14。取込表のチェック値: 行数 7268・seq 合計 26415546・md5 50ea9ac166322b2d531642e0a59ed1ae
-- ① 確認（読み取りのみ）。CSV インポートのあとに実行する。判定が「要確認」の行がないこと。「全体の行数」「全体の在庫合計」をメモする。
-- 取込表がまだない（準備を実行していない）と、この SQL はエラーになる。

with s as (select * from public.bulk_import_items),
exist as (select s.seq from s where exists (select 1 from public.items i where i.card_id = s.card_id and i.rarity = s.rarity)),
newcat as (select distinct s.category from s where not exists (select 1 from public.products p where p.name = s.category)),
cfg as (select coalesce((select array(select jsonb_array_elements_text(value)) from public.config where key = 'rarities'), '{}') as r),
near as (select n.category, p.name from newcat n join public.products p on p.name <> n.category and public.normalize_search(p.name) = public.normalize_search(n.category))
select 1 as 順, '全体の行数' as 項目, (select count(*) from public.items) as 件数, null::text as 詳細, 'メモ' as 判定
union all select 2, '全体の在庫合計', (select coalesce(sum(stock), 0) from public.items), null, 'メモ'
union all select 3, 'N修正・準備を実行済み',
  (select count(*) from maintenance.rarity_fix_log where batch = 'nfix-2026-11-14') + (select count(*) from maintenance.bulk_import_log where batch = 'prep-2026-11-14'), null,
  case when exists (select 1 from maintenance.rarity_fix_log where batch = 'nfix-2026-11-14') and exists (select 1 from maintenance.bulk_import_log where batch = 'prep-2026-11-14') then 'OK' else '要確認（順番）' end
union all select 4, 'このバッチの実行記録（0 であること）', (select count(*) from maintenance.bulk_import_log where batch = 'bulk-2026-11-14'), null,
  case when (select count(*) from maintenance.bulk_import_log where batch = 'bulk-2026-11-14') = 0 then 'OK' else '要確認' end
union all select 5, '取込表の行数（7268 であること）', (select count(*) from public.bulk_import_items), null, case when (select count(*) from public.bulk_import_items) = 7268 then 'OK' else '要確認（CSV インポートをやり直す）' end
union all select 6, '取込表の中身のチェック値（md5）', null, (select md5(string_agg(concat_ws('|', seq, name, card_id, rarity, category, coalesce(pack_release_date, '')), E'\n' order by seq)) from public.bulk_import_items),
  case when (select md5(string_agg(concat_ws('|', seq, name, card_id, rarity, category, coalesce(pack_release_date, '')), E'\n' order by seq)) from public.bulk_import_items) = '50ea9ac166322b2d531642e0a59ed1ae' then 'OK' else '要確認（CSV が書き換わった・文字化け）' end
union all select 7, 'すでに items にある行（入れずに飛ばす）', (select count(*) from exist), null, case when (select count(*) from exist) = 0 then 'OK' else '参考（前回確認後に登録された分）' end
union all select 8, '新しく入る行', (select count(*) from public.bulk_import_items) - (select count(*) from exist), null, 'メモ'
union all select 9, '新しく足すパック（products）', (select count(*) from newcat), null, 'メモ'
union all select 10, 'レアリティ設定（config.rarities）にないコード', (select count(*) from s, cfg where not (s.rarity = any(cfg.r))),
  (select string_agg(distinct s.rarity, ', ') from s, cfg where not (s.rarity = any(cfg.r))),
  case when (select count(*) from s, cfg where not (s.rarity = any(cfg.r))) = 0 then 'OK' else '要確認' end
union all select 11, '新しいパック名が既存のパックと記号・空白・かなの違いだけ', (select count(*) from near),
  (select string_agg(category || ' ≒ ' || name, ' / ') from (select * from near limit 20) t),
  case when (select count(*) from near) = 0 then 'OK' else '要確認（名前をそろえるか判断）' end
order by 1;
