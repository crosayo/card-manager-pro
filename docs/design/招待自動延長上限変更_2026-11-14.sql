-- Q-2026-11-06-7: 自動延長付きの招待リンクが、使われ続ける限り期限切れにならない問題の修正
-- 2026-11-14 作成。元に戻すときは「招待自動延長上限戻し_2026-11-14.sql」を実行する。
-- 順番: ①「招待自動延長上限確認_2026-11-14.sql」 → ② この「変更」 → ① をもう一度 → 問題があれば ③「戻し」。
--
-- redeem_invite の自動延長で延びる先を「作成から180日」までにする。それより先は管理者が招待リンクの画面で手動で延長する
-- （手動の延長はこれまでどおり上限なし。手動で延ばした期限を自動延長が短くすることはない）。
-- 確認SQLの「2.」に出る招待リンクは、作成から180日を過ぎているため、変更後は自動では延びず、今の有効期限で切れる。
-- 関数の置き換え1文だけ（表・データ・権限は変えない）。アプリのデプロイとは無関係（画面の説明文は新しいアプリで変わる）。
-- supabase/schema.sql（0. の redeem_invite）と同じ定義。

create or replace function public.redeem_invite(p_code text)
returns json
language plpgsql
security definer
set search_path = public
as $$
declare
  v_invite record;
  v_headers json := coalesce(current_setting('request.headers', true), '{}')::json;
begin
  update public.invites
  set last_used_at = now(),
      use_count = use_count + 1,
      expires_at = case
        when auto_extend_days is not null
          then greatest(expires_at, least(now() + make_interval(days => auto_extend_days), created_at + interval '180 days'))
        else expires_at
      end
  where code = p_code and revoked_at is null and expires_at > now()
  returning id, label, expires_at into v_invite;

  if not found then
    return json_build_object('valid', false);
  end if;

  insert into public.invite_access_logs (invite_id, ip, user_agent)
  values (v_invite.id, public.request_client_ip(), left(v_headers->>'user-agent', 300));
  delete from public.invite_access_logs
  where invite_id = v_invite.id and accessed_at < now() - interval '90 days';

  return json_build_object('valid', true, 'label', v_invite.label, 'expires_at', v_invite.expires_at);
end;
$$;

-- 結果（読み取りのみ）: 上限が入ったこと（true）
select p.prosrc like '%180 days%' as 自動延長の上限あり
from pg_proc p join pg_namespace n on n.oid = p.pronamespace
where n.nspname = 'public' and p.proname = 'redeem_invite';
