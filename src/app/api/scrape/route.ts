import { NextRequest, NextResponse } from 'next/server';
import { GoogleGenAI, Type } from "@google/genai";

export async function POST(req: NextRequest) {
  try {
    const { url } = await req.json();

    if (!url) {
      return NextResponse.json({ error: 'URL is required' }, { status: 400 });
    }

    // 1. URLからHTMLを取得
    const fetchResponse = await fetch(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36'
      }
    });

    if (!fetchResponse.ok) {
      return NextResponse.json({ error: `Failed to fetch URL: ${fetchResponse.statusText}` }, { status: 500 });
    }

    const html = await fetchResponse.text();

    // HTMLが長すぎる場合は切り詰める (Geminiのコンテキスト制限対策、ただしFlashはかなり長いので大きめにとる)
    const truncatedHtml = html.substring(0, 500000); 

    // 2. Gemini APIの初期化
    const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });

    // 3. GeminiにHTML解析を依頼
    const response = await ai.models.generateContent({
      model: 'gemini-3-flash-preview',
      contents: `
        以下のHTMLテキストから、トレーディングカード（主に遊戯王OCG）のリストを抽出してください。
        
        抽出ルール:
        1. カード名 (name): "《...》"のような括弧を除去して純粋な名前のみ。
        2. 型番 (cardId): "ABC-123"のような形式。見つからなければ空文字または推定。
        3. レアリティ (rarity): "Ultra", "Super", "Normal"などを"UR", "SR", "N", "SE"などの短縮コードに変換。
           - Ultra Rare -> UR
           - Super Rare -> SR
           - Rare -> R
           - Normal -> N
           - Secret -> SE
           - Ultimate -> UL
           - Prismatic -> PS
        4. stockは初期値として0を設定してください。
        5. categoryはページタイトルや内容から推測されるパック名を設定してください（例: "ストラクチャーデッキ－青眼龍轟臨－"）。
        
        HTML:
        ${truncatedHtml}
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

    const items = JSON.parse(response.text || "[]");

    return NextResponse.json({ items });

  } catch (error: any) {
    console.error('Scrape API Error:', error);
    return NextResponse.json({ 
      error: 'Failed to process request', 
      details: error.message 
    }, { status: 500 });
  }
}