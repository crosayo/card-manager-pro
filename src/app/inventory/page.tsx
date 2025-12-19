
'use client';

import React, { useState, useEffect, Suspense } from 'react';
import { useSearchParams } from 'next/navigation';
import { InventoryList } from '@/views/InventoryList';
import { useAppContext } from '@/context/AppContext';
import { api } from '@/services/api';
import { Item, SortConfig } from '@/types';
import { Loader2 } from 'lucide-react';

function InventoryPageContent() {
  const { isAdmin, handleLoginToggle, news, isLoading, addToast, setIsLoading, products } = useAppContext();
  const searchParams = useSearchParams();
  
  // 状態管理
  const [items, setItems] = useState<Item[]>([]);
  const [totalCount, setTotalCount] = useState(0);
  const [searchKeyword, setSearchKeyword] = useState("");
  const [currentPage, setCurrentPage] = useState(1);
  const pageSize = 50;
  
  const [sortConfig, setSortConfig] = useState<SortConfig>({ key: 'id', direction: 'desc' });
  const [showZeroStock, setShowZeroStock] = useState(true);
  
  const categoryParam = searchParams.get('category');
  const selectedCategory = categoryParam ? decodeURIComponent(categoryParam) : null;

  // データ取得ロジック
  useEffect(() => {
    if (selectedCategory) {
       setCurrentPage(1);
    }
  }, [selectedCategory]);

  useEffect(() => {
    const loadData = async () => {
      setIsLoading(true);
      try {
        const result = await api.fetchItems(
          currentPage,
          pageSize,
          { 
            category: selectedCategory, 
            search: searchKeyword,
            showZeroStock 
          },
          sortConfig
        );
        setItems(result.data);
        setTotalCount(result.count);
      } catch (e: any) {
        addToast('error', 'データ取得エラー', '在庫データの読み込みに失敗しました。', {
          code: e.code || 'FETCH_ERROR',
          message: e.message,
          timestamp: new Date().toLocaleString()
        });
      } finally {
        setIsLoading(false);
      }
    };

    const timer = setTimeout(() => {
      loadData();
    }, 300);

    return () => clearTimeout(timer);
  }, [addToast, setIsLoading, currentPage, pageSize, selectedCategory, searchKeyword, sortConfig, showZeroStock]);

  const handleSort = (key: keyof Item | 'releaseDate') => {
    setSortConfig(current => ({
      key,
      direction: current.key === key && current.direction === 'asc' ? 'desc' : 'asc'
    }));
    setCurrentPage(1);
  };

  const setSortDirectly = (key: keyof Item | 'releaseDate', direction: 'asc' | 'desc') => {
    setSortConfig({ key, direction });
    setCurrentPage(1);
  };

  const updateStock = async (id: number, delta: number) => {
    const oldItems = [...items];
    setItems(prev => prev.map(item => {
      if (item.id === id) {
        return { ...item, stock: Math.max(0, item.stock + delta) };
      }
      return item;
    }));

    try {
      const updatedItem = await api.updateStock(id, delta);
      setItems(prev => prev.map(item => item.id === id ? updatedItem : item));
    } catch (e: any) {
      setItems(oldItems);
      addToast('error', '在庫の更新に失敗しました', e.message);
    }
  };

  const handleAddItem = async (newItem: Omit<Item, 'id' | 'updatedAt'>) => {
    setIsLoading(true);
    try {
      const addedItem = await api.addItem(newItem);
      setItems(prev => [addedItem, ...prev].slice(0, pageSize));
      setTotalCount(prev => prev + 1);
      addToast('success', '登録完了', `「${addedItem.name}」を追加しました。`);
    } catch (e: any) {
      addToast('error', '登録失敗', e.message);
    } finally {
      setIsLoading(false);
    }
  };

  const handleUpdateItem = async (id: number, updates: Partial<Item>) => {
    setIsLoading(true);
    try {
      const updatedItem = await api.updateItem(id, updates);
      setItems(prev => prev.map(item => item.id === id ? updatedItem : item));
      addToast('success', '更新完了', `「${updatedItem.name}」の情報を更新しました。`);
    } catch (e: any) {
      addToast('error', '更新失敗', e.message);
    } finally {
      setIsLoading(false);
    }
  };

  const handleDeleteItem = async (id: number) => {
    setIsLoading(true);
    try {
      await api.deleteItem(id);
      setItems(prev => prev.filter(item => item.id !== id));
      setTotalCount(prev => prev - 1);
      addToast('info', '削除完了', 'アイテムを削除しました。');
    } catch (e: any) {
      addToast('error', '削除失敗', e.message);
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <InventoryList
      isAdmin={isAdmin}
      handleLoginToggle={handleLoginToggle}
      news={news}
      searchKeyword={searchKeyword}
      setSearchKeyword={(val) => { setSearchKeyword(val); setCurrentPage(1); }}
      isLoading={isLoading}
      addToast={addToast}
      items={items}
      totalCount={totalCount}
      currentPage={currentPage}
      setCurrentPage={setCurrentPage}
      pageSize={pageSize}
      selectedCategory={selectedCategory}
      products={products}
      sortConfig={sortConfig}
      handleSort={handleSort}
      setSortDirectly={setSortDirectly}
      updateStock={updateStock}
      onAddItem={handleAddItem}
      onUpdateItem={handleUpdateItem}
      onDeleteItem={handleDeleteItem}
      showZeroStock={showZeroStock}
      setShowZeroStock={(val) => { setShowZeroStock(val); setCurrentPage(1); }}
    />
  );
}

export default function InventoryPage() {
  return (
    <Suspense fallback={
      <div className="flex items-center justify-center min-h-screen">
        <Loader2 className="animate-spin text-cyan-600" size={32} />
      </div>
    }>
      <InventoryPageContent />
    </Suspense>
  );
}
