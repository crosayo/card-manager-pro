// 招待リンク（/?invite=コード）の招待コードをブラウザに保存する
// 招待コードは Supabase への全リクエストに x-invite-code ヘッダーとして付与され、
// DB側（RLS・DB関数）で有効期限・取消を検証する（lib/supabase.ts 参照）
// localStorage はプライベートブラウズ等で使えない場合があるため、失敗時はメモリ上で保持する

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

// URLの ?invite= を取り込み、アドレスバー・履歴からは取り除く。
// Supabase への最初の通信より前に招待コードを保存するため、クライアント生成時に呼ぶ
export function captureInviteFromUrl(): void {
  if (typeof window === 'undefined') return;
  const url = new URL(window.location.href);
  const code = url.searchParams.get(URL_PARAM)?.trim();
  if (!code) return;
  saveInviteCode(code);
  url.searchParams.delete(URL_PARAM);
  window.history.replaceState(window.history.state, '', url.pathname + url.search + url.hash);
}

export function buildInviteUrl(code: string): string {
  return `${window.location.origin}/?${URL_PARAM}=${encodeURIComponent(code)}`;
}
