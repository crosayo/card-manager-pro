-- Q-2026-11-06-1 の戻し: 「管理者判定変更_2026-11-14.sql」を実行する前の判定（ログインしていれば管理者）に戻す
-- 2026-11-14 作成。管理者なのに保存・在庫変更・Wiki取込が権限エラーになるときなどに実行する。
--
-- ■ 注意: 戻すと、Auth の新規登録か匿名サインインが有効な場合に、第三者が作ったアカウントでも全データを書き換え・全削除できる状態に戻る。
--   戻す前にダッシュボードで新規登録・匿名サインインがオフであることを確かめる（確認SQLの冒頭）。
--   管理者が登録されていないだけなら、戻さずに SQL エディタで admins に追加する方が安全:
--     insert into public.admins (user_id) select id from auth.users where email = 'ここに管理者のメールアドレス';
--
-- やること（全体が1つの DO ブロック。途中で失敗すれば何も変わらない）:
--   1. maintenance.admin_policy_backup に保存した元の条件で、ポリシーを元に戻す（いま is_admin() を使っているものだけ）。戻したら記録を消す。
--      変更SQLは anon か public を含む SELECT ポリシーを置き換えない（記録にも入らない）ので、戻しもそれらには触らない。
--   2. can_view()・reset_all_data()・increment_stock() を変更前の定義（auth.role() = 'authenticated'）に戻す。
--   - public.admins 表と public.is_admin() は残す（どこからも使われなくなるだけで害はない。アプリの新しい版と
--     「カード変更関数」が is_admin() を呼ぶため、消すとそれらが動かなくなる）。再変更のときは登録済みの管理者がそのまま使われる。
--   - アプリは新しい版のままでよい（画面と /api/scrape は is_admin() で判定し続けるので、admins に登録された人だけが管理者のまま）。

do $$
declare
  v_pol record;
  v_cur record;
  v_restored integer := 0;
begin
  if to_regclass('maintenance.admin_policy_backup') is null then
    raise exception '中止: maintenance.admin_policy_backup がありません。変更SQLが実行されていないようです（何も変更していません）';
  end if;

  -- 1. ポリシーを元の条件に戻す
  for v_pol in
    select b.tablename, b.policyname, b.cmd, b.qual, b.with_check
    from maintenance.admin_policy_backup b
    order by b.tablename, b.policyname
  loop
    select p.qual, p.with_check into v_cur
    from pg_policies p
    where p.schemaname = 'public' and p.tablename = v_pol.tablename and p.policyname = v_pol.policyname;
    if not found then
      raise notice 'ポリシー %「%」は今はないため戻しません', v_pol.tablename, v_pol.policyname;
      continue;
    end if;
    if (coalesce(v_cur.qual, '') || ' ' || coalesce(v_cur.with_check, '')) !~ 'is_admin\(' then
      raise notice 'ポリシー %「%」は is_admin() を使っていないため戻しません（変更のあとに書き換えられた）', v_pol.tablename, v_pol.policyname;
      continue;
    end if;
    if v_pol.qual is not null and v_pol.with_check is not null then
      execute format('alter policy %I on public.%I using (%s) with check (%s)', v_pol.policyname, v_pol.tablename, v_pol.qual, v_pol.with_check);
    elsif v_pol.qual is not null then
      execute format('alter policy %I on public.%I using (%s)', v_pol.policyname, v_pol.tablename, v_pol.qual);
    elsif v_pol.with_check is not null then
      execute format('alter policy %I on public.%I with check (%s)', v_pol.policyname, v_pol.tablename, v_pol.with_check);
    end if;
    v_restored := v_restored + 1;
  end loop;
  delete from maintenance.admin_policy_backup;

  -- 2. DB関数を変更前の定義に戻す（2026-11-14 時点の schema.sql と同じ）
  create or replace function public.can_view()
  returns boolean
  language sql
  stable
  security definer
  set search_path = public
  as $fn$
    select coalesce(auth.role(), '') = 'authenticated'
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
    if coalesce(auth.role(), '') <> 'authenticated' then
      raise exception '権限エラー: ログインが必要です' using errcode = '42501';
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
    if coalesce(auth.role(), '') <> 'authenticated' then
      raise exception '権限エラー: ログインが必要です' using errcode = '42501';
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

  raise notice '元に戻したポリシー % 件', v_restored;
end;
$$;

-- 結果（読み取りのみ）: いま is_admin() を使っているポリシー（0行なら全部戻った）
select p.tablename, p.policyname, p.cmd, p.roles, p.qual, p.with_check
from pg_policies p
where p.schemaname = 'public'
  and (coalesce(p.qual, '') || ' ' || coalesce(p.with_check, '')) ~ 'is_admin\('
order by p.tablename, p.policyname;
