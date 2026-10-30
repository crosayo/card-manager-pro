
'use client';

import React, { createContext, useContext, useState, useCallback, useEffect, useRef } from 'react';
import { useRouter } from 'next/navigation';
import { ToastType, AppError, News, Product, Season, SystemInfo, InviteStatus } from '@/types';
import { api } from '@/services/api';
import { getInviteCode } from '@/lib/invite';
import { INITIAL_RARITIES, INITIAL_SEASONS, INITIAL_SYSTEM_INFO } from '@/constants';

interface AppContextType {
  isAdmin: boolean;
  isAuthReady: boolean;          // ログイン状態の確認が終わったか
  inviteStatus: InviteStatus;    // 未ログイン時の招待リンクの状態
  refreshInviteStatus: () => Promise<void>;
  user: any;
  isLoading: boolean;
  news: News[];
  toasts: ToastType[];
  products: Product[];
  rarities: string[];
  seasons: Season[];
  systemInfo: SystemInfo;
  selectedRarities: string[];
  setSelectedRarities: (rarities: string[]) => void;
  showOnlyInStock: boolean;
  setShowOnlyInStock: (val: boolean) => void;
  refreshProducts: () => Promise<void>;
  refreshRarities: () => Promise<void>;
  refreshSeasons: () => Promise<void>;
  refreshNews: () => Promise<void>;
  refreshSystemInfo: () => Promise<void>;
  addProduct: (product: Omit<Product, 'id'>) => Promise<void>;
  updateProduct: (id: string, updates: Partial<Product>) => Promise<void>;
  deleteProduct: (id: string) => Promise<void>;
  addNews: (news: Omit<News, 'id' | 'createdAt'>) => Promise<void>;
  deleteNews: (id: number) => Promise<void>;
  addToast: (type: ToastType['type'], title: string, message?: string, errorDetail?: AppError) => void;
  removeToast: (id: number) => void;
  handleLoginToggle: () => Promise<void>;
  setIsLoading: (loading: boolean) => void;
  setRarities: (rarities: string[]) => void;
  setSeasons: (seasons: Season[]) => void;
  saveSystemInfo: (info: SystemInfo) => Promise<void>;
}

const AppContext = createContext<AppContextType | undefined>(undefined);

export const AppProvider = ({ children }: { children: React.ReactNode }) => {
  const router = useRouter();
  const [isAdmin, setIsAdmin] = useState(false);
  const [isAuthReady, setIsAuthReady] = useState(false);
  const [inviteStatus, setInviteStatus] = useState<InviteStatus>({ state: 'checking' });
  const [user, setUser] = useState<any>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [news, setNews] = useState<News[]>([]);
  const [toasts, setToasts] = useState<ToastType[]>([]);
  const [products, setProducts] = useState<Product[]>([]);
  const [rarities, setRarities] = useState<string[]>(INITIAL_RARITIES);
  const [seasons, setSeasons] = useState<Season[]>(INITIAL_SEASONS);
  const [systemInfo, setSystemInfo] = useState<SystemInfo>(INITIAL_SYSTEM_INFO);
  const [selectedRarities, setSelectedRarities] = useState<string[]>([]);
  const [showOnlyInStock, setShowOnlyInStock] = useState(false);

  // トーストID: Date.now() だと同一ミリ秒に複数出したとき重複するため連番を付与する
  const toastSeqRef = useRef(0);

  const addToast = useCallback((type: ToastType['type'], title: string, message?: string, errorDetail?: AppError) => {
    const id = Date.now() * 1000 + (toastSeqRef.current++ % 1000);
    setToasts(prev => [...prev, { id, type, title, message, errorDetail }]);
  }, []);

  const removeToast = useCallback((id: number) => {
    setToasts(prev => prev.filter(t => t.id !== id));
  }, []);

  const refreshProducts = useCallback(async () => {
    try {
      const fetchedProducts = await api.fetchProducts();
      setProducts(fetchedProducts);
    } catch (e) {
      console.error("Failed to fetch products", e);
    }
  }, []);

  const refreshRarities = useCallback(async () => {
    try {
      const fetched = await api.fetchRarities();
      setRarities(fetched);
    } catch (e) {
      console.error("Failed to fetch rarities", e);
    }
  }, []);

  const refreshSeasons = useCallback(async () => {
    try {
      const fetched = await api.fetchSeasons();
      const sorted = [...fetched].sort((a, b) => 
        new Date(b.startDate).getTime() - new Date(a.startDate).getTime()
      );
      setSeasons(sorted);
    } catch (e) {
      console.error("Failed to fetch seasons", e);
    }
  }, []);

  const refreshNews = useCallback(async () => {
    try {
      const fetched = await api.fetchNews();
      setNews(fetched);
    } catch (e) {
      console.error("Failed to fetch news", e);
    }
  }, []);

  const refreshSystemInfo = useCallback(async () => {
    try {
      const info = await api.fetchSystemInfo();
      setSystemInfo(info);
    } catch (e) {
      console.error("Failed to fetch system info", e);
    }
  }, []);

  const addProduct = async (productData: Omit<Product, 'id'>) => {
    try {
      await api.addProduct(productData);
      await refreshProducts();
      addToast('success', '製品追加', `「${productData.name}」を追加しました`);
    } catch (e: any) {
      addToast('error', '追加失敗', e.message);
      throw e;
    }
  };

  const updateProduct = async (id: string, updates: Partial<Product>) => {
    try {
      await api.updateProduct(id, updates);
      await refreshProducts();
      addToast('success', '製品更新', '製品情報を更新しました');
    } catch (e: any) {
      addToast('error', '更新失敗', e.message);
      throw e;
    }
  };

  const deleteProduct = async (id: string) => {
    try {
      await api.deleteProduct(id);
      await refreshProducts();
      addToast('info', '製品削除', '製品を削除しました');
    } catch (e: any) {
      addToast('error', '削除失敗', e.message);
      throw e;
    }
  };

  const addNews = async (newsData: Omit<News, 'id' | 'createdAt'>) => {
    try {
      await api.addNews(newsData);
      await refreshNews();
      addToast('success', 'お知らせ追加', '新しいお知らせを登録しました');
    } catch (e: any) {
      addToast('error', '追加失敗', e.message);
      throw e;
    }
  };

  const deleteNews = async (id: number) => {
    try {
      await api.deleteNews(id);
      await refreshNews();
      addToast('info', '削除完了', 'お知らせを削除しました');
    } catch (e: any) {
      addToast('error', '削除失敗', e.message);
      throw e;
    }
  };

  const saveSystemInfoState = async (info: SystemInfo) => {
    try {
      setSystemInfo(info);
      await api.saveSystemInfo(info);
      addToast('success', '設定保存', 'システム情報を更新しました');
    } catch (e: any) {
      addToast('error', '保存失敗', e.message);
      throw e;
    }
  };

  const handleLoginToggle = async () => {
    setIsLoading(true);
    try {
      if (isAdmin) {
        await api.signOut();
        setIsAdmin(false);
        setUser(null);
        addToast('info', 'ログアウトしました');
        router.push('/');
      } else {
        router.push('/login');
      }
    } catch (e: any) {
      addToast('error', 'エラー', e.message);
    } finally {
      setIsLoading(false);
    }
  };

  // 招待リンクの状態を確認する。招待コードが無くても呼び、DB関数が未登録なら
  // 「招待制は未導入（従来どおり公開）」として扱う（SQL適用前のデプロイで閲覧者を締め出さないため）
  const refreshInviteStatus = useCallback(async () => {
    const code = getInviteCode();
    setInviteStatus({ state: 'checking' });
    try {
      const result = await api.redeemInvite(code ?? '');
      if (result.valid) {
        setInviteStatus({ state: 'valid', expiresAt: result.expiresAt ?? '', label: result.label ?? null });
      } else {
        setInviteStatus(code ? { state: 'invalid' } : { state: 'none' });
      }
    } catch (e) {
      console.error('招待リンクの確認に失敗しました', e);
      setInviteStatus(code ? { state: 'invalid' } : { state: 'none' });
    }
  }, []);

  useEffect(() => {
    const { data: authListener } = api.onAuthStateChange((session) => {
      setUser(session?.user ?? null);
      setIsAdmin(!!session?.user);
      setIsAuthReady(true);
    });
    refreshInviteStatus();
    refreshProducts();
    refreshRarities();
    refreshSeasons();
    refreshNews();
    refreshSystemInfo();
    return () => {
      authListener?.subscription.unsubscribe();
    };
  }, [refreshInviteStatus, refreshProducts, refreshRarities, refreshSeasons, refreshNews, refreshSystemInfo]);

  // 招待制では、未ログイン時は招待コードなしだとデータが返らないため、
  // ログインしたら共通データを読み直す
  useEffect(() => {
    if (!isAdmin) return;
    refreshProducts();
    refreshRarities();
    refreshSeasons();
    refreshNews();
    refreshSystemInfo();
  }, [isAdmin, refreshProducts, refreshRarities, refreshSeasons, refreshNews, refreshSystemInfo]);

  // 閲覧中に招待リンクの期限が来たら、その時点で閲覧できない状態にする
  useEffect(() => {
    if (inviteStatus.state !== 'valid' || !inviteStatus.expiresAt) return;
    const remaining = new Date(inviteStatus.expiresAt).getTime() - Date.now();
    if (remaining > 2 ** 31 - 1) return; // setTimeout の上限（約24.8日）を超える場合は次回の読み込み時に判定
    const timer = setTimeout(() => setInviteStatus({ state: 'invalid' }), Math.max(0, remaining));
    return () => clearTimeout(timer);
  }, [inviteStatus]);

  return (
    <AppContext.Provider value={{
      isAdmin,
      isAuthReady,
      inviteStatus,
      refreshInviteStatus,
      user,
      isLoading,
      news,
      toasts,
      products,
      rarities,
      seasons,
      systemInfo,
      selectedRarities,
      setSelectedRarities,
      showOnlyInStock,
      setShowOnlyInStock,
      refreshProducts,
      refreshRarities,
      refreshSeasons,
      refreshNews,
      refreshSystemInfo,
      addProduct,
      updateProduct,
      deleteProduct,
      addNews,
      deleteNews,
      addToast,
      removeToast,
      handleLoginToggle,
      setIsLoading,
      setRarities,
      setSeasons,
      saveSystemInfo: saveSystemInfoState
    }}>
      {children}
    </AppContext.Provider>
  );
};

export const useAppContext = () => {
  const context = useContext(AppContext);
  if (context === undefined) {
    throw new Error('useAppContext must be used within an AppProvider');
  }
  return context;
};
