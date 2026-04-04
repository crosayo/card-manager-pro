
import { NextRequest, NextResponse } from 'next/server';
import { GoogleGenAI, Type } from "@google/genai";

// ── HTML ユーティリティ ──────────────────────────────────────────
function decodeEntities(str: string): string {
  return str
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&nbsp;/g, ' ')
    .replace(/&quot;/g, '"')
    .replace(/&#(\d+);/g, (_, n) => String.fromCharCode(Number(n)));
}

function stripTags(html: string): string {
  return decodeEntities(html.replace(/<[^>]+>/g, ' ')).replace(/\s+/g, ' ').trim();
}

function extractAnchorText(cellHtml: string): string {
  const m = cellHtml.match(/<a[^>]*>([^<]+)<\/a>/);
  return m ? decodeEntities(m[1].trim()) : '';
}

const CARD_ID_RE = /\b([A-Z]+-JP\d{3,4})\b/;

interface RawEntry {
  cardId: string;
  name: string;
  rawRarity: string;
}

// matchAll の代替（TypeScript target 互換）
function execAll(str: string, pattern: RegExp): RegExpExecArray[] {
  const results: RegExpExecArray[] = [];
  const re = new RegExp(pattern.source, pattern.flags.includes('g') ? pattern.flags : pattern.flags + 'g');
  let m: RegExpExecArray | null;
  while ((m = re.exec(str)) !== null) results.push(m);
  return results;
}

// ── テーブルパーサー ─────────────────────────────────────────────
// ネストを考慮してトップレベルの <table> のみ返す
function findTopLevelTables(html: string): string[] {
  const tables: string[] = [];
  let depth = 0, start = -1, i = 0;
  while (i < html.length) {
    const o = html.indexOf('<table', i);
    const c = html.indexOf('</table>', i);
    if (o === -1 && c === -1) break;
    if (o !== -1 && (c === -1 || o < c)) {
      if (depth === 0) start = o;
      depth++;
      i = o + 6;
    } else {
      depth--;
      if (depth === 0 && start >= 0) {
        tables.push(html.substring(start, c + 8));
        start = -1;
      }
      i = c + 8;
    }
  }
  return tables;
}

function parseFromTables(html: string): RawEntry[] {
  const results: RawEntry[] = [];

  for (const tableHtml of findTopLevelTables(html)) {
    const rowMatches = execAll(tableHtml, /<tr[^>]*>([\s\S]*?)<\/tr>/gi);
    let cardIdCol = -1, nameCol = -1, rarityCol = -1;
    const tableResults: RawEntry[] = [];

    for (const rowMatch of rowMatches) {
      const rowContent = rowMatch[1];

      // ヘッダー行でカラム位置を検出
      const thMatches = execAll(rowContent, /<th[^>]*>([\s\S]*?)<\/th>/gi);
      if (thMatches.length > 0) {
        thMatches.forEach((th, i) => {
          const t = stripTags(th[1]);
          if (/カード番号|番号/.test(t)) cardIdCol = i;
          else if (/カード名/.test(t)) nameCol = i;
          else if (/レアリティ/.test(t)) rarityCol = i;
        });
        continue;
      }

      // データ行
      const tdMatches = execAll(rowContent, /<td[^>]*>([\s\S]*?)<\/td>/gi);
      if (tdMatches.length < 2) continue;

      const cellHtmls = tdMatches.map(td => td[1]);
      const cellTexts = cellHtmls.map(stripTags);

      // 型番カラムを特定
      let idCol = cardIdCol;
      let cardId = '';
      if (idCol >= 0 && idCol < cellTexts.length) {
        const m = cellTexts[idCol].match(CARD_ID_RE);
        if (m) cardId = m[1];
      }
      if (!cardId) {
        for (let i = 0; i < cellTexts.length; i++) {
          const m = cellTexts[i].match(CARD_ID_RE);
          if (m) { cardId = m[1]; idCol = i; break; }
        }
      }
      if (!cardId) continue;

      // カード名を特定（アンカーテキスト優先）
      let name = '';
      if (nameCol >= 0 && nameCol < cellHtmls.length) {
        name = extractAnchorText(cellHtmls[nameCol]) || cellTexts[nameCol];
      }
      if (!name) {
        for (let i = 0; i < cellHtmls.length; i++) {
          if (i === idCol) continue;
          const anchor = extractAnchorText(cellHtmls[i]);
          if (anchor.length > 1) { name = anchor; break; }
        }
      }
      if (!name) name = idCol > 0 ? cellTexts[idCol - 1] : (cellTexts[idCol + 1] || '');

      // レアリティ原文を取得
      let rawRarity = '';
      if (rarityCol >= 0 && rarityCol < cellTexts.length) {
        rawRarity = cellTexts[rarityCol];
      } else {
        rawRarity = cellTexts.filter((_, i) => i !== idCol).join(' ');
      }

      if (cardId && name) tableResults.push({ cardId, name, rawRarity });
    }

    if (tableResults.length > 0) results.push(...tableResults);
  }

  return results;
}

// ── リストパーサー (UL/LI 形式、ストラクチャーデッキ等) ──────────
function parseFromLists(html: string): RawEntry[] {
  const results: RawEntry[] = [];
  for (const li of execAll(html, /<li[^>]*>([\s\S]*?)<\/li>/gi)) {
    const liHtml = li[1];
    const text = stripTags(liHtml);
    const m = text.match(CARD_ID_RE);
    if (!m) continue;
    const name = extractAnchorText(liHtml);
    if (!name) continue;
    results.push({ cardId: m[1], name, rawRarity: text });
  }
  return results;
}

// ── カテゴリ（パック名）抽出 ────────────────────────────────────
function extractCategory(html: string): string {
  const h1 = html.match(/<h1[^>]*id="firstHeading"[^>]*>([^<]+)<\/h1>/i)
    || html.match(/<h1[^>]*>([^<]+)<\/h1>/i);
  if (h1) return decodeEntities(h1[1].trim());
  const title = html.match(/<title[^>]*>([^<]+)<\/title>/i);
  if (title) {
    const t = decodeEntities(title[1]).split(/\s*[-－]\s*/)[0].trim();
    if (t) return t;
  }
  return '';
}

// ── メインハンドラー ─────────────────────────────────────────────
export async function POST(req: NextRequest) {
  try {
    const { url } = await req.json();
    if (!url) return NextResponse.json({ error: 'URL is required' }, { status: 400 });

    const fetchResponse = await fetch(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36'
      }
    });
    if (!fetchResponse.ok) {
      return NextResponse.json({ error: `Failed to fetch URL: ${fetchResponse.statusText}` }, { status: 500 });
    }

    const html = await fetchResponse.text();
    const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });

    // Step 1: HTMLから型番・名前を直接抽出
    let rawEntries = parseFromTables(html);
    if (rawEntries.length === 0) rawEntries = parseFromLists(html);

    const category = extractCategory(html);

    // Step 2: HTML解析失敗時はGeminiフルパースにフォールバック
    if (rawEntries.length === 0) {
      console.warn('HTMLパース結果0件。Geminiフルパースにフォールバック。');
      const truncatedHtml = html.substring(0, 500000);
      const fallbackResponse = await ai.models.generateContent({
        model: 'gemini-3-flash-preview',
        contents: `
以下のHTMLからカードリストを抽出してください。
カード名・型番は原文のまま抽出し省略・推測しないこと。
レアリティ略称: UR/SR/R/N/SE/25thSE/UL/PS
1行に複数レアリティがある場合は別オブジェクトとして分割。
HTML: ${truncatedHtml}
        `,
        config: {
          responseMimeType: "application/json",
          responseSchema: {
            type: Type.ARRAY,
            items: {
              type: Type.OBJECT,
              properties: {
                name: { type: Type.STRING },
                cardId: { type: Type.STRING },
                rarity: { type: Type.STRING },
                stock: { type: Type.INTEGER },
                category: { type: Type.STRING }
              }
            }
          }
        }
      });
      const items = JSON.parse(fallbackResponse.text || "[]");
      return NextResponse.json({ items });
    }

    // Step 3: Geminiはレアリティの正規化・分割のみ担当
    // 入力は「行番号|型番|レアリティ原文」形式で圧縮して送信
    const rarityInput = rawEntries.map((e, i) => `${i}|${e.cardId}|${e.rawRarity}`).join('\n');

    const rarityResponse = await ai.models.generateContent({
      model: 'gemini-3-flash-preview',
      contents: `
遊戯王カードのレアリティ情報を正規化してください。
型番・名前は変更せず、レアリティの正規化のみ行うこと。
1エントリに複数レアリティがある場合は別オブジェクトに分割すること。

レアリティ対応表:
ウルトラレア / Ultra Rare → UR
スーパーレア / Super Rare → SR
レア / Rare → R
ノーマル / Normal → N
シークレットレア / Secret Rare → SE
クォーターセンチュリーシークレットレア / 25th Secret → 25thSE
アルティメットレア / Ultimate Rare → UL
プリズマティックシークレットレア / Prismatic Secret → PS
判断不能 → N

入力(行番号|型番|レアリティ原文):
${rarityInput}
      `,
      config: {
        responseMimeType: "application/json",
        responseSchema: {
          type: Type.ARRAY,
          items: {
            type: Type.OBJECT,
            properties: {
              idx: { type: Type.INTEGER },
              rarity: { type: Type.STRING }
            }
          }
        }
      }
    });

    const rarityResults: Array<{ idx: number; rarity: string }> =
      JSON.parse(rarityResponse.text || "[]");

    // Step 4: HTMLパース結果(名前・型番)とGeminiレアリティを結合
    const items = rarityResults
      .map(r => {
        const entry = rawEntries[r.idx];
        if (!entry) return null;
        return {
          name: entry.name,
          cardId: entry.cardId,
          rarity: r.rarity || 'N',
          stock: 0,
          category: category || entry.cardId.split('-')[0]
        };
      })
      .filter(Boolean);

    return NextResponse.json({ items });

  } catch (error: any) {
    console.error('Scrape API Error:', error);
    return NextResponse.json({
      error: 'Failed to process request',
      details: error.message
    }, { status: 500 });
  }
}
