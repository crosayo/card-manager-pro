import { describe, expect, it } from 'vitest';
import { defaultShowOnlyInStock, resolveShowOnlyInStock } from './inStockFilter';

describe('在庫ありだけ表示の初期値', () => {
  it('管理者でなければ在庫ありだけ、管理者なら全件', () => {
    expect(defaultShowOnlyInStock(false)).toBe(true);
    expect(defaultShowOnlyInStock(true)).toBe(false);
    expect(resolveShowOnlyInStock(false, null)).toBe(true);
    expect(resolveShowOnlyInStock(true, null)).toBe(false);
  });

  it('切り替えた値は同じ立場のあいだ使う', () => {
    expect(resolveShowOnlyInStock(false, { forAdmin: false, value: false })).toBe(false);
    expect(resolveShowOnlyInStock(true, { forAdmin: true, value: true })).toBe(true);
  });

  it('ログイン・ログアウトで立場が変わったら、その立場の初期値に戻る', () => {
    // 友人として外した → 管理者としてログイン: 全件
    expect(resolveShowOnlyInStock(true, { forAdmin: false, value: false })).toBe(false);
    // 管理者として在庫ありにした → ログアウト（友人）: 在庫ありだけ
    expect(resolveShowOnlyInStock(false, { forAdmin: true, value: true })).toBe(true);
    // 友人のまま切り替えた値はそのまま使う
    expect(resolveShowOnlyInStock(false, { forAdmin: false, value: true })).toBe(true);
  });
});
