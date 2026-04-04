
import { supabase, isSupabaseEnabled } from '../lib/supabase';
import { Item, Product, PaginatedItems, SortConfig, Season, News, SystemInfo, StockLog, CardRequest, RequestItem, RequestEditLog, Supply } from '../types';
import { INITIAL_RARITIES, INITIAL_SEASONS, INITIAL_SYSTEM_INFO } from '../constants';
import { normalizeCardName, getSearchTerm } from '../utils';

// DBのマッピング
const mapDbItemToAppItem = (dbItem: any): Item => ({
  id: dbItem.id,
  name: dbItem.name,
  cardId: dbItem.card_id,
  rarity: dbItem.rarity,
  stock: dbItem.stock,
  category: dbItem.category,
  updatedAt: dbItem.updated_at || new Date().toISOString(),
});

const mapDbProductToAppProduct = (dbProduct: any): Product => ({
  id: dbProduct.name,
  name: dbProduct.name,
  releaseDate: dbProduct.release_date || '2000-01-01',
  isSidebarVisible: dbProduct.is_sidebar_visible ?? true,
});

const mapDbSupplyToAppSupply = (db: any): Supply => ({
  id: db.id,
  name: db.name,
  category: db.category,
  imageUrl: db.image_url,
  stock: db.stock,
  releaseDate: db.release_date,
  createdAt: db.created_at,
  updatedAt: db.updated_at,
});

const mapDbStockLogToAppStockLog = (db: any): StockLog => ({
  id: db.id,
  itemId: db.item_id,
  supplyId: db.supply_id,
  delta: db.delta,
  stockAfter: db.stock_after,
  source: db.source,
  requestId: db.request_id,
  note: db.note,
  createdAt: db.created_at,
  itemName: db.items?.name ?? null,
  itemCardId: db.items?.card_id ?? null,
  itemRarity: db.items?.rarity ?? null,
  supplyName: db.supplies?.name ?? null,
});

const mapDbRequestItemToAppRequestItem = (db: any): RequestItem => ({
  id: db.id,
  requestId: db.request_id,
  itemId: db.item_id,
  supplyId: db.supply_id,
  quantity: db.quantity,
  unitPrice: db.unit_price,
  item: db.items ? mapDbItemToAppItem(db.items) : undefined,
  supply: db.supplies ? mapDbSupplyToAppSupply(db.supplies) : undefined,
});

const mapDbRequestToAppRequest = (db: any): CardRequest => ({
  id: db.id,
  token: db.token,
  requesterName: db.requester_name,
  message: db.message,
  status: db.status,
  priceTotal: db.price_total,
  adminMemo: db.admin_memo,
  createdAt: db.created_at,
  resolvedAt: db.resolved_at,
  items: db.request_items ? db.request_items.map(mapDbRequestItemToAppRequestItem) : undefined,
});

const mapDbNewsToAppNews = (dbNews: any): News => ({
  id: dbNews.id,
  content: dbNews.content,
  type: dbNews.type,
  startDate: dbNews.start_date,
  endDate: dbNews.end_date,
  createdAt: dbNews.created_at
});

const handleSupabaseError = (error: any, action: string) => {
  if (!error) return;
  console.error(`Supabase Error [${action}]:`, error);

  const err: any = new Error(error.message || `DBエラー: ${action}`);
  err.code = error.code || 'UNKNOWN_DB_ERROR';
  err.details = error.details || error.hint || '';
  
  if (error.code === '42P01') throw err; // Undefined table
  if (error.code === '42883') throw err; // Undefined function
  
  if (error.code === '42501' || error.message?.includes('row-level security')) {
    err.message = `権限エラー: 操作権限がありません。ログインしてください。(${action})`;
    throw err;
  }
  
  throw err;
};

const ensureConnection = () => {
  if (!isSupabaseEnabled || !supabase) {
    const e: any = new Error("データベース接続設定が見つかりません。");
    e.code = "NO_CONNECTION";
    throw e;
  }
};

export const api = {
  // --- Auth ---
  onAuthStateChange: (callback: (session: any) => void) => {
    if (isSupabaseEnabled && supabase) {
      return supabase.auth.onAuthStateChange((_event: any, session: any) => callback(session));
    }
    return { data: { subscription: { unsubscribe: () => {} } } };
  },

  signInWithEmail: async (email: string, password: string) => {
    ensureConnection();
    const { data, error } = await supabase.auth.signInWithPassword({ email, password });
    if (error) throw new Error("ログイン失敗: メールアドレスかパスワードが間違っています。");
    return data;
  },

  signOut: async () => {
    if (isSupabaseEnabled && supabase) await supabase.auth.signOut();
  },

  // --- Products ---
  fetchProducts: async (): Promise<Product[]> => {
    ensureConnection();
    const { data, error } = await supabase
      .from('products')
      .select('*')
      .order('release_date', { ascending: false });
    
    if (error) {
      if (error.code === '42P01') return [];
      handleSupabaseError(error, 'fetchProducts');
    }
    return (data || []).map(mapDbProductToAppProduct);
  },

  addProduct: async (newProduct: Omit<Product, 'id'>): Promise<Product> => {
    ensureConnection();
    const { data, error } = await supabase
      .from('products')
      .insert([{
        name: newProduct.name,
        release_date: newProduct.releaseDate,
        is_sidebar_visible: newProduct.isSidebarVisible 
      }])
      .select()
      .single();
    if (error) handleSupabaseError(error, 'addProduct');
    return mapDbProductToAppProduct(data);
  },

  updateProduct: async (id: string, updates: Partial<Product>): Promise<Product> => {
    ensureConnection();
    const dbUpdates: any = {};
    if (updates.releaseDate !== undefined) dbUpdates.release_date = updates.releaseDate;
    if (updates.isSidebarVisible !== undefined) dbUpdates.is_sidebar_visible = updates.isSidebarVisible;

    const { data, error } = await supabase
      .from('products')
      .update(dbUpdates)
      .eq('name', id)
      .select()
      .single();
    if (error) handleSupabaseError(error, 'updateProduct');
    return mapDbProductToAppProduct(data);
  },

  deleteProduct: async (id: string): Promise<void> => {
    ensureConnection();
    const { error } = await supabase.from('products').delete().eq('name', id);
    if (error) handleSupabaseError(error, 'deleteProduct');
  },

  // IDで1件取得
  fetchItemById: async (id: number): Promise<Item> => {
    ensureConnection();
    const { data, error } = await supabase
      .from('items')
      .select('*')
      .eq('id', id)
      .single();
    if (error) handleSupabaseError(error, 'fetchItemById');
    return mapDbItemToAppItem(data);
  },

  // --- Items (Smart Pagination) ---
  fetchItems: async (
    page: number = 1,
    pageSize: number = 50,
    filters?: { category?: string | null, search?: string, showZeroStock?: boolean, rarities?: string[] },
    sort?: SortConfig
  ): Promise<PaginatedItems> => {
    ensureConnection();

    // 発売日順ソート: 発売日→型番→レアリティ表示順の3段ソート
    if (sort?.key === 'releaseDate') {
      return api._fallbackReleaseDateSort(page, pageSize, filters, sort);
    }
    
    // --- 通常のServer-side Query (高速) ---
    let query = supabase.from('items').select('*', { count: 'exact' });

    // Filters
    if (filters?.category) {
      query = query.eq('category', filters.category);
    }
    if (filters?.search) {
      const normalized = getSearchTerm(filters.search);
      const conditions: string[] = [];

      // 正規化後のキーワードで検索（常に実行）
      conditions.push(`name.ilike.%${normalized}%`);
      conditions.push(`card_id.ilike.%${normalized}%`);
      conditions.push(`category.ilike.%${normalized}%`);

      // 元のキーワードと異なる場合は元のキーワードでも検索
      if (normalized !== filters.search.trim()) {
        conditions.push(`name.ilike.%${filters.search.trim()}%`);
        conditions.push(`card_id.ilike.%${filters.search.trim()}%`);
      }

      query = query.or(conditions.join(','));
    }
    if (filters?.rarities && filters.rarities.length > 0) {
      query = query.in('rarity', filters.rarities);
    }
    if (filters?.showZeroStock === false) {
      query = query.gt('stock', 0);
    }

    // Sorting
    if (sort) {
      let dbKey = sort.key as string;
      if (sort.key === 'cardId') dbKey = 'card_id';
      if (sort.key === 'updatedAt') dbKey = 'updated_at';
      
      // releaseDateがここに来た場合（フォールバック）、updated_atで代用
      if ((sort.key as string) === 'releaseDate') dbKey = 'updated_at';
      
      query = query.order(dbKey, { ascending: sort.direction === 'asc' });

      if (dbKey !== 'card_id') {
         query = query.order('card_id', { ascending: true });
      }
      query = query.order('id', { ascending: true });
    } else {
      query = query.order('id', { ascending: false });
    }

    // Pagination
    const from = (page - 1) * pageSize;
    const to = from + pageSize - 1;
    
    const { data, count, error } = await query.range(from, to);

    if (error) {
       if (error.code === '42P01') return { data: [], count: 0 };
       handleSupabaseError(error, 'fetchItems');
    }
    
    return {
      data: (data || []).map(mapDbItemToAppItem),
      count: count || 0
    };
  },

  // 内部用: 全件取得ヘルパー
  fetchAllItemsInternal: async (): Promise<Item[]> => {
    let allItems: any[] = [];
    const PAGE_SIZE = 1000;
    let page = 0;
    let hasMore = true;

    while (hasMore) {
      const { data, error } = await supabase
        .from('items')
        .select('*')
        .range(page * PAGE_SIZE, (page + 1) * PAGE_SIZE - 1);

      if (error) throw error;

      if (data && data.length > 0) {
        allItems = [...allItems, ...data];
        page++;
        if (data.length < PAGE_SIZE) hasMore = false;
      } else {
        hasMore = false;
      }
    }
    return allItems.map(mapDbItemToAppItem);
  },

  addItem: async (newItem: Omit<Item, 'id' | 'updatedAt'>): Promise<Item> => {
    ensureConnection();
    // 追加時に正規化とサニタイズを適用
    const payload: any = {
        name: normalizeCardName(newItem.name),
        card_id: normalizeCardName(newItem.cardId), // 型番も正規化（半角統一）
        rarity: newItem.rarity,
        stock: newItem.stock,
        category: newItem.category,
    };
    
    const { data, error } = await supabase
      .from('items')
      .insert([payload])
      .select()
      .single();
    if (error) handleSupabaseError(error, 'addItem');
    return mapDbItemToAppItem(data);
  },

  updateStock: async (id: number, delta: number): Promise<Item> => {
    ensureConnection();
    
    // 安全性重視: RPCを使ったアトミックな更新 (連打対策)
    // Supabase側で increment_stock(item_id, delta) 関数を定義する必要あり
    const { data, error } = await supabase.rpc('increment_stock', { 
      item_id: id, 
      delta: delta 
    });

    if (error) {
      // RPCがない場合のフォールバック (ただし連打安全性は劣る)
      if (error.code === '42883') { // Undefined function
         console.warn("RPC 'increment_stock' not found. Falling back to simple update.");
         const { data: current } = await supabase.from('items').select('stock').eq('id', id).single();
         const newStock = Math.max(0, (current?.stock || 0) + delta);
         const { data: fallbackData, error: fallbackError } = await supabase
           .from('items')
           .update({ stock: newStock, updated_at: new Date().toISOString() })
           .eq('id', id)
           .select()
           .single();
         if (fallbackError) handleSupabaseError(fallbackError, 'updateStock(Fallback)');
         return mapDbItemToAppItem(fallbackData);
      }
      handleSupabaseError(error, 'updateStock(RPC)');
    }
    
    // RPCは更新後の行を返す前提
    return mapDbItemToAppItem(data);
  },

  updateItem: async (id: number, updates: Partial<Item>): Promise<Item> => {
    ensureConnection();
    const dbUpdates: any = {
      updated_at: new Date().toISOString()
    };
    // 更新時も正規化
    if (updates.name !== undefined) dbUpdates.name = normalizeCardName(updates.name);
    if (updates.cardId !== undefined) dbUpdates.card_id = normalizeCardName(updates.cardId);
    if (updates.rarity !== undefined) dbUpdates.rarity = updates.rarity;
    if (updates.stock !== undefined) dbUpdates.stock = updates.stock;
    if (updates.category !== undefined) dbUpdates.category = updates.category;

    const { data, error } = await supabase
      .from('items')
      .update(dbUpdates)
      .eq('id', id)
      .select()
      .single();
    if (error) handleSupabaseError(error, 'updateItem');
    return mapDbItemToAppItem(data);
  },

  deleteItem: async (id: number): Promise<void> => {
    ensureConnection();
    const { error } = await supabase.from('items').delete().eq('id', id);
    if (error) handleSupabaseError(error, 'deleteItem');
  },

  // --- Bulk Operations ---
  bulkInsertProducts: async (products: any[]): Promise<void> => {
    ensureConnection();
    const BATCH_SIZE = 500;
    
    // DBのカラム名に変換
    // 注意: created_at はDBスキーマによって存在しない場合があるため意図的に除外する
    const dbProducts = products.map(p => ({
      name: p.name,
      release_date: p.release_date || p.releaseDate, // 両方の形式に対応
      is_sidebar_visible: p.is_sidebar_visible !== undefined ? p.is_sidebar_visible : p.isSidebarVisible,
    }));

    for (let i = 0; i < dbProducts.length; i += BATCH_SIZE) {
      const chunk = dbProducts.slice(i, i + BATCH_SIZE);
      const { error } = await supabase
        .from('products')
        .upsert(chunk, { onConflict: 'name', ignoreDuplicates: true });
      if (error) handleSupabaseError(error, `bulkInsertProducts (batch ${i})`);
    }
  },

  bulkInsertItems: async (items: any[]): Promise<void> => {
    ensureConnection();
    const BATCH_SIZE = 100;
    
    // DBのカラム名に変換 & 正規化
    const normalizedItems = items.map(item => ({
      id: item.id, // バックアップからの復元時はIDを維持
      name: normalizeCardName(item.name),
      card_id: normalizeCardName(item.card_id || item.cardId),
      rarity: item.rarity,
      stock: item.stock,
      category: item.category,
      updated_at: item.updated_at || item.updatedAt || new Date().toISOString()
    }));

    for (let i = 0; i < normalizedItems.length; i += BATCH_SIZE) {
      const chunk = normalizedItems.slice(i, i + BATCH_SIZE);
      const { error } = await supabase
        .from('items')
        .upsert(chunk, { onConflict: 'id', ignoreDuplicates: false }); // ID重複時は更新(復元)
      if (error) handleSupabaseError(error, `bulkInsertItems (batch ${i})`);
    }
  },

  restoreFromBackup: async (backupData: { products: any[], items: any[] }): Promise<void> => {
    ensureConnection();
    
    // 1. 製品マスタの復元
    if (backupData.products && Array.isArray(backupData.products)) {
      await api.bulkInsertProducts(backupData.products);
    }
    
    // 2. 在庫データの復元
    if (backupData.items && Array.isArray(backupData.items)) {
      await api.bulkInsertItems(backupData.items);
    }
  },

  bulkUpdateStock: async (updates: { id: number, stock: number }[]): Promise<void> => {
    ensureConnection();
    const BATCH_SIZE = 50; 
    const timestamp = new Date().toISOString();

    for (let i = 0; i < updates.length; i += BATCH_SIZE) {
      const chunk = updates.slice(i, i + BATCH_SIZE);
      await Promise.all(chunk.map(item => 
        supabase
          .from('items')
          .update({ stock: item.stock, updated_at: timestamp })
          .eq('id', item.id)
      ));
    }
  },

  // --- Data Normalization Maintenance ---
  // 既存データの正規化（《》削除・半角統一）を行う
  normalizeAllItems: async (onProgress?: (count: number) => void): Promise<number> => {
    ensureConnection();
    const allItems = await api.fetchAllItemsInternal();
    let updateCount = 0;
    const BATCH_SIZE = 50;

    const updates = [];

    for (const item of allItems) {
      const normalizedName = normalizeCardName(item.name);
      const normalizedCardId = normalizeCardName(item.cardId);

      // 変化がある場合のみ更新対象にする
      if (normalizedName !== item.name || normalizedCardId !== item.cardId) {
        updates.push({
          id: item.id,
          name: normalizedName,
          card_id: normalizedCardId,
          updated_at: new Date().toISOString()
        });
      }
    }

    // バッチ更新
    for (let i = 0; i < updates.length; i += BATCH_SIZE) {
      const chunk = updates.slice(i, i + BATCH_SIZE);
      await Promise.all(chunk.map(u => 
        supabase.from('items').update(u).eq('id', u.id)
      ));
      updateCount += chunk.length;
      if (onProgress) onProgress(updateCount);
    }

    return updateCount;
  },

  // --- Backup (Full Export) ---
  fetchAllItemsForBackup: async (onProgress?: (count: number) => void): Promise<Item[]> => {
    ensureConnection();
    let allItems: any[] = [];
    const PAGE_SIZE = 1000;
    let page = 0;
    let hasMore = true;

    while (hasMore) {
      const { data, error } = await supabase
        .from('items')
        .select('*')
        .range(page * PAGE_SIZE, (page + 1) * PAGE_SIZE - 1)
        .order('id', { ascending: true });

      if (error) handleSupabaseError(error, 'fetchAllItemsForBackup');

      if (data && data.length > 0) {
        allItems = [...allItems, ...data];
        if (onProgress) onProgress(allItems.length);
        page++;
        if (data.length < PAGE_SIZE) hasMore = false;
      } else {
        hasMore = false;
      }
      
      await new Promise(r => setTimeout(r, 50));
    }

    return allItems.map(mapDbItemToAppItem);
  },

  // --- Reset All Data ---
  resetDatabase: async (): Promise<void> => {
    ensureConnection();
    const { error } = await supabase.rpc('reset_all_data');
    if (error) {
       if (error.code === '42883') {
         throw new Error("データベース初期化関数(reset_all_data)が見つかりません。設定画面のSQLを更新してください。");
       }
       handleSupabaseError(error, 'resetDatabase');
    }
  },

  // --- Dashboard Stats ---
  fetchDashboardStats: async (): Promise<{ totalCards: number, totalStock: number, lowStock: number }> => {
    ensureConnection();
    try {
      const { data, error } = await supabase.rpc('get_dashboard_stats');
      if (error) throw error;
      if (data) {
        return {
          totalCards: data.totalCards || 0,
          totalStock: data.totalStock || 0,
          lowStock: data.lowStock || 0
        };
      }
    } catch (e: any) {
      console.warn("RPC failed, falling back to standard queries.", e.message);
      const { count: totalCards } = await supabase.from('items').select('id', { count: 'exact', head: true });
      const { count: lowStock } = await supabase.from('items').select('id', { count: 'exact', head: true }).lt('stock', 2);
      return { totalCards: totalCards || 0, totalStock: 0, lowStock: lowStock || 0 };
    }
    return { totalCards: 0, totalStock: 0, lowStock: 0 };
  },

  // --- Config (Rarities, Seasons, SystemInfo) ---
  fetchRarities: async (): Promise<string[]> => {
    ensureConnection();
    const { data, error } = await supabase.from('config').select('value').eq('key', 'rarities').single();
    if (error) {
      if (error.code === '42P01' || error.code === 'PGRST116') return INITIAL_RARITIES;
      handleSupabaseError(error, 'fetchRarities');
    }
    return data?.value || INITIAL_RARITIES;
  },

  saveRarities: async (rarities: string[]): Promise<void> => {
    ensureConnection();
    const { error } = await supabase.from('config').upsert({ key: 'rarities', value: rarities }, { onConflict: 'key' });
    if (error) {
      console.error("saveRarities error:", error);
      handleSupabaseError(error, 'saveRarities');
    }
  },

  fetchSeasons: async (): Promise<Season[]> => {
    ensureConnection();
    const { data, error } = await supabase.from('config').select('value').eq('key', 'seasons').single();
    if (error) {
      if (error.code === '42P01' || error.code === 'PGRST116') return INITIAL_SEASONS;
      handleSupabaseError(error, 'fetchSeasons');
    }
    return data?.value || INITIAL_SEASONS;
  },

  saveSeasons: async (seasons: Season[]): Promise<void> => {
    ensureConnection();
    const { error } = await supabase.from('config').upsert({ key: 'seasons', value: seasons }, { onConflict: 'key' });
    if (error) {
      console.error("saveSeasons error:", error);
      handleSupabaseError(error, 'saveSeasons');
    }
  },

  fetchSystemInfo: async (): Promise<SystemInfo> => {
    ensureConnection();
    const { data, error } = await supabase.from('config').select('value').eq('key', 'system_info').single();
    if (error) {
      if (error.code === '42P01' || error.code === 'PGRST116') return INITIAL_SYSTEM_INFO;
      // エラーは無視して初期値を返す
    }
    return data?.value || INITIAL_SYSTEM_INFO;
  },

  saveSystemInfo: async (info: SystemInfo): Promise<void> => {
    ensureConnection();
    const { error } = await supabase.from('config').upsert({ key: 'system_info', value: info }, { onConflict: 'key' });
    if (error) {
      console.error("saveSystemInfo error:", error);
      handleSupabaseError(error, 'saveSystemInfo');
    }
  },

  fetchDistinctRarities: async (): Promise<string[]> => {
    ensureConnection();
    try {
      const { data, error } = await supabase.rpc('get_distinct_rarities');
      if (error) throw error;
      return (data || []).map((row: any) => row.rarity).filter(Boolean);
    } catch (e: any) {
      console.warn("RPC 'get_distinct_rarities' not found.");
      throw new Error("レアリティの集計に失敗しました。");
    }
  },
  
  // --- News ---
  fetchNews: async (): Promise<News[]> => {
    ensureConnection();
    const today = new Date().toISOString().split('T')[0];
    const { data, error } = await supabase
      .from('news')
      .select('*')
      .or(`end_date.is.null,end_date.gte.${today}`)
      .order('created_at', { ascending: false });
    
    if (error) {
      if (error.code === '42P01') return [];
      handleSupabaseError(error, 'fetchNews');
    }
    return (data || []).map(mapDbNewsToAppNews);
  },

  addNews: async (news: Omit<News, 'id' | 'createdAt'>): Promise<News> => {
    ensureConnection();
    const { data, error } = await supabase
      .from('news')
      .insert([{
        content: news.content,
        type: news.type,
        start_date: news.startDate,
        end_date: news.endDate
      }])
      .select()
      .single();
    if (error) handleSupabaseError(error, 'addNews');
    return mapDbNewsToAppNews(data);
  },

  deleteNews: async (id: number): Promise<void> => {
    ensureConnection();
    const { error } = await supabase.from('news').delete().eq('id', id);
    if (error) handleSupabaseError(error, 'deleteNews');
  },

  // --- StockLogs ---
  addStockLog: async (params: {
    itemId?: number;
    supplyId?: number;
    delta: number;
    stockAfter: number;
    source: 'manual' | 'request' | 'csv';
    requestId?: number;
    note?: string;
  }): Promise<void> => {
    ensureConnection();
    const { error } = await supabase.from('stock_logs').insert([{
      item_id: params.itemId ?? null,
      supply_id: params.supplyId ?? null,
      delta: params.delta,
      stock_after: params.stockAfter,
      source: params.source,
      request_id: params.requestId ?? null,
      note: params.note ?? null,
    }]);
    if (error) {
      // テーブル未作成時はエラーを無視してログのみ出力
      if (error.code === '42P01') { console.warn('stock_logs テーブルが存在しません'); return; }
      handleSupabaseError(error, 'addStockLog');
    }
  },

  fetchStockLogs: async (limit: number = 50): Promise<StockLog[]> => {
    ensureConnection();
    const { data, error } = await supabase
      .from('stock_logs')
      .select('*, items(name, card_id, rarity), supplies(name)')
      .order('created_at', { ascending: false })
      .limit(limit);
    if (error) {
      if (error.code === '42P01') return [];
      handleSupabaseError(error, 'fetchStockLogs');
    }
    return (data || []).map(mapDbStockLogToAppStockLog);
  },

  // --- Requests ---
  fetchRequests: async (status?: 'pending' | 'completed' | 'cancelled'): Promise<CardRequest[]> => {
    ensureConnection();
    let query = supabase
      .from('requests')
      .select(`*, request_items(*, items(*), supplies(*))`)
      .order('created_at', { ascending: false });
    if (status) query = query.eq('status', status);
    const { data, error } = await query;
    if (error) {
      if (error.code === '42P01') return [];
      handleSupabaseError(error, 'fetchRequests');
    }
    return (data || []).map(mapDbRequestToAppRequest);
  },

  fetchRequestById: async (id: number): Promise<CardRequest> => {
    ensureConnection();
    const { data, error } = await supabase
      .from('requests')
      .select(`*, request_items(*, items(*), supplies(*))`)
      .eq('id', id)
      .single();
    if (error) handleSupabaseError(error, 'fetchRequestById');
    return mapDbRequestToAppRequest(data);
  },

  createRequest: async (params: {
    requesterName: string;
    message?: string;
    items: Array<{ itemId?: number; supplyId?: number; quantity: number }>;
  }): Promise<CardRequest> => {
    ensureConnection();
    const { data: req, error: reqError } = await supabase
      .from('requests')
      .insert([{ requester_name: params.requesterName, message: params.message || null }])
      .select()
      .single();
    if (reqError) handleSupabaseError(reqError, 'createRequest');

    const requestItems = params.items.map(item => ({
      request_id: req.id,
      item_id: item.itemId ?? null,
      supply_id: item.supplyId ?? null,
      quantity: item.quantity,
    }));
    const { error: itemsError } = await supabase.from('request_items').insert(requestItems);
    if (itemsError) handleSupabaseError(itemsError, 'createRequest(items)');

    return api.fetchRequestById(req.id);
  },

  updateRequestStatus: async (
    requestId: number,
    status: 'completed' | 'cancelled',
    params?: {
      unitPrices?: Record<number, number>;
      priceTotal?: number;
      adminMemo?: string;
    }
  ): Promise<CardRequest> => {
    ensureConnection();
    const updates: any = {
      status,
      resolved_at: new Date().toISOString(),
    };
    if (params?.priceTotal !== undefined) updates.price_total = params.priceTotal;
    if (params?.adminMemo !== undefined) updates.admin_memo = params.adminMemo;

    const { error } = await supabase.from('requests').update(updates).eq('id', requestId);
    if (error) handleSupabaseError(error, 'updateRequestStatus');

    // 単価を更新
    if (params?.unitPrices) {
      await Promise.all(
        Object.entries(params.unitPrices).map(([riId, price]) =>
          supabase.from('request_items').update({ unit_price: price }).eq('id', Number(riId))
        )
      );
    }

    return api.fetchRequestById(requestId);
  },

  editRequest: async (
    requestId: number,
    requesterName: string,
    params: {
      message?: string;
      itemChanges?: Array<{ requestItemId: number; quantity: number }>;
      itemsToAdd?: Array<{ itemId?: number; supplyId?: number; quantity: number }>;
    }
  ): Promise<CardRequest> => {
    ensureConnection();
    // 本人確認
    const { data: reqData, error: reqFetchError } = await supabase
      .from('requests')
      .select('requester_name')
      .eq('id', requestId)
      .single();
    if (reqFetchError) handleSupabaseError(reqFetchError, 'editRequest(fetch)');
    if (reqData.requester_name !== requesterName) {
      const e: any = new Error('名前が一致しません。送信時に入力した名前を入力してください。');
      e.code = 'NAME_MISMATCH';
      throw e;
    }

    if (params.message !== undefined) {
      const { error } = await supabase.from('requests').update({ message: params.message }).eq('id', requestId);
      if (error) handleSupabaseError(error, 'editRequest(message)');
    }
    if (params.itemChanges) {
      await Promise.all(params.itemChanges.map(c =>
        supabase.from('request_items').update({ quantity: c.quantity }).eq('id', c.requestItemId)
      ));
    }
    if (params.itemsToAdd && params.itemsToAdd.length > 0) {
      const newItems = params.itemsToAdd.map(i => ({
        request_id: requestId,
        item_id: i.itemId ?? null,
        supply_id: i.supplyId ?? null,
        quantity: i.quantity,
      }));
      const { error } = await supabase.from('request_items').insert(newItems);
      if (error) handleSupabaseError(error, 'editRequest(addItems)');
    }

    return api.fetchRequestById(requestId);
  },

  addRequestEditLog: async (params: {
    requestId: number;
    editorName: string;
    fieldChanged: string;
    oldValue?: string;
    newValue?: string;
  }): Promise<void> => {
    ensureConnection();
    const { error } = await supabase.from('request_edit_logs').insert([{
      request_id: params.requestId,
      editor_name: params.editorName,
      field_changed: params.fieldChanged,
      old_value: params.oldValue ?? null,
      new_value: params.newValue ?? null,
    }]);
    if (error) {
      if (error.code === '42P01') return;
      handleSupabaseError(error, 'addRequestEditLog');
    }
  },

  deleteRequest: async (requestId: number): Promise<void> => {
    ensureConnection();
    // 関連する request_items を先に削除
    const { error: itemsError } = await supabase.from('request_items').delete().eq('request_id', requestId);
    if (itemsError) handleSupabaseError(itemsError, 'deleteRequest(items)');
    // request_edit_logs を削除
    const { error: logsError } = await supabase.from('request_edit_logs').delete().eq('request_id', requestId);
    if (logsError && logsError.code !== '42P01') handleSupabaseError(logsError, 'deleteRequest(logs)');
    // リクエスト本体を削除
    const { error } = await supabase.from('requests').delete().eq('id', requestId);
    if (error) handleSupabaseError(error, 'deleteRequest');
  },

  fetchRequestEditLogs: async (requestId: number): Promise<RequestEditLog[]> => {
    ensureConnection();
    const { data, error } = await supabase
      .from('request_edit_logs')
      .select('*')
      .eq('request_id', requestId)
      .order('created_at', { ascending: false });
    if (error) {
      if (error.code === '42P01') return [];
      handleSupabaseError(error, 'fetchRequestEditLogs');
    }
    return (data || []).map((db: any): RequestEditLog => ({
      id: db.id,
      requestId: db.request_id,
      editorName: db.editor_name,
      fieldChanged: db.field_changed,
      oldValue: db.old_value,
      newValue: db.new_value,
      createdAt: db.created_at,
    }));
  },

  // pending中のリクエスト枚数を集計 (itemId -> 枚数)
  fetchPendingQuantities: async (): Promise<Record<number, number>> => {
    ensureConnection();
    const { data, error } = await supabase
      .from('request_items')
      .select('item_id, quantity, requests!inner(status)')
      .eq('requests.status', 'pending');
    if (error) {
      if (error.code === '42P01') return {};
      console.warn('fetchPendingQuantities failed:', error.message);
      return {};
    }
    const map: Record<number, number> = {};
    for (const row of (data || [])) {
      if (row.item_id) {
        map[row.item_id] = (map[row.item_id] ?? 0) + row.quantity;
      }
    }
    return map;
  },

  // --- Supplies ---
  fetchSupplies: async (category?: Supply['category']): Promise<Supply[]> => {
    ensureConnection();
    let query = supabase.from('supplies').select('*').order('created_at', { ascending: false });
    if (category) query = query.eq('category', category);
    const { data, error } = await query;
    if (error) {
      if (error.code === '42P01') return [];
      handleSupabaseError(error, 'fetchSupplies');
    }
    return (data || []).map(mapDbSupplyToAppSupply);
  },

  createSupply: async (params: { name: string; category: Supply['category']; releaseDate?: string }): Promise<Supply> => {
    ensureConnection();
    const { data, error } = await supabase
      .from('supplies')
      .insert([{ name: params.name, category: params.category, release_date: params.releaseDate ?? null }])
      .select()
      .single();
    if (error) handleSupabaseError(error, 'createSupply');
    return mapDbSupplyToAppSupply(data);
  },

  updateSupply: async (id: number, params: Partial<Pick<Supply, 'name' | 'category' | 'releaseDate' | 'stock'>>): Promise<Supply> => {
    ensureConnection();
    const updates: any = {};
    if (params.name !== undefined) updates.name = params.name;
    if (params.category !== undefined) updates.category = params.category;
    if (params.releaseDate !== undefined) updates.release_date = params.releaseDate;
    if (params.stock !== undefined) updates.stock = params.stock;
    const { data, error } = await supabase.from('supplies').update(updates).eq('id', id).select().single();
    if (error) handleSupabaseError(error, 'updateSupply');
    return mapDbSupplyToAppSupply(data);
  },

  deleteSupply: async (id: number): Promise<void> => {
    ensureConnection();
    const { error } = await supabase.from('supplies').delete().eq('id', id);
    if (error) handleSupabaseError(error, 'deleteSupply');
  },

  uploadSupplyImage: async (supplyId: number, file: File): Promise<string> => {
    ensureConnection();
    const { compressImage } = await import('@/utils');
    const compressed = await compressImage(file, { maxWidth: 800, quality: 0.8 });
    const fileName = `supply-${supplyId}-${Date.now()}.jpg`;
    const { error } = await supabase.storage
      .from('supply-images')
      .upload(fileName, compressed, { upsert: true, contentType: 'image/jpeg' });
    if (error) handleSupabaseError(error, 'uploadSupplyImage');
    const { data: urlData } = supabase.storage.from('supply-images').getPublicUrl(fileName);
    await supabase.from('supplies').update({ image_url: urlData.publicUrl }).eq('id', supplyId);
    return urlData.publicUrl;
  },

  updateSupplyStock: async (id: number, delta: number): Promise<Supply> => {
    ensureConnection();
    const { data: current, error: fetchError } = await supabase.from('supplies').select('stock').eq('id', id).single();
    if (fetchError) handleSupabaseError(fetchError, 'updateSupplyStock(fetch)');
    const newStock = Math.max(0, (current?.stock ?? 0) + delta);
    const { data, error } = await supabase.from('supplies').update({ stock: newStock }).eq('id', id).select().single();
    if (error) handleSupabaseError(error, 'updateSupplyStock');
    return mapDbSupplyToAppSupply(data);
  },

  // --- Discord 通知 ---
  fetchDiscordWebhookUrl: async (): Promise<string> => {
    ensureConnection();
    const { data, error } = await supabase.from('config').select('value').eq('key', 'discord_webhook_url').single();
    if (error) return '';
    const val = data?.value;
    return typeof val === 'string' ? val : '';
  },

  updateDiscordWebhookUrl: async (url: string): Promise<void> => {
    ensureConnection();
    const { error } = await supabase.from('config').upsert({ key: 'discord_webhook_url', value: url }, { onConflict: 'key' });
    if (error) handleSupabaseError(error, 'updateDiscordWebhookUrl');
  },

  sendDiscordNotification: async (request: CardRequest): Promise<void> => {
    const webhookUrl = await api.fetchDiscordWebhookUrl();
    if (!webhookUrl) return;

    const itemLines = (request.items || []).map(ri => {
      const name = ri.item?.name ?? ri.supply?.name ?? '不明';
      return `${name} × ${ri.quantity}枚`;
    });

    const lines = [
      '【新しいリクエスト】',
      `送信者: ${request.requesterName}`,
      ...itemLines,
    ];
    if (request.message) lines.push(`メモ: ${request.message}`);

    try {
      await fetch(webhookUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ content: lines.join('\n') }),
      });
    } catch (e) {
      console.warn('Discord通知の送信に失敗しました:', e);
    }
  },

  checkSchema: async (): Promise<boolean> => {
    if (!isSupabaseEnabled || !supabase) return false;
    const { error } = await supabase.from('products').select('name').limit(1);
    return !error || error.code !== '42P01';
  },

  // フォールバック: RPC未登録時のクライアント側 releaseDate ソート（旧実装）
  _fallbackReleaseDateSort: async (
    page: number,
    pageSize: number,
    filters?: { category?: string | null, search?: string, showZeroStock?: boolean, rarities?: string[] },
    sort?: SortConfig
  ): Promise<PaginatedItems> => {
    const products = await api.fetchProducts();
    const productMap = new Map(products.map(p => [p.name, p.releaseDate]));
    const rarities = await api.fetchRarities();
    const rarityMap = new Map(rarities.map((r, i) => [r, i]));
    const allItems = await api.fetchAllItemsInternal();

    let itemsWithDate = allItems.map(item => ({
      ...item,
      releaseDate: productMap.get(item.category) || '1999-01-01'
    }));

    if (filters?.category) {
      itemsWithDate = itemsWithDate.filter(i => i.category === filters.category);
    }
    if (filters?.search) {
      const lowerRaw = filters.search.toLowerCase();
      const lowerNormalized = getSearchTerm(filters.search).toLowerCase();
      itemsWithDate = itemsWithDate.filter(i => {
        const normName = normalizeCardName(i.name).toLowerCase();
        const normCardId = normalizeCardName(i.cardId).toLowerCase();
        const normCategory = normalizeCardName(i.category).toLowerCase();
        return normName.includes(lowerNormalized) || normName.includes(lowerRaw) ||
               normCardId.includes(lowerNormalized) || normCardId.includes(lowerRaw) ||
               normCategory.includes(lowerNormalized) || normCategory.includes(lowerRaw);
      });
    }
    if (filters?.rarities && filters.rarities.length > 0) {
      itemsWithDate = itemsWithDate.filter(i => filters.rarities!.includes(i.rarity));
    }
    if (filters?.showZeroStock === false) {
      itemsWithDate = itemsWithDate.filter(i => i.stock > 0);
    }

    const direction = sort?.direction || 'desc';
    itemsWithDate.sort((a, b) => {
      const dateA = new Date(a.releaseDate).getTime();
      const dateB = new Date(b.releaseDate).getTime();
      if (dateA !== dateB) return direction === 'asc' ? dateA - dateB : dateB - dateA;
      if (a.cardId !== b.cardId) return a.cardId.localeCompare(b.cardId);
      const rankA = rarityMap.get(a.rarity) ?? 999;
      const rankB = rarityMap.get(b.rarity) ?? 999;
      return rankA - rankB;
    });

    const from = (page - 1) * pageSize;
    const slicedData = itemsWithDate.slice(from, from + pageSize).map(({ releaseDate, ...item }) => item);

    return { data: slicedData, count: itemsWithDate.length };
  },

  fetchPendingRequestsCount: async (): Promise<number> => {
    ensureConnection();
    const { count, error } = await supabase
      .from('requests')
      .select('id', { count: 'exact', head: true })
      .eq('status', 'pending');
    if (error) return 0;
    return count ?? 0;
  },
};
