
import { Item, News, Product, Season } from './types';

// 本番環境初期値: 空配列
export const INITIAL_PRODUCTS: Product[] = [];

export const INITIAL_NEWS: News[] = [
  { id: 1, startDate: new Date().toISOString().split('T')[0], content: "システムが本番稼働を開始しました。", type: 'success' },
];

export const INITIAL_RARITIES = ["UR", "SR", "R", "N", "SE", "PS", "UL", "QCSE", "20th", "HR"];

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

// 本番環境初期値: 空配列
export const INITIAL_ITEMS: Item[] = [];

export const getRarityStyle = (rarity: string) => {
  return 'bg-slate-100 text-slate-600 border-slate-200';
};