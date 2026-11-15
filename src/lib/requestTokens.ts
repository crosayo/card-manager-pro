// リクエストの編集用トークンをブラウザに保存する（同じブラウザなら編集用リンクを開かずに編集できる）
// localStorage はプライベートブラウズ等で使えない場合があるため、失敗しても動作は継続する

import { buildSecretUrl } from './urlSecret';

const STORAGE_KEY = 'card-manager:request-tokens';

export function getSavedRequestTokens(): Record<number, string> {
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    const parsed = raw ? JSON.parse(raw) : {};
    return parsed && typeof parsed === 'object' ? parsed : {};
  } catch {
    return {};
  }
}

export function saveRequestToken(requestId: number, token: string): void {
  try {
    const tokens = getSavedRequestTokens();
    tokens[requestId] = token;
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(tokens));
  } catch {
    // 保存できなくても編集用リンクから編集できるため無視する
  }
}

// 編集用リンク。トークンは fragment で渡す（サーバーに送られず、アクセスログに残らない。Q-2026-11-06-7）。
// 以前の /requests?token=… のリンクも RequestsView が読む
export function buildRequestEditUrl(token: string): string {
  return buildSecretUrl(window.location.origin, '/requests', 'token', token);
}
