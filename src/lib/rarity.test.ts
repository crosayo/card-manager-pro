import { describe, expect, it } from 'vitest';
import { normalizeRarity } from './rarity';

describe('normalizeRarity（Wiki取り込みのレアリティ判定）', () => {
  // T-2026-11-14-B: 「25th Secret Rare」が QCSE と R の2行になっていた不具合
  it.each([
    ['25th Secret Rare'],
    ['25th SE'],
    ['25th Secret'],
    ['25th secret rare'],
    ['クォーターセンチュリーシークレットレア'],
    ['Quarter Century Secret Rare'],
  ])('%s は QCSE だけになる', (input) => {
    expect(normalizeRarity(input)).toEqual(['QCSE']);
  });

  it('ほかのレアリティと並んでいても 25th Secret Rare から R が出ない', () => {
    expect(normalizeRarity('Ultra Rare / 25th Secret Rare')).toEqual(['QCSE', 'UR']);
    expect(normalizeRarity('Rare / 25th Secret Rare')).toEqual(['QCSE', 'R']);
  });

  it.each([
    ['Secret Rare', ['SE']],
    ['シークレットレア', ['SE']],
    ['Ultra Rare', ['UR']],
    ['Super', ['SR']],
    ['20th Secret Rare', ['20thSE']],
    ['プリズマティックシークレットレア', ['PSE']],
    ['ウルトラパラレルレア', ['P+UR']],
    ['ノーマルパラレル', ['P']],
    ['Rare', ['R']],
    ['レア', ['R']],
    ['ノーマル', ['N']],
    ['N', ['N']],
    ['', ['N']],
    ['スーパーレア / ウルトラレア', ['UR', 'SR']],
  ])('%s は %j（既存の判定を壊さない）', (input, expected) => {
    expect(normalizeRarity(input)).toEqual(expected);
  });

  it('同じレアリティの行が続いても結果が変わらない（g フラグの lastIndex の不具合を避ける）', () => {
    for (let i = 0; i < 3; i++) {
      expect(normalizeRarity('25th Secret Rare')).toEqual(['QCSE']);
      expect(normalizeRarity('Ultra Rare')).toEqual(['UR']);
    }
  });
});
