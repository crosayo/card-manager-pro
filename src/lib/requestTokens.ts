// リクエストの編集用トークンをブラウザに保存する（同じブラウザなら編集用リンクを開かずに編集できる）
// localStorage はプライベートブラウズ等で使えない場合があるため、失敗しても動作は継続する

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

export function buildRequestEditUrl(token: string): string {
  return `${window.location.origin}/requests?token=${encodeURIComponent(token)}`;
}
