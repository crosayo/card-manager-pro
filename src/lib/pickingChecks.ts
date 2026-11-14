// ピッキングリストの「取り出した」チェックをブラウザに保存する（途中で閉じても続きから再開できる）
// 値は「行のキー（item-<id> / supply-<id>）→ チェックした時点の内訳（リクエストIDと枚数）」。
// 内訳が今のリストと違う行（リクエストの完了・追加・枚数の変更）は、チェックしていないものとして扱う。
// localStorage はプライベートブラウズ等で使えない場合があるため、失敗しても動作は継続する

const STORAGE_KEY = 'card-manager:picking-checks';

export type PickingChecks = Record<string, string>;

export function getSavedPickingChecks(): PickingChecks {
  try {
    const parsed: unknown = JSON.parse(window.localStorage.getItem(STORAGE_KEY) ?? '{}');
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return {};
    return Object.fromEntries(
      Object.entries(parsed).filter((entry): entry is [string, string] => typeof entry[1] === 'string'),
    );
  } catch {
    return {};
  }
}

export function savePickingChecks(checks: PickingChecks): void {
  try {
    if (Object.keys(checks).length === 0) window.localStorage.removeItem(STORAGE_KEY);
    else window.localStorage.setItem(STORAGE_KEY, JSON.stringify(checks));
  } catch {
    // 保存できない環境では画面を開いている間だけチェックを保持する
  }
}
