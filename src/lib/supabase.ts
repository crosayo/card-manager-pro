import { createClient, SupabaseClient } from '@supabase/supabase-js';
import { captureInviteFromUrl, getInviteCode } from './invite';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

export const isSupabaseEnabled = !!supabaseUrl && !!supabaseAnonKey;

// 招待リンクから開かれた場合、最初の通信より前に招待コードを保存する
captureInviteFromUrl();

// 全リクエストに招待コードを付与する（DB側で current_setting('request.headers') から読む）
const fetchWithInvite: typeof fetch = (input, init) => {
  const code = getInviteCode();
  if (!code) return fetch(input, init);
  const headers = new Headers(init?.headers);
  headers.set('x-invite-code', code);
  return fetch(input, { ...init, headers });
};

// 未設定時は undefined だが、利用側は ensureConnection() で確認してから使うため型は非 null とする
export const supabase: SupabaseClient = isSupabaseEnabled
  ? createClient(supabaseUrl!, supabaseAnonKey!, { global: { fetch: fetchWithInvite } })
  : (undefined as unknown as SupabaseClient);
