import { describe, expect, it } from 'vitest';
import { CARD_ID_RE, extractCardId } from './cardId';

describe('extractCardId（Wiki取り込みの型番検出）', () => {
  it.each([
    ['LOB-JP001', 'LOB-JP001'],        // 通常の型番
    ['26LP-JP001', '26LP-JP001'],      // 数字始まり（2026-11-03 の修正）
    ['IMPH-JPS01', 'IMPH-JPS01'],      // ＋1パック（2026-11-03 の修正）
    ['IMPH-JPT01', 'IMPH-JPT01'],      // トークン（2026-11-03 の修正）
    ['DC01-JP003', 'DC01-JP003'],      // 英字と数字の混在
    ['SD5-JP0001', 'SD5-JP0001'],      // 4桁の番号
  ])('%s を拾う', (input, expected) => {
    expect(extractCardId(input)).toBe(expected);
  });

  it('前後に文字があっても型番だけを拾う', () => {
    expect(extractCardId('LOB-JP001 青眼の白龍 Ultra')).toBe('LOB-JP001');
    expect(extractCardId('[26LP-JP001]')).toBe('26LP-JP001');
  });

  it.each([
    ['JP001'],         // 型番の頭がない
    ['2026-JP001'],    // 英字を含まない頭（年号など）
    ['LOB-EN001'],     // 日本語版以外
    ['LOB-JP01'],      // 番号が2桁
    ['lob-jp001'],     // 小文字（Wiki の表記は大文字）
    ['青眼の白龍'],
    [''],
  ])('%s は拾わない', (input) => {
    expect(extractCardId(input)).toBeNull();
  });

  it('g フラグを持たない（test() の lastIndex が残って取りこぼす不具合を避ける）', () => {
    expect(CARD_ID_RE.flags).not.toContain('g');
  });
});
