
/**
 * 文字列を正規化し、不要な記号を削除します。
 * 1. NFKC正規化 (全角英数→半角、半角カナ→全角など)
 * 2. 《》の削除
 * 3. 前後の空白削除
 */
export const normalizeCardName = (text: string): string => {
  if (!text) return '';
  return text
    .normalize('NFKC')
    .replace(/[《》]/g, '')
    .trim();
};

/**
 * 検索用に正規化されたテキストを取得します。
 */
export const getSearchTerm = (text: string): string => {
  return normalizeCardName(text);
};
