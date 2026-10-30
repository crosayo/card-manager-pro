
import { supabase, isSupabaseEnabled } from '../lib/supabase';
import { Item, Product, PaginatedItems, SortConfig, Season, News, SystemInfo, StockLog, CardRequest, RequestItem, RequestEditLog, Supply, Invite, InviteAccessLog } from '../types';
import { INITIAL_RARITIES, INITIAL_SEASONS, INITIAL_SYSTEM_INFO } from '../constants';
import { normalizeForStorage, toSearchKey, toSearchTokens } from '../utils';

type ItemFilters = { category?: string | null, search?: string, showZeroStock?: boolean, rarities?: string[], rarityOrder?: string[] };

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

const mapDbInviteToAppInvite = (db: any): Invite => ({
  id: db.id,
  code: db.code,
  label: db.label,
  expiresAt: db.expires_at,
  revokedAt: db.revoked_at,
  createdAt: db.created_at,
  lastUsedAt: db.last_used_at,
  useCount: db.use_count ?? 0,
  autoExtendDays: db.auto_extend_days ?? null,
});

const mapDbInviteAccessLog = (db: any): InviteAccessLog => ({
  id: db.id,
  inviteId: db.invite_id,
  accessedAt: db.accessed_at,
  ip: db.ip,
  userAgent: db.user_agent,
});

// requests テーブルの取得列（token は管理者のみ取得する。anon には列単位で閲覧権限がない）
const REQUEST_PUBLIC_COLUMNS = 'id, requester_name, message, status, price_total, admin_memo, created_at, resolved_at';
const requestSelect = (includeToken?: boolean) =>
  `${REQUEST_PUBLIC_COLUMNS}${includeToken ? ', token' : ''}, request_items(*, items(*), supplies(*))`;

const mapDbNewsToAppNews =(dbNews: any): News => ({
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

// RPC関数が未登録かどうか（42883: PostgreSQL側 / PGRST202: PostgRESTのスキーマキャッシュ上に無い）
const isMissingFunction = (error: any) => error?.code === '42883' || error?.code === 'PGRST202';

// 複数件の更新結果から失敗分をまとめて1つのエラーにする
const throwIfAnyFailed = (results: { error: any }[], action: string) => {
  const failed = results.filter(r => r.error);
  if (failed.length === 0) return;
  console.error(`Supabase Error [${action}]:`, failed.map(r => r.error));
  const err: any = new Error(`${action}: ${results.length}件中${failed.length}件の更新に失敗しました。(${failed[0].error.message})`);
  err.code = failed[0].error.code || 'PARTIAL_FAILURE';
  throw err;
};

let warnedMissingSearchRpc = false;

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

  // --- 招待リンク ---
  // 招待コードを検証し、最終利用日時を記録する（未ログインでも呼べる）
  redeemInvite: async (code: string): Promise<{ valid: boolean; expiresAt?: string; label?: string | null }> => {
    ensureConnection();
    const { data, error } = await supabase.rpc('redeem_invite', { p_code: code });
    if (error) {
      // SQL未適用の環境では招待制が無効なため、従来どおり公開として扱う
      if (isMissingFunction(error)) return { valid: true, expiresAt: undefined, label: null };
      handleSupabaseError(error, 'redeemInvite');
    }
    return { valid: !!data?.valid, expiresAt: data?.expires_at, label: data?.label ?? null };
  },

  fetchInvites: async (): Promise<Invite[]> => {
    ensureConnection();
    const { data, error } = await supabase.from('invites').select('*').order('created_at', { ascending: false });
    if (error) {
      if (error.code === '42P01') return [];
      handleSupabaseError(error, 'fetchInvites');
    }
    return (data || []).map(mapDbInviteToAppInvite);
  },

  // autoExtend=true なら、アクセスされるたびに「今から days 日後」まで有効期限を延ばす
  createInvite: async (params: { label?: string; days: number; autoExtend?: boolean }): Promise<Invite> => {
    ensureConnection();
    const expiresAt = new Date(Date.now() + params.days * 24 * 60 * 60 * 1000).toISOString();
    const { data, error } = await supabase
      .from('invites')
      .insert([{
        label: params.label?.trim() || null,
        expires_at: expiresAt,
        auto_extend_days: params.autoExtend ? params.days : null,
      }])
      .select()
      .single();
    if (error) handleSupabaseError(error, 'createInvite');
    return mapDbInviteToAppInvite(data);
  },

  // 有効期限を延長する（期限切れのものは今から数えて延長）。取消済みは延長できない
  extendInvite: async (invite: Invite, days: number): Promise<Invite> => {
    ensureConnection();
    const base = Math.max(Date.now(), new Date(invite.expiresAt).getTime());
    const expiresAt = new Date(base + days * 24 * 60 * 60 * 1000).toISOString();
    const { data, error } = await supabase
      .from('invites')
      .update({ expires_at: expiresAt })
      .eq('id', invite.id)
      .is('revoked_at', null)
      .select()
      .single();
    if (error) handleSupabaseError(error, 'extendInvite');
    return mapDbInviteToAppInvite(data);
  },

  // 選択した複数の招待リンクをまとめて延長する（取消済みは対象外）
  extendInvites: async (invites: Invite[], days: number): Promise<Invite[]> => {
    ensureConnection();
    const results = await Promise.allSettled(
      invites.filter(i => !i.revokedAt).map(i => api.extendInvite(i, days))
    );
    const failed = results.filter(r => r.status === 'rejected');
    if (failed.length > 0) {
      throw new Error(`${results.length}件中${failed.length}件の延長に失敗しました。(${(failed[0] as PromiseRejectedResult).reason?.message ?? ''})`);
    }
    return results.map(r => (r as PromiseFulfilledResult<Invite>).value);
  },

  // 自動延長の設定（days=null で解除）
  setInviteAutoExtend: async (id: number, days: number | null): Promise<Invite> => {
    ensureConnection();
    const { data, error } = await supabase
      .from('invites')
      .update({ auto_extend_days: days })
      .eq('id', id)
      .select()
      .single();
    if (error) handleSupabaseError(error, 'setInviteAutoExtend');
    return mapDbInviteToAppInvite(data);
  },

  // 選択した複数の招待リンクをまとめて取り消す
  revokeInvites: async (ids: number[]): Promise<Invite[]> => {
    ensureConnection();
    const { data, error } = await supabase
      .from('invites')
      .update({ revoked_at: new Date().toISOString() })
      .in('id', ids)
      .is('revoked_at', null)
      .select();
    if (error) handleSupabaseError(error, 'revokeInvites');
    return (data || []).map(mapDbInviteToAppInvite);
  },

  fetchInviteAccessLogs: async (inviteId: number, limit: number = 100): Promise<InviteAccessLog[]> => {
    ensureConnection();
    const { data, error } = await supabase
      .from('invite_access_logs')
      .select('*')
      .eq('invite_id', inviteId)
      .order('accessed_at', { ascending: false })
      .limit(limit);
    if (error) {
      if (error.code === '42P01') return [];
      handleSupabaseError(error, 'fetchInviteAccessLogs');
    }
    return (data || []).map(mapDbInviteAccessLog);
  },

  revokeInvite: async (id: number): Promise<Invite> => {
    ensureConnection();
    const { data, error } = await supabase
      .from('invites')
      .update({ revoked_at: new Date().toISOString() })
      .eq('id', id)
      .select()
      .single();
    if (error) handleSupabaseError(error, 'revokeInvite');
    return mapDbInviteToAppInvite(data);
  },

  deleteInvite: async (id: number): Promise<void> => {
    ensureConnection();
    const { error } = await supabase.from('invites').delete().eq('id', id);
    if (error) handleSupabaseError(error, 'deleteInvite');
  },

  // ログイン中の管理者のアクセストークン（サーバー側APIの認証に使う）。未ログインなら null
  getAccessToken: async (): Promise<string | null> => {
    if (!isSupabaseEnabled || !supabase) return null;
    const { data } = await supabase.auth.getSession();
    return data.session?.access_token ?? null;
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
  // 検索・絞り込み・ソート・ページネーションはすべてDB関数 search_items で行う。
  // 検索ワードは空白区切りのAND検索で、表記ゆれ（全角/半角・ひらがな/カタカナ・
  // 記号や空白の有無・大文字/小文字）はDB側の search_key 列で吸収する。
  fetchItems: async (
    page: number = 1,
    pageSize: number = 50,
    filters?: ItemFilters,
    sort?: SortConfig
  ): Promise<PaginatedItems> => {
    ensureConnection();

    const { data: rpcResult, error } = await supabase.rpc('search_items', {
      p_search:          filters?.search?.trim() || null,
      p_category:        filters?.category ?? null,
      p_rarities:        (filters?.rarities && filters.rarities.length > 0) ? filters.rarities : null,
      p_show_zero_stock: filters?.showZeroStock !== false,
      p_sort_key:        sort?.key ?? null,
      p_direction:       sort?.direction ?? 'desc',
      p_page:            page,
      p_page_size:       pageSize,
      p_rarity_order:    (filters?.rarityOrder && filters.rarityOrder.length > 0) ? filters.rarityOrder : null,
    });

    if (error) {
      // SQL未適用の環境では全件取得してクライアント側で処理する（低速）
      if (isMissingFunction(error) || error.code === '42703') {
        if (!warnedMissingSearchRpc) {
          console.warn("RPC 'search_items' が未登録です。設定画面のSQLを実行してください。クライアント側検索で代替します。");
          warnedMissingSearchRpc = true;
        }
        return api._fallbackSearch(page, pageSize, filters, sort);
      }
      if (error.code === '42P01') return { data: [], count: 0 };
      handleSupabaseError(error, 'fetchItems(RPC:search_items)');
    }

    return {
      data:  ((rpcResult as any)?.data  || []).map(mapDbItemToAppItem),
      count: (rpcResult  as any)?.count || 0,
    };
  },

  // 内部用: 全件取得ヘルパー
  fetchAllItemsInternal: async (): Promise<Item[]> => {
    ensureConnection();
    let allItems: any[] = [];
    const PAGE_SIZE = 1000;
    let page = 0;
    let hasMore = true;

    while (hasMore) {
      const { data, error } = await supabase
        .from('items')
        .select('*')
        .order('id', { ascending: true })
        .range(page * PAGE_SIZE, (page + 1) * PAGE_SIZE - 1);

      if (error) handleSupabaseError(error, 'fetchAllItemsInternal');

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
        name: normalizeForStorage(newItem.name),
        card_id: normalizeForStorage(newItem.cardId), // 型番も正規化（半角統一）
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
      if (isMissingFunction(error)) {
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
    if (updates.name !== undefined) dbUpdates.name = normalizeForStorage(updates.name);
    if (updates.cardId !== undefined) dbUpdates.card_id = normalizeForStorage(updates.cardId);
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
      name: normalizeForStorage(item.name),
      card_id: normalizeForStorage(item.card_id || item.cardId),
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

  // CSV等からの在庫一括上書き。更新前の在庫を取得して増減数を算出し、
  // 在庫が変わらない行は更新しない。結果を種類別に返す（呼び出し側でログ記録・表示に使う）
  bulkUpdateStock: async (updates: { id: number, stock: number }[]): Promise<{
    updated: { id: number, stock: number, delta: number }[];
    unchanged: number;
    notFound: number[];
    failed: { id: number, message: string }[];
  }> => {
    ensureConnection();
    const FETCH_BATCH_SIZE = 200;
    const BATCH_SIZE = 50;
    const timestamp = new Date().toISOString();

    // 1. 更新前の在庫を取得
    const currentStock = new Map<number, number>();
    const ids = Array.from(new Set(updates.map(u => u.id)));
    for (let i = 0; i < ids.length; i += FETCH_BATCH_SIZE) {
      const chunk = ids.slice(i, i + FETCH_BATCH_SIZE);
      const { data, error } = await supabase.from('items').select('id, stock').in('id', chunk);
      if (error) handleSupabaseError(error, 'bulkUpdateStock(fetch)');
      for (const row of (data || [])) currentStock.set(row.id, row.stock);
    }

    const result = {
      updated: [] as { id: number, stock: number, delta: number }[],
      unchanged: 0,
      notFound: [] as number[],
      failed: [] as { id: number, message: string }[],
    };

    const targets: { id: number, stock: number, delta: number }[] = [];
    for (const u of updates) {
      const before = currentStock.get(u.id);
      if (before === undefined) { result.notFound.push(u.id); continue; }
      if (before === u.stock) { result.unchanged++; continue; }
      targets.push({ id: u.id, stock: u.stock, delta: u.stock - before });
    }

    // 2. 変更がある行だけ更新（.select() で実際に更新されたかを確認する）
    for (let i = 0; i < targets.length; i += BATCH_SIZE) {
      const chunk = targets.slice(i, i + BATCH_SIZE);
      const responses = await Promise.all(chunk.map(t =>
        supabase
          .from('items')
          .update({ stock: t.stock, updated_at: timestamp })
          .eq('id', t.id)
          .select('id')
      ));
      responses.forEach(({ data, error }: any, idx: number) => {
        const t = chunk[idx];
        if (error) {
          result.failed.push({ id: t.id, message: error.message });
        } else if (!data || data.length === 0) {
          result.failed.push({ id: t.id, message: '権限がないか、対象が存在しません' });
        } else {
          result.updated.push(t);
        }
      });
    }

    if (result.failed.length > 0) {
      console.error('bulkUpdateStock: 更新に失敗した行', result.failed);
    }
    return result;
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
      const normalizedName = normalizeForStorage(item.name);
      const normalizedCardId = normalizeForStorage(item.cardId);

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
    let failedCount = 0;
    let firstError: any = null;
    for (let i = 0; i < updates.length; i += BATCH_SIZE) {
      const chunk = updates.slice(i, i + BATCH_SIZE);
      const responses = await Promise.all(chunk.map(u =>
        supabase.from('items').update(u).eq('id', u.id)
      ));
      for (const { error } of responses) {
        if (error) {
          failedCount++;
          firstError = firstError ?? error;
        } else {
          updateCount++;
        }
      }
      if (onProgress) onProgress(updateCount);
    }

    if (failedCount > 0) {
      console.error('normalizeAllItems: 更新失敗', firstError);
      throw new Error(`${updateCount}件を正規化しましたが、${failedCount}件の更新に失敗しました。(${firstError.message})`);
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
  // 編集用トークンは未ログインユーザーには返さない（DB側でも列単位で閲覧を禁止している）
  fetchRequests: async (
    status?: 'pending' | 'completed' | 'cancelled',
    options?: { includeToken?: boolean }
  ): Promise<CardRequest[]> => {
    ensureConnection();
    let query = supabase
      .from('requests')
      .select(requestSelect(options?.includeToken))
      .order('created_at', { ascending: false });
    if (status) query = query.eq('status', status);
    const { data, error } = await query;
    if (error) {
      if (error.code === '42P01') return [];
      handleSupabaseError(error, 'fetchRequests');
    }
    return (data || []).map(mapDbRequestToAppRequest);
  },

  fetchRequestById: async (id: number, options?: { includeToken?: boolean }): Promise<CardRequest> => {
    ensureConnection();
    const { data, error } = await supabase
      .from('requests')
      .select(requestSelect(options?.includeToken))
      .eq('id', id)
      .single();
    if (error) handleSupabaseError(error, 'fetchRequestById');
    return mapDbRequestToAppRequest(data);
  },

  // リクエスト送信。本体と明細をDB関数で一括登録し、編集用トークンを受け取る
  createRequest: async (params: {
    requesterName: string;
    message?: string;
    items: Array<{ itemId?: number; supplyId?: number; quantity: number }>;
  }): Promise<CardRequest> => {
    ensureConnection();
    const { data: created, error } = await supabase.rpc('create_request', {
      p_requester_name: params.requesterName,
      p_message: params.message ?? null,
      p_items: params.items.map(item => ({
        item_id: item.itemId ?? null,
        supply_id: item.supplyId ?? null,
        quantity: item.quantity,
      })),
    });
    if (!error) {
      const request = await api.fetchRequestById(created.id);
      return { ...request, token: created.token };
    }
    if (!isMissingFunction(error)) handleSupabaseError(error, 'createRequest(RPC)');

    // RPC未登録時のフォールバック（旧実装）
    console.warn("RPC 'create_request' not found. Falling back to direct insert.");
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

    const request = await api.fetchRequestById(req.id);
    return { ...request, token: req.token };
  },

  // 編集用リンクのトークンから対象リクエストのIDを取得（無効なら null）
  resolveRequestToken: async (token: string): Promise<number | null> => {
    ensureConnection();
    const { data, error } = await supabase.rpc('resolve_request_token', { p_token: token });
    if (error) handleSupabaseError(error, 'resolveRequestToken');
    return data ?? null;
  },

  // 申請者による編集（編集用トークンで本人確認。照合・更新・履歴記録はDB関数内で行う）
  editRequestByToken: async (
    token: string,
    params: {
      message?: string;
      itemChanges?: Array<{ requestItemId: number; quantity: number }>;
      itemsToRemove?: number[]; // 削除する request_items の id
    }
  ): Promise<CardRequest> => {
    ensureConnection();
    const { data: requestId, error } = await supabase.rpc('edit_request_by_token', {
      p_token: token,
      p_message: params.message ?? null,
      p_item_changes: params.itemChanges
        ? params.itemChanges.map(c => ({ request_item_id: c.requestItemId, quantity: c.quantity }))
        : null,
      p_remove_item_ids: params.itemsToRemove && params.itemsToRemove.length > 0 ? params.itemsToRemove : null,
    });
    if (error) handleSupabaseError(error, 'editRequestByToken');
    return api.fetchRequestById(requestId);
  },

  // 申請者によるバリアント変更（同名カードへの差し替えのみ許可）
  swapRequestItemByToken: async (token: string, requestItemId: number, newItemId: number): Promise<CardRequest> => {
    ensureConnection();
    const { data: requestId, error } = await supabase.rpc('swap_request_item_by_token', {
      p_token: token,
      p_request_item_id: requestItemId,
      p_new_item_id: newItemId,
    });
    if (error) handleSupabaseError(error, 'swapRequestItemByToken');
    return api.fetchRequestById(requestId);
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
      const results = await Promise.all(
        Object.entries(params.unitPrices).map(([riId, price]) =>
          supabase.from('request_items').update({ unit_price: price }).eq('id', Number(riId))
        )
      );
      throwIfAnyFailed(results, 'updateRequestStatus(unitPrices)');
    }

    return api.fetchRequestById(requestId, { includeToken: true });
  },

  // 管理者による編集（ログイン済みのためDBのRLS/権限で保護される）
  editRequestAsAdmin: async (
    requestId: number,
    params: {
      message?: string;
      itemChanges?: Array<{ requestItemId: number; quantity: number }>;
      itemsToAdd?: Array<{ itemId?: number; supplyId?: number; quantity: number }>;
      itemsToRemove?: number[]; // 削除する request_items の id
    }
  ): Promise<CardRequest> => {
    ensureConnection();
    if (params.itemsToRemove && params.itemsToRemove.length > 0) {
      const { data: deleted, error } = await supabase
        .from('request_items')
        .delete()
        .eq('request_id', requestId)
        .in('id', params.itemsToRemove)
        .select('id');
      if (error) handleSupabaseError(error, 'editRequest(removeItems)');
      if (!deleted || deleted.length !== params.itemsToRemove.length) {
        throw new Error(`カードの削除に失敗しました（${params.itemsToRemove.length}件中${deleted?.length ?? 0}件のみ削除）。権限を確認してください。`);
      }
    }
    if (params.message !== undefined) {
      const { error } = await supabase.from('requests').update({ message: params.message }).eq('id', requestId);
      if (error) handleSupabaseError(error, 'editRequest(message)');
    }
    if (params.itemChanges) {
      const results = await Promise.all(params.itemChanges.map(c =>
        supabase.from('request_items').update({ quantity: c.quantity }).eq('id', c.requestItemId)
      ));
      throwIfAnyFailed(results, 'editRequest(itemChanges)');
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

    return api.fetchRequestById(requestId, { includeToken: true });
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
    // リクエスト本体を削除（.select()で実際に削除されたか確認）
    const { data: deleted, error } = await supabase.from('requests').delete().eq('id', requestId).select();
    if (error) handleSupabaseError(error, 'deleteRequest');
    if (!deleted || deleted.length === 0) {
      throw new Error('削除に失敗しました。権限がないか、対象レコードが既に存在しません。');
    }
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
    const { error: updateError } = await supabase.from('supplies').update({ image_url: urlData.publicUrl }).eq('id', supplyId);
    if (updateError) handleSupabaseError(updateError, 'uploadSupplyImage(update)');
    return urlData.publicUrl;
  },

  updateSupplyStock: async (id: number, delta: number): Promise<Supply> => {
    ensureConnection();

    // 連打・同時操作でもずれないよう、DB側で「現在値 + delta」をアトミックに計算する
    const { data: rpcData, error: rpcError } = await supabase.rpc('increment_supply_stock', {
      p_supply_id: id,
      p_delta: delta,
    });
    if (!rpcError) return mapDbSupplyToAppSupply(rpcData);
    if (!isMissingFunction(rpcError)) handleSupabaseError(rpcError, 'updateSupplyStock(RPC)');

    // RPC未登録時のフォールバック（同時操作時の安全性は劣る）
    console.warn("RPC 'increment_supply_stock' not found. Falling back to simple update.");
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

  // フォールバック: RPC search_items 未登録時のクライアント側検索・ソート
  // （DB関数と同じ検索規則。全件取得するため件数が多いと遅い）
  _fallbackSearch: async (
    page: number,
    pageSize: number,
    filters?: ItemFilters,
    sort?: SortConfig
  ): Promise<PaginatedItems> => {
    const products = await api.fetchProducts();
    const productMap = new Map(products.map(p => [p.name, p.releaseDate]));
    const rarityOrder = filters?.rarityOrder ?? await api.fetchRarities();
    const rarityRank = (r: string) => { const i = rarityOrder.indexOf(r); return i === -1 ? 999 : i; };
    const allItems = await api.fetchAllItemsInternal();

    let filtered = allItems;
    if (filters?.category) {
      filtered = filtered.filter(i => i.category === filters.category);
    }
    const tokens = toSearchTokens(filters?.search ?? '');
    if (tokens.length > 0) {
      filtered = filtered.filter(i => {
        const key = `${toSearchKey(i.name)}|${toSearchKey(i.cardId)}|${toSearchKey(i.category)}`;
        return tokens.every(t => key.includes(t));
      });
    }
    if (filters?.rarities && filters.rarities.length > 0) {
      filtered = filtered.filter(i => filters.rarities!.includes(i.rarity));
    }
    if (filters?.showZeroStock === false) {
      filtered = filtered.filter(i => i.stock > 0);
    }

    const sign = sort?.direction === 'asc' ? 1 : -1;
    const cmp = (a: string | number, b: string | number) => (a < b ? -1 : a > b ? 1 : 0);
    const primary = (a: Item, b: Item): number => {
      switch (sort?.key) {
        case 'releaseDate':
          return cmp(productMap.get(a.category) || '1999-01-01', productMap.get(b.category) || '1999-01-01');
        case 'cardId':    return cmp(a.cardId ?? '', b.cardId ?? '');
        case 'name':      return cmp(a.name ?? '', b.name ?? '');
        case 'rarity':    return cmp(rarityRank(a.rarity), rarityRank(b.rarity)) || cmp(a.rarity ?? '', b.rarity ?? '');
        case 'category':  return cmp(a.category ?? '', b.category ?? '');
        case 'stock':     return cmp(a.stock, b.stock);
        case 'updatedAt': return cmp(a.updatedAt, b.updatedAt);
        default:          return cmp(a.id, b.id); // ソート指定なし: 新しい順（sign=-1）
      }
    };
    filtered = [...filtered].sort((a, b) =>
      sign * primary(a, b) ||
      cmp(a.cardId ?? '', b.cardId ?? '') ||
      cmp(rarityRank(a.rarity), rarityRank(b.rarity)) ||
      cmp(a.id, b.id)
    );

    const from = (page - 1) * pageSize;
    return { data: filtered.slice(from, from + pageSize), count: filtered.length };
  },

  // カード名で全バリアントを取得（別レアリティ/型番選択用）
  fetchItemsByName: async (name: string): Promise<Item[]> => {
    ensureConnection();
    const { data, error } = await supabase
      .from('items')
      .select('*')
      .eq('name', name)
      .order('card_id', { ascending: true });
    if (error) {
      if (error.code === '42P01') return [];
      handleSupabaseError(error, 'fetchItemsByName');
    }
    return (data || []).map(mapDbItemToAppItem);
  },

  // リクエストアイテムのカードを別バリアントに差し替え（名前確認不要）
  swapRequestItem: async (requestItemId: number, newItemId: number): Promise<void> => {
    ensureConnection();
    const { error } = await supabase
      .from('request_items')
      .update({ item_id: newItemId })
      .eq('id', requestItemId);
    if (error) handleSupabaseError(error, 'swapRequestItem');
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
