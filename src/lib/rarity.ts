// Wiki取り込み（/api/scrape）で使うレアリティの正規化。単体テストのために route.ts から切り出した（T-2026-11-14-B）。
// route.ts から関数を export すると Next.js の Route Handler の型検査で「有効なルートの export ではない」となるため、lib に置く。

// ── レアリティ正規化（Gemini不要・固定マッピング） ───────────────
// 複合レアリティを先にスキャンして除去し、残りでノーマル・レアを判定する
// 「○○ Rare」の「Rare」を省略した英語表記（例: 単に "Ultra" "Secret"）も
// wiki上でよく使われるため、\bによる単語単位マッチも併記して拾う
// コードは公式カードデータベースの略号にそろえる（2026-11-08 レアリティ整理。constants.ts の INITIAL_RARITIES）。
// 長い名前（複合）を先に置く。先に一致した部分は除去されるので、たとえば
// 「プリズマティックシークレットレア」が「シークレットレア」として二重に拾われることはない。
export const COMPOUND_RARITY_PATTERNS: Array<{ pattern: RegExp; code: string }> = [
  // 「25th Secret Rare」は丸ごと QCSE として除く（以前の 25th.?se は「25th Se」だけを除き、残りの「cret Rare」が R と判定されて2行になっていた。2026-11-14）
  { pattern: /クォーターセンチュリーシークレットレア|quarter.?century.?secret(?:.?rare)?|25th.?secret(?:.?rare)?|25th.?se\b/gi, code: 'QCSE' },
  { pattern: /プリズマティックシークレットレア|prismatic.?secret(?:.?rare)?/gi,                        code: 'PSE' },
  { pattern: /エクストラシークレットレア|extra.?secret(?:.?rare)?/gi,                                  code: 'EXSE' },
  { pattern: /20thシークレットレア|20th.?secret(?:.?rare)?/gi,                                        code: '20thSE' },
  { pattern: /10000シークレットレア|10000.?secret(?:.?rare)?/gi,                                      code: '10000SE' },
  { pattern: /ゴールドシークレットレア|gold.?secret(?:.?rare)?/gi,                                     code: 'GSE' },
  { pattern: /プレミアムゴールドレア|premium.?gold(?:.?rare)?/gi,                                     code: 'PG' },
  { pattern: /グランドマスターレア|grand.?master(?:.?rare)?/gi,                                       code: 'GMR' },
  { pattern: /ミレニアムシークレットレア|millennium.?secret(?:.?rare)?/gi,                             code: 'M+SE' },
  { pattern: /ミレニアムウルトラレア|millennium.?ultra(?:.?rare)?/gi,                                  code: 'M+UR' },
  { pattern: /ミレニアムスーパーレア|millennium.?super(?:.?rare)?/gi,                                  code: 'M+SR' },
  { pattern: /ミレニアムレア|millennium.?rare/gi,                                           code: 'M' },
  { pattern: /KCウルトラレア|kc.?ultra(?:.?rare)?/gi,                                                  code: 'KC+UR' },
  { pattern: /シークレットパラレルレア|secret.?parallel(?:.?rare)?/gi,                                 code: 'P+SE' },
  { pattern: /ウルトラパラレルレア|ultra.?parallel(?:.?rare)?/gi,                                      code: 'P+UR' },
  { pattern: /スーパーパラレルレア|super.?parallel(?:.?rare)?/gi,                                      code: 'P+SR' },
  { pattern: /ホログラフィックパラレルレア|holographic.?parallel(?:.?rare)?/gi,                        code: 'P+HR' },
  { pattern: /ホログラフィックレア|holographic.?rare|ghost.?rare/gi,                        code: 'HR' },
  { pattern: /コレクターズレア|collector'?s.?rare/gi,                                       code: 'CR' },
  { pattern: /ゴールドレア|gold.?rare/gi,                                                   code: 'GR' },
  { pattern: /アルティメットレア|ultimate.?rare|\bultimate\b/gi,                            code: 'UL' },
  { pattern: /シークレットレア|secret.?rare|\bsecret\b/gi,                                  code: 'SE' },
  { pattern: /ウルトラレア|ultra.?rare|\bultra\b/gi,                                        code: 'UR' },
  { pattern: /スーパーレア|super.?rare|\bsuper\b/gi,                                        code: 'SR' },
  { pattern: /ノーマルパラレル(?:レア)?|normal.?parallel(?:.?rare)?|N-Parallel/gi,                              code: 'P' },
  { pattern: /ノーマルレア|normal.?rare/gi,                                                 code: 'NR' },
];

export function normalizeRarity(rawRarity: string): string[] {
  let remaining = rawRarity;
  const results: string[] = [];

  // Step1: 複合レアリティをスキャン・除去（スペース区切りでも検出できる）
  for (const { pattern, code } of COMPOUND_RARITY_PATTERNS) {
    // g フラグ付きの正規表現の test() は lastIndex を覚えていて、次の呼び出しで途中から探してしまう。
    // そのため同じレアリティの行が続くと見落として「N」になることがあった。i フラグだけの新しい正規表現で判定する。
    if (new RegExp(pattern.source, 'i').test(remaining)) {
      if (!results.includes(code)) results.push(code);
      remaining = remaining.replace(new RegExp(pattern.source, 'gi'), ' ');
    }
  }

  // Step2: 残りをスペース・区切り文字で分割してノーマル・レアの単体判定
  for (const part of remaining.split(/[\s\/／・\n,、]+/)) {
    const t = part.trim();
    if (!t) continue;
    if (/^(ノーマル|N|Normal)$/i.test(t) && !results.includes('N')) results.push('N');
    else if (/^(レア|R|Rare)$/i.test(t) && !results.includes('R')) results.push('R');
  }

  return results.length > 0 ? results : ['N'];
}
