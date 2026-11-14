-- 全カード一括登録 第3段階（2026-11-14）。YGOJSON（MIT、データ日付 2026-04-07）由来の「まだ DB にない行」を在庫0で登録する。
--   取込表 public.bulk_import_items（7,268 行。Table Editor の CSV インポートで入れる）から、items に「同じ型番×レアリティの行がまだない」ものだけを入れる。
--   新しいパック（products にない収録パック名、732 件の見込み）は products に足す（発売日つき、サイドバー表示はオフ）。
--   既存の行・在庫数には触れない。入れた行の id と足したパック名を maintenance.bulk_import_log に残し、戻しはこれを使う（在庫0・参照なしの行だけ消せる）。
-- 順番: ① N修正 → ② 一括登録準備 → CSV インポート → ③ 一括登録（この SQL）。
-- バッチ名: bulk-2026-11-14。取込表のチェック値: 行数 7268・seq 合計 26415546・md5 50ea9ac166322b2d531642e0a59ed1ae
-- ② 変更。ファイルの中身をすべて貼り付けて1回で実行する。本体は1つの DO ブロックなので、失敗すれば何も変わらない（取込表も残る）。
-- 順番が違う・取込表の行数かチェック値が違う・入れた行数が合わない・在庫合計が変わった・取り込めなかった行がある、のどれかで全部取り消す。二重実行も止める。
-- 成功したら最後に取込表 public.bulk_import_items を削除する。実行前に設定画面の「バックアップ」で JSON を保存しておくこと。

create schema if not exists maintenance;
revoke all on schema maintenance from public;
create table if not exists maintenance.bulk_import_log (
  id bigserial primary key,
  batch text not null,
  step text not null,          -- cardid / extension / index / function / staging / product / item
  item_id bigint,
  product_name text,
  old_value jsonb,
  new_value jsonb,
  created_at timestamptz not null default now()
);
create index if not exists bulk_import_log_batch_idx on maintenance.bulk_import_log (batch, step);

do $body$
declare
  n_before bigint; s_before bigint; n_now bigint; s_now bigint; n_expect bigint; n_ins bigint; n_prod bigint; p_before bigint; bad text;
begin
  if exists (select 1 from maintenance.bulk_import_log where batch = 'bulk-2026-11-14') then
    raise exception 'このバッチ（bulk-2026-11-14）はすでに実行済みです。二重実行を防ぐため中止します';
  end if;
  if not exists (select 1 from maintenance.rarity_fix_log where batch = 'nfix-2026-11-14') then raise exception '先に N修正を実行してください'; end if;
  if not exists (select 1 from maintenance.bulk_import_log where batch = 'prep-2026-11-14') then raise exception '先に一括登録準備を実行してください'; end if;
  if to_regclass('public.bulk_import_items') is null then raise exception '取込表 public.bulk_import_items がない（準備と CSV インポートを先に）'; end if;
  if (select count(*) from public.bulk_import_items) <> 7268 then raise exception '取込表の行数が % で、想定の 7268 と違うので中止', (select count(*) from public.bulk_import_items); end if;
  if (select md5(string_agg(concat_ws('|', seq, name, card_id, rarity, category, coalesce(pack_release_date, '')), E'\n' order by seq)) from public.bulk_import_items) <> '50ea9ac166322b2d531642e0a59ed1ae' then raise exception '取込表の中身のチェック値が想定と違うので中止（CSV を作り直さずにインポートし直す）'; end if;
  select string_agg(distinct s.rarity, ', ') into bad from public.bulk_import_items s
  where not exists (select 1 from public.config c, jsonb_array_elements_text(c.value) v where c.key = 'rarities' and v = s.rarity);
  if bad is not null then raise exception 'レアリティ設定にないコードがあるので中止: %', bad; end if;

  select count(*), coalesce(sum(stock), 0) into n_before, s_before from public.items;
  select count(*) into p_before from public.products;
  select count(*) into n_expect from public.bulk_import_items s
  where not exists (select 1 from public.items i where i.card_id = s.card_id and i.rarity = s.rarity);

  -- 1. 新しいパック（products にない名前だけ。発売日は取込表のいちばん早い日付、サイドバー表示はオフ）
  with ins as (
    insert into public.products (name, release_date, is_sidebar_visible)
    select s.category, min(nullif(s.pack_release_date, '')), false
    from public.bulk_import_items s
    where not exists (select 1 from public.products p where p.name = s.category)
    group by s.category
    returning name)
  insert into maintenance.bulk_import_log (batch, step, product_name) select 'bulk-2026-11-14', 'product', name from ins;
  get diagnostics n_prod = row_count;

  -- 2. カード（同じ型番×レアリティの行がまだないものだけ。在庫0）
  with ins as (
    insert into public.items (name, card_id, rarity, stock, category)
    select s.name, s.card_id, s.rarity, 0, s.category
    from public.bulk_import_items s
    where not exists (select 1 from public.items i where i.card_id = s.card_id and i.rarity = s.rarity)
    order by s.seq
    returning id)
  insert into maintenance.bulk_import_log (batch, step, item_id) select 'bulk-2026-11-14', 'item', id from ins;
  get diagnostics n_ins = row_count;

  -- 3. 最後の確認（合わなければ全部取り消す）
  select count(*), coalesce(sum(stock), 0) into n_now, s_now from public.items;
  if n_ins <> n_expect then raise exception '入れた行数 % が想定 % と違う', n_ins, n_expect; end if;
  if n_now <> n_before + n_ins then raise exception '行数が合わない: % + % ≠ %', n_before, n_ins, n_now; end if;
  if s_now <> s_before then raise exception '在庫合計が合わない: 変更前 % ≠ 変更後 %', s_before, s_now; end if;
  if (select count(*) from public.products) <> p_before + n_prod then raise exception 'パックの件数が合わない'; end if;
  select string_agg(s.seq::text, ', ') into bad from public.bulk_import_items s
  where not exists (select 1 from public.items i where i.card_id = s.card_id and i.rarity = s.rarity);
  if bad is not null then raise exception '取り込めなかった行がある: %', left(bad, 1500); end if;
  select string_agg(distinct i.category, ', ') into bad from public.items i
  where not exists (select 1 from public.products p where p.name = i.category)
    and i.id in (select item_id from maintenance.bulk_import_log where batch = 'bulk-2026-11-14' and step = 'item');
  if bad is not null then raise exception 'products にない収録パックの行がある: %', left(bad, 1500); end if;

  -- 4. 取込表を消す
  drop table public.bulk_import_items;
  raise notice '完了: カード % 行・パック % 件を追加。行数 % → %、在庫合計 %（変わらず）', n_ins, n_prod, n_before, n_now, s_now;
end
$body$;

select step as 記録, count(*) as 件数 from maintenance.bulk_import_log where batch = 'bulk-2026-11-14' group by step
union all select '全体の行数', count(*) from public.items
union all select '全体の在庫合計', coalesce(sum(stock), 0) from public.items
union all select 'パックの件数', count(*) from public.products;
