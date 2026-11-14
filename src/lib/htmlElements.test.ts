import { describe, expect, it } from 'vitest';
import { extractElementContents } from './htmlElements';

// 以前の正規表現（比較用）
const legacy = (html: string, tag: string) =>
  Array.from(html.matchAll(new RegExp(`<${tag}[^>]*>([\\s\\S]*?)<\\/${tag}>`, 'gi')), m => m[1]);

describe('extractElementContents', () => {
  it('行・セルの中身を順に取り出す（以前の正規表現と同じ結果）', () => {
    const html = '<table><TR class="a"><td>1</td><td x=1>2</td></TR>\n<tr><th>h</th></tr></table>';
    expect(extractElementContents(html, 'tr')).toEqual(legacy(html, 'tr'));
    expect(extractElementContents(html, 'tr')).toEqual(['<td>1</td><td x=1>2</td>', '<th>h</th>']);
    expect(extractElementContents('<td>1</td><td x=1>2</td>', 'td')).toEqual(['1', '2']);
  });

  it('閉じタグがない要素は以前と同じく取り出さない', () => {
    expect(extractElementContents('<tr><td>a</td><tr><td>b</td></tr>', 'tr')).toEqual(legacy('<tr><td>a</td><tr><td>b</td></tr>', 'tr'));
    expect(extractElementContents('<tr><td>a</td>', 'tr')).toEqual([]);
    expect(extractElementContents('<tr class="x"', 'tr')).toEqual([]);
  });

  it('タグ名の続く別のタグ（<track>・<thead>）は拾わない', () => {
    expect(extractElementContents('<track src=x></tr><tr>ok</tr>', 'tr')).toEqual(['ok']);
    expect(extractElementContents('<thead><th>h</th></thead>', 'th')).toEqual(['h']);
  });

  it('limit 件で止まる', () => {
    expect(extractElementContents('<a>1</a><a>2</a>', 'a', 1)).toEqual(['1']);
  });

  it('閉じタグのない <tr> が大量にあっても入力の長さに比例した時間で終わる', () => {
    const html = '<tr>x'.repeat(200_000); // 約100万文字。以前の正規表現では数十秒かかる
    const start = performance.now();
    expect(extractElementContents(html, 'tr')).toEqual([]);
    expect(extractElementContents('<tr'.repeat(300_000), 'tr')).toEqual([]);
    expect(performance.now() - start).toBeLessThan(1000);
  });
});
