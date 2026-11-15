-- T-2026-11-14-B（DEV-2026-11-14-2）: 「25th Secret Rare」が QCSE と R の2行で登録されていないかを見る。読み取りのみ。何も変更しない。
-- 2026-11-14 作成。Wiki 取込の正規表現の不具合（「25th Se」だけを除き、残りの「cret Rare」が R になる）で、
-- 同じ型番・同じパックに QCSE と R の行がそろって入った可能性がある。全カード一括登録の前に実行する。
-- Supabase の SQL エディタは最後の結果しか表示しないため、1つの SELECT で返す。
-- 見るところ:
--   - 出た行は「候補」。R と QCSE の両方が実在するカードもあるため、公式カードデータベースで確かめてから直す。
--   - 直すときは別の修正提案（確認・変更・戻しの SQL）にする。ここでは何も変えない。
--   - 0 行なら既存の誤登録はない。

select
  r.card_id                       as 型番,
  r.name                          as カード名,
  r.category                      as 収録パック,
  r.id                            as r行のid,
  coalesce(r.stock, 0)            as r行の在庫,
  q.id                            as qcse行のid,
  coalesce(q.stock, 0)            as qcse行の在庫,
  (select count(*) from public.request_items ri where ri.item_id = r.id) as r行のリクエスト明細数,
  r.updated_at                    as r行の更新日時
from public.items r
join public.items q
  on q.card_id = r.card_id
 and q.category is not distinct from r.category
 and q.rarity = 'QCSE'
where r.rarity = 'R'
order by r.category, r.card_id;
