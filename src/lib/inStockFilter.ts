// 在庫一覧の「在庫ありだけ表示」の初期値（企画書「全カード・全パックの一括登録」の決定）
// 一括登録で在庫0の行が大幅に増えるため、友人（招待リンクの閲覧者＝管理者でない人）には在庫ありだけを最初に見せる。
// 管理者は今までどおり全件（在庫0を含む）から始める。
// 画面で切り替えた値は「管理者か・管理者でないか」ごとに覚え、ログイン・ログアウトで立場が変わったら、その立場の初期値に戻す。
// ブラウザには保存しない（並び順の保存 P-7-06 と同じく、検索語・レアリティ・在庫ありは開き直すと初期値）。

/** 画面で切り替えた値（そのときの立場つき）。まだ切り替えていなければ null */
export type InStockChoice = { forAdmin: boolean; value: boolean } | null;

/** 切り替える前の初期値: 管理者でなければ在庫ありだけ */
export const defaultShowOnlyInStock = (isAdmin: boolean): boolean => !isAdmin;

/** 今の「在庫ありだけ表示」。今の立場で切り替えた値があればそれ、なければ初期値 */
export function resolveShowOnlyInStock(isAdmin: boolean, choice: InStockChoice): boolean {
  return choice !== null && choice.forAdmin === isAdmin ? choice.value : defaultShowOnlyInStock(isAdmin);
}
