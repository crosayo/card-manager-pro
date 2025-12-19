
'use client';

import React, { createContext, useContext, useState, useCallback, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { ToastType, AppError, News, Product, Season } from '@/types';
import { api } from '@/services/api';
import { INITIAL_RARITIES, INITIAL_SEASONS } from '@/constants';

interface AppContextType {
  isAdmin: boolean;
  user: any;
  isLoading: boolean;
  news: News[];
  toasts: ToastType[];
  products: Product[];
  rarities: string[];
  seasons: Season[]; 
  refreshProducts: () => Promise<void>;
  refreshRarities: () => Promise<void>;
  refreshSeasons: () => Promise<void>;
  refreshNews: () => Promise<void>; // Added
  addProduct: (product: Omit<Product, 'id'>) => Promise<void>;
  updateProduct: (id: string, updates: Partial<Product>) => Promise<void>;
  deleteProduct: (id: string) => Promise<void>;
  addNews: (news: Omit<News, 'id' | 'createdAt'>) => Promise<void>; // Added
  deleteNews: (id: number) => Promise<void>; // Added
  addToast: (type: ToastType['type'], title: string, message?: string, errorDetail?: AppError) => void;
  removeToast: (id: number) => void;
  handleLoginToggle: () => Promise<void>;
  setIsLoading: (loading: boolean) => void;
}

const AppContext = createContext<AppContextType | undefined>(undefined);

export const AppProvider = ({ children }: { children: React.ReactNode }) => {
  const router = useRouter();
  const [isAdmin, setIsAdmin] = useState(false);
  const [user, setUser] = useState<any>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [news, setNews] = useState<News[]>([]); // Initialize empty
  const [toasts, setToasts] = useState<ToastType[]>([]);
  const [products, setProducts] = useState<Product[]>([]);
  const [rarities, setRarities] = useState<string[]>(INITIAL_RARITIES);
  const [seasons, setSeasons] = useState<Season[]>(INITIAL_SEASONS);

  const addToast = useCallback((type: ToastType['type'], title: string, message?: string, errorDetail?: AppError) => {
    const id = Date.now();
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

  useEffect(() => {
    const { data: authListener } = api.onAuthStateChange((session) => {
      setUser(session?.user ?? null);
      setIsAdmin(!!session?.user);
    });
    refreshProducts();
    refreshRarities();
    refreshSeasons();
    refreshNews(); // Added
    return () => {
      authListener?.subscription.unsubscribe();
    };
  }, [refreshProducts, refreshRarities, refreshSeasons, refreshNews]);

  return (
    <AppContext.Provider value={{
      isAdmin,
      user,
      isLoading,
      news,
      toasts,
      products,
      rarities,
      seasons,
      refreshProducts,
      refreshRarities,
      refreshSeasons,
      refreshNews, // Added
      addProduct,
      updateProduct,
      deleteProduct,
      addNews, // Added
      deleteNews, // Added
      addToast,
      removeToast,
      handleLoginToggle,
      setIsLoading
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
