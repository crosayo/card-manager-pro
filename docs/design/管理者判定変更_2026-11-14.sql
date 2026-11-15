-- Q-2026-11-06-1: 管理者を「ログインしているか」ではなく「admins 表に登録されているか」で判定する
-- 2026-11-14 作成。元に戻すときは「管理者判定戻し_2026-11-14.sql」を実行する。
-- 順番: ①「管理者判定確認_2026-11-14.sql」 → ② この「変更」 → ① をもう一度 → 問題があれば ③「戻し」。
--
-- ■ 実行する前に、すぐ下の v_email の 'ここに管理者のメールアドレス' を、
--   アプリにログインするときのメールアドレス（確認SQLの「1.」に出るもの）に書き換える。
--   書き換えていない・そのアドレスのユーザーがいない・匿名ユーザーだった場合は、何も変えずに中止する。
--
-- やること（全体が1つの DO ブロック。途中で失敗すれば何も変わらない）:
--   1. public.admins 表（user_id → auth.users）を作り、上のメールアドレスのユーザーを最初の管理者として登録する。
--      admins は API から読み書きできない（RLS 有効・ポリシーなし・anon/authenticated の権限なし）。
--      管理者の追加・削除は SQL エディタで行う（04 §6.2）。
--   2. public.is_admin()（SECURITY DEFINER・search_path 固定・stable）を作る。auth.uid() が admins にあれば true。
--   3. ロックアウト防止: 登録後に admins が0人なら中止する。
--   4. public スキーマのポリシーのうち、authenticated 向け・auth.role() を使うもの・誰でも書き込めるものの条件を
--      (select public.is_admin()) に置き換える（ポリシー名・対象ロール・操作は変えない。招待制の閲覧ポリシー can_view() は対象外）。
--      ただし anon か public を含む SELECT ポリシー（{anon,authenticated} 向けの using (true) など）は閲覧用なので置き換えない
--      （置き換えると招待リンクの閲覧者が読めなくなる。2026-11-14 レビュー。確認SQLの「10.」に一覧が出る）。
--      条件に auth.role() を使うもの（public 向けでも実際は「ログインしていれば読める」）は従来どおり置き換える。
--      元の条件は maintenance.admin_policy_backup に保存し、戻しSQLが使う。
--   5. can_view()・reset_all_data()・increment_stock() の「ログインしているか」の判定を is_admin() に置き換える。
--   6. 置き換え漏れがあれば中止する。
-- 最後の SELECT（読み取りのみ）が、登録した管理者と置き換えたポリシーの一覧を返す。
--
-- 注意:
--   - SQL エディタ（postgres ロール）は RLS の外で動くので、この変更のあとも SQL エディタからはいつでも admins を直せる。
--     アプリから管理できなくなったら、SQL エディタで「insert into public.admins (user_id) select id from auth.users where email = '…';」。
--   - 一時表は使わない（Q-2026-11-13-3）。
--   - 2026-11-01 の「リクエスト挿入ポリシー戻し」「リクエスト削除ポリシー追加」を後から実行すると、authenticated（ログインだけ）向けの
--     ポリシーが作られる。そのときはこの変更SQLをもう一度実行して is_admin() に置き換える（二重実行しても安全）。

do $$
declare
  v_email text := 'ここに管理者のメールアドレス';
  v_uid uuid;
  v_anon boolean;
  v_admins integer;
  v_pol record;
  v_changed integer := 0;
  v_left integer;
begin
  -- 0. 入力の確認
  if v_email is null or btrim(v_email) = '' or v_email like 'ここに%' or position('@' in v_email) = 0 then
    raise exception '中止: 先頭の v_email を管理者のメールアドレスに書き換えてから実行してください（何も変更していません）';
  end if;
  select u.id, coalesce(u.is_anonymous, false) into v_uid, v_anon
  from auth.users u
  where lower(u.email) = lower(btrim(v_email));
  if not found then
    raise exception '中止: % のユーザーが auth.users にありません。確認SQLの「1.」のアドレスを使ってください（何も変更していません）', v_email;
  end if;
  if v_anon then
    raise exception '中止: % は匿名ユーザーです（何も変更していません）', v_email;
  end if;

  -- 1. 管理者の表と最初の管理者
  create table if not exists public.admins (
    user_id uuid primary key references auth.users(id) on delete cascade,
    created_at timestamptz not null default now()
  );
  alter table public.admins enable row level security;
  revoke all on public.admins from public, anon, authenticated;
  comment on table public.admins is '管理者として扱う Auth ユーザー（Q-2026-11-06-1）。SQL エディタで追加・削除する';
  insert into public.admins (user_id) values (v_uid) on conflict (user_id) do nothing;

  -- 2. 管理者かどうか（RLS・DB関数・/api/scrape・画面が使う）
  create or replace function public.is_admin()
  returns boolean
  language sql
  stable
  security definer
  set search_path = public, pg_temp
  as $fn$
    select exists (select 1 from public.admins a where a.user_id = auth.uid());
  $fn$;
  revoke all on function public.is_admin() from public;
  grant execute on function public.is_admin() to anon, authenticated, service_role;

  -- 3. ロックアウト防止
  select count(*) into v_admins from public.admins a join auth.users u on u.id = a.user_id and not coalesce(u.is_anonymous, false);
  if v_admins = 0 then
    raise exception '中止: 管理者が0人になります（何も変更していません）';
  end if;

  -- 4. ポリシーの条件を is_admin() に置き換える（元の条件は記録表に保存）
  create schema if not exists maintenance;
  revoke all on schema maintenance from public;
  create table if not exists maintenance.admin_policy_backup (
    tablename text not null,
    policyname text not null,
    cmd text not null,
    roles text[] not null,
    qual text,
    with_check text,
    saved_at timestamptz not null default now(),
    primary key (tablename, policyname)
  );

  for v_pol in
    select p.tablename, p.policyname, p.cmd, p.roles::text[] as roles, p.qual, p.with_check
    from pg_policies p
    where p.schemaname = 'public'
      and p.tablename <> 'admins'
      and (coalesce(p.qual, '') || ' ' || coalesce(p.with_check, '')) !~ '(can_view|is_admin)\('
      and (
        'authenticated' = any(p.roles)
        or (coalesce(p.qual, '') || ' ' || coalesce(p.with_check, '')) like '%auth.role()%'
        or (p.cmd <> 'SELECT' and ('public' = any(p.roles) or 'anon' = any(p.roles)))
      )
      -- 招待リンクの閲覧者（anon）や全員（public）にも向けた SELECT ポリシーは閲覧用なので置き換えない（確認SQLの「10.」。2026-11-14 レビュー）
      and not (p.cmd = 'SELECT' and ('anon' = any(p.roles) or 'public' = any(p.roles)) and coalesce(p.qual, '') not like '%auth.role()%')
    order by p.tablename, p.policyname
  loop
    insert into maintenance.admin_policy_backup (tablename, policyname, cmd, roles, qual, with_check)
    values (v_pol.tablename, v_pol.policyname, v_pol.cmd, v_pol.roles, v_pol.qual, v_pol.with_check)
    on conflict (tablename, policyname) do update
      set cmd = excluded.cmd, roles = excluded.roles, qual = excluded.qual,
          with_check = excluded.with_check, saved_at = now();

    -- 元にある条件だけを置き換える（UPDATE・ALL で WITH CHECK がない場合は USING がそのまま使われる）
    if v_pol.qual is not null and v_pol.with_check is not null then
      execute format('alter policy %I on public.%I using ((select public.is_admin())) with check ((select public.is_admin()))',
                     v_pol.policyname, v_pol.tablename);
    elsif v_pol.qual is not null then
      execute format('alter policy %I on public.%I using ((select public.is_admin()))', v_pol.policyname, v_pol.tablename);
    elsif v_pol.with_check is not null then
      execute format('alter policy %I on public.%I with check ((select public.is_admin()))', v_pol.policyname, v_pol.tablename);
    end if;
    v_changed := v_changed + 1;
  end loop;

  -- 5. DB関数の判定を is_admin() に置き換える（schema.sql と同じ定義）
  create or replace function public.can_view()
  returns boolean
  language sql
  stable
  security definer
  set search_path = public
  as $fn$
    select public.is_admin()
        or exists (
          select 1 from public.invites
          where code = public.request_invite_code()
            and revoked_at is null
            and expires_at > now()
        );
  $fn$;

  create or replace function public.reset_all_data()
  returns void
  language plpgsql
  security definer
  set search_path = public
  as $fn$
  begin
    if not public.is_admin() then
      raise exception '権限エラー: 管理者のみ実行できます' using errcode = '42501';
    end if;
    truncate table public.items restart identity cascade;
    truncate table public.products cascade;
    truncate table public.news restart identity cascade;
  end;
  $fn$;
  revoke execute on function public.reset_all_data() from public, anon;
  grant execute on function public.reset_all_data() to authenticated;

  create or replace function public.increment_stock(item_id bigint, delta integer)
  returns json
  language plpgsql
  security definer
  set search_path = public
  as $fn$
  declare
    updated_row record;
  begin
    if not public.is_admin() then
      raise exception '権限エラー: 管理者のみ実行できます' using errcode = '42501';
    end if;
    update public.items
    set stock = greatest(0, stock + delta),
        updated_at = now()
    where id = item_id
    returning id, name, card_id, rarity, stock, category, updated_at into updated_row;

    if not found then
      raise exception 'Item not found';
    end if;

    return row_to_json(updated_row);
  end;
  $fn$;
  revoke execute on function public.increment_stock(bigint, integer) from public, anon;
  grant execute on function public.increment_stock(bigint, integer) to authenticated;

  -- 6. 置き換え漏れの確認
  select count(*) into v_left
  from pg_policies p
  where p.schemaname = 'public'
    and p.tablename <> 'admins'
    and (coalesce(p.qual, '') || ' ' || coalesce(p.with_check, '')) !~ '(can_view|is_admin)\('
    and (
      'authenticated' = any(p.roles)
      or (coalesce(p.qual, '') || ' ' || coalesce(p.with_check, '')) like '%auth.role()%'
      or (p.cmd <> 'SELECT' and ('public' = any(p.roles) or 'anon' = any(p.roles)))
    )
      -- 招待リンクの閲覧者（anon）や全員（public）にも向けた SELECT ポリシーは閲覧用なので置き換えない（確認SQLの「10.」）
      and not (p.cmd = 'SELECT' and ('anon' = any(p.roles) or 'public' = any(p.roles)) and coalesce(p.qual, '') not like '%auth.role()%');
  if v_left > 0 then
    raise exception '中止: is_admin() に置き換えられなかったポリシーが % 件あります（何も変更していません）', v_left;
  end if;
  select count(*) into v_left
  from pg_proc p join pg_namespace n on n.oid = p.pronamespace
  where n.nspname = 'public' and p.prokind = 'f' and pg_get_functiondef(p.oid) like '%auth.role()%';
  if v_left > 0 then
    raise exception '中止: auth.role() でログインだけを見ている関数が % 個残っています。確認SQLの「7.」を報告してください（何も変更していません）', v_left;
  end if;

  raise notice '管理者 %、置き換えたポリシー % 件', v_email, v_changed;
end;
$$;

-- 結果（読み取りのみ）: 登録されている管理者と、置き換えたポリシー
select '管理者' as 種類, u.email as 名前, to_char(a.created_at, 'YYYY-MM-DD HH24:MI') as 詳細
from public.admins a join auth.users u on u.id = a.user_id
union all
select 'ポリシー', b.tablename || '「' || b.policyname || '」' || b.cmd, '元の条件: ' || coalesce(b.qual, '-') || ' / ' || coalesce(b.with_check, '-')
from maintenance.admin_policy_backup b
order by 1, 2;
