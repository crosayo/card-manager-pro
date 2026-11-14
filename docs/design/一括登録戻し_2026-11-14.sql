-- 全カード一括登録 第3段階（2026-11-14）。YGOJSON（MIT、データ日付 2026-04-07）由来の「まだ DB にない行」を在庫0で登録する。
--   取込表 public.bulk_import_items（7,268 行。Table Editor の CSV インポートで入れる）から、items に「同じ型番×レアリティの行がまだない」ものだけを入れる。
--   新しいパック（products にない収録パック名、732 件の見込み）は products に足す（発売日つき、サイドバー表示はオフ）。
--   既存の行・在庫数には触れない。入れた行の id と足したパック名を maintenance.bulk_import_log に残し、戻しはこれを使う（在庫0・参照なしの行だけ消せる）。
-- 順番: ① N修正 → ② 一括登録準備 → CSV インポート → ③ 一括登録（この SQL）。
-- バッチ名: bulk-2026-11-14。取込表のチェック値: 行数 7268・seq 合計 26415546・md5 50ea9ac166322b2d531642e0a59ed1ae
-- ③ 戻し。② で入れたカード行（在庫0のまま・リクエスト明細や在庫履歴が付いていないもの）と、② で足したパックを消す。
-- 入れた行のどれかに在庫が入った・リクエストされた・在庫履歴がある場合は、全体を中止する（その行を先に確認する。一覧は中止メッセージに出る）。
-- 足したパックに、② のあとで登録したカードが入っていれば、そのパックは消さずに残す（メッセージで知らせる）。
-- 取込表は作り直さない。もう一度 ② を実行するときは、「一括登録準備戻し」→「一括登録準備変更」→ CSV インポートからやり直す。

do $body$
declare
  bad text; n_before bigint; s_before bigint; n_now bigint; s_now bigint; n_items bigint; n_prod bigint; keep text; max_id bigint;
begin
  if not exists (select 1 from maintenance.bulk_import_log where batch = 'bulk-2026-11-14') then
    raise exception 'バッチ bulk-2026-11-14 の記録がないので中止';
  end if;
  select count(*), coalesce(sum(stock), 0) into n_before, s_before from public.items;

  select string_agg(i.id::text, ', ') into bad from public.items i
  join maintenance.bulk_import_log l on l.batch = 'bulk-2026-11-14' and l.step = 'item' and l.item_id = i.id
  where coalesce(i.stock, 0) <> 0
     or exists (select 1 from public.request_items ri where ri.item_id = i.id)
     or exists (select 1 from public.stock_logs sl where sl.item_id = i.id);
  if bad is not null then raise exception '在庫・リクエスト・在庫履歴が付いた行があるので中止: %', left(bad, 1500); end if;

  delete from public.items i using maintenance.bulk_import_log l
  where l.batch = 'bulk-2026-11-14' and l.step = 'item' and l.item_id = i.id;
  get diagnostics n_items = row_count;

  -- ② のあとに登録されたカード（② で入れた最後の id より大きい id）が入っているパックは残す。
  -- ② の前からあったカード（products に名前がなかった収録パック）しかないパックは、② の前と同じく消す。
  select max(item_id) into max_id from maintenance.bulk_import_log where batch = 'bulk-2026-11-14' and step = 'item';
  select string_agg(l.product_name, ' / ') into keep from maintenance.bulk_import_log l
  where l.batch = 'bulk-2026-11-14' and l.step = 'product' and exists (select 1 from public.items i where i.category = l.product_name and i.id > coalesce(max_id, 0));
  delete from public.products p using maintenance.bulk_import_log l
  where l.batch = 'bulk-2026-11-14' and l.step = 'product' and p.name = l.product_name
    and not exists (select 1 from public.items i where i.category = p.name and i.id > coalesce(max_id, 0));
  get diagnostics n_prod = row_count;
  if keep is not null then raise notice 'ほかのカードが入っているので残したパック: %', left(keep, 1500); end if;

  select count(*), coalesce(sum(stock), 0) into n_now, s_now from public.items;
  if n_now <> n_before - n_items then raise exception '行数が合わない'; end if;
  if s_now <> s_before then raise exception '在庫合計が合わない'; end if;

  update maintenance.bulk_import_log set batch = batch || '-rolled-back-' || to_char(now(), 'YYYYMMDDHH24MISS')
  where batch = 'bulk-2026-11-14';
  raise notice '戻し完了: カード % 行・パック % 件を削除。行数 % → %、在庫合計 %（変わらず）', n_items, n_prod, n_before, n_now, s_now;
end
$body$;

select '全体の行数' as 項目, count(*) as 件数 from public.items
union all select '全体の在庫合計', coalesce(sum(stock), 0) from public.items
union all select 'パックの件数', count(*) from public.products;
