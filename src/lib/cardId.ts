// Wiki取り込み（/api/scrape）で使うカード型番の検出。単体テストのために route.ts から切り出した。

// 「26LP-JP001」のように数字始まりの型番もあるため、英字を1文字以上含む英数字を許容する
// 「IMPH-JPS01」（＋1パック）「IMPH-JPT01」（トークン）のようにJPの後に英字が入る型番も拾う
export const CARD_ID_RE = /\b((?=[0-9]*[A-Z])[A-Z0-9]+-JP(?:\d{3,4}|[A-Z]\d{2,3}))\b/;

/** 文字列の中の最初のカード型番を返す。見つからなければ null */
export function extractCardId(text: string): string | null {
  const m = text.match(CARD_ID_RE);
  return m ? m[1] : null;
}
