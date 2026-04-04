
export type Item = {
  id: number;
  name: string;
  cardId: string;
  rarity: string;
  stock: number;
  category: string;
  updatedAt: string;
};

export type Product = {
  id: string; // 将来的にはUUID推奨ですが、現行DBに合わせてname(文字列)をIDとして扱います
  name: string; // 表示名兼ID
  releaseDate: string;
  isSidebarVisible: boolean;
};

export type News = {
  id: number;
  content: string;
  type: 'info' | 'alert' | 'success';
  startDate?: string;
  endDate?: string | null; // null = 無期限
  createdAt?: string;
};

export type Season = {
  id: string;
  name: string;
  startDate: string; // YYYY-MM-DD
};

export type SystemInfo = {
  version: string;
  lastUpdated: string;
  changelog: string;
};

export type AppError = {
  code: string;
  message: string;
  details?: string;
  timestamp: string;
};

export type ToastType = {
  id: number;
  type: 'success' | 'error' | 'info';
  title: string;
  message?: string;
  errorDetail?: AppError;
};

export type SortConfig = {
  key: keyof Item | 'releaseDate'; // releaseDateはItemのプロパティではないがソートキーとしては許容
  direction: 'asc' | 'desc';
};

export type TabType = 'dashboard' | 'inventory' | 'requests' | 'products' | 'logs' | 'scraper' | 'settings' | 'supplies';

export type PaginatedItems = {
  data: Item[];
  count: number;
};

export interface StockLog {
  id: number;
  itemId: number | null;
  supplyId: number | null;
  delta: number;
  stockAfter: number;
  source: 'manual' | 'request' | 'csv';
  requestId: number | null;
  note: string | null;
  createdAt: string;
}

export interface CardRequest {
  id: number;
  token: string;
  requesterName: string;
  message: string | null;
  status: 'pending' | 'completed' | 'cancelled';
  priceTotal: number | null;
  adminMemo: string | null;
  createdAt: string;
  resolvedAt: string | null;
  items?: RequestItem[];
}

export interface RequestItem {
  id: number;
  requestId: number;
  itemId: number | null;
  supplyId: number | null;
  quantity: number;
  unitPrice: number | null;
  item?: Item;
  supply?: Supply;
}

export interface RequestEditLog {
  id: number;
  requestId: number;
  editorName: string;
  fieldChanged: string;
  oldValue: string | null;
  newValue: string | null;
  createdAt: string;
}

export interface Supply {
  id: number;
  name: string;
  category: 'sleeve' | 'playmat' | 'other';
  imageUrl: string | null;
  stock: number;
  releaseDate: string | null;
  createdAt: string;
  updatedAt: string;
}

export const SUPPLY_CATEGORY_LABELS: Record<Supply['category'], string> = {
  sleeve: 'スリーブ',
  playmat: 'プレイマット',
  other: 'その他',
};
