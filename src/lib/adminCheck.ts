// ログイン状態が変わったときの「管理者か」の決め方（2026-11-14 独立レビュー）。
// is_admin() の確認が通信エラーなどで失敗したとき、トークンの自動更新（TOKEN_REFRESHED）など
// 同じユーザーのままの出来事なら直前の値を保つ（一時的な通信エラーで管理画面から締め出さない）。
// ログイン直後など、それ以外の出来事で失敗したら管理者として扱わない。

/** 同じユーザーのまま起きる出来事（supabase-js の AuthChangeEvent） */
const SAME_USER_EVENTS = new Set(['TOKEN_REFRESHED', 'USER_UPDATED']);

export type AdminCheckResult = { ok: true; isAdmin: boolean } | { ok: false };

/** 確認の結果から次の isAdmin を決める */
export function nextIsAdmin(event: string, sameUser: boolean, previous: boolean, result: AdminCheckResult): boolean {
  if (result.ok) return result.isAdmin;
  return sameUser && SAME_USER_EVENTS.has(event) ? previous : false;
}
