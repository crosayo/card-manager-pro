
import { Item, News, Product, Season, SystemInfo } from './types';

// 本番環境初期値: 空配列
export const INITIAL_PRODUCTS: Product[] = [];

export const INITIAL_NEWS: News[] = [
  { id: 1, startDate: new Date().toISOString().split('T')[0], content: "システムが本番稼働を開始しました。", type: 'success' },
];

// レアリティの初期値（39種類。2026-11-08 整理）
// 基本は公式カードデータベース（遊戯王ニューロン）の略号。空白は詰める（例: 公式「20th SE」→「20thSE」）。
// 公式にないデザイン違いは「基本の略号-区別」で表す（例: UR-初期・UR-ロゴ・UR-OF＝オーバーフレーム）。
// NR（ノーマルレア）は公式では R 扱いだが、見た目が違うため別に持つ。トークンは N として登録する。
// 経緯と対応表: docs/design/レアリティ整理変更_2026-11-08.sql
export const INITIAL_RARITIES = [
  "N", "NR", "R", "SR", "UR", "SE",
  "P", "P+UR", "P+SR", "P+SE", "P+HR",
  "UL", "HR", "CR", "GR", "GSE", "PG", "EXSE", "PSE", "QCSE", "QCSE-GREEN", "20thSE", "10000SE", "GMR",
  "KC+UR", "M", "M+SR", "M+UR", "M+SE",
  "UR-RED", "UR-BLUE", "SE-RED", "SE-BLUE",
  "UR-初期", "SE-初期", "UR-ロゴ", "SE-ロゴ", "UR-OF", "PSE-OF",
];

export const INITIAL_SEASONS: Season[] = [
  { id: 's13', name: '第13期 (2025~)', startDate: '2025-04-01' },
  { id: 's12', name: '第12期 (2023~)', startDate: '2023-04-01' },
  { id: 's11', name: '第11期 (2020~)', startDate: '2020-04-01' },
  { id: 's10', name: '第10期 (2017~)', startDate: '2017-03-25' },
  { id: 's9', name: '第9期 (2014~)', startDate: '2014-03-21' },
  { id: 's8', name: '第8期 (2012~)', startDate: '2012-03-17' },
  { id: 's7', name: '第7期 (2010~)', startDate: '2010-03-20' },
  { id: 's6', name: '第6期 (2008~)', startDate: '2008-03-15' },
  { id: 's5', name: '第5期 (2006~)', startDate: '2006-05-18' },
  { id: 's4', name: '第4期 (2004~)', startDate: '2004-05-27' },
  { id: 's3', name: '第3期 (2002~)', startDate: '2002-05-16' },
  { id: 's2', name: '第2期 (2000~)', startDate: '2000-04-20' },
  { id: 's1', name: '第1期 (1999~)', startDate: '1999-02-04' },
];

export const INITIAL_SYSTEM_INFO: SystemInfo = {
  version: "4.5",
  lastUpdated: new Date().toISOString().split('T')[0],
  changelog: "初期リリース\n- ダッシュボード機能\n- 在庫管理機能\n- Wikiスクレイピング機能"
};

// 本番環境初期値: 空配列
export const INITIAL_ITEMS: Item[] = [];

export const RARITY_STYLES: Record<string, { bg: string; text: string; border: string }> = {
  'UR': { bg: 'bg-yellow-50',  text: 'text-yellow-800', border: 'border-yellow-300' },
  'SR': { bg: 'bg-purple-50',  text: 'text-purple-800', border: 'border-purple-300' },
  'R':  { bg: 'bg-blue-50',    text: 'text-blue-800',   border: 'border-blue-300'   },
  'N':  { bg: 'bg-slate-100',  text: 'text-slate-600',  border: 'border-slate-300'  },
};

export const RARITY_DEFAULT_STYLE = {
  bg: 'bg-slate-100', text: 'text-slate-600', border: 'border-slate-200'
};

export const getRarityStyle = (rarity: string): string => {
  const style = RARITY_STYLES[rarity] ?? RARITY_DEFAULT_STYLE;
  return `${style.bg} ${style.text} border ${style.border}`;
};
