import { describe, expect, it } from 'vitest';
import { dominantSetCode, extractSetCode, rankPackCandidates } from './packMatch';

describe('extractSetCode', () => {
  it('型番の頭を取り出す', () => {
    expect(extractSetCode('PHNI-JP001')).toBe('PHNI');
    expect(extractSetCode('26LP-JP001')).toBe('26LP');
    expect(extractSetCode('IMPH-JPS01')).toBe('IMPH');
    expect(extractSetCode('20CP-JPT01')).toBe('20CP');
    expect(extractSetCode('ｐｈｎｉ－ｊｐ００１')).toBe('PHNI');
    expect(extractSetCode(' sd48-jp001 ')).toBe('SD48');
  });

  it('Wiki 取込の型番の形でなければ null', () => {
    expect(extractSetCode('')).toBeNull();
    expect(extractSetCode('305-009')).toBeNull();
    expect(extractSetCode('S2-04')).toBeNull();
    expect(extractSetCode('1234-JP001')).toBeNull();
    expect(extractSetCode('none')).toBeNull();
  });
});

describe('dominantSetCode', () => {
  it('いちばん多いセットコード', () => {
    expect(dominantSetCode(['PHNI-JP001', 'PHNI-JP002', 'SUDA-JP010', ''])).toBe('PHNI');
  });
  it('同数なら先に出たもの、型番がなければ null', () => {
    expect(dominantSetCode(['SUDA-JP010', 'PHNI-JP001'])).toBe('SUDA');
    expect(dominantSetCode(['', 'none'])).toBeNull();
    expect(dominantSetCode([])).toBeNull();
  });
});

describe('rankPackCandidates', () => {
  const products = ['PHANTOM NIGHTMARE', 'ファントム・ナイトメア', 'ほかのパック'];
  it('行数の多い順。products にない名前と空は除く', () => {
    expect(rankPackCandidates(
      ['PHANTOM NIGHTMARE', 'ファントム・ナイトメア', 'PHANTOM NIGHTMARE', '消えたパック', null, ''],
      products,
    )).toEqual([{ name: 'PHANTOM NIGHTMARE', count: 2 }, { name: 'ファントム・ナイトメア', count: 1 }]);
  });
  it('同数なら名前順、該当なしは空', () => {
    expect(rankPackCandidates(['ほかのパック', 'PHANTOM NIGHTMARE'], products).map(c => c.name)).toEqual(['PHANTOM NIGHTMARE', 'ほかのパック']);
    expect(rankPackCandidates([], products)).toEqual([]);
  });
});
