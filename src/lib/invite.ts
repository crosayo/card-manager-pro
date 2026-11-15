// 招待リンク（/#invite=コード。以前の /?invite=コード も読む）の招待コードをブラウザに保存する
// 招待コードは Supabase への全リクエストに x-invite-code ヘッダーとして付与され、
// DB側（RLS・DB関数）で有効期限・取消を検証する（lib/supabase.ts 参照）
// localStorage はプライベートブラウズ等で使えない場合があるため、失敗時はメモリ上で保持する

import { buildSecretUrl, takeSecretParam } from './urlSecret';

const STORAGE_KEY = 'card-manager:invite';
const URL_PARAM = 'invite';

let memoryCode: string | null = null;

export function getInviteCode(): string | null {
  if (typeof window === 'undefined') return null;
  try {
    return window.localStorage.getItem(STORAGE_KEY) ?? memoryCode;
  } catch {
    return memoryCode;
  }
}

export function saveInviteCode(code: string): void {
  memoryCode = code;
  try {
    window.localStorage.setItem(STORAGE_KEY, code);
  } catch {
    // 保存できない環境ではメモリ上の値のみ使う（タブを閉じると再度リンクが必要）
  }
}

export function clearInviteCode(): void {
  memoryCode = null;
  try {
    window.localStorage.removeItem(STORAGE_KEY);
  } catch {
    // 無視
  }
}

// URLの #invite=（以前のリンクは ?invite=）を取り込み、アドレスバー・履歴からは取り除く（Q-2026-11-06-7）。
// Supabase への最初の通信より前に招待コードを保存するため、クライアント生成時に呼ぶ
export function captureInviteFromUrl(): void {
  if (typeof window === 'undefined') return;
  const { value, cleanedUrl } = takeSecretParam(window.location.href, URL_PARAM);
  if (cleanedUrl !== null) window.history.replaceState(window.history.state, '', cleanedUrl);
  if (value) saveInviteCode(value);
}

// 招待リンク。コードは fragment で渡す（サーバーに送られず、アクセスログに残らない）
export function buildInviteUrl(code: string): string {
  return buildSecretUrl(window.location.origin, '/', URL_PARAM, code);
}
