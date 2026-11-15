-- Q-2026-11-13-3: maintenance スキーマ（2026-11-08 のレアリティ整理の記録表・2026-11-14 の管理者判定のポリシー記録表）が
-- API（anon・authenticated）から使えないことの確認。読み取りのみ。何も変更しない。
-- 2026-11-14 作成。いつ実行してもよい（「管理者判定変更_2026-11-14.sql」の後にもう一度実行すると、新しい記録表も確かめられる）。
-- Supabase の SQL エディタは最後の結果しか表示しないため、1つの SELECT で「項目・件数・詳細・判定」の表を1つ返す。
-- 見るところ: 判定がすべて OK であること。「要確認」があれば報告してください（直す SQL は別に作る）。

with roles(r) as (values ('anon'), ('authenticated')),
tables as (
  select c.oid, c.relname
  from pg_class c join pg_namespace n on n.oid = c.relnamespace
  where n.nspname = 'maintenance' and c.relkind in ('r', 'v', 'm', 'p')
)
select '1. maintenance スキーマがあるか' as 項目,
       case when to_regnamespace('maintenance') is null then 0 else 1 end as 件数,
       coalesce((select string_agg(relname, ', ' order by relname) from tables), '（表なし）') as 詳細,
       case when to_regnamespace('maintenance') is null then '参考（スキーマがない）' else 'OK' end as 判定
union all
select format('2. %s が maintenance を使えるか（USAGE）', r),
       case when to_regnamespace('maintenance') is not null and has_schema_privilege(r, 'maintenance', 'USAGE') then 1 else 0 end,
       '0 であること（0 なら中の表は API から見えない）',
       case when to_regnamespace('maintenance') is not null and has_schema_privilege(r, 'maintenance', 'USAGE') then '要確認' else 'OK' end
from roles
union all
select format('3. %s が maintenance に表を作れるか（CREATE）', r),
       case when to_regnamespace('maintenance') is not null and has_schema_privilege(r, 'maintenance', 'CREATE') then 1 else 0 end,
       '0 であること',
       case when to_regnamespace('maintenance') is not null and has_schema_privilege(r, 'maintenance', 'CREATE') then '要確認' else 'OK' end
from roles
union all
select format('4. %s が読める maintenance の表', r),
       (select count(*) from tables t where has_table_privilege(r, t.oid, 'SELECT')),
       coalesce((select string_agg(t.relname, ', ' order by t.relname) from tables t where has_table_privilege(r, t.oid, 'SELECT')), 'なし')
         || '（表の権限。スキーマの USAGE がなければ実際には読めない）',
       case when (select count(*) from tables t where has_table_privilege(r, t.oid, 'SELECT')) = 0 then 'OK'
            else '参考（2. が 0 なら API からは読めない）' end
from roles
union all
select '5. API に公開しているスキーマに maintenance が入っていないか',
       case when coalesce(current_setting('pgrst.db_schemas', true), '') like '%maintenance%' then 1 else 0 end,
       coalesce(nullif(current_setting('pgrst.db_schemas', true), ''), '（設定を読めない。ダッシュボードの Settings → API → Exposed schemas で確かめる）'),
       case when coalesce(current_setting('pgrst.db_schemas', true), '') like '%maintenance%' then '要確認' else 'OK' end;
