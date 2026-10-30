
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

export type TabType = 'dashboard' | 'inventory' | 'requests' | 'products' | 'logs' | 'scraper' | 'settings' | 'supplies' | 'invites';

// 招待リンク（期限付きの閲覧・リクエスト権限）
export interface Invite {
  id: number;
  code: string;
  label: string | null;      // 誰に渡したかのメモ
  expiresAt: string;
  revokedAt: string | null;
  createdAt: string;
  lastUsedAt: string | null;
  useCount: number;
  autoExtendDays: number | null; // アクセスされるたびに「今からこの日数」まで延長（null=自動延長なし）
}

// 招待リンクのアクセス履歴（90日分）
export interface InviteAccessLog {
  id: number;
  inviteId: number;
  accessedAt: string;
  ip: string | null;
  userAgent: string | null;
}

// 閲覧者（未ログイン）の招待リンクの状態
export type InviteStatus =
  | { state: 'none' }                                   // 招待コードなし
  | { state: 'checking' }                               // 確認中
  | { state: 'valid'; expiresAt: string; label: string | null }
  | { state: 'invalid' };                               // 期限切れ・取消・存在しない

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
  itemName?: string | null;
  itemCardId?: string | null;
  itemRarity?: string | null;
  supplyName?: string | null;
}

export interface CardRequest {
  id: number;
  token?: string; // 編集用トークン（送信直後と管理者にのみ渡される）
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
