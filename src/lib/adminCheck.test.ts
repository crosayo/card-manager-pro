import { describe, expect, it } from 'vitest';
import { nextIsAdmin } from './adminCheck';

describe('nextIsAdmin', () => {
  it('確認できたらその結果', () => {
    expect(nextIsAdmin('SIGNED_IN', false, false, { ok: true, isAdmin: true })).toBe(true);
    expect(nextIsAdmin('TOKEN_REFRESHED', true, true, { ok: true, isAdmin: false })).toBe(false);
  });
  it('トークン更新などで同じユーザーのまま確認に失敗したら直前の値を保つ', () => {
    expect(nextIsAdmin('TOKEN_REFRESHED', true, true, { ok: false })).toBe(true);
    expect(nextIsAdmin('USER_UPDATED', true, true, { ok: false })).toBe(true);
    expect(nextIsAdmin('TOKEN_REFRESHED', true, false, { ok: false })).toBe(false);
  });
  it('ログイン直後や別のユーザーで失敗したら管理者として扱わない', () => {
    expect(nextIsAdmin('SIGNED_IN', false, true, { ok: false })).toBe(false);
    expect(nextIsAdmin('INITIAL_SESSION', false, false, { ok: false })).toBe(false);
    expect(nextIsAdmin('TOKEN_REFRESHED', false, true, { ok: false })).toBe(false);
  });
});
