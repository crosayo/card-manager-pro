
'use client';

import React, { useState, useRef, useEffect } from 'react';
import { Eye, EyeOff, Search, Plus, Loader2, Filter, ArrowUpDown, Edit3, Trash2, X, Save, ChevronLeft, ChevronRight, FileText, Image as ImageIcon, ExternalLink, Upload, ChevronsLeft, ChevronsRight, Calendar, ChevronDown, ShoppingCart, Check } from 'lucide-react';
import { Item, News, Product, SortConfig, AppError, ToastType } from '@/types';
import { useAppContext } from '@/context/AppContext';
import { api } from '@/services/api';
import { ConfirmDialog } from '@/components/ui/ConfirmDialog';
import { RARITY_STYLES, RARITY_DEFAULT_STYLE } from '@/constants';
import { useCart } from '@/context/CartContext';

interface InventoryListProps {
  isAdmin: boolean;
  handleLoginToggle: () => void;
  news: News[];
  searchKeyword: string;
  setSearchKeyword: (val: string) => void;
  isLoading: boolean;
  addToast: (type: ToastType['type'], title: string, message?: string, errorDetail?: AppError) => void;
  items: Item[]; 
  totalCount: number; 
  currentPage: number;
  setCurrentPage: (page: number) => void;
  pageSize: number;
  selectedCategory: string | null;
  products: Product[];
  sortConfig: SortConfig;
  handleSort: (key: keyof Item | 'releaseDate') => void;
  setSortDirectly?: (key: keyof Item | 'releaseDate', direction: 'asc' | 'desc') => void;
  updateStock: (id: number, delta: number) => Promise<void>;
  onAddItem: (item: Omit<Item, 'id' | 'updatedAt'>) => Promise<void>;
  onUpdateItem: (id: number, item: Partial<Item>) => Promise<void>;
  onDeleteItem: (id: number) => Promise<void>;
  pendingQuantities?: Record<number, number>;
}

export const InventoryList: React.FC<InventoryListProps> = ({
  isAdmin,
  handleLoginToggle,
  news,
  searchKeyword,
  setSearchKeyword,
  isLoading,
  addToast,
  items,
  totalCount,
  currentPage,
  setCurrentPage,
  pageSize,
  selectedCategory,
  products,
  sortConfig,
  handleSort,
  setSortDirectly,
  updateStock,
  onAddItem,
  onUpdateItem,
  onDeleteItem,
  pendingQuantities = {},
}) => {
  const { rarities, selectedRarities, setSelectedRarities, showOnlyInStock, setShowOnlyInStock } = useAppContext();
  const { cartItems, addToCart } = useCart();
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingItem, setEditingItem] = useState<Item | null>(null);
  
  // Sort Dropdown State
  const [isSortOpen, setIsSortOpen] = useState(false);
  // Filter Dropdown State
  const [isFilterOpen, setIsFilterOpen] = useState(false);
  
  // CSV Import State
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [isImporting, setIsImporting] = useState(false);

  // Confirm Dialog State
  const [confirmDialog, setConfirmDialog] = useState<{
    isOpen: boolean; title: string; message: string; variant: 'danger' | 'warning' | 'info';
    onConfirm: () => void;
  }>({ isOpen: false, title: '', message: '', variant: 'warning', onConfirm: () => {} });

  const [formData, setFormData] = useState({
    name: '',
    cardId: '',
    rarity: 'N',
    stock: 0,
    category: selectedCategory || products[0]?.name || '',
  });

  const totalPages = Math.ceil(totalCount / pageSize);

  const getRarityStyle = (rarity: string): string => {
    const style = RARITY_STYLES[rarity] ?? RARITY_DEFAULT_STYLE;
    return `${style.bg} ${style.text} border ${style.border}`;
  };
  
  const getReleaseDate = (categoryName: string) => {
    return products.find(p => p.name === categoryName)?.releaseDate || '-';
  };

  const openAddModal = () => {
    setEditingItem(null);
    setFormData({
      name: '',
      cardId: '',
      rarity: rarities[0] || 'N',
      stock: 0,
      category: selectedCategory || products[0]?.name || '',
    });
    setIsModalOpen(true);
  };

  const openEditModal = (item: Item, e?: React.MouseEvent) => {
    if (e) {
      e.stopPropagation();
      e.preventDefault();
    }
    setEditingItem(item);
    setFormData({
      name: item.name,
      cardId: item.cardId,
      rarity: item.rarity,
      stock: item.stock,
      category: item.category,
    });
    setIsModalOpen(true);
  };

  const handleExportCSV = () => {
    addToast('info', 'CSV出力', '現在表示中のページデータを出力します。');
    try {
      const BOM = '\uFEFF';
      const headers = ['ID', 'カード名', '型番', 'レアリティ', '在庫数', '収録パック', '発売日', '最終更新日'];
      const rows = items.map(item => [
        item.id,
        `"${item.name.replace(/"/g, '""')}"`,
        item.cardId,
        item.rarity,
        item.stock,
        `"${item.category.replace(/"/g, '""')}"`,
        getReleaseDate(item.category),
        item.updatedAt
      ]);
      const csvContent = BOM + [headers.join(','), ...rows.map(r => r.join(','))].join('\n');
      const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
      const link = document.createElement('a');
      const fileName = `inventory_page${currentPage}_${new Date().toISOString().split('T')[0]}.csv`;
      link.href = URL.createObjectURL(blob);
      link.download = fileName;
      link.click();
    } catch (e: any) {
      addToast('error', 'CSV出力失敗', e.message);
    }
  };

  const handleImportCSVClick = () => {
    fileInputRef.current?.click();
  };

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const inputEl = e.target;
    setConfirmDialog({
      isOpen: true,
      title: 'CSV在庫更新',
      message: `「${file.name}」を読み込んで在庫を更新しますか？\nCSVの「ID」列と「在庫数」列を使用してデータベースを上書きします。`,
      variant: 'warning',
      onConfirm: () => {
        setConfirmDialog(prev => ({ ...prev, isOpen: false }));
        processCSVImport(file, inputEl);
      }
    });
  };

  const processCSVImport = async (file: File, inputEl: HTMLInputElement) => {
    setIsImporting(true);
    addToast('info', '在庫更新開始', 'CSVを解析して更新処理を実行しています...');

    const reader = new FileReader();
    reader.onload = async (event) => {
      try {
        const text = event.target?.result as string;
        const rows = text.split('\n').filter(row => row.trim() !== '');
        
        const updates: { id: number, stock: number }[] = [];
        let successCount = 0;
        let failCount = 0;

        for (let i = 1; i < rows.length; i++) {
          const cols = rows[i].split(/,(?=(?:(?:[^"]*"){2})*[^"]*$)/); // カンマ区切り（引用符内を無視）
          
          if (cols.length < 5) continue;

          // CSVのエスケープ処理: ダブルクォート削除
          const idStr = cols[0]?.replace(/"/g, '').trim();
          const stockStr = cols[4]?.replace(/"/g, '').trim();

          if (idStr && stockStr) {
            const id = parseInt(idStr);
            const stock = parseInt(stockStr);
            if (!isNaN(id) && !isNaN(stock)) {
              updates.push({ id, stock });
              successCount++;
            } else {
              failCount++;
            }
          }
        }

        if (updates.length > 0) {
          await api.bulkUpdateStock(updates);
          addToast('success', '在庫更新完了', `${updates.length}件の在庫を更新しました。ページをリロードして反映を確認してください。`);
          // ログ記録（失敗しても無視）
          Promise.all(updates.map(u =>
            api.addStockLog({ itemId: u.id, delta: 0, stockAfter: u.stock, source: 'csv', note: 'CSVインポ���ト' }).catch(() => {})
          ));
        } else {
          addToast('error', '更新データなし', '有効な更新データが見つかりませんでした。CSVの形式を確認してください。');
        }

      } catch (err: any) {
        console.error(err);
        addToast('error', 'インポート失敗', err.message);
      } finally {
        setIsImporting(false);
        if (fileInputRef.current) fileInputRef.current.value = '';
      }
    };
    reader.readAsText(file);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!formData.name || !formData.cardId) {
      addToast('error', '入力エラー', 'カード名と型番は必須です。');
      return;
    }

    const itemToSubmit = {
      ...formData
    };
    
    if (editingItem) {
      await onUpdateItem(editingItem.id, itemToSubmit);
    } else {
      await onAddItem(itemToSubmit);
    }
    setIsModalOpen(false);
  };

  const handleDeleteClick = (id: number, name: string, e?: React.MouseEvent) => {
    if (e) {
      e.stopPropagation();
      e.preventDefault();
    }
    setConfirmDialog({
      isOpen: true,
      title: 'カード削除',
      message: `「${name}」を削除してもよろしいですか？\nこの操作は取り消せません。`,
      variant: 'danger',
      onConfirm: () => {
        setConfirmDialog(prev => ({ ...prev, isOpen: false }));
        onDeleteItem(id);
      }
    });
  };

  const openImageSearch = (name: string, e: React.MouseEvent) => {
    e.stopPropagation();
    e.preventDefault();
    const query = encodeURIComponent(`遊戯王 ${name}`);
    window.open(`https://www.google.com/search?tbm=isch&q=${query}`, '_blank');
  };

  // Pagination Handlers
  const gotoFirst = () => setCurrentPage(1);
  const gotoLast = () => setCurrentPage(totalPages);
  const prev5 = () => setCurrentPage(Math.max(1, currentPage - 5));
  const next5 = () => setCurrentPage(Math.min(totalPages, currentPage + 5));

  const applySort = (key: keyof Item | 'releaseDate', direction: 'asc' | 'desc') => {
    if (setSortDirectly) {
      setSortDirectly(key, direction);
      setIsSortOpen(false);
    }
  };

  return (
    <div className="p-4 md:p-8 pb-20">
      {/* 閲覧専用バナー */}
      {!isAdmin && (
        <div className="bg-blue-600 text-white px-4 md:px-6 py-3 rounded-lg shadow-md mb-6 flex flex-col md:flex-row items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <Eye className="text-blue-200 shrink-0" size={24} />
            <div>
              <h3 className="font-bold">閲覧モードで表示中</h3>
              <p className="text-sm text-blue-100">現在ログインしていません。在庫の編集を行うには管理者としてログインしてください。</p>
            </div>
          </div>
          <button 
            onClick={handleLoginToggle}
            className="w-full md:w-auto bg-white text-blue-600 px-4 py-2 rounded font-bold text-sm hover:bg-blue-50 transition-colors whitespace-nowrap"
          >
            ログイン
          </button>
        </div>
      )}

      {/* ツールバー */}
      <div className="bg-white/90 backdrop-blur-md p-4 rounded-xl shadow-sm mb-6 flex flex-col gap-4 sticky top-0 z-10 border border-slate-200/60">
        
        {/* 上段: 検索とメイン操作 */}
        <div className="flex flex-col md:flex-row gap-2 w-full justify-between items-start md:items-center">
          <div className="flex items-center gap-2 bg-slate-100 px-4 py-2 rounded-lg w-full md:max-w-md focus-within:ring-2 focus-within:ring-cyan-400 transition-all">
            <Search size={20} className="text-slate-400 shrink-0" />
            <input 
              type="text" 
              placeholder="カード名、型番で検索..." 
              className="bg-transparent border-none outline-none w-full text-slate-700 placeholder-slate-400"
              value={searchKeyword}
              onChange={(e) => setSearchKeyword(e.target.value)}
            />
          </div>

          <div className="flex gap-2 w-full md:w-auto overflow-x-auto pb-1 md:pb-0">
             {isAdmin && (
               <>
                 <button 
                   onClick={openAddModal}
                   className="flex items-center gap-2 bg-cyan-600 hover:bg-cyan-700 text-white px-4 py-2 rounded-lg font-medium transition-colors shadow-sm disabled:opacity-50 text-sm whitespace-nowrap active:scale-95 duration-150"
                   disabled={isLoading}
                 >
                   <Plus size={18} /> <span className="hidden sm:inline">新規登録</span>
                 </button>

                 <button 
                   onClick={handleImportCSVClick}
                   className="flex items-center gap-2 bg-green-600 hover:bg-green-700 text-white px-3 py-2 rounded-lg font-medium transition-colors shadow-sm text-sm whitespace-nowrap active:scale-95 duration-150"
                   title="CSVを読み込んで在庫を一括更新"
                   disabled={isImporting || isLoading}
                 >
                   {isImporting ? <Loader2 size={18} className="animate-spin" /> : <Upload size={18} />}
                   <span className="hidden sm:inline">在庫更新(CSV)</span>
                 </button>
                 <input 
                   type="file" 
                   ref={fileInputRef} 
                   onChange={handleFileChange} 
                   accept=".csv" 
                   className="hidden" 
                 />

                 <button 
                   onClick={handleExportCSV}
                   className="flex items-center gap-2 bg-slate-200 hover:bg-slate-300 text-slate-600 px-3 py-2 rounded-lg font-medium transition-colors shadow-sm text-sm whitespace-nowrap active:scale-95 duration-150"
                   title="表示中のデータをCSVでダウンロード"
                 >
                   <FileText size={18} />
                 </button>
               </>
             )}
          </div>
        </div>
        
        {/* 下段: ソート + フィルター */}
        <div className="flex flex-col sm:flex-row gap-2 justify-between items-start sm:items-center text-sm border-t border-slate-100 pt-3">
          <div className="flex gap-2 items-center w-full sm:w-auto relative">
             {/* ソートボタン (クリック式) */}
             <button
               onClick={() => { setIsSortOpen(!isSortOpen); setIsFilterOpen(false); }}
               className="flex items-center gap-2 bg-slate-50 border border-slate-200 px-3 py-1.5 rounded-lg text-slate-700 hover:bg-slate-100 transition-colors"
             >
               <ArrowUpDown size={14} />
               <span>
                  {sortConfig.key === 'releaseDate' && sortConfig.direction === 'desc' ? '発売日が新しい順' :
                   sortConfig.key === 'releaseDate' && sortConfig.direction === 'asc' ? '発売日が古い順' :
                   sortConfig.key === 'cardId' && sortConfig.direction === 'asc' ? '型番順 (A → Z)' :
                   sortConfig.key === 'cardId' && sortConfig.direction === 'desc' ? '型番順 (Z → A)' :
                   sortConfig.key === 'stock' && sortConfig.direction === 'desc' ? '在庫が多い順' :
                   sortConfig.key === 'stock' && sortConfig.direction === 'asc' ? '在庫が少ない順' :
                   sortConfig.key === 'updatedAt' && sortConfig.direction === 'desc' ? '更新が新しい順' : '並び替え'}
               </span>
               <ChevronDown size={14} className={`transition-transform duration-200 ${isSortOpen ? 'rotate-180' : ''}`} />
             </button>

             {/* ドロップダウンメニュー (クリックで開閉) */}
             {isSortOpen && setSortDirectly && (
               <>
                 <div className="fixed inset-0 z-20 cursor-default" onClick={() => setIsSortOpen(false)}></div>
                 <div className="absolute top-full left-0 mt-1 w-56 bg-white border border-slate-200 rounded-lg shadow-xl overflow-hidden z-30 animate-in fade-in zoom-in-95 duration-100">
                   <div className="py-1">
                     <button onClick={() => applySort('releaseDate', 'desc')} className="w-full text-left px-4 py-2 hover:bg-cyan-50 text-slate-700 text-sm">発売日が新しい順</button>
                     <button onClick={() => applySort('releaseDate', 'asc')} className="w-full text-left px-4 py-2 hover:bg-cyan-50 text-slate-700 text-sm">発売日が古い順</button>
                     <div className="border-t border-slate-100 my-1"></div>
                     <button onClick={() => applySort('cardId', 'asc')} className="w-full text-left px-4 py-2 hover:bg-cyan-50 text-slate-700 text-sm">型番順 (A → Z)</button>
                     <button onClick={() => applySort('cardId', 'desc')} className="w-full text-left px-4 py-2 hover:bg-cyan-50 text-slate-700 text-sm">型番順 (Z → A)</button>
                     <div className="border-t border-slate-100 my-1"></div>
                     <button onClick={() => applySort('stock', 'desc')} className="w-full text-left px-4 py-2 hover:bg-cyan-50 text-slate-700 text-sm">在庫が多い順</button>
                     <button onClick={() => applySort('stock', 'asc')} className="w-full text-left px-4 py-2 hover:bg-cyan-50 text-slate-700 text-sm">在庫が少ない順</button>
                     <div className="border-t border-slate-100 my-1"></div>
                     <button onClick={() => applySort('updatedAt', 'desc')} className="w-full text-left px-4 py-2 hover:bg-cyan-50 text-slate-700 text-sm">更新が新しい順</button>
                   </div>
                 </div>
               </>
             )}

             {/* フィルターボタン */}
             <div className="relative">
               <button
                 onClick={() => { setIsFilterOpen(!isFilterOpen); setIsSortOpen(false); }}
                 className={`flex items-center gap-2 border px-3 py-1.5 rounded-lg transition-colors ${
                   selectedRarities.length > 0 || showOnlyInStock
                     ? 'bg-cyan-50 border-cyan-300 text-cyan-700 hover:bg-cyan-100'
                     : 'bg-slate-50 border-slate-200 text-slate-700 hover:bg-slate-100'
                 }`}
               >
                 <Filter size={14} />
                 <span>フィルター</span>
                 {(selectedRarities.length > 0 || showOnlyInStock) && (
                   <span className="bg-cyan-600 text-white text-xs rounded-full w-4 h-4 flex items-center justify-center leading-none">
                     {selectedRarities.length + (showOnlyInStock ? 1 : 0)}
                   </span>
                 )}
               </button>

               {/* フィルタードロップダウン */}
               {isFilterOpen && (
                 <>
                   <div className="fixed inset-0 z-20 cursor-default" onClick={() => setIsFilterOpen(false)}></div>
                   <div className="absolute top-full left-0 mt-1 w-64 bg-white border border-slate-200 rounded-lg shadow-xl z-30 animate-in fade-in zoom-in-95 duration-100">
                     <div className="p-3 space-y-3">
                       {/* レアリティフィルター */}
                       <div>
                         <p className="text-xs font-bold text-slate-500 uppercase tracking-wider mb-2">レアリティ</p>
                         <div className="flex flex-wrap gap-1">
                           {(() => {
                             const availableRarities = selectedCategory
                               ? rarities.filter(r => items.some(item => item.rarity === r))
                               : rarities;
                             return availableRarities.map(r => {
                               const style = RARITY_STYLES[r] ?? RARITY_DEFAULT_STYLE;
                               const isSelected = selectedRarities.includes(r);
                               return (
                                 <button
                                   key={r}
                                   onClick={() => {
                                     if (isSelected) {
                                       setSelectedRarities(selectedRarities.filter(x => x !== r));
                                     } else {
                                       setSelectedRarities([...selectedRarities, r]);
                                     }
                                   }}
                                   className={`px-2 py-0.5 rounded text-xs font-bold border transition-all ${
                                     isSelected
                                       ? `${style.bg} ${style.text} ${style.border} ring-1 ring-offset-1`
                                       : 'bg-slate-100 text-slate-500 border-slate-200 hover:bg-slate-200'
                                   }`}
                                 >
                                   {r}
                                 </button>
                               );
                             });
                           })()}
                         </div>
                       </div>

                       {/* 在庫フィルター */}
                       <div className="border-t border-slate-100 pt-2">
                         <p className="text-xs font-bold text-slate-500 uppercase tracking-wider mb-2">在庫</p>
                         <button
                           onClick={() => setShowOnlyInStock(!showOnlyInStock)}
                           className={`w-full flex items-center gap-2 px-3 py-1.5 rounded-lg border text-sm font-medium transition-all ${
                             showOnlyInStock
                               ? 'bg-amber-50 text-amber-700 border-amber-300'
                               : 'bg-slate-50 text-slate-600 border-slate-200 hover:bg-slate-100'
                           }`}
                         >
                           <span className={`w-3 h-3 rounded-full border-2 flex-shrink-0 ${showOnlyInStock ? 'bg-amber-400 border-amber-400' : 'border-slate-400'}`} />
                           在庫ありのみ表示
                         </button>
                       </div>

                       {/* リセット */}
                       {(selectedRarities.length > 0 || showOnlyInStock) && (
                         <div className="border-t border-slate-100 pt-2 text-right">
                           <button
                             onClick={() => { setSelectedRarities([]); setShowOnlyInStock(false); }}
                             className="text-xs text-slate-400 hover:text-slate-600 underline"
                           >
                             すべて解除
                           </button>
                         </div>
                       )}
                     </div>
                   </div>
                 </>
               )}
             </div>
          </div>
        </div>

        {/* フィルターチップバー: 適用中フィルターを表示 */}
        {(selectedCategory || selectedRarities.length > 0 || showOnlyInStock) && (
          <div className="flex flex-wrap gap-2 items-center pt-2 border-t border-slate-100">
            <Filter size={14} className="text-slate-400 shrink-0" />
            {selectedCategory && (
              <span className="flex items-center gap-1 bg-cyan-100 text-cyan-800 border border-cyan-200 px-2 py-1 rounded-full text-xs font-bold">
                {selectedCategory}
              </span>
            )}
            {selectedRarities.map(r => {
              const style = RARITY_STYLES[r] ?? RARITY_DEFAULT_STYLE;
              return (
                <button
                  key={r}
                  onClick={() => setSelectedRarities(selectedRarities.filter(x => x !== r))}
                  className={`flex items-center gap-1 ${style.bg} ${style.text} border ${style.border} px-2 py-1 rounded-full text-xs font-bold hover:opacity-80 transition-opacity`}
                >
                  {r} <X size={10} />
                </button>
              );
            })}
            {showOnlyInStock && (
              <button
                onClick={() => setShowOnlyInStock(false)}
                className="flex items-center gap-1 bg-amber-100 text-amber-700 border border-amber-300 px-2 py-1 rounded-full text-xs font-bold hover:opacity-80 transition-opacity"
              >
                在庫あり <X size={10} />
              </button>
            )}
            {(selectedRarities.length > 0 || showOnlyInStock) && (
              <button
                onClick={() => { setSelectedRarities([]); setShowOnlyInStock(false); }}
                className="text-xs text-slate-400 hover:text-slate-600 underline"
              >
                すべて解除
              </button>
            )}
          </div>
        )}
      </div>
      
      {isLoading && (
        <div className="fixed inset-0 bg-white/50 backdrop-blur-sm z-40 flex items-center justify-center pointer-events-none">
          <div className="bg-white p-4 rounded-lg shadow-xl flex items-center gap-3 border border-slate-200">
            <Loader2 className="animate-spin text-cyan-600" size={24} />
            <span className="font-bold text-slate-700">データを読み込み中...</span>
          </div>
        </div>
      )}

      {/* ページネーション (上部) */}
      <div className="flex justify-between items-center mb-4 text-sm text-slate-500">
         <div>
           {totalCount > 0 ? (
             <span>
               全 <b>{totalCount.toLocaleString()}</b> 件中
               <b> {(currentPage - 1) * pageSize + 1} - {Math.min(currentPage * pageSize, totalCount)}</b> 件を表示
             </span>
           ) : (
             <span>データがありません</span>
           )}
         </div>
      </div>

      {/* PC表示: テーブルビュー */}
      <div className="hidden md:block bg-white rounded-xl shadow-sm overflow-hidden border border-slate-200 overflow-x-auto relative z-0">
        <table className="w-full text-left border-collapse min-w-[700px]">
          <thead>
            <tr className="bg-slate-50 border-b border-slate-200 text-slate-500 text-sm uppercase tracking-wider">
              {['releaseDate', 'cardId', 'name', 'rarity', 'stock', 'category'].map((key) => (
                <th key={key} className="p-4 cursor-pointer hover:bg-slate-100 transition-colors group" onClick={() => handleSort(key as any)}>
                  <div className="flex items-center gap-1">
                    {key === 'releaseDate' ? '発売日' : key === 'cardId' ? '型番' : key === 'name' ? 'カード名' : key === 'rarity' ? 'レア' : key === 'stock' ? '在庫' : '収録パック'}
                    <ArrowUpDown size={14} className={`opacity-0 group-hover:opacity-100 ${sortConfig.key === key ? 'opacity-100 text-cyan-600' : ''}`} />
                  </div>
                </th>
              ))}
              <th className="p-4 text-center">操作</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {items.length === 0 ? (
              <tr>
                <td colSpan={7} className="p-12 text-center text-slate-400">
                  <div className="flex flex-col items-center gap-2">
                    <Search size={32} className="opacity-20" />
                    <p>条件に一致するデータが見つかりません</p>
                  </div>
                </td>
              </tr>
            ) : (
              items.map(item => (
                <tr key={item.id} className="hover:bg-cyan-50/30 transition-colors group">
                  <td className="p-4 font-mono text-slate-500 text-sm">{getReleaseDate(item.category)}</td>
                  <td className="p-4 font-mono text-slate-600 font-medium">{item.cardId}</td>
                  <td className="p-4 font-bold text-slate-800 flex items-center gap-2">
                     {item.name}
                     <button 
                       onClick={(e) => openImageSearch(item.name, e)}
                       className="opacity-0 group-hover:opacity-100 text-slate-400 hover:text-cyan-600 transition-opacity"
                       title="Google画像検索を開く"
                     >
                       <ImageIcon size={16} />
                     </button>
                  </td>
                  <td className="p-4">
                    <span className={`px-2 py-1 rounded-md text-xs font-bold border ${getRarityStyle(item.rarity)}`}>
                      {item.rarity}
                    </span>
                  </td>
                  <td className="p-4">
                    <div className="flex items-center gap-3">
                      {isAdmin && (
                        <button
                          type="button"
                          onClick={() => updateStock(item.id, -1)}
                          disabled={isLoading}
                          className="w-8 h-8 flex items-center justify-center rounded-full bg-slate-100 text-slate-600 hover:bg-red-100 hover:text-red-600 transition-colors disabled:opacity-50"
                        >
                          -
                        </button>
                      )}

                      <div className="text-center">
                        <span className={`font-bold text-lg ${item.stock === 0 ? 'text-red-500 opacity-50' : 'text-slate-700'}`}>
                          {item.stock}
                        </span>
                        {(pendingQuantities[item.id] ?? 0) > 0 && (
                          <div className="text-[10px] text-red-400 whitespace-nowrap">
                            {pendingQuantities[item.id]}枚リクエスト中
                          </div>
                        )}
                      </div>

                      {isAdmin && (
                        <button
                          type="button"
                          onClick={() => updateStock(item.id, 1)}
                          disabled={isLoading}
                          className="w-8 h-8 flex items-center justify-center rounded-full bg-slate-100 text-slate-600 hover:bg-blue-100 hover:text-blue-600 transition-colors disabled:opacity-50"
                        >
                          +
                        </button>
                      )}
                    </div>
                  </td>
                  <td className="p-4 text-sm text-slate-500">
                    {products.find(p => p.name === item.category)?.name || item.category}
                  </td>
                  <td className="p-4 text-center">
                    <div className="flex items-center justify-center gap-2">
                      {/* リクエストボタン */}
                      {(() => {
                        const effectiveStock = item.stock - (pendingQuantities[item.id] ?? 0);
                        const inCart = cartItems.some(c => c.itemId === item.id);
                        return (
                          <button
                            type="button"
                            disabled={effectiveStock <= 0}
                            onClick={() => addToCart({ itemId: item.id, name: item.name, quantity: 1, maxStock: effectiveStock })}
                            className={`flex items-center gap-1 px-2 py-1 rounded text-xs font-bold transition-colors ${
                              inCart
                                ? 'bg-cyan-100 text-cyan-700 border border-cyan-300'
                                : effectiveStock <= 0
                                  ? 'bg-slate-50 text-slate-300 border border-slate-200 cursor-not-allowed'
                                  : 'bg-slate-100 hover:bg-cyan-50 text-slate-500 hover:text-cyan-600 border border-slate-200 hover:border-cyan-300'
                            }`}
                            title={effectiveStock <= 0 ? '在庫なし' : 'カートに追加'}
                          >
                            {inCart ? <Check size={12} /> : <ShoppingCart size={12} />}
                            {inCart ? '追加済み' : effectiveStock <= 0 ? '在庫なし' : 'リクエスト'}
                          </button>
                        );
                      })()}

                      {isAdmin && (
                        <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                          <button
                            type="button"
                            onClick={(e) => openEditModal(item, e)}
                            className="bg-slate-100 hover:bg-cyan-100 text-slate-400 hover:text-cyan-600 p-2 rounded transition-colors"
                            title="編集"
                          >
                            <Edit3 size={18} />
                          </button>
                          <button
                            type="button"
                            onClick={(e) => handleDeleteClick(item.id, item.name, e)}
                            className="bg-slate-100 hover:bg-red-100 text-slate-400 hover:text-red-600 p-2 rounded transition-colors"
                            title="削除"
                          >
                            <Trash2 size={18} />
                          </button>
                        </div>
                      )}
                    </div>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      {/* モバイル表示 */}
      <div className="md:hidden space-y-4">
        {items.length === 0 ? (
          <div className="p-8 text-center text-slate-400 bg-white rounded-xl shadow-sm border border-slate-200">
             <div className="flex flex-col items-center gap-2">
                <Search size={32} className="opacity-20" />
                <p>条件に一致するデータが見つかりません</p>
             </div>
          </div>
        ) : (
          items.map(item => (
            <div key={item.id} className="bg-white p-4 rounded-xl shadow-sm border border-slate-200">
              <div className="flex justify-between items-start mb-2">
                 <div className="flex-1 mr-2">
                   <div className="font-bold text-lg text-slate-800 leading-tight mb-1 flex items-center gap-2">
                     {item.name}
                     <button 
                        onClick={(e) => openImageSearch(item.name, e)}
                        className="text-slate-400 hover:text-cyan-600 p-1 bg-slate-50 rounded-full"
                     >
                       <ImageIcon size={14} />
                     </button>
                   </div>
                   <div className="text-xs font-mono text-slate-500 bg-slate-100 inline-block px-1.5 py-0.5 rounded mr-2">{item.cardId}</div>
                   <span className="text-xs font-mono text-slate-400 inline-flex items-center gap-1">
                      <Calendar size={10} /> {getReleaseDate(item.category)}
                   </span>
                 </div>
                 <span className={`px-2 py-1 rounded text-xs font-bold border shrink-0 ${getRarityStyle(item.rarity)}`}>
                   {item.rarity}
                 </span>
              </div>
              
              <div className="text-sm text-slate-600 mb-4 pb-3 border-b border-slate-100">
                 <span className="text-slate-400 text-xs mr-1">収録:</span>
                 {products.find(p => p.name === item.category)?.name || item.category}
              </div>
              
              <div className="flex justify-between items-center">
                <div className="text-xs text-slate-400">
                  更新: {item.updatedAt.substring(5, 10)}
                </div>
                <div className="flex items-center gap-3">
                   {isAdmin ? (
                     <>
                       <button
                         onClick={() => updateStock(item.id, -1)}
                         disabled={isLoading}
                         className="w-10 h-10 flex items-center justify-center rounded-full bg-slate-100 text-slate-600 hover:bg-red-100 hover:text-red-600 active:bg-red-200 transition-colors disabled:opacity-50"
                       >
                         -
                       </button>
                       <div className="text-center">
                         <span className={`font-bold text-xl ${item.stock === 0 ? 'text-red-500 opacity-50' : 'text-slate-800'}`}>
                           {item.stock}
                         </span>
                         {(pendingQuantities[item.id] ?? 0) > 0 && (
                           <div className="text-[10px] text-red-400">{pendingQuantities[item.id]}件申請中</div>
                         )}
                       </div>
                       <button
                         onClick={() => updateStock(item.id, 1)}
                         disabled={isLoading}
                         className="w-10 h-10 flex items-center justify-center rounded-full bg-slate-100 text-slate-600 hover:bg-blue-100 hover:text-blue-600 active:bg-blue-200 transition-colors disabled:opacity-50"
                       >
                         +
                       </button>
                     </>
                   ) : (
                     <div className="flex items-center gap-2">
                        <span className="text-xs text-slate-400">在庫:</span>
                        <div className="text-center">
                          <span className={`font-bold text-xl ${item.stock === 0 ? 'text-red-500' : 'text-slate-800'}`}>
                            {item.stock}
                          </span>
                          {(pendingQuantities[item.id] ?? 0) > 0 && (
                            <div className="text-[10px] text-red-400">{pendingQuantities[item.id]}件申請中</div>
                          )}
                        </div>
                     </div>
                   )}
                </div>
              </div>

              {/* モバイル: リクエストボタン */}
              {(() => {
                const effectiveStock = item.stock - (pendingQuantities[item.id] ?? 0);
                const inCart = cartItems.some(c => c.itemId === item.id);
                return (
                  <div className="mt-2">
                    <button
                      disabled={effectiveStock <= 0}
                      onClick={() => addToCart({ itemId: item.id, name: item.name, quantity: 1, maxStock: effectiveStock })}
                      className={`w-full py-2 rounded-lg text-sm font-bold flex items-center justify-center gap-2 border transition-colors ${
                        inCart
                          ? 'bg-cyan-50 text-cyan-700 border-cyan-300'
                          : effectiveStock <= 0
                            ? 'bg-slate-50 text-slate-300 border-slate-200 cursor-not-allowed'
                            : 'bg-slate-50 hover:bg-cyan-50 text-slate-500 hover:text-cyan-600 border-slate-200 hover:border-cyan-300'
                      }`}
                    >
                      {inCart ? <Check size={14} /> : <ShoppingCart size={14} />}
                      {inCart ? 'カートに追加済み' : effectiveStock <= 0 ? '在庫なし' : 'リクエストする'}
                    </button>
                  </div>
                );
              })()}
              
               {isAdmin && (
                 <div className="mt-3 flex justify-end gap-2 pt-2 border-t border-slate-50 border-dashed">
                   <button 
                     onClick={(e) => openEditModal(item, e)}
                     className="flex-1 py-2 text-sm text-slate-500 hover:text-cyan-600 hover:bg-slate-50 rounded flex items-center justify-center gap-1 active:bg-slate-100"
                   >
                     <Edit3 size={16} /> 編集
                   </button>
                   <div className="w-px bg-slate-200 my-1"></div>
                   <button 
                     onClick={(e) => handleDeleteClick(item.id, item.name, e)}
                     className="flex-1 py-2 text-sm text-slate-500 hover:text-red-600 hover:bg-red-50 rounded flex items-center justify-center gap-1 active:bg-red-100"
                   >
                     <Trash2 size={16} /> 削除
                   </button>
                 </div>
               )}
            </div>
          ))
        )}
      </div>

      {/* ページネーション (下部) */}
      <div className="flex justify-center items-center mt-8 text-sm text-slate-500">
         <div className="flex items-center gap-2 bg-white px-4 py-2 rounded-full shadow-sm border border-slate-100">
           {/* 最初へ */}
           <button
             onClick={gotoFirst}
             disabled={currentPage === 1 || isLoading}
             className="p-2 rounded-full hover:bg-slate-100 disabled:opacity-30 disabled:hover:bg-transparent transition-colors"
             title="最初のページ"
           >
             <ChevronsLeft size={20} />
           </button>
           
           {/* 5ページ前 */}
           <button
             onClick={prev5}
             disabled={currentPage === 1 || isLoading}
             className="p-2 rounded-full hover:bg-slate-100 disabled:opacity-30 disabled:hover:bg-transparent transition-colors text-xs font-bold w-10"
             title="5ページ戻る"
           >
             -5
           </button>

           {/* 前へ */}
           <button
             onClick={() => setCurrentPage(Math.max(1, currentPage - 1))}
             disabled={currentPage === 1 || isLoading}
             className="p-2 rounded-full hover:bg-slate-100 disabled:opacity-30 disabled:hover:bg-transparent transition-colors"
           >
             <ChevronLeft size={20} />
           </button>

           <span className="font-bold text-slate-800 text-base mx-2">
             {currentPage} <span className="text-slate-400 text-sm font-normal">/ {Math.max(1, totalPages)}</span>
           </span>

           {/* 次へ */}
           <button
             onClick={() => setCurrentPage(Math.min(totalPages, currentPage + 1))}
             disabled={currentPage >= totalPages || isLoading}
             className="p-2 rounded-full hover:bg-slate-100 disabled:opacity-30 disabled:hover:bg-transparent transition-colors"
           >
             <ChevronRight size={20} />
           </button>

           {/* 5ページ次 */}
           <button
             onClick={next5}
             disabled={currentPage >= totalPages || isLoading}
             className="p-2 rounded-full hover:bg-slate-100 disabled:opacity-30 disabled:hover:bg-transparent transition-colors text-xs font-bold w-10"
             title="5ページ進む"
           >
             +5
           </button>

           {/* 最後へ */}
           <button
             onClick={gotoLast}
             disabled={currentPage >= totalPages || isLoading}
             className="p-2 rounded-full hover:bg-slate-100 disabled:opacity-30 disabled:hover:bg-transparent transition-colors"
             title="最後のページ"
           >
             <ChevronsRight size={20} />
           </button>
         </div>
      </div>

      {/* 登録・編集モーダル */}
      {isModalOpen && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-center justify-center p-4 animate-in fade-in duration-200">
          <div className="bg-white rounded-xl shadow-2xl max-w-lg w-full overflow-hidden">
            <div className="bg-slate-50 p-4 border-b border-slate-100 flex justify-between items-center">
              <h3 className="font-bold text-lg text-slate-800 flex items-center gap-2">
                {editingItem ? <Edit3 className="text-cyan-600" /> : <Plus className="text-cyan-600" />}
                {editingItem ? 'カード情報を編集' : '新規カード登録'}
              </h3>
              <button onClick={() => setIsModalOpen(false)} className="text-slate-400 hover:text-slate-600">
                <X size={24} />
              </button>
            </div>
            
            <form onSubmit={handleSubmit} className="p-6 space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div className="col-span-2">
                  <label className="block text-sm font-bold text-slate-700 mb-1">カード名</label>
                  <input
                    type="text"
                    required
                    value={formData.name}
                    onChange={(e) => setFormData({...formData, name: e.target.value})}
                    className="w-full border border-slate-300 rounded px-3 py-2 focus:ring-2 focus:ring-cyan-500 outline-none"
                    placeholder="例: 青眼の白龍"
                  />
                </div>
                
                <div>
                  <label className="block text-sm font-bold text-slate-700 mb-1">型番</label>
                  <input
                    type="text"
                    required
                    value={formData.cardId}
                    onChange={(e) => setFormData({...formData, cardId: e.target.value.toUpperCase()})}
                    className="w-full border border-slate-300 rounded px-3 py-2 focus:ring-2 focus:ring-cyan-500 outline-none font-mono"
                    placeholder="例: SM-51"
                  />
                </div>
                
                <div>
                  <label className="block text-sm font-bold text-slate-700 mb-1">レアリティ</label>
                  <select
                    value={formData.rarity}
                    onChange={(e) => setFormData({...formData, rarity: e.target.value})}
                    className="w-full border border-slate-300 rounded px-3 py-2 focus:ring-2 focus:ring-cyan-500 outline-none"
                  >
                    {rarities.map(r => ( // Contextのraritiesを使用
                      <option key={r} value={r}>{r}</option>
                    ))}
                  </select>
                </div>

                <div className="col-span-2">
                  <label className="block text-sm font-bold text-slate-700 mb-1">収録パック / カテゴリ</label>
                  <select
                    value={formData.category}
                    onChange={(e) => {
                      const val = e.target.value;
                      setFormData({...formData, category: val});
                    }}
                    className="w-full border border-slate-300 rounded px-3 py-2 focus:ring-2 focus:ring-cyan-500 outline-none"
                  >
                    {products.map(p => (
                      <option key={p.id} value={p.name}>{p.name}</option>
                    ))}
                    {!products.some(p => p.name === formData.category) && formData.category && (
                      <option value={formData.category}>{formData.category}</option>
                    )}
                  </select>
                </div>

                <div>
                  <label className="block text-sm font-bold text-slate-700 mb-1">
                    {editingItem ? '現在庫数' : '初期在庫数'}
                  </label>
                  <input
                    type="number"
                    min="0"
                    value={formData.stock}
                    onChange={(e) => setFormData({...formData, stock: parseInt(e.target.value) || 0})}
                    className="w-full border border-slate-300 rounded px-3 py-2 focus:ring-2 focus:ring-cyan-500 outline-none"
                  />
                </div>
              </div>

              <div className="pt-4 flex justify-end gap-3">
                <button
                  type="button"
                  onClick={() => setIsModalOpen(false)}
                  className="px-4 py-2 text-slate-600 hover:bg-slate-100 rounded-lg font-medium"
                >
                  キャンセル
                </button>
                <button
                  type="submit"
                  disabled={isLoading}
                  className="px-6 py-2 bg-cyan-600 hover:bg-cyan-700 text-white rounded-lg font-bold flex items-center gap-2 disabled:opacity-50"
                >
                  {isLoading ? <Loader2 className="animate-spin" size={18} /> : <Save size={18} />}
                  {editingItem ? '更新する' : '登録する'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      <ConfirmDialog
        isOpen={confirmDialog.isOpen}
        title={confirmDialog.title}
        message={confirmDialog.message}
        variant={confirmDialog.variant}
        onConfirm={confirmDialog.onConfirm}
        onCancel={() => setConfirmDialog(prev => ({ ...prev, isOpen: false }))}
      />
    </div>
  );
};
