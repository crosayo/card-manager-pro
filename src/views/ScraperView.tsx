
'use client';

import React, { useState, useEffect } from 'react';
import { Download, Zap, RefreshCw, Check, Loader2, Save, Trash2, Copy, Plus, Database, ArrowRight, Bookmark, AlertTriangle, ArrowRightCircle } from 'lucide-react';
import { AppError, ToastType, Item } from '../types';
import { api } from '../services/api';
import { useAppContext } from '../context/AppContext';
import { normalizeCardName } from '../utils';

interface ScraperViewProps {
  isLoading: boolean;
  addToast: (type: ToastType['type'], title: string, message?: string, errorDetail?: AppError) => void;
}

// 内部管理用の型定義（ユニークキー用）
interface ScrapedItem extends Omit<Item, 'id' | 'updatedAt'> {
  _tempId: string;
}

// 競合解決用の型
type ResolutionType = 'merge' | 'overwrite' | 'skip';
interface ConflictItem {
  tempId: string;
  newItem: ScrapedItem;
  existingItem: Item;
  resolution: ResolutionType;
}

// 最新パックのプリセット（構築用）
const PRESET_PACKS = [
  { name: 'SUPREME DARKNESS (2024)', url: 'https://yugioh-wiki.net/index.php?SUPREME%20DARKNESS' },
  { name: 'RAGE OF THE ABYSS (2024)', url: 'https://yugioh-wiki.net/index.php?RAGE%20OF%20THE%20ABYSS' },
  { name: 'INFINITE FORBIDDEN (2024)', url: 'https://yugioh-wiki.net/index.php?THE%20INFINITE%20FORBIDDEN' },
  { name: 'LEGACY OF DESTRUCTION (2024)', url: 'https://yugioh-wiki.net/index.php?LEGACY%20OF%20DESTRUCTION' },
  { name: 'PHANTOM NIGHTMARE (2023)', url: 'https://yugioh-wiki.net/index.php?PHANTOM%20NIGHTMARE' },
  { name: 'QUARTER CENTURY CHRONICLE side:PRIDE', url: 'https://yugioh-wiki.net/index.php?QUARTER%20CENTURY%20CHRONICLE%20side%3APRIDE' },
  { name: 'QUARTER CENTURY CHRONICLE side:UNITY', url: 'https://yugioh-wiki.net/index.php?QUARTER%20CENTURY%20CHRONICLE%20side%3AUNITY' },
];

export const ScraperView: React.FC<ScraperViewProps> = ({ isLoading: globalIsLoading, addToast }) => {
  const { products, refreshProducts, rarities } = useAppContext();
  const [url, setUrl] = useState("");
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  
  const [scrapedItems, setScrapedItems] = useState<ScrapedItem[]>([]);
  const [importStatus, setImportStatus] = useState<'idle' | 'importing' | 'done'>('idle');
  
  // パック情報の管理
  const [productMode, setProductMode] = useState<'existing' | 'new'>('existing');
  const [selectedProductId, setSelectedProductId] = useState("");
  const [newProductData, setNewProductData] = useState({
    name: '', 
    releaseDate: new Date().toISOString().split('T')[0]
  });

  // 競合解決モーダルの状態
  const [isConflictModalOpen, setIsConflictModalOpen] = useState(false);
  const [conflicts, setConflicts] = useState<ConflictItem[]>([]);
  const [safeItems, setSafeItems] = useState<ScrapedItem[]>([]);
  const [isProcessingConflicts, setIsProcessingConflicts] = useState(false);

  const loadPreset = (presetUrl: string) => {
    setUrl(presetUrl);
    addToast('info', 'URLセット', 'プリセットURLをセットしました。「解析実行」ボタンを押してください。');
  };

  const analyzeUrl = async () => {
    if (!url) {
      addToast('error', 'URL未入力', 'WikiのURLを入力するか、プリセットから選択してください。');
      return;
    }

    setIsAnalyzing(true);
    setScrapedItems([]);
    setImportStatus('idle');

    try {
      const response = await fetch('/api/scrape', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ url })
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.details || data.error || '解析に失敗しました');
      }

      if (data.items && Array.isArray(data.items)) {
        // 一時IDを付与 + 即座に正規化して表示
        const itemsWithIds: ScrapedItem[] = data.items.map((item: any) => ({
          name: normalizeCardName(item.name || ''),
          cardId: normalizeCardName(item.cardId || ''),
          rarity: item.rarity || 'N',
          stock: item.stock || 0,
          category: item.category || '',
          _tempId: crypto.randomUUID ? crypto.randomUUID() : Math.random().toString(36).substring(2)
        }));

        setScrapedItems(itemsWithIds);
        
        // パック名の自動判別とフォーム入力
        if (itemsWithIds.length > 0 && itemsWithIds[0].category) {
           const scrapedCategory = itemsWithIds[0].category;
           const match = products.find(p => p.name === scrapedCategory);
           
           if (match) {
             setProductMode('existing');
             setSelectedProductId(match.id);
             addToast('success', '解析完了', `${itemsWithIds.length}件取得。既存のパック「${match.name}」と一致しました。`);
           } else {
             setProductMode('new');
             setNewProductData(prev => ({ 
               ...prev, 
               name: scrapedCategory 
             }));
             addToast('success', '解析完了', `${itemsWithIds.length}件取得。新規パックとして登録準備ができました。`);
           }
        } else {
            addToast('success', '解析完了', `${itemsWithIds.length}件のカード情報が見つかりました。`);
        }

      } else {
        throw new Error('有効なデータが見つかりませんでした');
      }

    } catch (e: any) {
      addToast('error', 'Wiki解析エラー', e.message, {
        code: 'SCRAPE_ERROR',
        message: e.message,
        timestamp: new Date().toLocaleString()
      });
    } finally {
      setIsAnalyzing(false);
    }
  };

  const prepareImport = async () => {
    if (scrapedItems.length === 0) return;
    
    if (productMode === 'existing' && !selectedProductId) {
      addToast('error', 'エラー', '登録先のパックを選択してください');
      return;
    }
    if (productMode === 'new' && (!newProductData.name || !newProductData.releaseDate)) {
       addToast('error', 'エラー', '新規パック名と発売日を入力してください');
       return;
    }

    setImportStatus('importing');
    
    // 既存データ取得して重複チェック (バックアップ用APIを流用して全件取得)
    try {
      const allExistingItems = await api.fetchAllItemsForBackup();
      
      const conflictList: ConflictItem[] = [];
      const safeList: ScrapedItem[] = [];

      for (const newItem of scrapedItems) {
        // カード名と型番が一致するものを探す（レアリティは一旦不問にするか、レアリティも含めるか。
        // 要件：①同じカード名で型番が同じものがあるかチェック（レアリティ不問）
        const match = allExistingItems.find(
          existing => 
            normalizeCardName(existing.name) === normalizeCardName(newItem.name) && 
            normalizeCardName(existing.cardId) === normalizeCardName(newItem.cardId) &&
            existing.rarity === newItem.rarity // レアリティも一致しないと「別のカード」として扱えない（例えばURとSEは別物）
        );

        if (match) {
          conflictList.push({
            tempId: newItem._tempId,
            newItem,
            existingItem: match,
            resolution: 'merge' // デフォルトは在庫追加
          });
        } else {
          safeList.push(newItem);
        }
      }

      setConflicts(conflictList);
      setSafeItems(safeList);

      if (conflictList.length > 0) {
        setIsConflictModalOpen(true);
        setImportStatus('idle'); // モーダル待ち状態へ
      } else {
        // 競合なしなら即実行
        executeImport(safeList, []);
      }

    } catch (e: any) {
       addToast('error', 'チェック失敗', e.message);
       setImportStatus('idle');
    }
  };

  const executeImport = async (safes: ScrapedItem[], resolvedConflicts: ConflictItem[]) => {
    setImportStatus('importing');
    try {
      let categoryName = "";

      if (productMode === 'new') {
        const newProduct = await api.addProduct({
          name: newProductData.name,
          releaseDate: newProductData.releaseDate,
          isSidebarVisible: true
        });
        categoryName = newProduct.name;
        await refreshProducts();
        addToast('success', '製品登録', `新製品「${newProduct.name}」をマスタに追加しました`);
      } else {
        const p = products.find(p => p.id === selectedProductId);
        categoryName = p ? p.name : "";
      }

      if (!categoryName) throw new Error("カテゴリの決定に失敗しました");

      let count = 0;

      // 1. 安全なアイテムの新規登録
      for (const item of safes) {
        await api.addItem({
            name: normalizeCardName(item.name),
            cardId: normalizeCardName(item.cardId),
            rarity: item.rarity,
            stock: item.stock,
            category: categoryName
        });
        count++;
      }

      // 2. 競合アイテムの処理
      for (const conf of resolvedConflicts) {
        if (conf.resolution === 'skip') continue;

        if (conf.resolution === 'merge') {
          // 在庫加算
          if (conf.newItem.stock > 0) {
             await api.updateStock(conf.existingItem.id, conf.newItem.stock);
             count++;
          }
        } else if (conf.resolution === 'overwrite') {
          // 上書き (名前やカテゴリ情報の更新)
          await api.updateItem(conf.existingItem.id, {
            name: normalizeCardName(conf.newItem.name),
            stock: conf.newItem.stock, // 在庫もWikiの値で上書き
            category: categoryName // カテゴリも選択中のパックに更新
          });
          count++;
        }
      }
      
      addToast('success', 'インポート完了', `${count}件のデータを処理しました。`);
      setImportStatus('done');
      setIsConflictModalOpen(false);

    } catch (e: any) {
      addToast('error', 'インポート失敗', `処理中にエラーが発生しました: ${e.message}`);
      setImportStatus('idle');
    }
  };

  const handleConflictResolutionChange = (tempId: string, resolution: ResolutionType) => {
    setConflicts(prev => prev.map(c => c.tempId === tempId ? { ...c, resolution } : c));
  };

  const applyResolutionToAll = (resolution: ResolutionType) => {
    setConflicts(prev => prev.map(c => ({ ...c, resolution })));
  };

  const confirmConflicts = () => {
    executeImport(safeItems, conflicts);
  };

  // IDベースでの更新（indexベースより確実）
  const updateItem = (id: string, field: keyof ScrapedItem, value: any) => {
    setScrapedItems(prev => prev.map(item => 
      item._tempId === id ? { ...item, [field]: value } : item
    ));
  };

  const removeItem = (id: string) => {
    setScrapedItems(prev => prev.filter(item => item._tempId !== id));
  };

  const duplicateItem = (index: number) => {
    setScrapedItems(prev => {
      const newItems = [...prev];
      const source = newItems[index];
      const newItem = { 
        ...source,
        _tempId: crypto.randomUUID ? crypto.randomUUID() : Math.random().toString(36).substring(2)
      };
      newItems.splice(index + 1, 0, newItem);
      return newItems;
    });
  };

  const addNewRow = () => {
    setScrapedItems(prev => [...prev, { 
      name: '', 
      cardId: '', 
      rarity: 'N', 
      stock: 0, 
      category: '',
      _tempId: crypto.randomUUID ? crypto.randomUUID() : Math.random().toString(36).substring(2)
    }]);
  };

  const sortedProducts = [...products].sort((a, b) => new Date(b.releaseDate).getTime() - new Date(a.releaseDate).getTime());

  return (
    <div className="p-4 md:p-8 max-w-6xl mx-auto pb-24">
      <h2 className="text-2xl font-bold text-slate-800 mb-6 flex items-center gap-2">
        <Download /> Wiki取込 (Gemini Powered)
      </h2>
      
      <div className="bg-white p-6 rounded-xl shadow-sm border border-slate-200 mb-8">
        <div className="bg-blue-50 border-l-4 border-blue-500 p-4 mb-6 text-sm text-blue-800">
           <div className="font-bold mb-1 flex items-center gap-2"><Zap size={16}/> Gemini 3 Flash</div>
           <p>WikiのURLからカードリストを解析します。解析後は下部のリストで直接編集が可能です。</p>
        </div>

        <label className="block text-sm font-bold text-slate-700 mb-2">Wiki URL</label>
        <div className="flex flex-col md:flex-row gap-2 mb-4">
          <input 
            type="text" 
            value={url}
            onChange={(e) => setUrl(e.target.value)}
            className="flex-1 border border-slate-300 rounded px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-cyan-500 font-mono text-slate-600"
            placeholder="https://yugioh-wiki.net/index.php?..."
          />
          <button 
            onClick={analyzeUrl}
            disabled={isAnalyzing || globalIsLoading}
            className="bg-cyan-600 text-white px-6 py-2 rounded-lg font-bold hover:bg-cyan-700 flex items-center justify-center gap-2 disabled:opacity-50 min-w-[140px]"
          >
            {isAnalyzing ? <Loader2 className="animate-spin" size={18} /> : <RefreshCw size={18} />}
            {isAnalyzing ? '解析中...' : '解析実行'}
          </button>
        </div>

        {/* プリセットボタン */}
        <div className="border-t border-slate-100 pt-4">
          <div className="text-xs font-bold text-slate-500 mb-2 flex items-center gap-1">
            <Bookmark size={12} /> 主要パックのプリセット (クリックでURLセット)
          </div>
          <div className="flex flex-wrap gap-2">
            {PRESET_PACKS.map((pack) => (
              <button
                key={pack.name}
                onClick={() => loadPreset(pack.url)}
                disabled={isAnalyzing}
                className="text-xs px-3 py-1.5 bg-slate-50 hover:bg-cyan-50 text-slate-600 hover:text-cyan-700 border border-slate-200 rounded-full transition-colors whitespace-nowrap"
              >
                {pack.name}
              </button>
            ))}
          </div>
        </div>
      </div>

      {scrapedItems.length > 0 && (
        <div className="animate-in fade-in slide-in-from-bottom-4 duration-500 space-y-6">
          
          <div className="bg-slate-800 text-white p-6 rounded-xl shadow-lg border border-slate-700">
            <h3 className="font-bold text-lg mb-4 flex items-center gap-2 text-cyan-400">
              <Database size={20} /> 登録先パックの設定
            </h3>
            
            <div className="flex flex-col md:flex-row gap-6">
              <div className="flex-1">
                <div className="flex gap-4 mb-3 text-sm">
                  <label className="flex items-center gap-2 cursor-pointer">
                    <input 
                      type="radio" 
                      checked={productMode === 'existing'} 
                      onChange={() => setProductMode('existing')}
                      className="text-cyan-500 focus:ring-cyan-500 accent-cyan-500"
                    />
                    <span>既存のパックに追加</span>
                  </label>
                  <label className="flex items-center gap-2 cursor-pointer">
                    <input 
                      type="radio" 
                      checked={productMode === 'new'} 
                      onChange={() => setProductMode('new')}
                      className="text-cyan-500 focus:ring-cyan-500 accent-cyan-500"
                    />
                    <span>新しいパックを作成</span>
                  </label>
                </div>

                {productMode === 'existing' ? (
                  <select
                    value={selectedProductId}
                    onChange={(e) => setSelectedProductId(e.target.value)}
                    className="w-full bg-slate-700 border border-slate-600 rounded px-3 py-2 text-white focus:outline-none focus:ring-2 focus:ring-cyan-500"
                  >
                    <option value="">-- パックを選択してください --</option>
                    {sortedProducts.map(p => (
                      <option key={p.id} value={p.id}>
                        {p.name} ({p.releaseDate})
                      </option>
                    ))}
                  </select>
                ) : (
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                    <div>
                      <label className="block text-xs text-slate-400 mb-1">パック名 (正式名称)</label>
                      <input 
                        type="text"
                        value={newProductData.name}
                        onChange={(e) => setNewProductData({...newProductData, name: e.target.value})}
                        className="w-full bg-slate-700 border border-slate-600 rounded px-3 py-2 text-white focus:outline-none focus:ring-2 focus:ring-cyan-500"
                      />
                    </div>
                    <div>
                      <label className="block text-xs text-slate-400 mb-1">発売日</label>
                      <input 
                        type="date"
                        value={newProductData.releaseDate}
                        onChange={(e) => setNewProductData({...newProductData, releaseDate: e.target.value})}
                        className="w-full bg-slate-700 border border-slate-600 rounded px-3 py-2 text-white focus:outline-none focus:ring-2 focus:ring-cyan-500"
                      />
                    </div>
                  </div>
                )}
              </div>

              <div className="flex items-end">
                 <button 
                   onClick={prepareImport}
                   disabled={importStatus !== 'idle'}
                   className={`
                     w-full md:w-auto flex items-center justify-center gap-2 px-6 py-3 rounded-lg font-bold text-white transition-all shadow-md
                     ${importStatus === 'done' ? 'bg-green-600' : 'bg-cyan-600 hover:bg-cyan-500'}
                     disabled:opacity-50 disabled:cursor-not-allowed
                   `}
                 >
                   {importStatus === 'importing' ? <Loader2 className="animate-spin" size={20} /> : 
                    importStatus === 'done' ? <Check size={20} /> : <Save size={20} />}
                   {importStatus === 'importing' ? 'チェック中...' : 
                    importStatus === 'done' ? '保存完了' : '確定して在庫登録'}
                 </button>
              </div>
            </div>
          </div>

          <div className="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden">
            <div className="p-4 border-b border-slate-200 bg-slate-50 flex justify-between items-center">
              <h4 className="font-bold text-slate-700">解析結果詳細 ({scrapedItems.length}件)</h4>
              <div className="text-xs text-slate-500">
                リストの内容は直接編集可能です。
              </div>
            </div>
            
            <div className="overflow-x-auto">
              <table className="w-full text-left text-sm whitespace-nowrap">
                <thead className="bg-slate-100 text-slate-500 font-medium border-b border-slate-200">
                  <tr>
                    <th className="p-3 w-12 text-center">#</th>
                    <th className="p-3 w-32">型番</th>
                    <th className="p-3 min-w-[200px]">カード名</th>
                    <th className="p-3 w-28">レアリティ</th>
                    <th className="p-3 w-24">在庫</th>
                    <th className="p-3 w-24 text-center">操作</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {scrapedItems.map((item, idx) => (
                    <tr key={item._tempId} className="hover:bg-slate-50 transition-colors">
                      <td className="p-3 text-center text-slate-400 font-mono text-xs">{idx + 1}</td>
                      <td className="p-2">
                        <input 
                          type="text" 
                          value={item.cardId}
                          onChange={(e) => updateItem(item._tempId, 'cardId', e.target.value)}
                          className="w-full bg-white border border-slate-200 focus:border-cyan-500 rounded px-2 py-1 outline-none font-mono text-slate-600 transition-all shadow-sm focus:shadow"
                        />
                      </td>
                      <td className="p-2">
                        <input 
                          type="text" 
                          value={item.name}
                          onChange={(e) => updateItem(item._tempId, 'name', e.target.value)}
                          className="w-full bg-white border border-slate-200 focus:border-cyan-500 rounded px-2 py-1 outline-none font-bold text-slate-800 transition-all shadow-sm focus:shadow"
                        />
                      </td>
                      <td className="p-2">
                        <select 
                          value={item.rarity}
                          onChange={(e) => updateItem(item._tempId, 'rarity', e.target.value)}
                          className="w-full bg-white border border-slate-200 focus:border-cyan-500 rounded px-2 py-1 outline-none cursor-pointer shadow-sm"
                        >
                          {rarities.map(r => ( // Contextのraritiesを使用
                            <option key={r} value={r}>{r}</option>
                          ))}
                        </select>
                      </td>
                      <td className="p-2">
                         <input 
                          type="number" 
                          min="0"
                          value={item.stock}
                          onChange={(e) => updateItem(item._tempId, 'stock', parseInt(e.target.value) || 0)}
                          className="w-full bg-white border border-slate-200 focus:border-cyan-500 rounded px-2 py-1 outline-none text-right font-mono shadow-sm"
                        />
                      </td>
                      <td className="p-2 text-center">
                        <div className="flex items-center justify-center gap-1">
                          <button 
                            type="button"
                            onClick={() => duplicateItem(idx)}
                            className="p-2 text-slate-400 hover:text-blue-600 hover:bg-blue-50 rounded transition-colors"
                            title="複製"
                          >
                            <Copy size={16} />
                          </button>
                          <button 
                            type="button"
                            onClick={() => removeItem(item._tempId)}
                            className="p-2 text-slate-400 hover:text-red-600 hover:bg-red-50 rounded transition-colors"
                            title="削除"
                          >
                            <Trash2 size={16} />
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            
            <div className="p-2 border-t border-slate-200 bg-slate-50">
              <button 
                onClick={addNewRow}
                className="w-full py-2 flex items-center justify-center gap-2 text-slate-500 hover:text-cyan-600 hover:bg-slate-100 rounded-lg border border-dashed border-slate-300 hover:border-cyan-300 transition-all"
              >
                <Plus size={16} /> 空の行を追加
              </button>
            </div>
          </div>
        </div>
      )}

      {/* 競合解決モーダル */}
      {isConflictModalOpen && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-xl shadow-2xl w-full max-w-4xl max-h-[90vh] flex flex-col">
            <div className="p-6 border-b border-slate-200 flex justify-between items-center bg-slate-50 rounded-t-xl">
              <div className="flex items-center gap-3">
                 <div className="bg-amber-100 p-2 rounded-full text-amber-600">
                    <AlertTriangle size={24} />
                 </div>
                 <div>
                   <h3 className="text-xl font-bold text-slate-800">重複データが見つかりました</h3>
                   <p className="text-sm text-slate-500">データベースに既に存在するカードが {conflicts.length} 件あります。</p>
                 </div>
              </div>
            </div>

            <div className="flex-1 overflow-y-auto p-6 bg-slate-50/50">
               <div className="flex justify-end gap-2 mb-4">
                  <span className="text-xs font-bold text-slate-500 self-center mr-2">一括設定:</span>
                  <button onClick={() => applyResolutionToAll('merge')} className="text-xs px-3 py-1 bg-green-100 text-green-700 rounded-full font-bold hover:bg-green-200">在庫を追加 (すべて)</button>
                  <button onClick={() => applyResolutionToAll('overwrite')} className="text-xs px-3 py-1 bg-blue-100 text-blue-700 rounded-full font-bold hover:bg-blue-200">上書き (すべて)</button>
                  <button onClick={() => applyResolutionToAll('skip')} className="text-xs px-3 py-1 bg-slate-200 text-slate-600 rounded-full font-bold hover:bg-slate-300">スキップ (すべて)</button>
               </div>

               <div className="space-y-3">
                 {conflicts.map((conf, idx) => (
                   <div key={conf.tempId} className="bg-white p-4 rounded-lg shadow-sm border border-slate-200 flex flex-col md:flex-row items-center gap-4">
                      <div className="flex-1 min-w-0">
                         <div className="flex items-center gap-2 mb-1">
                            <span className="font-bold text-slate-800">{conf.newItem.name}</span>
                            <span className="text-xs font-mono bg-slate-100 px-1.5 py-0.5 rounded text-slate-500">{conf.newItem.cardId}</span>
                            <span className="text-xs font-bold border px-1.5 py-0.5 rounded bg-slate-50 text-slate-600">{conf.newItem.rarity}</span>
                         </div>
                         <div className="text-xs text-slate-500 flex items-center gap-4">
                            <span>現在庫: <b>{conf.existingItem.stock}</b></span>
                            <ArrowRight size={12} />
                            <span>Wiki在庫: <b>{conf.newItem.stock}</b></span>
                         </div>
                      </div>

                      <div className="flex items-center gap-2 bg-slate-50 p-1.5 rounded-lg border border-slate-100">
                         <label className={`
                           cursor-pointer px-3 py-1.5 rounded-md text-sm font-bold transition-colors flex items-center gap-1
                           ${conf.resolution === 'merge' ? 'bg-green-600 text-white shadow-sm' : 'text-slate-500 hover:bg-white'}
                         `}>
                           <input type="radio" name={`res-${idx}`} className="hidden" checked={conf.resolution === 'merge'} onChange={() => handleConflictResolutionChange(conf.tempId, 'merge')} />
                           <span>在庫追加</span>
                         </label>

                         <label className={`
                           cursor-pointer px-3 py-1.5 rounded-md text-sm font-bold transition-colors flex items-center gap-1
                           ${conf.resolution === 'overwrite' ? 'bg-blue-600 text-white shadow-sm' : 'text-slate-500 hover:bg-white'}
                         `}>
                           <input type="radio" name={`res-${idx}`} className="hidden" checked={conf.resolution === 'overwrite'} onChange={() => handleConflictResolutionChange(conf.tempId, 'overwrite')} />
                           <span>上書き</span>
                         </label>

                         <label className={`
                           cursor-pointer px-3 py-1.5 rounded-md text-sm font-bold transition-colors flex items-center gap-1
                           ${conf.resolution === 'skip' ? 'bg-slate-600 text-white shadow-sm' : 'text-slate-500 hover:bg-white'}
                         `}>
                           <input type="radio" name={`res-${idx}`} className="hidden" checked={conf.resolution === 'skip'} onChange={() => handleConflictResolutionChange(conf.tempId, 'skip')} />
                           <span>スキップ</span>
                         </label>
                      </div>
                   </div>
                 ))}
               </div>
            </div>

            <div className="p-6 border-t border-slate-200 bg-white rounded-b-xl flex justify-end gap-3">
               <button 
                 onClick={() => setIsConflictModalOpen(false)}
                 className="px-5 py-2.5 text-slate-600 font-bold hover:bg-slate-100 rounded-lg transition-colors"
               >
                 キャンセル
               </button>
               <button 
                 onClick={confirmConflicts}
                 className="px-6 py-2.5 bg-cyan-600 hover:bg-cyan-700 text-white font-bold rounded-lg shadow-md flex items-center gap-2"
               >
                 <Check size={18} />
                 解決してインポートを実行
               </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
