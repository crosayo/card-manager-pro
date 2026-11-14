import { describe, expect, it } from 'vitest';
import { findExistingForImport, isUniqueViolation } from './importMatch';

const existing = [
  { id: 1, name: 'ＷＷ−アイス・ベル', cardId: 'DT03-JP001', rarity: 'N', category: 'パックA' },
  { id: 2, name: "ブラック・マジシャン", cardId: 'SD48-JP001', rarity: 'UR', category: 'パックB' },
  { id: 3, name: '型番なしのカード', cardId: '', rarity: 'N', category: 'パックC' },
  { id: 4, name: 'カードの名前', cardId: 'PHNI-JP010', rarity: 'SR', category: '別のパック' },
];

describe('findExistingForImport', () => {
  it('型番がある行は名前を見ずに 型番×レアリティ×登録先パック で見つける', () => {
    expect(findExistingForImport({ name: 'WW-アイス・ベル', cardId: 'DT03-JP001', rarity: 'N' }, 'パックA', existing)?.id).toBe(1);
    expect(findExistingForImport({ name: '名前が全然違う', cardId: 'ＤＴ０３－ＪＰ００１', rarity: 'N' }, 'パックA', existing)?.id).toBe(1);
  });

  it('レアリティかパックが違えば、名前も違うなら見つけない', () => {
    expect(findExistingForImport({ name: '名前が全然違う', cardId: 'DT03-JP001', rarity: 'SR' }, 'パックA', existing)).toBeUndefined();
    expect(findExistingForImport({ name: '名前が全然違う', cardId: 'DT03-JP001', rarity: 'N' }, 'パックZ', existing)).toBeUndefined();
  });

  it('従来どおり 名前×型番×レアリティ なら別パックの行も見つける', () => {
    expect(findExistingForImport({ name: 'カードノ名前', cardId: 'PHNI-JP010', rarity: 'SR' }, '新しいパック', existing)?.id).toBe(4);
  });

  it('型番が空の行はカード名で照合する', () => {
    expect(findExistingForImport({ name: '型番なしのカード', cardId: '', rarity: 'N' }, 'パックC', existing)?.id).toBe(3);
    expect(findExistingForImport({ name: 'ほかのカード', cardId: '', rarity: 'N' }, 'パックC', existing)).toBeUndefined();
  });
});

describe('isUniqueViolation', () => {
  it('23505 だけ', () => {
    expect(isUniqueViolation('23505')).toBe(true);
    expect(isUniqueViolation('42501')).toBe(false);
    expect(isUniqueViolation(undefined)).toBe(false);
  });
});
