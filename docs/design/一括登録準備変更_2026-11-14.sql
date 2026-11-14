-- 全カード一括登録の準備（2026-11-14）。企画書「全カード・全パックの一括登録」の「必要な改修」の DB 部分。
--   1. 一意索引の前提を整える: 型番欄の誤り 4 行を直す（「none」「None」→ 空、型番のあとにパック名が続いた1行 → 型番だけ）。型番修正一覧.csv。
--   2. 一意索引 items_card_rarity_category_key（型番×レアリティ×収録パック。型番が空の行はカード名で区別）。同じ行を二重に入れられなくなる（P-1-03）。
--   3. 検索の索引（pg_trgm。P-1-05）: 拡張 pg_trgm と、search_key の GIN 索引。今の search_items は strpos で探すため索引を使えないので、
--      索引を使える条件（3文字以上でいちばん長い検索語の LIKE。今の条件の一部なので結果は同じ）を1つ足し、plan_cache_mode を force_custom_plan にする。
--      関数の他の部分は本番の今の定義をそのまま使う（書き換え前の定義は記録表に保存し、戻しで元に戻す）。
--   4. 投入用の取込表 public.bulk_import_items を作る（RLS 有効・ポリシーなし＝API からは読めない。一括登録の変更 SQL の最後に削除する）。
-- 順番: ① N修正 → ② 一括登録準備（この SQL）→ ③ 一括登録。
-- バッチ名: prep-2026-11-14（maintenance.bulk_import_log に記録し、戻しはこの記録を使う）。
-- ② 変更。ファイルの中身をすべて貼り付けて1回で実行する。本体は1つの DO ブロックなので、失敗すれば何も変わらない。
-- N修正が未実行、型番を直す行が想定と違う、重複が残る、search_items の形が想定と違う、のどれかで中止する。二重実行も止める。
-- 索引の作成は 3万行で数秒の見込み（ローカルの PostgreSQL 16 で約1秒）。作成中は items への書き込みが待たされるので、アプリを操作していない時間に実行する。

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
  bad text; n_before bigint; s_before bigint; n_now bigint; s_now bigint; trgm_schema text; trgm_created boolean := false;
  old_def text; new_def text; n_hit int;
begin
  if exists (select 1 from maintenance.bulk_import_log where batch = 'prep-2026-11-14') then
    raise exception 'このバッチ（prep-2026-11-14）はすでに実行済みです。二重実行を防ぐため中止します';
  end if;
  if not exists (select 1 from maintenance.rarity_fix_log where batch = 'nfix-2026-11-14') then
    raise exception '先に「N誤登録修正変更_2026-11-14.sql」を実行してください（順番: N修正 → 準備 → 一括登録）';
  end if;
  if to_regclass('public.bulk_import_items') is not null then raise exception '取込表 public.bulk_import_items がすでにあるので中止'; end if;
  if exists (select 1 from pg_indexes where schemaname = 'public' and indexname in ('items_card_rarity_category_key', 'items_search_key_trgm')) then
    raise exception '索引がすでにあるので中止';
  end if;

  select count(*), coalesce(sum(stock), 0) into n_before, s_before from public.items;

  -- 1. 型番欄の誤りを直す
  drop table if exists pg_temp._cfix;
  create temp table _cfix (id bigint primary key, old_card_id text not null, new_card_id text not null);
  insert into pg_temp._cfix values
    (107159, 'none', ''),
    (107270, 'none', ''),
    (107300, '23TP-JP212 トーナメントパック 2023 Vol.2', '23TP-JP212'),
    (108798, 'None', '');
  select string_agg(f.id::text, ', ') into bad from pg_temp._cfix f left join public.items i on i.id = f.id
  where i.id is null or i.card_id is distinct from f.old_card_id;
  if bad is not null then raise exception '型番を直す行が想定と違うので中止: %', bad; end if;
  insert into maintenance.bulk_import_log (batch, step, item_id, old_value, new_value)
  select 'prep-2026-11-14', 'cardid', f.id, jsonb_build_object('card_id', f.old_card_id), jsonb_build_object('card_id', f.new_card_id) from pg_temp._cfix f;
  update public.items i set card_id = f.new_card_id from pg_temp._cfix f where i.id = f.id;

  -- 2. 重複が残っていないか（残っていれば索引を作れないので中止）
  select string_agg(k, ' / ') into bad from (
    select coalesce(nullif(card_id, ''), '名前:' || name) || ' ' || coalesce(rarity, '') || ' ' || coalesce(category, '') || ' ×' || count(*) as k
    from public.items group by coalesce(nullif(card_id, ''), '名前:' || name), coalesce(rarity, ''), coalesce(category, '')
    having count(*) > 1 limit 30) t;
  if bad is not null then raise exception '重複が残っているので一意索引を作れない（先に片付けが必要）: %', bad; end if;

  -- 3. 一意索引（型番×レアリティ×収録パック。型番が空ならカード名）
  create unique index items_card_rarity_category_key on public.items ((coalesce(nullif(card_id, ''), '名前:' || name)), (coalesce(rarity, '')), (coalesce(category, '')));
  insert into maintenance.bulk_import_log (batch, step, new_value) values ('prep-2026-11-14', 'index', jsonb_build_object('name', 'items_card_rarity_category_key'));

  -- 4. pg_trgm と検索の索引
  if not exists (select 1 from pg_extension where extname = 'pg_trgm') then
    create schema if not exists extensions;
    create extension pg_trgm with schema extensions;
    trgm_created := true;
  end if;
  select n.nspname into trgm_schema from pg_extension e join pg_namespace n on n.oid = e.extnamespace where e.extname = 'pg_trgm';
  insert into maintenance.bulk_import_log (batch, step, new_value) values ('prep-2026-11-14', 'extension', jsonb_build_object('created', trgm_created, 'schema', trgm_schema));
  execute format('create index items_search_key_trgm on public.items using gin (search_key %I.gin_trgm_ops)', trgm_schema);
  insert into maintenance.bulk_import_log (batch, step, new_value) values ('prep-2026-11-14', 'index', jsonb_build_object('name', 'items_search_key_trgm'));

  -- 5. search_items に索引を使える条件を足す（いちばん長い検索語を含むこと。今の「全部の語を含む」条件の一部なので結果は変わらない）
  --    検索語は normalize_search で % _ \ が取り除かれているので、LIKE の特殊文字の心配はない。
  select pg_get_functiondef(p.oid) into old_def from pg_proc p join pg_namespace n on n.oid = p.pronamespace
  where n.nspname = 'public' and p.proname = 'search_items';
  if old_def is null then raise exception 'search_items が見つからないので中止'; end if;
  select count(*) into n_hit from regexp_matches(old_def, 'strpos\(i\.search_key, tok\) = 0\s*\)', 'g');
  if n_hit <> 1 or old_def ~ 'v_like' then raise exception 'search_items の形が想定と違うので中止（該当 % か所）', n_hit; end if;
  select count(*) into n_hit from regexp_matches(old_def, 'v_result json;', 'g');
  if n_hit <> 1 then raise exception 'search_items の形が想定と違うので中止（v_result）'; end if;
  select count(*) into n_hit from regexp_matches(old_def, '\n(\s*)WITH filtered AS \(', 'g');
  if n_hit <> 1 then raise exception 'search_items の形が想定と違うので中止（WITH filtered）'; end if;
  new_def := regexp_replace(old_def, 'v_result json;',
    E'v_result json;\n  v_like text;  -- pg_trgm の索引用（2026-11-14 一括登録準備）');
  new_def := regexp_replace(new_def, '\n(\s*)WITH filtered AS \(',
    E'\n  -- 3文字以上でいちばん長い検索語で先に絞る（索引を使う）。2文字以下だけなら絞らない（2026-11-14 一括登録準備）\n  v_like := coalesce((SELECT ''%'' || t || ''%'' FROM unnest(v_tokens) AS t WHERE length(t) >= 3 ORDER BY length(t) DESC LIMIT 1), ''%'');\n\n\\1WITH filtered AS (');
  new_def := regexp_replace(new_def, '(strpos\(i\.search_key, tok\) = 0\s*\))',
    E'\\1\n      AND i.search_key LIKE v_like  -- 上の条件の一部なので結果は変わらない');
  insert into maintenance.bulk_import_log (batch, step, old_value, new_value)
  values ('prep-2026-11-14', 'function', jsonb_build_object('def', old_def), jsonb_build_object('def', new_def));
  execute new_def;
  -- 呼び出しごとに検索語に合わせた実行計画を作る（短い語で索引を全部読む計画を使い回さないため）
  execute format('alter function %s set plan_cache_mode = force_custom_plan', (select p.oid::regprocedure from pg_proc p join pg_namespace n on n.oid = p.pronamespace where n.nspname = 'public' and p.proname = 'search_items'));

  -- 6. 投入用の取込表（Table Editor の CSV インポートで入れる）
  create table public.bulk_import_items (
    seq integer primary key,
    name text not null,
    card_id text not null,
    rarity text not null,
    category text not null,
    pack_release_date text
  );
  alter table public.bulk_import_items enable row level security;
  revoke all on public.bulk_import_items from anon, authenticated;
  insert into maintenance.bulk_import_log (batch, step, new_value) values ('prep-2026-11-14', 'staging', jsonb_build_object('table', 'public.bulk_import_items'));

  select count(*), coalesce(sum(stock), 0) into n_now, s_now from public.items;
  if n_now <> n_before or s_now <> s_before then raise exception '行数か在庫合計が変わった（% → %、% → %）', n_before, n_now, s_before, s_now; end if;
  drop table pg_temp._cfix;
  raise notice '完了: 型番修正 %、索引2つ、search_items 更新、取込表作成。行数 %・在庫合計 %（変わらず）', 4, n_now, s_now;
end
$body$;

select step as 記録, count(*) as 件数 from maintenance.bulk_import_log where batch = 'prep-2026-11-14' group by step
union all select '全体の行数', count(*) from public.items
union all select '全体の在庫合計', coalesce(sum(stock), 0) from public.items;
