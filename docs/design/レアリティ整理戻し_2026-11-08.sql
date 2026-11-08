-- レアリティ整理（2026-11-08）。公式カードデータベース（遊戯王ニューロン）の略号にそろえる。
-- 対応表と経緯: Docs「レアリティ整理表（公式カードデータベース基準）」、03_改修ログ.md の 2026-11-08。
-- 順番: ①「レアリティ整理確認_2026-11-08.sql」 → ② この「変更」 → 問題があれば ③「戻し」。
-- バッチ名: rarity-2026-11-08（maintenance.rarity_fix_log に1行ずつ記録し、戻しはこの記録を使う）。
-- ③ 戻し。② の変更を、maintenance.rarity_fix_log の記録を使って元に戻す。
-- Supabase の SQL エディタでは、ファイルの中身をすべて貼り付けて1回で実行する。本体は1つの DO ブロックなので、途中で失敗すると何も変わらない。
-- 注意: ② のあとに、対象の行をアプリで編集・削除していると、その分は戻せない（そのときはエラーにして中止する）。
-- まとめた行（merge）は、同じ id で作り直し、残した行から在庫を引き、参照を元の行に付け替える。

do $body$
declare
  bad text; n_before bigint; s_before bigint; n_now bigint; s_now bigint; n_merged bigint;
begin
  if not exists (select 1 from maintenance.rarity_fix_log where batch = 'rarity-2026-11-08') then
    raise exception 'バッチ rarity-2026-11-08 の記録がないので中止';
  end if;

  select count(*), coalesce(sum(stock),0) into n_before, s_before from public.items;

  -- 先に、② のあとで変わった行がないか確かめる
  select string_agg(l.item_id::text, ', ') into bad
  from maintenance.rarity_fix_log l left join public.items i on i.id = l.item_id
  where l.batch = 'rarity-2026-11-08' and l.step in ('rename', 'fix') and (i.id is null or i.rarity is distinct from l.new_rarity);
  if bad is not null then raise exception '② のあとに変わった行があるので中止: %', bad; end if;

  -- 4. 設定を戻す
  update public.config c set value = l.old_row
  from maintenance.rarity_fix_log l where l.batch = 'rarity-2026-11-08' and l.step = 'config' and c.key = 'rarities' and l.old_row is not null;
  delete from public.config c
  where c.key = 'rarities' and exists (select 1 from maintenance.rarity_fix_log l where l.batch = 'rarity-2026-11-08' and l.step = 'config' and l.old_row is null);

  -- 3. 表記を戻す
  update public.items i set rarity = l.old_rarity
  from maintenance.rarity_fix_log l where l.batch = 'rarity-2026-11-08' and l.step = 'rename' and i.id = l.item_id;

  -- 2. まとめた行を作り直す
  insert into public.items (id, name, card_id, rarity, stock, category, updated_at)
  overriding system value
  select (l.old_row->>'id')::bigint, l.old_row->>'name', l.old_row->>'card_id', l.old_row->>'rarity',
         (l.old_row->>'stock')::int, l.old_row->>'category', (l.old_row->>'updated_at')::timestamptz
  from maintenance.rarity_fix_log l where l.batch = 'rarity-2026-11-08' and l.step = 'merge';

  update public.items d set stock = d.stock - t.moved
  from (select merged_into, sum(stock_moved) as moved from maintenance.rarity_fix_log
        where batch = 'rarity-2026-11-08' and step = 'merge' group by merged_into) t
  where d.id = t.merged_into and t.moved <> 0;

  update public.request_items ri set item_id = l.item_id
  from maintenance.rarity_fix_log l where l.batch = 'rarity-2026-11-08' and l.step = 'merge_ref' and l.ref_table = 'request_items' and ri.id = l.ref_id;
  update public.stock_logs sl set item_id = l.item_id
  from maintenance.rarity_fix_log l where l.batch = 'rarity-2026-11-08' and l.step = 'merge_ref' and l.ref_table = 'stock_logs' and sl.id = l.ref_id;

  -- 1. 個別の修正を戻す
  update public.items i set rarity = l.old_rarity, name = l.old_name
  from maintenance.rarity_fix_log l where l.batch = 'rarity-2026-11-08' and l.step = 'fix' and i.id = l.item_id;

  -- 確認: 在庫合計は変わらず、行数はまとめた行の分だけ増える
  select count(*), coalesce(sum(stock),0) into n_now, s_now from public.items;
  select count(*) into n_merged from maintenance.rarity_fix_log where batch = 'rarity-2026-11-08' and step = 'merge';
  if n_now <> n_before + n_merged then raise exception '行数が合わない'; end if;
  if s_now <> s_before then raise exception '在庫合計が合わない'; end if;

  -- 記録は残し、バッチ名を変えて「戻し済み」にする（もう一度 ② を実行できるようにする）
  update maintenance.rarity_fix_log set batch = batch || '-rolled-back-' || to_char(now(), 'YYYYMMDDHH24MISS')
  where batch = 'rarity-2026-11-08';
  raise notice '戻し完了: 行数 % → %、在庫合計 %（変わらず）', n_before, n_now, s_now;
end
$body$;

select '全体の行数' as 項目, count(*) as 件数 from public.items
union all select '全体の在庫合計', coalesce(sum(stock),0) from public.items;
