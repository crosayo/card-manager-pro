// 招待コード・編集用トークンを URL で受け渡すための共通処理（Q-2026-11-06-7）。
// 新しいリンクは「#名前=値」（fragment）で渡す。fragment はサーバーに送られないため、Vercel のアクセスログや
// 転送先に残らない。以前の「?名前=値」（query）のリンクも読めるようにし、読んだらどちらも URL から消す。

export type TakenSecret = {
  value: string | null;       // 見つかった値（前後の空白は除く。なければ null）
  cleanedUrl: string | null;  // 値を取り除いた URL（パス＋query＋fragment）。取り除くものがなければ null
};

export function takeSecretParam(href: string, name: string): TakenSecret {
  const url = new URL(href);
  let value: string | null = null;
  let changed = false;

  // fragment（#invite=…・#token=…）。ほかの値が並んでいても、その名前だけを取り除く
  const hash = url.hash.replace(/^#/, '');
  if (hash) {
    const parts = hash.split('&');
    const kept: string[] = [];
    for (const part of parts) {
      const eq = part.indexOf('=');
      const key = eq === -1 ? part : part.slice(0, eq);
      if (safeDecode(key) === name) {
        const v = eq === -1 ? '' : safeDecode(part.slice(eq + 1).replace(/\+/g, ' ')).trim();
        if (v && value === null) value = v;
        changed = true;
      } else {
        kept.push(part);
      }
    }
    if (changed) url.hash = kept.length > 0 ? `#${kept.join('&')}` : '';
  }

  // 以前の形式（?invite=…・?token=…）
  if (url.searchParams.has(name)) {
    const v = url.searchParams.get(name)?.trim();
    if (v && value === null) value = v;
    url.searchParams.delete(name);
    changed = true;
  }

  return { value, cleanedUrl: changed ? url.pathname + url.search + url.hash : null };
}

// 「#名前=値」の形のリンクを作る
export function buildSecretUrl(origin: string, path: string, name: string, value: string): string {
  return `${origin}${path}#${encodeURIComponent(name)}=${encodeURIComponent(value)}`;
}

function safeDecode(s: string): string {
  try {
    return decodeURIComponent(s);
  } catch {
    return s;
  }
}
