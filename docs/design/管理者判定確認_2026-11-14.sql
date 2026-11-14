-- Q-2026-11-06-1: 管理者判定（is_admin）の確認。読み取りのみ。何も変更しない。
-- 2026-11-14 作成。「管理者判定変更_2026-11-14.sql」の前と後に実行する。
-- Supabase の SQL エディタは最後の結果しか表示しないため、1つの SELECT で「項目・件数・詳細・判定」の表を1つ返す。
--
-- ■ 先にダッシュボードで見ること（読むだけ。SQL では見られない）
--   Supabase ダッシュボード → Authentication → Sign In / Providers（画面名は版により「Providers」「Settings」）
--     - 「Allow new users to sign up」（新規登録を許可）が **オフ** であること
--     - 「Allow anonymous sign-ins」（匿名サインイン）が **オフ** であること
--     - Email 以外のプロバイダ（Google など）が有効なら、それでも新規登録できるのでオフであること
--   どれかがオンなら、第三者が自分でアカウントを作れる。この変更でそのアカウントは管理者にならなくなるが、
--   オンにしておく理由がなければオフにする（オーナー判断。オフにしても既存の管理者のログインは変わらない）。
--
-- 見るところ:
--   - 変更前: 「1.」で管理者として登録するメールアドレスを確かめる（変更SQLの先頭に書く）。
--             「2. 匿名ユーザー」が 0 であること。1 以上なら匿名サインインが使われた跡がある（要確認）。
--             「6.」が変更で is_admin() に切り替わるポリシーの一覧。「7.」は切り替わる DB 関数。
--   - 変更後: 「3.」「4.」が OK、「5.」が 1 以上、「6.」「7.」が 0 であること。
--   - 「8.」「9.」は参考（この変更では触らない。8. は Storage の画像のポリシー、9. は誰でも読める SELECT ポリシー）。
--   - 「10.」は authenticated も含むが anon か public にも向けた SELECT ポリシー（閲覧用。条件に auth.role() を使うものは除く）。
--     変更SQLは置き換えない（2026-11-14 レビュー）。
--   - 「11.」は変更SQL・戻しSQLが決め打ちの定義で置き換える3つの関数。本文が変更前（schema.sql の 3cb6967 の版）か変更後（今の schema.sql）の
--     どちらかと一致すれば OK。「想定と違う」なら本番で書き換えられているので、変更・戻しを実行せずに報告する。

with users as (
  select u.id, u.email, coalesce(u.is_anonymous, false) as is_anonymous, u.created_at, u.last_sign_in_at
  from auth.users u
),
admins_count as (
  select case when to_regclass('public.admins') is null then null
              else (xpath('/row/c/text()', query_to_xml('select count(*) as c from public.admins a join auth.users u on u.id = a.user_id', false, true, '')))[1]::text::integer
         end as n
),
admin_emails as (
  select case when to_regclass('public.admins') is null then null
              else (xpath('/row/e/text()', query_to_xml('select string_agg(u.email, '' / '' order by u.email) as e from public.admins a join auth.users u on u.id = a.user_id', false, true, '')))[1]::text
         end as e
),
target_policies as (
  -- 変更SQLが is_admin() に切り替えるポリシー（変更SQLと同じ条件）
  select p.tablename, p.policyname, p.cmd, p.roles, p.qual, p.with_check
  from pg_policies p
  where p.schemaname = 'public'
    and p.tablename <> 'admins'
    and (coalesce(p.qual, '') || ' ' || coalesce(p.with_check, '')) !~ '(can_view|is_admin)\('
    and (
      'authenticated' = any(p.roles)
      or (coalesce(p.qual, '') || ' ' || coalesce(p.with_check, '')) like '%auth.role()%'
      or (p.cmd <> 'SELECT' and ('public' = any(p.roles) or 'anon' = any(p.roles)))
    )
    and not (p.cmd = 'SELECT' and ('anon' = any(p.roles) or 'public' = any(p.roles)) and coalesce(p.qual, '') not like '%auth.role()%')
),
fixed_functions as (
  -- 変更SQL・戻しSQLが決め打ちの定義で置き換える関数。本文（コメント・空白の違いを除く）の md5 を、
  -- 変更前（2026-11-14 時点の設定画面 SQL＝コミット 3cb6967 の schema.sql）・変更後（今の schema.sql）の定義と比べる
  select p.proname,
         md5(btrim(regexp_replace(regexp_replace(p.prosrc, '--[^\n]*', '', 'g'), '\s+', ' ', 'g'))) as h,
         coalesce(array_to_string(p.proconfig, ','), '') as cfg
  from pg_proc p join pg_namespace n on n.oid = p.pronamespace
  where n.nspname = 'public' and p.proname in ('can_view', 'reset_all_data', 'increment_stock')
),
fixed_judged as (
  select f.proname, f.cfg,
         case
           when (f.proname, f.h) in (('can_view', '53e7bfc96c70940978db14fd8e6d2712'), ('reset_all_data', 'f3f4a2505d70d366e306f149087aaf2c'), ('increment_stock', 'f22608b5b0d978830297353ddcd2f1f3')) then '変更前の定義'
           when (f.proname, f.h) in (('can_view', 'c8fb8d651e4dff4e1e2a273caa3d1747'), ('reset_all_data', '49e8b127cb260fcda51c8730d1100a2b'), ('increment_stock', '9d58ae856e8a8550bebf80e5c7687a63')) then '変更後の定義'
           else '想定と違う'
         end as state
  from fixed_functions f
),
kept_select as (
  -- 置き換えの対象から外す SELECT ポリシー（anon か public を含む。閲覧用。変更SQLは触らない）
  select p.tablename, p.policyname, p.roles, p.qual
  from pg_policies p
  where p.schemaname = 'public'
    and p.tablename <> 'admins'
    and p.cmd = 'SELECT'
    and ('anon' = any(p.roles) or 'public' = any(p.roles))
    and (coalesce(p.qual, '') || ' ' || coalesce(p.with_check, '')) !~ '(can_view|is_admin)\('
    and 'authenticated' = any(p.roles)
    and coalesce(p.qual, '') not like '%auth.role()%'
),
role_functions as (
  -- 関数の中で auth.role() により「ログインしているか」だけを見ている public の関数
  select p.proname, p.prosecdef
  from pg_proc p
  join pg_namespace n on n.oid = p.pronamespace
  where n.nspname = 'public'
    and p.prokind = 'f'
    and pg_get_functiondef(p.oid) like '%auth.role()%'
),
storage_policies as (
  select p.tablename, p.policyname, p.cmd, p.roles
  from pg_policies p
  where p.schemaname = 'storage'
    and ('authenticated' = any(p.roles) or (coalesce(p.qual, '') || ' ' || coalesce(p.with_check, '')) like '%auth.role()%')
),
open_select as (
  select p.tablename, p.policyname
  from pg_policies p
  where p.schemaname = 'public' and p.cmd = 'SELECT' and p.qual = 'true'
    and not ('authenticated' = all(p.roles))
)
select '1. ログインできるユーザー（匿名を除く）' as 項目,
       (select count(*) from users where not is_anonymous) as 件数,
       coalesce((select string_agg(format('%s（作成 %s・最終ログイン %s）', email, to_char(created_at, 'YYYY-MM-DD'), coalesce(to_char(last_sign_in_at, 'YYYY-MM-DD'), 'なし')), ' / ' order by created_at)
                 from (select * from users where not is_anonymous order by created_at limit 10) t), 'なし') as 詳細,
       case when (select count(*) from users where not is_anonymous) = 1 then 'OK'
            else '要確認（オーナー以外のアカウントがないか見る）' end as 判定
union all
select '2. 匿名ユーザー（is_anonymous）',
       (select count(*) from users where is_anonymous),
       '0 であること。1 以上なら匿名サインインが有効になっていた可能性がある',
       case when (select count(*) from users where is_anonymous) = 0 then 'OK' else '要確認' end
union all
select '3. admins 表',
       case when to_regclass('public.admins') is null then 0 else 1 end,
       '変更前は 0（まだない）、変更後は 1',
       case when to_regclass('public.admins') is null then '参考（変更前）' else 'OK' end
union all
select '4. is_admin() 関数',
       (select count(*) from pg_proc p join pg_namespace n on n.oid = p.pronamespace
        where n.nspname = 'public' and p.proname = 'is_admin' and p.prosecdef),
       '変更前は 0、変更後は 1（SECURITY DEFINER）',
       '参考'
union all
select '5. 登録されている管理者',
       coalesce((select n from admins_count), 0),
       coalesce((select e from admin_emails), '（admins 表がまだない）'),
       case when (select n from admins_count) is null then '参考（変更前）'
            when (select n from admins_count) >= 1 then 'OK'
            else '要確認（0人＝だれも管理できない）' end
union all
select '6. is_admin() に切り替えるポリシー（残り）',
       (select count(*) from target_policies),
       coalesce((select string_agg(format('%s「%s」%s %s', tablename, policyname, cmd, roles::text), ' / ' order by tablename, policyname)
                 from target_policies), 'なし'),
       case when (select count(*) from target_policies) = 0 then 'OK（変更後）' else '参考（変更前はここに並ぶ）' end
union all
select '7. auth.role() でログインだけを見ている関数（残り）',
       (select count(*) from role_functions),
       coalesce((select string_agg(proname || case when prosecdef then '（definer）' else '' end, ' / ' order by proname) from role_functions), 'なし'),
       case when (select count(*) from role_functions) = 0 then 'OK（変更後）'
            when (select count(*) from role_functions where proname not in ('can_view', 'reset_all_data', 'increment_stock')) > 0
              then '要確認（変更SQLが知らない関数がある。報告してください）'
            else '参考（変更前は can_view・reset_all_data・increment_stock）' end
union all
select '8. Storage のポリシー（authenticated 向け）',
       (select count(*) from storage_policies),
       coalesce((select string_agg(format('%s「%s」%s', tablename, policyname, cmd), ' / ' order by tablename, policyname) from storage_policies), 'なし'),
       '参考（この変更では触らない。サプライ画像のアップロードはログインだけで許されたまま）'
union all
select '9. 条件なしで読める SELECT ポリシー',
       (select count(*) from open_select),
       coalesce((select string_agg(format('%s「%s」', tablename, policyname), ' / ' order by tablename, policyname) from open_select), 'なし'),
       case when (select count(*) from open_select) = 0 then 'OK' else '要確認（招待制の外で読める）' end
union all
select '10. 置き換えの対象から外す SELECT ポリシー（anon・public 向け）',
       (select count(*) from kept_select),
       coalesce((select string_agg(format('%s「%s」%s 条件: %s', tablename, policyname, roles::text, coalesce(qual, '-')), ' / ' order by tablename, policyname) from kept_select), 'なし'),
       '参考（authenticated も含むが閲覧用なので変更SQL・戻しSQLとも触らない。条件が true なら「9.」にも出る）'
union all
select '11. 変更・戻しで決め打ちの定義に置き換える関数（can_view・reset_all_data・increment_stock）',
       (select count(*) from fixed_judged where state = '想定と違う'),
       coalesce((select string_agg(format('%s: %s（設定 %s）', proname, state, cfg), ' / ' order by proname) from fixed_judged), 'なし'),
       case when (select count(*) from fixed_judged) < 3 then '要確認（関数が足りない）'
            when (select count(*) from fixed_judged where state = '想定と違う') = 0 then 'OK'
            else '要確認（本番で定義が書き換えられている。変更・戻しを実行すると上書きされるので、実行せずに報告する）' end;
