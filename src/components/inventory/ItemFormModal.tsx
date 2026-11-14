'use client';

import React, { useState, useEffect } from 'react';
import { Search, Plus, LoaderCircle, PenLine, X, Save } from 'lucide-react';
import { Item, Product } from '@/types';
import { useAppContext } from '@/context/AppContext';
import { api } from '@/services/api';

// 在庫一覧の「新規カード登録」「カード情報を編集」モーダル。B6 で InventoryList.tsx から分けた。
// 閉じると部品ごと外れるため、開くたびに入力と既存カード検索は initialFormData から始まる
export interface ItemFormData {
  name: string;
  cardId: string;
  rarity: string;
  stock: number;
  category: string;
}

interface ItemFormModalProps {
  editingItem: Item | null;
  initialFormData: ItemFormData;
  products: Product[];
  isLoading: boolean;
  onSubmit: (formData: ItemFormData) => Promise<void>;
  onClose: () => void;
  onValidationError: () => void;
}

export const ItemFormModal: React.FC<ItemFormModalProps> = ({
  editingItem,
  initialFormData,
  products,
  isLoading,
  onSubmit,
  onClose,
  onValidationError,
}) => {
  const { rarities } = useAppContext();
  const [formData, setFormData] = useState<ItemFormData>(initialFormData);

  // 登録モーダル内: 既存カード検索（別カテゴリへの別レアリティ追加用）
  const [cardSearchKeyword, setCardSearchKeyword] = useState('');
  const [cardSearchResults, setCardSearchResults] = useState<Item[]>([]);
  const [searchedCardKeyword, setSearchedCardKeyword] = useState(''); // 結果が出ているキーワード

  // 登録モーダル内の既存カード検索（デバウンス付き）
  // 検索中か・結果を出すかは描画時に求める（effect の中で同期的に setState しない）
  // 元の InventoryList の条件にあった isModalOpen は、部品が画面にあること自体が「開いている」なので外した
  const isCardSearchActive = !editingItem && cardSearchKeyword.trim() !== '';
  const isCardSearching = isCardSearchActive && searchedCardKeyword !== cardSearchKeyword;
  const visibleCardSearchResults = isCardSearchActive ? cardSearchResults : [];
  useEffect(() => {
    if (!isCardSearchActive) return;
    const timer = setTimeout(async () => {
      try {
        const result = await api.fetchItems(1, 8, { search: cardSearchKeyword });
        setCardSearchResults(result.data);
      } catch {
        setCardSearchResults([]);
      } finally {
        setSearchedCardKeyword(cardSearchKeyword);
      }
    }, 300);
    return () => clearTimeout(timer);
  }, [cardSearchKeyword, isCardSearchActive]);

  // 検索候補を選んでフォームに反映（別カテゴリへの別レアリティ追加を想定）
  const selectSearchedCard = (item: Item) => {
    setFormData(prev => ({
      ...prev,
      name: item.name,
      cardId: item.cardId,
      category: item.category,
    }));
    setCardSearchKeyword('');
    setCardSearchResults([]);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!formData.name || !formData.cardId) {
      onValidationError();
      return;
    }
    await onSubmit({ ...formData });
  };

  return (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-center justify-center p-4 animate-in fade-in duration-200">
          <div className="bg-white rounded-xl shadow-2xl max-w-lg w-full overflow-hidden">
            <div className="bg-slate-50 p-4 border-b border-slate-100 flex justify-between items-center">
              <h3 className="text-lg font-bold text-slate-800 flex items-center gap-2">
                {editingItem ? <PenLine className="text-cyan-600" /> : <Plus className="text-cyan-600" />}
                {editingItem ? 'カード情報を編集' : '新規カード登録'}
              </h3>
              <button onClick={onClose} className="text-slate-400 hover:text-slate-600">
                <X size={24} />
              </button>
            </div>
            
            {!editingItem && (
              <div className="px-6 pt-4">
                <label className="block text-sm font-bold text-slate-700 mb-1">既存カードから呼び出し（別カテゴリへの別レアリティ追加に便利）</label>
                <div className="relative">
                  <div className="flex items-center gap-2 bg-slate-100 px-3 py-2 rounded-lg focus-within:ring-2 focus-within:ring-cyan-400 transition-all">
                    <Search size={16} className="text-slate-400 shrink-0" />
                    <input
                      type="text"
                      placeholder="カード名・型番で検索..."
                      className="bg-transparent border-none outline-none w-full text-sm text-slate-700 placeholder-slate-400"
                      value={cardSearchKeyword}
                      onChange={(e) => setCardSearchKeyword(e.target.value)}
                    />
                    {isCardSearching && <LoaderCircle size={14} className="animate-spin text-slate-400 shrink-0" />}
                  </div>
                  {visibleCardSearchResults.length > 0 && (
                    <div className="absolute top-full left-0 right-0 mt-1 bg-white border border-slate-200 rounded-lg shadow-xl z-10 max-h-56 overflow-y-auto">
                      {visibleCardSearchResults.map(result => (
                        <button
                          type="button"
                          key={result.id}
                          onClick={() => selectSearchedCard(result)}
                          className="w-full text-left px-3 py-2 hover:bg-cyan-50 border-b border-slate-50 last:border-b-0"
                        >
                          <div className="font-bold text-sm text-slate-800">{result.name}</div>
                          <div className="text-xs text-slate-400 flex items-center gap-2">
                            <span className="font-mono">{result.cardId}</span>
                            <span>{result.rarity}</span>
                            <span>{result.category}</span>
                          </div>
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            )}

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
                  onClick={onClose}
                  className="px-4 py-2 text-slate-600 hover:bg-slate-100 rounded-lg font-medium"
                >
                  キャンセル
                </button>
                <button
                  type="submit"
                  disabled={isLoading}
                  className="px-6 py-2 bg-cyan-600 hover:bg-cyan-700 text-white rounded-lg font-bold flex items-center gap-2 disabled:opacity-50"
                >
                  {isLoading ? <LoaderCircle className="animate-spin" size={18} /> : <Save size={18} />}
                  {editingItem ? '更新する' : '登録する'}
                </button>
              </div>
            </form>
          </div>
        </div>
  );
};
