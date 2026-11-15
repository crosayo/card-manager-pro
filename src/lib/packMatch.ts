// Wiki 取込で、取り込んだパック名が既存のパックと完全一致しないときに、
// 型番の頭（セットコード。例 PHNI-JP001 → PHNI）が同じ既存パックを候補として選ぶ（2026-11-14 全カード一括登録）。
// 一括登録で作ったパック名（YGOJSON 由来）は Wiki の見出しと約4割一致しない見込みのため、
// 名前だけで探すと同じ収録パックが2つに分かれる。候補は初期選択にするだけで、確定は管理者が見て行う。

/** 型番からセットコードを取り出す（Wiki 取込の型番 CARD_ID_RE と同じ形: 英字を1文字以上含む英数字 + "-JP"）。なければ null */
export function extractSetCode(cardId: string): string | null {
  const m = (cardId || '').normalize('NFKC').trim().toUpperCase().match(/^((?=[0-9]*[A-Z])[A-Z0-9]+)-JP/);
  return m ? m[1] : null;
}

/** 取り込んだ行の中でいちばん多いセットコード（同数なら先に出たもの）。型番のある行がなければ null */
export function dominantSetCode(cardIds: readonly string[]): string | null {
  const counts = new Map<string, number>();
  for (const id of cardIds) {
    const code = extractSetCode(id);
    if (code) counts.set(code, (counts.get(code) ?? 0) + 1);
  }
  let best: string | null = null;
  let bestCount = 0;
  for (const [code, n] of counts) {
    if (n > bestCount) { best = code; bestCount = n; }
  }
  return best;
}

export interface PackCandidate {
  name: string;   // 既存パック（products.name）
  count: number;  // そのパックにある、同じセットコードの行数
}

/**
 * 同じセットコードの既存行の収録パック名から、候補を行数の多い順に返す。
 * products にないパック名は除く。同数なら名前順（結果を毎回同じにするため）。
 */
export function rankPackCandidates(categories: readonly (string | null)[], productNames: readonly string[]): PackCandidate[] {
  const known = new Set(productNames);
  const counts = new Map<string, number>();
  for (const c of categories) {
    if (c && known.has(c)) counts.set(c, (counts.get(c) ?? 0) + 1);
  }
  return [...counts].map(([name, count]) => ({ name, count }))
    .sort((a, b) => b.count - a.count || (a.name < b.name ? -1 : a.name > b.name ? 1 : 0));
}
