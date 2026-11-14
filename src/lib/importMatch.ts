// Wiki 取込の重複判定（2026-11-14 独立レビュー 中1）。
// DB の一意索引 items_card_rarity_category_key は「型番×レアリティ×収録パック（型番が空ならカード名）」。
// 一括登録で入る行は名前の表記が Wiki と違うことがある（WW-／WW−、'／’、の／ノ など）ため、
// 型番がある行は名前を見ずに「型番×レアリティ×登録先パック」で既存行と照合する。
// 見つからなければ従来の「名前×型番×レアリティ」（パック不問）でも探す（別パックの同じカードに在庫を足す従来の動き）。

import { normalizeCardName, normalizeForStorage } from '../utils';

export interface ImportKeyItem {
  name: string;
  cardId: string;
  rarity: string;
  category?: string;
}

/** 取り込む行に対応する既存行。なければ undefined */
export function findExistingForImport<T extends ImportKeyItem>(
  newItem: ImportKeyItem,
  targetCategory: string,
  existingItems: readonly T[],
): T | undefined {
  const cardId = normalizeCardName(newItem.cardId);
  const name = normalizeCardName(newItem.name);
  const sameRarity = (e: T) => e.rarity === newItem.rarity;

  // 1. 一意索引と同じ鍵（登録先パックの中）
  const byKey = existingItems.find(e =>
    sameRarity(e) && (e.category ?? '') === targetCategory &&
    (cardId !== ''
      ? normalizeCardName(e.cardId) === cardId
      : normalizeCardName(e.cardId) === '' && normalizeForStorage(e.name) === normalizeForStorage(newItem.name)));
  if (byKey) return byKey;

  // 2. 従来の判定（名前×型番×レアリティ。パック不問）
  return existingItems.find(e =>
    sameRarity(e) && normalizeCardName(e.name) === name && normalizeCardName(e.cardId) === cardId);
}

/** 一意索引違反（PostgreSQL の unique_violation）か */
export const isUniqueViolation = (code: string | undefined): boolean => code === '23505';
