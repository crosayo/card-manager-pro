
'use client';

import React, { useState, useEffect, useRef, Suspense } from 'react';
import { useSearchParams } from 'next/navigation';
import { InventoryList } from '@/views/InventoryList';
import { useAppContext } from '@/context/AppContext';
import { api } from '@/services/api';
import { Item, SortConfig } from '@/types';
import { Loader2 } from 'lucide-react';

function InventoryPageContent() {
  const { isAdmin, handleLoginToggle, news, isLoading, addToast, setIsLoading, products, rarities, selectedRarities, setSelectedRarities, showOnlyInStock, setShowOnlyInStock } = useAppContext();
  const searchParams = useSearchParams();
  
  // 状態管理
  const [items, setItems] = useState<Item[]>([]);
  const [totalCount, setTotalCount] = useState(0);
  const [pendingQuantities, setPendingQuantities] = useState<Record<number, number>>({});
  const [searchKeyword, setSearchKeyword] = useState("");
  const [currentPage, setCurrentPage] = useState(1);
  const pageSize = 50;
  
  const [sortConfig, setSortConfig] = useState<SortConfig>({ key: 'releaseDate', direction: 'desc' });

  const categoryParam = searchParams.get('category');
  const selectedCategory = categoryParam ? decodeURIComponent(categoryParam) : null;

  // pendingDeltaRef と processingRef（連打対策）
  const pendingDeltaRef = useRef<Map<number, number>>(new Map());
  const processingRef = useRef<Set<number>>(new Set());

  // データ取得ロジック
  useEffect(() => {
    if (selectedCategory) {
      setCurrentPage(1);
      setSelectedRarities([]);
    }
  }, [selectedCategory, setSelectedRarities]);

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
            showZeroStock: !showOnlyInStock,
            rarities: selectedRarities.length > 0 ? selectedRarities : undefined,
            rarityOrder: rarities.length > 0 ? rarities : undefined,
          },
          sortConfig
        );
        setItems(result.data);
        setTotalCount(result.count);
        // 仮減らし在庫の取得（失敗しても無視）
        api.fetchPendingQuantities().then(setPendingQuantities).catch(() => {});
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
  }, [addToast, setIsLoading, currentPage, pageSize, selectedCategory, searchKeyword, sortConfig, showOnlyInStock, selectedRarities, rarities]);

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
    // 楽観的UI更新（累積deltaで計算）
    setItems(prev => prev.map(item => {
      if (item.id !== id) return item;
      const pending = pendingDeltaRef.current.get(id) ?? 0;
      const newPending = pending + delta;
      pendingDeltaRef.current.set(id, newPending);
      return { ...item, stock: Math.max(0, item.stock + delta) };
    }));

    // すでに処理中なら何もしない（後続のAPI呼び出しはまとめて送る）
    if (processingRef.current.has(id)) return;
    processingRef.current.add(id);

    // 少し待ってから累積deltaをまとめて送信（デバウンス）
    await new Promise(r => setTimeout(r, 100));

    const totalDelta = pendingDeltaRef.current.get(id) ?? 0;
    pendingDeltaRef.current.delete(id);
    processingRef.current.delete(id);

    if (totalDelta === 0) return;

    try {
      const updatedItem = await api.updateStock(id, totalDelta);
      setItems(prev => prev.map(item => item.id === id ? updatedItem : item));
      // ログ記録（失敗しても無視）
      api.addStockLog({ itemId: id, delta: totalDelta, stockAfter: updatedItem.stock, source: 'manual' }).catch(() => {});
    } catch (e: any) {
      // 失敗時: サーバーから現在値を取得して正確な値に戻す
      try {
        const current = await api.fetchItemById(id);
        setItems(prev => prev.map(item => item.id === id ? current : item));
      } catch {
        addToast('error', '在庫の更新に失敗しました', 'ページを再読み込みしてください。');
      }
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
      pendingQuantities={pendingQuantities}
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
