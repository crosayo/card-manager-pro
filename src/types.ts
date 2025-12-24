
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

export type TabType = 'dashboard' | 'inventory' | 'products' | 'scraper' | 'settings';

export type PaginatedItems = {
  data: Item[];
  count: number;
};
