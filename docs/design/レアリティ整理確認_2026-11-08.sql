-- レアリティ整理（2026-11-08）。公式カードデータベース（遊戯王ニューロン）の略号にそろえる。
-- 対応表と経緯: Docs「レアリティ整理表（公式カードデータベース基準）」、03_改修ログ.md の 2026-11-08。
-- 順番: ①「レアリティ整理確認_2026-11-08.sql」 → ② この「変更」 → 問題があれば ③「戻し」。
-- バッチ名: rarity-2026-11-08（maintenance.rarity_fix_log に1行ずつ記録し、戻しはこの記録を使う）。
-- ① 確認（読み取りのみ。何も変更しない）。begin〜rollback の中で一時表だけ作る。
-- 見るところ:
--   A. 全体の行数と在庫合計（変更後に同じ在庫合計になることを確かめるため、メモしておく）
--   B. 個別に直す行が、想定どおりのレアリティで残っているか（「想定と違う」が0行であること）
--   C. まとめる行（src）と残す行（dst）が両方あるか、在庫と参照の件数
--   D. 置き換える表記ごとの行数
--   E. 置き換えると重複になる組（0行であること。出たら変更SQLは中止される）
--   F. 今のレアリティ設定（config.rarities）

begin;
create temp table _fix (id bigint primary key, expect_rarity text not null, new_rarity text not null, new_name text) on commit drop;
insert into _fix values
  (81820, 'P', 'P+UR', null),
  (81833, 'P', 'P+UR', null),
  (81845, 'P', 'P+UR', null),
  (82948, 'P', 'P+UR', null),
  (82951, 'P', 'P+UR', null),
  (82954, 'P', 'P+UR', null),
  (82998, 'P', 'P+UR', null),
  (85506, 'P', 'P+UR', null),
  (85575, 'P', 'P+UR', null),
  (85578, 'P', 'P+UR', null),
  (85623, 'P', 'P+UR', null),
  (85626, 'P', 'P+UR', null),
  (85630, 'P', 'P+UR', null),
  (85675, 'P', 'P+UR', null),
  (85714, 'P', 'P+UR', null),
  (85791, 'P', 'P+UR', null),
  (85810, 'P', 'P+UR', null),
  (85824, 'P', 'P+UR', null),
  (85858, 'P', 'P+UR', null),
  (85952, 'P', 'P+UR', null),
  (85964, 'P', 'P+UR', null),
  (86020, 'P', 'P+UR', null),
  (86026, 'P', 'P+UR', null),
  (86034, 'P', 'P+UR', null),
  (86096, 'P', 'P+UR', null),
  (86143, 'P', 'P+UR', null),
  (86148, 'P', 'P+UR', null),
  (89211, 'P', 'P+UR', null),
  (89222, 'P', 'P+UR', null),
  (90042, 'P', 'P+UR', null),
  (90063, 'P', 'P+UR', null),
  (90064, 'P', 'P+UR', null),
  (90175, 'P', 'P+UR', null),
  (90176, 'P', 'P+UR', null),
  (90179, 'P', 'P+UR', null),
  (90670, 'P', 'P+UR', null),
  (90692, 'P', 'P+UR', null),
  (90694, 'P', 'P+UR', null),
  (90695, 'P', 'P+UR', null),
  (90742, 'P', 'P+UR', null),
  (90747, 'P', 'P+UR', null),
  (90751, 'P', 'P+UR', null),
  (91090, 'P', 'P+UR', null),
  (91091, 'P', 'P+UR', null),
  (91092, 'P', 'P+UR', null),
  (91093, 'P', 'P+UR', null),
  (91094, 'P', 'P+UR', null),
  (91095, 'P', 'P+UR', null),
  (91096, 'P', 'P+UR', null),
  (91097, 'P', 'P+UR', null),
  (91098, 'P', 'P+UR', null),
  (93721, 'P', 'P+UR', null),
  (94666, 'P', 'P+UR', null),
  (94681, 'P', 'P+UR', null),
  (94699, 'P', 'P+UR', null),
  (96019, 'P', 'P+UR', null),
  (96020, 'P', 'P+UR', null),
  (96027, 'P', 'P+UR', null),
  (99387, 'P', 'P+UR', null),
  (99393, 'P', 'P+UR', null),
  (99396, 'P', 'P+UR', null),
  (99400, 'P', 'P+UR', null),
  (99403, 'P', 'P+UR', null),
  (99407, 'P', 'P+UR', null),
  (99414, 'P', 'P+UR', null),
  (101719, 'P', 'P+UR', null),
  (101743, 'P', 'P+UR', null),
  (102217, 'P', 'P+UR', null),
  (102232, 'P', 'P+UR', null),
  (102238, 'P', 'P+UR', null),
  (102364, 'P', 'P+UR', null),
  (102369, 'P', 'P+UR', null),
  (102404, 'P', 'P+UR', null),
  (102410, 'P', 'P+UR', null),
  (102419, 'P', 'P+UR', null),
  (102461, 'P', 'P+UR', null),
  (102481, 'P', 'P+UR', null),
  (102490, 'P', 'P+UR', null),
  (102808, 'P', 'P+UR', null),
  (102813, 'P', 'P+UR', null),
  (102960, 'P', 'P+UR', null),
  (102967, 'P', 'P+UR', null),
  (102970, 'P', 'P+UR', null),
  (103014, 'P', 'P+UR', null),
  (103061, 'P', 'P+UR', null),
  (103070, 'P', 'P+UR', null),
  (103081, 'P', 'P+UR', null),
  (103096, 'P', 'P+UR', null),
  (103187, 'P', 'P+UR', null),
  (103203, 'P', 'P+UR', null),
  (105980, 'P', 'P+UR', null),
  (105986, 'P', 'P+UR', null),
  (105998, 'P', 'P+UR', null),
  (106212, 'P', 'P+UR', null),
  (106230, 'P', 'P+UR', null),
  (106247, 'P', 'P+UR', null),
  (106989, 'P', 'P+UR', null),
  (107067, 'P', 'P+UR', null),
  (107075, 'P', 'P+UR', null),
  (107086, 'P', 'P+UR', null),
  (107096, 'P', 'P+UR', null),
  (91074, 'P', 'P+SR', null),
  (91075, 'P', 'P+SR', null),
  (91076, 'P', 'P+SR', null),
  (91077, 'P', 'P+SR', null),
  (91078, 'P', 'P+SR', null),
  (91079, 'P', 'P+SR', null),
  (91080, 'P', 'P+SR', null),
  (91081, 'P', 'P+SR', null),
  (91082, 'P', 'P+SR', null),
  (91083, 'P', 'P+SR', null),
  (90151, 'M', 'M+SR', null),
  (82779, 'その他', 'N', '炎舞-天璇'),
  (89147, 'その他', 'R', '罡炎星-リシュンキ'),
  (93973, 'その他', 'N', null),
  (93974, 'その他', 'N', null),
  (93975, 'その他', 'N', null),
  (97492, 'その他', 'N', null);

create temp table _merge (src bigint primary key, dst bigint not null, note text) on commit drop;
insert into _merge values
  (99389, 106790, 'DC01-JP003 の P は N-P の行と重複（公式は N・P のみ）'),
  (2314, 2315, 'DBGV-JP034 の NP は N-P の行と重複'),
  (93720, 93690, 'YSD-JPS01 は存在しない型番（オーナー確認）。YSD-JP010 の N にまとめる'),
  (105964, 106003, '説明文が入った行'),
  (105965, 106021, '説明文が入った行'),
  (106190, 106246, '説明文が入った行'),
  (106191, 106229, '説明文が入った行'),
  (106192, 106229, '説明文が入った行'),
  (106193, 106226, '説明文が入った行'),
  (106194, 106222, '説明文が入った行');

create temp table _ren (old_rarity text primary key, new_rarity text not null) on commit drop;
insert into _ren values
  ('N-P', 'P'),
  ('NP', 'P'),
  ('UR-P', 'P+UR'),
  ('SR-P', 'P+SR'),
  ('SR-Parallel', 'P+SR'),
  ('SE-P', 'P+SE'),
  ('HP', 'P+HR'),
  ('KC', 'KC+UR'),
  ('Millennium-Super', 'M+SR'),
  ('Millennium Super', 'M+SR'),
  ('Millennium-Ultra', 'M+UR'),
  ('Millennium-Secret', 'M+SE'),
  ('Ten Thousand Secret', '10000SE'),
  ('Premium Gold', 'PG'),
  ('Ultra RED Ver.', 'UR-RED'),
  ('Ultra BLUE Ver.', 'UR-BLUE'),
  ('Secret RED Ver.', 'SE-RED'),
  ('Secret BLUE Ver.', 'SE-BLUE'),
  ('初期UR', 'UR-初期'),
  ('初期SE', 'SE-初期'),
  ('UR(ロゴ入り)', 'UR-ロゴ'),
  ('SE(ロゴ入り)', 'SE-ロゴ'),
  ('UR（オーバーフレーム）', 'UR-OF'),
  ('PSE（オーバーフレーム）', 'PSE-OF'),
  ('Ultimate(Secret)', 'UL'),
  ('PS', 'EXSE'),
  ('25thSE', 'QCSE'),
  ('20th', '20thSE');

-- A
select count(*) as 行数, coalesce(sum(stock),0) as 在庫合計 from public.items;

-- B
select f.id, f.expect_rarity as 想定, i.rarity as 現在, i.name, i.category,
       case when i.id is null then 'なし' when i.rarity is distinct from f.expect_rarity then '想定と違う' else 'OK' end as 判定
from _fix f left join public.items i on i.id = f.id
order by 判定 desc, f.id;

-- C
select m.src, s.name as src_name, s.rarity as src_rarity, s.stock as src_stock,
       m.dst, d.name as dst_name, d.rarity as dst_rarity, d.stock as dst_stock,
       (select count(*) from public.request_items ri where ri.item_id = m.src) as src_のリクエスト明細,
       (select count(*) from public.stock_logs sl where sl.item_id = m.src) as src_の在庫履歴,
       case when s.id is null or d.id is null then 'なし' when s.category is distinct from d.category then 'パックが違う' else 'OK' end as 判定,
       m.note
from _merge m left join public.items s on s.id = m.src left join public.items d on d.id = m.dst
order by m.src;

-- D
select r.old_rarity, r.new_rarity, count(i.id) as 行数, coalesce(sum(i.stock),0) as 在庫
from _ren r left join public.items i on i.rarity = r.old_rarity
group by r.old_rarity, r.new_rarity order by 行数 desc;

-- E（変更後の姿を作って、型番・レアリティ・パック（型番がなければ名前）が同じ行が2行以上になる組）
with after as (
  select i.id,
         coalesce(f.new_name, i.name) as name, i.card_id, i.category,
         coalesce(f.new_rarity, r.new_rarity, i.rarity) as rarity,
         (f.id is not null or r.old_rarity is not null) as changed
  from public.items i
  left join _fix f on f.id = i.id
  left join _ren r on r.old_rarity = i.rarity and f.id is null
  where i.id not in (select src from _merge)
)
select coalesce(nullif(card_id,''), name) as 型番または名前, rarity, category, count(*) as 行数, array_agg(id order by id) as ids
from after
group by coalesce(nullif(card_id,''), name), rarity, category
having count(*) > 1 and bool_or(changed);

-- F
select value from public.config where key = 'rarities';

rollback;
