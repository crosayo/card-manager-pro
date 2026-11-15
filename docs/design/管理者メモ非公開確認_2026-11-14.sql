-- Q-2026-11-06-2: requests の管理者メモ（admin_memo）を招待リンクの閲覧者（anon）から見えなくする変更の確認。読み取りのみ。何も変更しない。
-- 2026-11-14 作成。「管理者メモ非公開変更_2026-11-14.sql」の前と後に実行する。
-- Supabase の SQL エディタは最後の結果しか表示しないため、1つの SELECT で「項目・件数・詳細・判定」の表を1つ返す。
-- 見るところ:
--   - 変更前: 「1.」が 1（anon が admin_memo を読める）、「2.」が 0、「3.」が 7。
--   - 変更後: 「1.」が 0、「2.」が 0、「3.」が 7（admin_memo 以外の列はこれまでどおり読める）、「4.」が 1。
--   - 「5.」は、いま管理者メモが入っているリクエストの数（参考。変更後は招待リンクの画面に出なくなる）。

with cols(col) as (
  values ('id'), ('requester_name'), ('message'), ('status'), ('price_total'), ('created_at'), ('resolved_at')
)
select '1. anon が admin_memo を読めるか' as 項目,
       case when has_column_privilege('anon', 'public.requests', 'admin_memo', 'SELECT') then 1 else 0 end as 件数,
       '変更前は 1、変更後は 0' as 詳細,
       case when has_column_privilege('anon', 'public.requests', 'admin_memo', 'SELECT') then '参考（変更前）' else 'OK' end as 判定
union all
select '2. anon が token を読めるか',
       case when has_column_privilege('anon', 'public.requests', 'token', 'SELECT') then 1 else 0 end,
       '0 であること（2026-10-24 から読めない）',
       case when has_column_privilege('anon', 'public.requests', 'token', 'SELECT') then '要確認' else 'OK' end
union all
select '3. anon が読める公開列',
       (select count(*) from cols where has_column_privilege('anon', 'public.requests', col, 'SELECT')),
       coalesce((select string_agg(col, ', ') from cols where not has_column_privilege('anon', 'public.requests', col, 'SELECT')), '7列とも読める'),
       case when (select count(*) from cols where has_column_privilege('anon', 'public.requests', col, 'SELECT')) = 7 then 'OK'
            else '要確認（読めない列があると招待リンクのリクエスト一覧が出ない）' end
union all
select '4. 管理者（authenticated）が admin_memo を読めるか',
       case when has_column_privilege('authenticated', 'public.requests', 'admin_memo', 'SELECT') then 1 else 0 end,
       '1 であること（この変更では変えない）',
       case when has_column_privilege('authenticated', 'public.requests', 'admin_memo', 'SELECT') then 'OK' else '要確認' end
union all
select '5. 管理者メモが入っているリクエスト',
       (select count(*) from public.requests where nullif(btrim(admin_memo), '') is not null),
       '参考（変更後は招待リンクの画面に出なくなる）',
       '参考';
