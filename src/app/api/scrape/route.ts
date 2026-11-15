
import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { CARD_ID_RE } from '@/lib/cardId';
import { normalizeRarity } from '@/lib/rarity';
import { extractElementContents } from '@/lib/htmlElements';
import { BodyTooLargeError, readBodyWithLimit } from '@/lib/fetchLimit';

// ── HTML ユーティリティ ──────────────────────────────────────────
function decodeEntities(str: string): string {
  return str
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&nbsp;/g, ' ')
    .replace(/&quot;/g, '"')
    .replace(/&#x([0-9a-fA-F]+);/g, (_, h) => String.fromCharCode(parseInt(h, 16)))
    .replace(/&#(\d+);/g, (_, n) => String.fromCharCode(Number(n)));
}

function stripTags(html: string): string {
  return decodeEntities(html.replace(/<[^>]+>/g, ' ')).replace(/\s+/g, ' ').trim();
}

function extractAnchorText(cellHtml: string): string {
  const [inner] = extractElementContents(cellHtml, 'a', 1);
  if (inner === undefined) return '';
  // アンカー内のHTMLタグ（<span>等）を除去してテキストのみ取得
  return decodeEntities(inner.replace(/<[^>]+>/g, '').trim());
}

interface RawEntry {
  cardId: string;
  name: string;
  rawRarity: string;
}

// ── 本文領域抽出 ─────────────────────────────────────────────────
// PukiWikiはメニューバー(id="menubar")にも過去記事へのリンク等が並んでおり、
// そこにカード型番らしき文字列が偶然含まれるとテーブル解析が誤検出するため、
// 本文コンテナ(id="body")〜フッター(id="footer")の間だけを解析対象にする
function extractMainContent(html: string): string {
  const bodyIdx = html.indexOf('id="body"');
  if (bodyIdx === -1) return html;
  const bodyDivStart = html.lastIndexOf('<div', bodyIdx);
  const footerIdx = html.indexOf('id="footer"', bodyDivStart);
  if (footerIdx === -1) return html.substring(bodyDivStart);
  const footerDivStart = html.lastIndexOf('<div', footerIdx);
  return html.substring(bodyDivStart, footerDivStart);
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
    // 行・セルは extractElementContents で取り出す（閉じタグがなくても入力の長さに比例した時間で終わる。Q-2026-11-06-6）
    const rows = extractElementContents(tableHtml, 'tr');
    let cardIdCol = -1, nameCol = -1, rarityCol = -1;
    const tableResults: RawEntry[] = [];

    for (const rowContent of rows) {
      // ヘッダー行でカラム位置を検出
      const thCells = extractElementContents(rowContent, 'th');
      if (thCells.length > 0) {
        thCells.forEach((th, i) => {
          const t = stripTags(th);
          if (/カード番号|番号|収録/.test(t)) cardIdCol = i;
          else if (/カード名/.test(t)) nameCol = i;
          else if (/レアリティ/.test(t)) rarityCol = i;
        });
        continue;
      }

      // データ行
      const cellHtmls = extractElementContents(rowContent, 'td');
      if (cellHtmls.length < 2) continue;

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
  for (const liHtml of extractElementContents(html, 'li')) {
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

// ── アクセス制限 ─────────────────────────────────────────────────
const ALLOWED_HOSTS = ['yugioh-wiki.net'];
const MAX_REDIRECTS = 3;
const FETCH_TIMEOUT_MS = 15_000;          // 取得全体（リダイレクトと本文の読み込みを含む）の制限時間
const MAX_BODY_BYTES = 5 * 1024 * 1024;   // 取得するページの大きさの上限（5MB。Wiki のパックページは数百KB）
const USER_AGENT = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36';

// http(s) かつ許可ホスト（またはそのサブドメイン）のみ。ポート指定・認証情報付きURLは拒否
function isAllowedUrl(raw: string): boolean {
  let u: URL;
  try { u = new URL(raw); } catch { return false; }
  if (u.protocol !== 'https:' && u.protocol !== 'http:') return false;
  if (u.port || u.username || u.password) return false;
  const host = u.hostname.toLowerCase();
  return ALLOWED_HOSTS.some(h => host === h || host.endsWith(`.${h}`));
}

// リダイレクトを自前で追い、転送先も許可ホストかを毎回検査する（許可外なら null）
async function fetchAllowed(url: string, signal: AbortSignal): Promise<Response | null> {
  let current = url;
  for (let i = 0; i <= MAX_REDIRECTS; i++) {
    const res = await fetch(current, { headers: { 'User-Agent': USER_AGENT }, redirect: 'manual', signal });
    if (res.status < 300 || res.status >= 400) return res;
    const location = res.headers.get('location');
    if (!location) return res;
    current = new URL(location, current).toString();
    if (!isAllowedUrl(current)) return null;
  }
  return null;
}

// Authorization: Bearer <アクセストークン> を Supabase Auth で検証し、さらに DB関数 is_admin で
// 管理者（admins 表に登録済み）かを確かめる（Q-2026-11-06-1）。失敗時はエラー応答を返す
async function verifyAdmin(req: NextRequest): Promise<NextResponse | null> {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!supabaseUrl || !supabaseAnonKey) {
    return NextResponse.json({ error: 'サーバーの設定が不足しています。' }, { status: 500 });
  }
  const token = req.headers.get('authorization')?.match(/^Bearer\s+(.+)$/i)?.[1];
  if (!token) {
    return NextResponse.json({ error: 'ログインが必要です。' }, { status: 401 });
  }
  // is_admin を本人の権限で呼ぶため、アクセストークンを付けたクライアントを作る
  const client = createClient(supabaseUrl, supabaseAnonKey, {
    auth: { persistSession: false, autoRefreshToken: false },
    global: { headers: { Authorization: `Bearer ${token}` } },
  });
  const { data, error } = await client.auth.getUser(token);
  if (error || !data.user) {
    return NextResponse.json({ error: 'ログインの有効期限が切れています。再度ログインしてください。' }, { status: 401 });
  }
  const { data: isAdmin, error: adminError } = await client.rpc('is_admin');
  if (adminError) {
    console.error('Scrape API: is_admin の確認に失敗しました', adminError);
    return NextResponse.json({ error: '管理者かどうかを確認できませんでした。時間をおいてもう一度お試しください。' }, { status: 503 });
  }
  if (isAdmin !== true) {
    return NextResponse.json({ error: '管理者のみ利用できます。' }, { status: 403 });
  }
  return null;
}

// ── メインハンドラー ─────────────────────────────────────────────
export async function POST(req: NextRequest) {
  try {
    // 管理者（admins 表に登録済み）のみ利用可能。第三者による踏み台利用を防ぐ
    const authError = await verifyAdmin(req);
    if (authError) return authError;

    const { url } = await req.json();
    if (!url || typeof url !== 'string') return NextResponse.json({ error: 'URLを指定してください。' }, { status: 400 });

    // 取得先は遊戯王カードWikiのみ許可（リダイレクト先も同様に検査する）
    if (!isAllowedUrl(url)) {
      return NextResponse.json({ error: `取込できるのは ${ALLOWED_HOSTS.join(' / ')} のページのみです。` }, { status: 400 });
    }
    // 取得先が応答しない・巨大なページを返す場合に備え、時間とサイズに上限を設ける（Q-2026-11-06-6）
    const signal = AbortSignal.timeout(FETCH_TIMEOUT_MS);
    const fetchResponse = await fetchAllowed(url, signal);
    if (!fetchResponse) {
      return NextResponse.json({ error: '許可されていないURLへ転送されたため、取得を中止しました。' }, { status: 400 });
    }
    if (!fetchResponse.ok) {
      await fetchResponse.body?.cancel().catch(() => {});
      return NextResponse.json({ error: `ページを取得できませんでした（HTTP ${fetchResponse.status}）。URLを確認してください。` }, { status: 502 });
    }

    // yugioh-wiki.net はEUC-JPのため、バイト列で取得してデコード（上限を超えたら読むのをやめる）
    const buffer = await readBodyWithLimit(fetchResponse, MAX_BODY_BYTES);
    const contentType = fetchResponse.headers.get('content-type') || '';
    const charsetMatch = contentType.match(/charset=([\w-]+)/i);
    const charset = charsetMatch ? charsetMatch[1].toLowerCase() : 'euc-jp';
    const html = new TextDecoder(charset).decode(buffer);

    // Step 1: HTMLから型番・名前を直接抽出（本文領域のみを対象にする）
    const mainContent = extractMainContent(html);
    let rawEntries = parseFromTables(mainContent);
    if (rawEntries.length === 0) rawEntries = parseFromLists(mainContent);

    const category = extractCategory(html);

    if (rawEntries.length === 0) {
      return NextResponse.json(
        { error: 'カードリストが見つかりませんでした。URLを確認してください。' },
        { status: 422 }
      );
    }

    // Step 2: レアリティ正規化（固定マッピングで処理・Gemini不要）
    // 複数レアリティがある行は別オブジェクトに展開
    const items = rawEntries.flatMap(entry => {
      const rarities = normalizeRarity(entry.rawRarity);
      return rarities.map(rarity => ({
        name: entry.name,
        cardId: entry.cardId,
        rarity,
        stock: 0,
        category: category || entry.cardId.split('-')[0]
      }));
    });

    return NextResponse.json({ items });

  } catch (error) {
    // 例外の内容はサーバーのログにだけ残し、応答には一般的な文言を返す（Q-2026-11-06-6）
    console.error('Scrape API Error:', error);
    if (error instanceof BodyTooLargeError) {
      return NextResponse.json({ error: 'ページが大きすぎるため取り込めません（上限 5MB）。' }, { status: 413 });
    }
    const name = error instanceof Error || error instanceof DOMException ? error.name : '';
    if (name === 'TimeoutError' || name === 'AbortError') {
      return NextResponse.json({ error: `取得先が${FETCH_TIMEOUT_MS / 1000}秒以内に応答しなかったため中止しました。時間をおいてもう一度お試しください。` }, { status: 504 });
    }
    return NextResponse.json({ error: '取込の処理中にエラーが発生しました。時間をおいてもう一度お試しください。' }, { status: 500 });
  }
}
