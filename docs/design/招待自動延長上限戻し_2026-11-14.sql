-- Q-2026-11-06-7 の戻し: 「招待自動延長上限変更_2026-11-14.sql」を実行する前の redeem_invite（自動延長に上限なし）に戻す
-- 2026-11-14 作成。招待リンクを開くとエラーになるときなどに実行する。
-- 戻すと、自動延長付きの招待リンクは使われ続ける限り期限切れにならない状態に戻る。

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
          then greatest(expires_at, now() + make_interval(days => auto_extend_days))
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

-- 結果（読み取りのみ）: 上限が外れたこと（false）
select p.prosrc like '%180 days%' as 自動延長の上限あり
from pg_proc p join pg_namespace n on n.oid = p.pronamespace
where n.nspname = 'public' and p.proname = 'redeem_invite';
