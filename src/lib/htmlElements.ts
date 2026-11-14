// Wiki取込（/api/scrape）の HTML から、指定したタグの中身を順に取り出す（Q-2026-11-06-6）。
// 以前の正規表現 /<tr[^>]*>([\s\S]*?)<\/tr>/gi は、閉じタグのない <tr> が多いと
// 開始位置ごとに末尾まで探し直すため、入力の長さの2乗で遅くなっていた。
// ここでは前から一度だけ読み進め、開始タグの「>」や閉じタグが見つからなければその時点で打ち切る（入力の長さに比例）。
// 取り出す範囲は以前の正規表現と同じ（開始タグの直後から、最初に現れる閉じタグの直前まで。入れ子は考えない）。
// 違い: タグ名の直後が空白・「>」・「/」のときだけ開始タグとみなす（<tr> を探すときに <track> を拾わない）。

export function extractElementContents(html: string, tag: string, limit = Number.POSITIVE_INFINITY): string[] {
  if (!/^[a-z][a-z0-9]*$/i.test(tag)) throw new Error(`invalid tag: ${tag}`);
  const results: string[] = [];
  const open = new RegExp(`<${tag}(?=[\\s>/])`, 'gi');
  const close = new RegExp(`</${tag}>`, 'gi');
  let pos = 0;
  while (results.length < limit) {
    open.lastIndex = pos;
    const o = open.exec(html);
    if (!o) break;
    const gt = html.indexOf('>', o.index + 1 + tag.length);
    if (gt === -1) break; // 以降の開始タグにも「>」はない
    close.lastIndex = gt + 1;
    const c = close.exec(html);
    if (!c) break; // 以降の開始タグにも閉じタグはない
    results.push(html.slice(gt + 1, c.index));
    pos = c.index + c[0].length;
  }
  return results;
}
