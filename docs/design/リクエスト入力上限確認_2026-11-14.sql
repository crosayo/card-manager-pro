-- Q-2026-11-06-3: リクエストの入力上限（名前50文字・メモ1000文字・明細200件・カード／サプライの排他）の確認。読み取りのみ。何も変更しない。
-- 2026-11-14 作成。「リクエスト入力上限変更_2026-11-14.sql」の前と後に実行する。
-- Supabase の SQL エディタは最後の結果しか表示しないため、1つの SELECT で「項目・件数・詳細・判定」の表を1つ返す。
-- 見るところ:
--   - 変更前: 「1. B7」が 1（B7 を先に実行済み）であること。「2.」〜「4.」で既存データの最大が上限より小さいこと
--             （上限を超えている既存のリクエストは、そのままでは残るが、申請者がメモを編集すると上限で止まる）。
--             「5.」が 0 であること（1 以上ならカードとサプライの両方を持つ明細がすでにある）。
--   - 変更後: 「6.」が 2 であること。

with fn as (
  select p.proname, p.prosrc
  from pg_proc p join pg_namespace n on n.oid = p.pronamespace
  where n.nspname = 'public' and p.proname in ('create_request', 'edit_request_by_token')
),
per_request as (
  select ri.request_id, count(*) as n
  from public.request_items ri
  group by ri.request_id
)
select '1. B7（在庫上限チェック）が入っているか' as 項目,
       (select count(*) from fn where proname = 'create_request' and prosrc like '%在庫が足りません%') as 件数,
       '1 であること（0 なら先に 在庫上限チェック変更_2026-11-09.sql を実行する）' as 詳細,
       case when (select count(*) from fn where proname = 'create_request' and prosrc like '%在庫が足りません%') = 1 then 'OK' else '要確認' end as 判定
union all
select '2. お名前の最大文字数（上限 50）',
       coalesce((select max(char_length(btrim(requester_name))) from public.requests), 0),
       format('50 を超えるリクエスト %s 件', (select count(*) from public.requests where char_length(btrim(requester_name)) > 50)),
       case when coalesce((select max(char_length(btrim(requester_name))) from public.requests), 0) <= 50 then 'OK' else '参考（既存の行はそのまま残る）' end
union all
select '3. メモの最大文字数（上限 1000）',
       coalesce((select max(char_length(btrim(message))) from public.requests), 0),
       format('1000 を超えるリクエスト %s 件', (select count(*) from public.requests where char_length(btrim(message)) > 1000)),
       case when coalesce((select max(char_length(btrim(message))) from public.requests), 0) <= 1000 then 'OK' else '参考（既存の行はそのまま残る）' end
union all
select '4. 1つのリクエストの明細の最大件数（上限 200）',
       coalesce((select max(n) from per_request), 0),
       format('200 を超えるリクエスト %s 件', (select count(*) from per_request where n > 200)),
       case when coalesce((select max(n) from per_request), 0) <= 200 then 'OK' else '参考' end
union all
select '5. カードとサプライの両方を持つ明細',
       (select count(*) from public.request_items where item_id is not null and supply_id is not null),
       '0 であること',
       case when (select count(*) from public.request_items where item_id is not null and supply_id is not null) = 0 then 'OK' else '要確認' end
union all
select '6. 上限チェックが入った関数',
       (select count(*) from fn where prosrc like '%1000文字以内%'),
       '変更前は 0、変更後は 2（create_request・edit_request_by_token）',
       '参考';
