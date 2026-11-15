// 在庫一覧の並び順をブラウザに保存する（再読み込み・次回表示でも同じ並び順で開く）
// localStorage はプライベートブラウズ等で使えない場合があるため、失敗しても動作は継続する
// 保存値は手で書き換えられる可能性があるため、読み込み時に検証し、不正なら既定値を使う

import { SortConfig } from '@/types';

const STORAGE_KEY = 'card-manager:inventory-sort';

export const DEFAULT_INVENTORY_SORT: SortConfig = { key: 'releaseDate', direction: 'desc' };

// DB関数 search_items が並べ替えに対応しているキー（画面から選べるのもこの範囲）
const ALLOWED_KEYS: readonly SortConfig['key'][] = ['releaseDate', 'cardId', 'name', 'rarity', 'category', 'stock', 'updatedAt'];

const isSortConfig = (v: unknown): v is SortConfig => {
  if (!v || typeof v !== 'object') return false;
  const c = v as Record<string, unknown>;
  return ALLOWED_KEYS.includes(c.key as SortConfig['key']) && (c.direction === 'asc' || c.direction === 'desc');
};

export function getSavedInventorySort(): SortConfig {
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    const parsed: unknown = raw ? JSON.parse(raw) : null;
    return isSortConfig(parsed) ? { key: parsed.key, direction: parsed.direction } : DEFAULT_INVENTORY_SORT;
  } catch {
    return DEFAULT_INVENTORY_SORT;
  }
}

export function saveInventorySort(sort: SortConfig): void {
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify({ key: sort.key, direction: sort.direction }));
  } catch {
    // 保存できなくても、このタブを開いている間の並べ替えはそのまま使える
  }
}
