-- レアリティ整理（2026-11-08）。公式カードデータベース（遊戯王ニューロン）の略号にそろえる。
-- 対応表と経緯: Docs「レアリティ整理表（公式カードデータベース基準）」、03_改修ログ.md の 2026-11-08。
-- 順番: ①「レアリティ整理確認_2026-11-08.sql」 → ② この「変更」 → 問題があれば ③「戻し」。
-- バッチ名: rarity-2026-11-08（maintenance.rarity_fix_log に1行ずつ記録し、戻しはこの記録を使う）。
-- ② 変更。Supabase の SQL エディタでは、ファイルの中身をすべて貼り付けて1回で実行する。
-- 本体は1つの DO ブロック（1つの文）なので、途中で失敗すると何も変わらない（すべて取り消される）。
-- 最後に「行数＝変更前−まとめた行数」「在庫合計が変わらない」「古い表記が残っていない」「新しい重複がない」を確かめ、
-- 1つでも合わなければエラーにして全部取り消す。二重実行も止める。
-- 実行前に、設定画面の「バックアップ」で JSON を保存しておくこと。

-- 記録表（API に公開されない maintenance スキーマ。何度実行しても同じ）
create schema if not exists maintenance;
revoke all on schema maintenance from public;
create table if not exists maintenance.rarity_fix_log (
  id bigserial primary key,
  batch text not null,
  step text not null,          -- fix / merge_ref / merge / rename / config
  item_id bigint,
  ref_table text,
  ref_id bigint,
  old_rarity text,
  new_rarity text,
  old_name text,
  new_name text,
  stock_moved integer,
  merged_into bigint,
  old_row jsonb,
  created_at timestamptz not null default now()
);

do $body$
declare
  bad text; n_before bigint; s_before bigint; n_now bigint; s_now bigint; n_merged bigint; leftover text; dup text;
begin
  if exists (select 1 from maintenance.rarity_fix_log where batch = 'rarity-2026-11-08') then
    raise exception 'このバッチ（rarity-2026-11-08）はすでに実行済みです。二重実行を防ぐため中止します';
  end if;

  drop table if exists _fix, _merge, _ren, _before;
  create temp table _fix (id bigint primary key, expect_rarity text not null, new_rarity text not null, new_name text) ;
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

  create temp table _merge (src bigint primary key, dst bigint not null, note text) ;
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

  create temp table _ren (old_rarity text primary key, new_rarity text not null) ;
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

  select count(*), coalesce(sum(stock),0) into n_before, s_before from public.items;

  -- 0. 前提の確認（想定と違えば中止）
  select string_agg(f.id::text || '(' || coalesce(i.rarity, 'なし') || ')', ', ') into bad
  from _fix f left join public.items i on i.id = f.id
  where i.id is null or i.rarity is distinct from f.expect_rarity;
  if bad is not null then raise exception '個別に直す行が想定と違うので中止: %', bad; end if;

  select string_agg(m.src::text || '→' || m.dst::text, ', ') into bad
  from _merge m left join public.items s on s.id = m.src left join public.items d on d.id = m.dst
  where s.id is null or d.id is null or s.category is distinct from d.category;
  if bad is not null then raise exception 'まとめる行が想定と違うので中止: %', bad; end if;

  -- 1. 個別の修正（レアリティ、必要ならカード名）
  insert into maintenance.rarity_fix_log (batch, step, item_id, old_rarity, new_rarity, old_name, new_name)
  select 'rarity-2026-11-08', 'fix', i.id, i.rarity, f.new_rarity, i.name, coalesce(f.new_name, i.name)
  from _fix f join public.items i on i.id = f.id;

  update public.items i set rarity = f.new_rarity, name = coalesce(f.new_name, i.name)
  from _fix f where i.id = f.id;

  -- 2. 重複・誤った行を、残す行にまとめる（参照を付け替え → 在庫を足す → 消す）
  insert into maintenance.rarity_fix_log (batch, step, item_id, ref_table, ref_id, merged_into)
  select 'rarity-2026-11-08', 'merge_ref', m.src, 'request_items', ri.id, m.dst
  from _merge m join public.request_items ri on ri.item_id = m.src;
  insert into maintenance.rarity_fix_log (batch, step, item_id, ref_table, ref_id, merged_into)
  select 'rarity-2026-11-08', 'merge_ref', m.src, 'stock_logs', sl.id, m.dst
  from _merge m join public.stock_logs sl on sl.item_id = m.src;

  update public.request_items ri set item_id = m.dst from _merge m where ri.item_id = m.src;
  update public.stock_logs sl set item_id = m.dst from _merge m where sl.item_id = m.src;

  insert into maintenance.rarity_fix_log (batch, step, item_id, old_rarity, old_name, stock_moved, merged_into, old_row)
  select 'rarity-2026-11-08', 'merge', s.id, s.rarity, s.name, coalesce(s.stock, 0), m.dst,
         jsonb_build_object('id', s.id, 'name', s.name, 'card_id', s.card_id, 'rarity', s.rarity,
                            'stock', s.stock, 'category', s.category, 'updated_at', s.updated_at)
  from _merge m join public.items s on s.id = m.src;

  update public.items d set stock = coalesce(d.stock, 0) + t.add
  from (select m.dst, sum(coalesce(s.stock, 0)) as add from _merge m join public.items s on s.id = m.src group by m.dst) t
  where d.id = t.dst and t.add <> 0;

  delete from public.items i using _merge m where i.id = m.src;

  -- 3. 表記の置き換え
  insert into maintenance.rarity_fix_log (batch, step, item_id, old_rarity, new_rarity)
  select 'rarity-2026-11-08', 'rename', i.id, i.rarity, r.new_rarity
  from public.items i join _ren r on r.old_rarity = i.rarity;

  update public.items i set rarity = r.new_rarity from _ren r where i.rarity = r.old_rarity;

  -- 4. アプリのレアリティ設定（並び順は設定画面で変えられる）
  insert into maintenance.rarity_fix_log (batch, step, old_row)
  select 'rarity-2026-11-08', 'config', (select value from public.config where key = 'rarities');

  insert into public.config (key, value) values ('rarities', '["N", "NR", "R", "SR", "UR", "SE", "P", "P+UR", "P+SR", "P+SE", "P+HR", "UL", "HR", "CR", "GR", "GSE", "PG", "EXSE", "PSE", "QCSE", "QCSE-GREEN", "20thSE", "10000SE", "GMR", "KC+UR", "M", "M+SR", "M+UR", "M+SE", "UR-RED", "UR-BLUE", "SE-RED", "SE-BLUE", "UR-初期", "SE-初期", "UR-ロゴ", "SE-ロゴ", "UR-OF", "PSE-OF"]'::jsonb)
  on conflict (key) do update set value = excluded.value;

  -- 5. 最後の確認（合わなければ全部取り消す）
  select count(*), coalesce(sum(stock),0) into n_now, s_now from public.items;
  select count(*) into n_merged from _merge;
  if n_now <> n_before - n_merged then raise exception '行数が合わない: 変更前 % − まとめた % ≠ 変更後 %', n_before, n_merged, n_now; end if;
  if s_now <> s_before then raise exception '在庫合計が合わない: 変更前 % ≠ 変更後 %', s_before, s_now; end if;

  select string_agg(distinct i.rarity, ', ') into leftover from public.items i join _ren r on r.old_rarity = i.rarity;
  if leftover is not null then raise exception '古い表記が残っている: %', leftover; end if;

  select string_agg(k, ' / ') into dup from (
    select coalesce(nullif(i.card_id,''), i.name) || ' ' || i.rarity || ' ' || i.category as k
    from public.items i
    group by coalesce(nullif(i.card_id,''), i.name), i.rarity, i.category
    having count(*) > 1
       and bool_or(i.id in (select item_id from maintenance.rarity_fix_log where batch = 'rarity-2026-11-08' and step in ('fix','rename')
                            union select merged_into from maintenance.rarity_fix_log where batch = 'rarity-2026-11-08' and step = 'merge'))
  ) t;
  if dup is not null then raise exception '新しく重複ができた: %', dup; end if;

  drop table _fix, _merge, _ren;
  raise notice '完了: 行数 % → %、在庫合計 %（変わらず）', n_before, n_now, s_now;
end
$body$;

-- 実行後の確認（読み取りのみ。SQL エディタにはこの表が出る）
select step as 記録, count(*) as 件数 from maintenance.rarity_fix_log where batch = 'rarity-2026-11-08' group by step
union all select '全体の行数', count(*) from public.items
union all select '全体の在庫合計', coalesce(sum(stock),0) from public.items;
