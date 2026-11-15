-- B7: 在庫上限チェック（create_request）の確認（T-2026-11-04-B）。読み取りのみ。何も変更しない。
-- 2026-11-09 作成（2026-11-14 適用）。「在庫上限チェック変更_2026-11-09.sql」の前と後に実行する。
-- Supabase の SQL エディタは最後の結果しか表示しないため、1つの SELECT で「項目・件数・詳細・判定」の表を1つ返す。
-- 見るところ:
--   - 変更前: 判定に「要確認」がないこと、「3. 上限チェック」が 0 であること。「6. 受付中のリクエスト数」をメモする。
--   - 変更後: 「3. 上限チェック」が 1、「6. 受付中のリクエスト数」が変更前と同じであること。
--   - 「4.」「5.」が 1 以上なら、受付中の枚数がすでに在庫を超えている。変更後はそのカード・サプライの新しい申請が通らなくなる。

with fn as (
  select p.oid, p.prosecdef, pg_get_functiondef(p.oid) as def
  from pg_proc p
  join pg_namespace n on n.oid = p.pronamespace
  where n.nspname = 'public' and p.proname = 'create_request'
),
pending_items as (
  select ri.item_id, sum(ri.quantity) as qty
  from public.request_items ri
  join public.requests r on r.id = ri.request_id
  where r.status = 'pending' and ri.item_id is not null
  group by ri.item_id
),
over_items as (
  select i.id, i.name, coalesce(i.stock, 0) as stock, p.qty
  from pending_items p
  join public.items i on i.id = p.item_id
  where p.qty > coalesce(i.stock, 0)
),
pending_supplies as (
  select ri.supply_id, sum(ri.quantity) as qty
  from public.request_items ri
  join public.requests r on r.id = ri.request_id
  where r.status = 'pending' and ri.supply_id is not null
  group by ri.supply_id
),
over_supplies as (
  select s.id, s.name, coalesce(s.stock, 0) as stock, p.qty
  from pending_supplies p
  join public.supplies s on s.id = p.supply_id
  where p.qty > coalesce(s.stock, 0)
)
select '1. create_request 関数の数' as 項目,
       (select count(*) from fn) as 件数,
       '1 であること（引数違いの同名関数がない）' as 詳細,
       case when (select count(*) from fn) = 1 then 'OK' else '要確認' end as 判定
union all
select '2. SECURITY DEFINER',
       (select count(*) from fn where prosecdef),
       '1 であること',
       case when (select count(*) from fn where prosecdef) = 1 then 'OK' else '要確認' end
union all
select '3. 上限チェック（B7）の有無',
       (select count(*) from fn where def like '%在庫が足りません%'),
       '変更前は 0、変更後は 1',
       '参考'
union all
select '4. 受付中が在庫を超えているカード',
       (select count(*) from over_items),
       coalesce((select string_agg(format('%s（id %s）在庫%s・受付中%s', name, id, stock, qty), ' / ' order by id)
                 from (select * from over_items order by id limit 20) t), 'なし'),
       case when (select count(*) from over_items) = 0 then 'OK' else '参考（変更後は新しい申請が通らない）' end
union all
select '5. 受付中が在庫を超えているサプライ',
       (select count(*) from over_supplies),
       coalesce((select string_agg(format('%s（id %s）在庫%s・受付中%s', name, id, stock, qty), ' / ' order by id)
                 from (select * from over_supplies order by id limit 20) t), 'なし'),
       case when (select count(*) from over_supplies) = 0 then 'OK' else '参考（変更後は在庫を超える新しい申請が通らない）' end
union all
select '6. 受付中のリクエスト数',
       (select count(*) from public.requests where status = 'pending'),
       '変更の前後で同じであること（関数の置き換えだけなのでデータは変わらない）',
       '参考';
