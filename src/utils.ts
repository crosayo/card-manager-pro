
/**
 * 保存用に文字列を正規化し、不要な記号を削除します。
 * 1. NFKC正規化（全角英数字・記号 → 半角）
 * 2. 遊戯王カード名に使われる記号類の除去
 * 3. 前後の空白除去
 *
 * カード名の表記（ひらがな/カタカナ）は変更しない。DBに保存する値の生成には
 * 必ずこちらを使うこと（ひらがな→カタカナ変換を含む normalizeCardName を
 * 保存経路で使うと、意図せず名前の表記が書き換わってしまう）。
 */
export function normalizeForStorage(text: string): string {
  if (!text) return '';

  let result = text;

  // 1. NFKC正規化（全角英数字・記号 → 半角）
  result = result.normalize('NFKC');

  // 2. 記号の除去（遊戯王カード名に使われる記号類）
  result = result.replace(/[《》「」『』【】・＝―〈〉〔〕［］｛｝、。!！?？～〜･]/g, '');

  // 3. 前後の空白除去
  result = result.trim();

  return result;
}

/**
 * 検索・比較用に文字列を正規化します。保存用正規化に加えてひらがな→カタカナ
 * 変換を行い、表記ゆれ（ひらがな/カタカナ）を吸収します。検索・重複判定など
 * 「比較にのみ使う」用途で使用し、保存する値の生成には使わないこと。
 */
export function normalizeCardName(text: string): string {
  if (!text) return '';

  let result = normalizeForStorage(text);

  // ひらがな → カタカナ変換
  result = result.replace(/[ぁ-ゖ]/g, (ch) =>
    String.fromCharCode(ch.charCodeAt(0) + 0x60)
  );

  return result;
}

// 検索キーから取り除く文字（空白・ASCII記号・カード名に使われる全角記号類）
// ※ DB関数 public.normalize_search（SettingsView の SQL）と同じ規則にすること
const SEARCH_STRIP_PATTERN = /[\s\x21-\x2f\x3a-\x40\x5b-\x60\x7b-\x7e《》「」『』【】・〈〉〔〕［］｛｝、。～〜―‐–—−･·☆★♪♡〝〟…]/g;

/**
 * 検索照合用のキーを生成します（DB関数 public.normalize_search と同じ処理）。
 * NFKC正規化 → 空白・記号の除去 → ひらがな→カタカナ → 小文字化
 * 表記ゆれ（全角/半角・ひらがな/カタカナ・記号や空白の有無・大文字/小文字）を吸収する。
 */
export function toSearchKey(text: string): string {
  if (!text) return '';
  return text
    .normalize('NFKC')
    .replace(SEARCH_STRIP_PATTERN, '')
    .replace(/[ぁ-ゖ]/g, (ch) => String.fromCharCode(ch.charCodeAt(0) + 0x60))
    .toLowerCase();
}

/**
 * 検索ワードを空白で区切り、それぞれを検索キーに変換します（AND検索用）。
 * 記号のみの語など、変換後に空になる語は除外する。
 */
export function toSearchTokens(text: string): string[] {
  if (!text) return [];
  return text
    .normalize('NFKC')
    .split(/\s+/)
    .map(toSearchKey)
    .filter(Boolean);
}

/**
 * 画像ファイルをリサイズ・圧縮します（ブラウザ専用）。
 */
export async function compressImage(
  file: File,
  options: { maxWidth: number; quality: number }
): Promise<Blob> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => {
      const canvas = document.createElement('canvas');
      const scale = Math.min(1, options.maxWidth / img.width);
      canvas.width = img.width * scale;
      canvas.height = img.height * scale;
      const ctx = canvas.getContext('2d')!;
      ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
      canvas.toBlob(
        (blob) => blob ? resolve(blob) : reject(new Error('圧縮に失敗しました')),
        'image/jpeg',
        options.quality
      );
    };
    img.onerror = reject;
    img.src = URL.createObjectURL(file);
  });
}

/**
 * catch で受け取った値からエラーメッセージを取り出す。
 * Error のほか、Supabase のエラーオブジェクト（message を持つ）にも対応する。
 */
export function getErrorMessage(e: unknown): string {
  if (e instanceof Error) return e.message;
  if (typeof e === 'object' && e !== null && 'message' in e && typeof e.message === 'string') return e.message;
  return String(e);
}

/** catch で受け取った値からエラーコード（api.ts が付ける code など）を取り出す。無ければ undefined */
export function getErrorCode(e: unknown): string | undefined {
  if (typeof e === 'object' && e !== null && 'code' in e && typeof e.code === 'string') return e.code;
  return undefined;
}
