
import { supabase, isSupabaseEnabled } from '../lib/supabase';
import { Item, Product, PaginatedItems, SortConfig, Season, News } from '../types';
import { INITIAL_RARITIES, INITIAL_SEASONS } from '../constants';
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

  // --- Items (Smart Pagination) ---
  fetchItems: async (
    page: number = 1, 
    pageSize: number = 50, 
    filters?: { category?: string | null, search?: string, showZeroStock?: boolean },
    sort?: SortConfig
  ): Promise<PaginatedItems> => {
    ensureConnection();

    // ★SQL改変不可・itemsテーブルにrelease_dateが無い前提での「発売日順ソート」実装
    // クライアントサイドで全件取得・結合・ソートを行う（処理は遅くなるが要件を満たす）
    if (sort?.key === 'releaseDate') {
      try {
        // 1. 全製品取得 (発売日データ用)
        const products = await api.fetchProducts();
        const productMap = new Map(products.map(p => [p.name, p.releaseDate]));

        // 2. 全アイテム取得 (フィルタリングなしで全件)
        const allItems = await api.fetchAllItemsInternal();

        // 3. データ結合 & アプリケーション側でのフィルタリング
        // 内部計算用に一時的に releaseDate を持つオブジェクトを作成
        let itemsWithDate = allItems.map(item => ({
          ...item,
          releaseDate: productMap.get(item.category) || '1999-01-01'
        }));

        // Filter: Category
        if (filters?.category) {
          itemsWithDate = itemsWithDate.filter(i => i.category === filters.category);
        }
        // Filter: Search
        if (filters?.search) {
          const rawSearch = filters.search;
          const normalizedSearch = getSearchTerm(filters.search);
          const lowerRaw = rawSearch.toLowerCase();
          const lowerNormalized = normalizedSearch.toLowerCase();

          // メモリ上での検索なので、normalize同士で比較するのが確実
          itemsWithDate = itemsWithDate.filter(i => {
             const normName = normalizeCardName(i.name).toLowerCase();
             const normCardId = normalizeCardName(i.cardId).toLowerCase();
             
             // 正規化後で一致するか、または生の入力で部分一致するか
             return normName.includes(lowerNormalized) || 
                    normName.includes(lowerRaw) ||
                    normCardId.includes(lowerNormalized) ||
                    normCardId.includes(lowerRaw);
          });
        }
        // Filter: Zero Stock
        if (filters?.showZeroStock === false) {
          itemsWithDate = itemsWithDate.filter(i => i.stock > 0);
        }

        // 4. ソート実行
        itemsWithDate.sort((a, b) => {
          const dateA = new Date(a.releaseDate!).getTime();
          const dateB = new Date(b.releaseDate!).getTime();
          
          if (dateA !== dateB) {
            return sort.direction === 'asc' ? dateA - dateB : dateB - dateA;
          }
          // 第2ソート: 型番
          if (a.cardId !== b.cardId) {
            return a.cardId.localeCompare(b.cardId);
          }
          return 0;
        });

        // 5. ページネーション切り出し & Item型への準拠（releaseDate削除）
        const from = (page - 1) * pageSize;
        const slicedData = itemsWithDate.slice(from, from + pageSize).map(i => {
          const { releaseDate, ...itemWithoutDate } = i; // releaseDateを除去
          return itemWithoutDate;
        });

        return {
          data: slicedData,
          count: itemsWithDate.length
        };

      } catch (e) {
        console.error("Client-side sort failed", e);
        // 失敗時は通常取得にフォールバック
      }
    }
    
    // --- 通常のServer-side Query (高速) ---
    let query = supabase.from('items').select('*', { count: 'exact' });

    // Filters
    if (filters?.category) {
      query = query.eq('category', filters.category);
    }
    if (filters?.search) {
      // 検索寛容化: 正規化された用語と、生の入力の両方で検索する
      // DB側が正規化されていれば前者がヒット、されていなくても後者がヒットする可能性がある
      const normalized = getSearchTerm(filters.search);
      const raw = filters.search;
      
      // ILIKE は大文字小文字を無視するが、全角半角は区別する
      // なので、OR条件で両パターンを含める
      if (normalized !== raw) {
        query = query.or(`name.ilike.%${raw}%,name.ilike.%${normalized}%,card_id.ilike.%${raw}%,card_id.ilike.%${normalized}%`);
      } else {
        query = query.or(`name.ilike.%${raw}%,card_id.ilike.%${raw}%`);
      }
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
      if (sort.key === 'releaseDate') dbKey = 'updated_at';
      
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
    const { data: current } = await supabase.from('items').select('stock').eq('id', id).single();
    const newStock = Math.max(0, (current?.stock || 0) + delta);
    
    const { data, error } = await supabase
      .from('items')
      .update({ 
        stock: newStock,
        updated_at: new Date().toISOString() 
      })
      .eq('id', id)
      .select()
      .single();
    if (error) handleSupabaseError(error, 'updateStock');
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

  // --- Config (Rarities & Seasons) ---
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
    if (error) handleSupabaseError(error, 'saveRarities');
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
    if (error) handleSupabaseError(error, 'saveSeasons');
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

  checkSchema: async (): Promise<boolean> => {
    if (!isSupabaseEnabled || !supabase) return false;
    const { error } = await supabase.from('products').select('name').limit(1);
    return !error || error.code !== '42P01';
  }
};
