-- N の誤登録の修正（2026-11-14、オーナー承認 2026-11-14）。全カード一括登録 第2段階の照合（YGOJSON、データ日付 2026-04-07）で決めた行だけを直す。
-- 判定の一覧: N修正_判定一覧.csv（action 列）。直すのは「書き換え」687 行と「削除（在庫0）」137 行。統合（同じパックに正しい行がある）は照合の結果 0 行。
--   書き換え: YGOJSON でその型番に N がなく、正しいレアリティが1つに決まる行。行の id はそのままなので、リクエスト明細・在庫履歴の付け替えは要らない。
--   削除（在庫0）: YGOJSON の正しいレアリティが複数あってどれか決められず、在庫が 0 の行。正しい行は一括登録で入る。
--   「N のまま」「要確認」の行には触れない（要確認一覧_N.csv）。
-- 順番: ① N修正（この SQL）→ ② 一括登録準備 → ③ 一括登録。それぞれ 確認 → 変更 →（問題があれば）戻し。
-- バッチ名: nfix-2026-11-14（maintenance.rarity_fix_log に1行ずつ記録し、戻しはこの記録を使う）。
-- ③ 戻し。② の変更を、maintenance.rarity_fix_log の記録（バッチ nfix-2026-11-14）を使って元に戻す。
-- Supabase の SQL エディタで、ファイルの中身をすべて貼り付けて1回で実行する。本体は1つの DO ブロックなので、途中で失敗すると何も変わらない。
-- 注意: 一括登録（③）を実行済みなら、先に「一括登録戻し」と「一括登録準備戻し」を実行すること（同じ型番×レアリティの行が入っていると、削除した行を作り直したときに重複になるため中止する）。
-- ② のあとに対象の行をアプリで編集・削除していると戻せない（そのときはエラーにして中止する）。

do $body$
declare
  bad text; n_before bigint; s_before bigint; n_now bigint; s_now bigint; n_del bigint;
begin
  if not exists (select 1 from maintenance.rarity_fix_log where batch = 'nfix-2026-11-14') then
    raise exception 'バッチ nfix-2026-11-14 の記録がないので中止';
  end if;
  if to_regclass('maintenance.bulk_import_log') is not null then
    if exists (select 1 from maintenance.bulk_import_log where batch in ('bulk-2026-11-14', 'prep-2026-11-14')) then
      raise exception '一括登録準備・一括登録が実行済みです。先に「一括登録戻し」「一括登録準備戻し」を実行してください';
    end if;
  end if;

  select count(*), coalesce(sum(stock), 0) into n_before, s_before from public.items;

  select string_agg(l.item_id::text, ', ') into bad
  from maintenance.rarity_fix_log l left join public.items i on i.id = l.item_id
  where l.batch = 'nfix-2026-11-14' and l.step = 'rewrite' and (i.id is null or i.rarity is distinct from l.new_rarity);
  if bad is not null then raise exception '② のあとに変わった行があるので中止: %', left(bad, 1500); end if;

  select string_agg(l.item_id::text, ', ') into bad
  from maintenance.rarity_fix_log l join public.items i on i.id = l.item_id
  where l.batch = 'nfix-2026-11-14' and l.step = 'delete';
  if bad is not null then raise exception '削除した行の id がすでに使われているので中止: %', left(bad, 1500); end if;

  -- 1. 書き換えを戻す
  update public.items i set rarity = l.old_rarity
  from maintenance.rarity_fix_log l where l.batch = 'nfix-2026-11-14' and l.step = 'rewrite' and i.id = l.item_id;

  -- 2. 削除した行を同じ id で作り直す
  insert into public.items (id, name, card_id, rarity, stock, category, updated_at)
  overriding system value
  select (l.old_row->>'id')::bigint, l.old_row->>'name', l.old_row->>'card_id', l.old_row->>'rarity',
         (l.old_row->>'stock')::int, l.old_row->>'category', (l.old_row->>'updated_at')::timestamptz
  from maintenance.rarity_fix_log l where l.batch = 'nfix-2026-11-14' and l.step = 'delete';

  select count(*), coalesce(sum(stock), 0) into n_now, s_now from public.items;
  select count(*) into n_del from maintenance.rarity_fix_log where batch = 'nfix-2026-11-14' and step = 'delete';
  if n_now <> n_before + n_del then raise exception '行数が合わない'; end if;
  if s_now <> s_before then raise exception '在庫合計が合わない'; end if;

  -- 記録は残し、バッチ名を変えて「戻し済み」にする（もう一度 ② を実行できるようにする）
  update maintenance.rarity_fix_log set batch = batch || '-rolled-back-' || to_char(now(), 'YYYYMMDDHH24MISS')
  where batch = 'nfix-2026-11-14';
  raise notice '戻し完了: 行数 % → %、在庫合計 %（変わらず）', n_before, n_now, s_now;
end
$body$;

select '全体の行数' as 項目, count(*) as 件数 from public.items
union all select '全体の在庫合計', coalesce(sum(stock), 0) from public.items
union all select '残っている N（参考）', count(*) from public.items where rarity = 'N';
