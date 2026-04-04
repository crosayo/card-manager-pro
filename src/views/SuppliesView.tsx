
'use client';

import React, { useState, useEffect, useRef } from 'react';
import { useSearchParams } from 'next/navigation';
import { Package, Plus, Minus, X, Pencil, Trash2, Upload, Loader2, ShoppingCart, ImageOff, CheckCircle } from 'lucide-react';
import { api } from '@/services/api';
import { Supply, SUPPLY_CATEGORY_LABELS } from '@/types';
import { useAppContext } from '@/context/AppContext';
import { useCart } from '@/context/CartContext';
import { ConfirmDialog } from '@/components/ui/ConfirmDialog';

const CATEGORY_ORDER: Supply['category'][] = ['sleeve', 'playmat', 'other'];

interface FormData {
  name: string;
  category: Supply['category'];
  releaseDate: string;
}

const INITIAL_FORM: FormData = { name: '', category: 'sleeve', releaseDate: '' };

export const SuppliesView: React.FC = () => {
  const searchParams = useSearchParams();
  const { isAdmin, addToast } = useAppContext();
  const { cartItems, addToCart } = useCart();

  const [supplies, setSupplies] = useState<Supply[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [sortBy, setSortBy] = useState<'releaseDate' | 'name'>('releaseDate');

  // 追加・編集モーダル
  const [addModalOpen, setAddModalOpen] = useState(false);
  const [editTarget, setEditTarget] = useState<Supply | null>(null);
  const [formData, setFormData] = useState<FormData>(INITIAL_FORM);
  const [isSaving, setIsSaving] = useState(false);

  // 画像アップロード
  const [uploadTarget, setUploadTarget] = useState<Supply | null>(null);
  const [imageFile, setImageFile] = useState<File | null>(null);
  const [imagePreview, setImagePreview] = useState<string | null>(null);
  const [isUploading, setIsUploading] = useState(false);
  const imageInputRef = useRef<HTMLInputElement>(null);
  const editImageInputRef = useRef<HTMLInputElement>(null);

  // 在庫デバウンス（在庫一覧と同じパターン）
  const pendingDeltaRef = useRef<Map<number, number>>(new Map());
  const processingRef = useRef<Set<number>>(new Set());

  // 確認ダイアログ
  const [confirmDialog, setConfirmDialog] = useState<{
    isOpen: boolean; title: string; message: string; variant: 'danger' | 'warning' | 'info';
    onConfirm: () => void;
  }>({ isOpen: false, title: '', message: '', variant: 'warning', onConfirm: () => {} });

  const categoryParam = searchParams.get('category') as Supply['category'] | null;

  useEffect(() => {
    const loadSupplies = async () => {
      setIsLoading(true);
      try {
        const data = await api.fetchSupplies();
        setSupplies(data);
      } catch (e: any) {
        addToast('error', 'データ取得エラー', e.message);
      } finally {
        setIsLoading(false);
      }
    };
    loadSupplies();
  }, [addToast]);

  const sorted = [...supplies].sort((a, b) => {
    if (sortBy === 'releaseDate') {
      const aDate = a.releaseDate ?? '1900-01-01';
      const bDate = b.releaseDate ?? '1900-01-01';
      return bDate.localeCompare(aDate);
    }
    return a.name.localeCompare(b.name, 'ja');
  });

  const grouped = CATEGORY_ORDER.reduce<Record<Supply['category'], Supply[]>>(
    (acc, cat) => { acc[cat] = sorted.filter(s => s.category === cat); return acc; },
    { sleeve: [], playmat: [], other: [] }
  );

  const totalCount = supplies.length;
  const inStockCount = supplies.filter(s => s.stock > 0).length;
  const outOfStockCount = supplies.filter(s => s.stock === 0).length;

  const updateStock = async (id: number, delta: number) => {
    setSupplies(prev => prev.map(s => {
      if (s.id !== id) return s;
      const pending = pendingDeltaRef.current.get(id) ?? 0;
      pendingDeltaRef.current.set(id, pending + delta);
      return { ...s, stock: Math.max(0, s.stock + delta) };
    }));

    if (processingRef.current.has(id)) return;
    processingRef.current.add(id);

    await new Promise(r => setTimeout(r, 100));

    const totalDelta = pendingDeltaRef.current.get(id) ?? 0;
    pendingDeltaRef.current.delete(id);
    processingRef.current.delete(id);
    if (totalDelta === 0) return;

    try {
      const updated = await api.updateSupplyStock(id, totalDelta);
      setSupplies(prev => prev.map(s => s.id === id ? updated : s));
      api.addStockLog({ supplyId: id, delta: totalDelta, stockAfter: updated.stock, source: 'manual' }).catch(() => {});
    } catch (e: any) {
      addToast('error', '在庫更新失敗', e.message);
      api.fetchSupplies().then(setSupplies).catch(() => {});
    }
  };

  const closeModal = () => {
    setAddModalOpen(false);
    setEditTarget(null);
    setFormData(INITIAL_FORM);
    setImageFile(null);
    setImagePreview(null);
  };

  const handleAddSupply = async () => {
    if (!formData.name) return;
    setIsSaving(true);
    try {
      const added = await api.createSupply({
        name: formData.name,
        category: formData.category,
        releaseDate: formData.releaseDate || undefined,
      });
      setSupplies(prev => [...prev, added]);
      setAddModalOpen(false);
      setFormData(INITIAL_FORM);
      addToast('success', '登録完了', `「${added.name}」を追加しました。`);
      // 追加後に画像アップロード促進
      setUploadTarget(added);
      setImageFile(null);
      setImagePreview(null);
    } catch (e: any) {
      addToast('error', '登録失敗', e.message);
    } finally {
      setIsSaving(false);
    }
  };

  const handleEditSupply = async () => {
    if (!editTarget || !formData.name) return;
    setIsSaving(true);
    try {
      const updated = await api.updateSupply(editTarget.id, {
        name: formData.name,
        category: formData.category,
        releaseDate: formData.releaseDate || undefined,
      });
      setSupplies(prev => prev.map(s => s.id === editTarget.id ? { ...updated, imageUrl: s.imageUrl } : s));
      closeModal();
      addToast('success', '更新完了', `「${updated.name}」を更新しました。`);
    } catch (e: any) {
      addToast('error', '更新失敗', e.message);
    } finally {
      setIsSaving(false);
    }
  };

  const handleDeleteSupply = (supply: Supply) => {
    setConfirmDialog({
      isOpen: true,
      title: '削除確認',
      message: `「${supply.name}」を削除しますか？`,
      variant: 'danger',
      onConfirm: async () => {
        setConfirmDialog(prev => ({ ...prev, isOpen: false }));
        try {
          await api.deleteSupply(supply.id);
          setSupplies(prev => prev.filter(s => s.id !== supply.id));
          addToast('info', '削除完了', `「${supply.name}」を削除しました。`);
        } catch (e: any) {
          addToast('error', '削除失敗', e.message);
        }
      }
    });
  };

  const handleImageFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setImageFile(file);
    setImagePreview(URL.createObjectURL(file));
  };

  const handleImageUpload = async (targetId: number) => {
    if (!imageFile) return;
    setIsUploading(true);
    try {
      const url = await api.uploadSupplyImage(targetId, imageFile);
      setSupplies(prev => prev.map(s => s.id === targetId ? { ...s, imageUrl: url } : s));
      addToast('success', 'アップロード完了', '画像をアップロードしました。');
      setUploadTarget(null);
      setImageFile(null);
      setImagePreview(null);
    } catch (e: any) {
      addToast('error', 'アップロード失敗', e.message);
    } finally {
      setIsUploading(false);
    }
  };

  const openEditModal = (supply: Supply) => {
    setEditTarget(supply);
    setFormData({
      name: supply.name,
      category: supply.category,
      releaseDate: supply.releaseDate ?? '',
    });
    setImageFile(null);
    setImagePreview(supply.imageUrl ?? null);
  };

  const isInCart = (supplyId: number) => cartItems.some(c => c.supplyId === supplyId);

  if (isLoading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <Loader2 className="animate-spin text-cyan-600" size={32} />
      </div>
    );
  }

  return (
    <div className="p-4 md:p-8 pb-24 max-w-7xl mx-auto">
      {/* ヘッダー */}
      <div className="flex flex-wrap items-center justify-between gap-4 mb-6">
        <h2 className="text-2xl font-bold text-slate-800 flex items-center gap-2">
          <Package className="text-cyan-600" /> サプライ
        </h2>
        <div className="flex items-center gap-3">
          <div className="flex rounded-lg border border-slate-200 overflow-hidden text-sm">
            <button
              onClick={() => setSortBy('releaseDate')}
              className={`px-3 py-1.5 font-bold transition-colors ${sortBy === 'releaseDate' ? 'bg-cyan-600 text-white' : 'bg-white text-slate-600 hover:bg-slate-50'}`}
            >
              発売日順
            </button>
            <button
              onClick={() => setSortBy('name')}
              className={`px-3 py-1.5 font-bold transition-colors ${sortBy === 'name' ? 'bg-cyan-600 text-white' : 'bg-white text-slate-600 hover:bg-slate-50'}`}
            >
              名前順
            </button>
          </div>
          {isAdmin && (
            <button
              onClick={() => { setFormData(INITIAL_FORM); setAddModalOpen(true); }}
              className="bg-cyan-600 hover:bg-cyan-700 text-white px-4 py-2 rounded-lg font-bold flex items-center gap-2 text-sm"
            >
              <Plus size={16} /> サプライを追加
            </button>
          )}
        </div>
      </div>

      {/* 統計ウィジェット */}
      <div className="grid grid-cols-3 gap-4 mb-8">
        {[
          { label: '登録数', value: totalCount, color: 'text-slate-800' },
          { label: '在庫あり', value: inStockCount, color: 'text-emerald-600' },
          { label: '在庫なし', value: outOfStockCount, color: 'text-rose-600' },
        ].map(({ label, value, color }) => (
          <div key={label} className="bg-white rounded-xl p-4 shadow-sm border border-slate-200 text-center">
            <div className={`text-2xl font-bold ${color}`}>{value}</div>
            <div className="text-xs text-slate-500 mt-1">{label}</div>
          </div>
        ))}
      </div>

      {/* カテゴリセクション */}
      {CATEGORY_ORDER.map(cat => {
        const items = grouped[cat];
        if (items.length === 0 && !isAdmin) return null;
        const isCategoryHighlighted = categoryParam === cat;

        return (
          <div key={cat} id={`section-${cat}`} className="mb-10">
            <h3 className="text-lg font-bold text-slate-700 mb-4 pb-2 border-b border-slate-200 flex items-center gap-2">
              {isCategoryHighlighted && <span className="w-1.5 h-5 bg-cyan-500 rounded-full inline-block" />}
              {SUPPLY_CATEGORY_LABELS[cat]}
              <span className="text-sm font-normal text-slate-400">({items.length}件)</span>
            </h3>
            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-4">
              {items.map(supply => {
                const inCart = isInCart(supply.id);
                return (
                  <div
                    key={supply.id}
                    className={`group bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden transition-all hover:shadow-md ${supply.stock === 0 ? 'opacity-60' : ''}`}
                  >
                    {/* 画像エリア */}
                    <div className="relative aspect-square bg-slate-100">
                      {supply.imageUrl ? (
                        <img src={supply.imageUrl} alt={supply.name} className="w-full h-full object-cover" />
                      ) : (
                        <div className="w-full h-full flex items-center justify-center text-slate-300">
                          <ImageOff size={40} />
                        </div>
                      )}
                      {/* 在庫バッジ */}
                      <div className={`absolute top-2 right-2 px-2 py-0.5 rounded-full text-xs font-bold shadow ${supply.stock === 0 ? 'bg-red-600 text-white' : 'bg-emerald-600 text-white'}`}>
                        {supply.stock === 0 ? '在庫なし' : `${supply.stock}枚`}
                      </div>
                      {/* 管理者ホバーボタン */}
                      {isAdmin && (
                        <div className="absolute top-2 left-2 opacity-0 group-hover:opacity-100 transition-opacity flex gap-1">
                          <button
                            onClick={() => openEditModal(supply)}
                            className="w-7 h-7 bg-white/90 hover:bg-white rounded-md flex items-center justify-center text-slate-600 shadow"
                            title="編集"
                          >
                            <Pencil size={13} />
                          </button>
                          <button
                            onClick={() => handleDeleteSupply(supply)}
                            className="w-7 h-7 bg-white/90 hover:bg-red-50 rounded-md flex items-center justify-center text-slate-600 hover:text-red-600 shadow"
                            title="削除"
                          >
                            <Trash2 size={13} />
                          </button>
                          <button
                            onClick={() => { setUploadTarget(supply); setImageFile(null); setImagePreview(supply.imageUrl ?? null); }}
                            className="w-7 h-7 bg-white/90 hover:bg-blue-50 rounded-md flex items-center justify-center text-slate-600 hover:text-blue-600 shadow"
                            title="画像変更"
                          >
                            <Upload size={13} />
                          </button>
                        </div>
                      )}
                    </div>

                    {/* カード本体 */}
                    <div className="p-3">
                      <div className="font-bold text-slate-800 text-sm truncate mb-2">{supply.name}</div>
                      {isAdmin ? (
                        <div className="flex items-center gap-1 mb-2">
                          <button
                            onClick={() => updateStock(supply.id, -1)}
                            disabled={supply.stock === 0}
                            className="w-7 h-7 flex items-center justify-center rounded bg-slate-100 hover:bg-slate-200 disabled:opacity-30"
                          >
                            <Minus size={12} />
                          </button>
                          <span className="flex-1 text-center text-sm font-bold text-slate-700">{supply.stock}</span>
                          <button
                            onClick={() => updateStock(supply.id, 1)}
                            className="w-7 h-7 flex items-center justify-center rounded bg-slate-100 hover:bg-slate-200"
                          >
                            <Plus size={12} />
                          </button>
                        </div>
                      ) : (
                        <div className="text-sm text-slate-600 mb-2 text-center font-bold">{supply.stock}枚</div>
                      )}
                      {/* リクエストボタン */}
                      <button
                        disabled={supply.stock === 0}
                        onClick={() => {
                          if (inCart) return;
                          addToCart({ supplyId: supply.id, name: supply.name, quantity: 1, maxStock: supply.stock });
                          addToast('success', 'カートに追加', `「${supply.name}」をカートに追加しました。`);
                        }}
                        className={`w-full py-1.5 rounded-lg text-xs font-bold flex items-center justify-center gap-1.5 transition-all ${
                          inCart
                            ? 'bg-emerald-50 text-emerald-600 border border-emerald-200'
                            : supply.stock === 0
                              ? 'bg-slate-100 text-slate-400 cursor-not-allowed'
                              : 'bg-cyan-600 hover:bg-cyan-700 text-white'
                        }`}
                      >
                        {inCart ? (
                          <><CheckCircle size={12} /> 追加済み ✓</>
                        ) : supply.stock === 0 ? (
                          '在庫なし'
                        ) : (
                          <><ShoppingCart size={12} /> リクエストする</>
                        )}
                      </button>
                    </div>
                  </div>
                );
              })}

              {/* 管理者用追加カード */}
              {isAdmin && (
                <button
                  onClick={() => { setFormData({ ...INITIAL_FORM, category: cat }); setAddModalOpen(true); }}
                  className="min-h-[220px] rounded-xl border-2 border-dashed border-slate-200 hover:border-cyan-400 flex flex-col items-center justify-center text-slate-400 hover:text-cyan-600 transition-colors gap-2"
                >
                  <Plus size={24} />
                  <span className="text-sm font-bold">追加</span>
                </button>
              )}
            </div>
          </div>
        );
      })}

      {supplies.length === 0 && (
        <div className="text-center py-20 text-slate-400">
          <Package size={48} className="mx-auto mb-3 opacity-20" />
          <p>サプライはまだ登録されていません</p>
        </div>
      )}

      {/* 追加・編集モーダル */}
      {(addModalOpen || editTarget) && (
        <div className="fixed inset-0 bg-black/60 z-50 flex items-center justify-center p-4 animate-in fade-in duration-200">
          <div className="bg-white rounded-xl shadow-2xl max-w-md w-full">
            <div className="p-4 border-b border-slate-100 flex justify-between items-center bg-slate-50 rounded-t-xl">
              <h3 className="font-bold text-slate-800">{editTarget ? 'サプライ編集' : 'サプライ追加'}</h3>
              <button onClick={closeModal} className="text-slate-400 hover:text-slate-600"><X size={20} /></button>
            </div>
            <div className="p-5 space-y-4">
              <div>
                <label className="block text-sm font-bold text-slate-700 mb-1">名前 <span className="text-red-500">*</span></label>
                <input
                  type="text"
                  value={formData.name}
                  onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                  className="w-full border border-slate-300 rounded px-3 py-2 text-sm focus:ring-2 focus:ring-cyan-500 outline-none"
                  placeholder="例: ブラック 100枚入りスリーブ"
                />
              </div>
              <div>
                <label className="block text-sm font-bold text-slate-700 mb-1">カテゴリ <span className="text-red-500">*</span></label>
                <select
                  value={formData.category}
                  onChange={(e) => setFormData({ ...formData, category: e.target.value as Supply['category'] })}
                  className="w-full border border-slate-300 rounded px-3 py-2 text-sm focus:ring-2 focus:ring-cyan-500 outline-none"
                >
                  {Object.entries(SUPPLY_CATEGORY_LABELS).map(([val, label]) => (
                    <option key={val} value={val}>{label}</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-sm font-bold text-slate-700 mb-1">発売日（任意）</label>
                <input
                  type="date"
                  value={formData.releaseDate}
                  onChange={(e) => setFormData({ ...formData, releaseDate: e.target.value })}
                  className="w-full border border-slate-300 rounded px-3 py-2 text-sm focus:ring-2 focus:ring-cyan-500 outline-none"
                />
              </div>

              {/* 編集時: 画像アップロード */}
              {editTarget && (
                <div>
                  <label className="block text-sm font-bold text-slate-700 mb-1">画像</label>
                  {imagePreview && (
                    <img src={imagePreview} alt="プレビュー" className="w-full h-32 object-cover rounded-lg mb-2 border border-slate-200" />
                  )}
                  <div className="flex gap-2">
                    <button
                      type="button"
                      onClick={() => editImageInputRef.current?.click()}
                      className="flex-1 py-2 border-2 border-dashed border-slate-300 hover:border-cyan-400 rounded-lg text-sm text-slate-500 hover:text-cyan-600 transition-colors flex items-center justify-center gap-2"
                    >
                      <Upload size={16} /> 画像を選択
                    </button>
                    {imageFile && (
                      <button
                        type="button"
                        onClick={() => handleImageUpload(editTarget.id)}
                        disabled={isUploading}
                        className="px-3 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg text-sm font-bold flex items-center gap-1 disabled:opacity-50"
                      >
                        {isUploading ? <Loader2 className="animate-spin" size={14} /> : <Upload size={14} />}
                        アップロード
                      </button>
                    )}
                  </div>
                  <input
                    ref={editImageInputRef}
                    type="file"
                    accept="image/jpeg,image/png,image/webp"
                    onChange={handleImageFileChange}
                    className="hidden"
                  />
                </div>
              )}

              <div className="flex gap-3 pt-2">
                <button type="button" onClick={closeModal} className="flex-1 py-2 text-slate-600 hover:bg-slate-100 rounded-lg font-medium">
                  キャンセル
                </button>
                <button
                  type="button"
                  onClick={editTarget ? handleEditSupply : handleAddSupply}
                  disabled={isSaving || !formData.name}
                  className="flex-1 bg-cyan-600 hover:bg-cyan-700 text-white py-2 rounded-lg font-bold flex items-center justify-center gap-2 disabled:opacity-50"
                >
                  {isSaving && <Loader2 className="animate-spin" size={16} />}
                  {editTarget ? '更新' : '追加'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* 追加後の画像アップロードモーダル */}
      {uploadTarget && !editTarget && (
        <div className="fixed inset-0 bg-black/60 z-50 flex items-center justify-center p-4 animate-in fade-in duration-200">
          <div className="bg-white rounded-xl shadow-2xl max-w-sm w-full">
            <div className="p-4 border-b border-slate-100 flex justify-between items-center bg-slate-50 rounded-t-xl">
              <h3 className="font-bold text-slate-800">画像のアップロード</h3>
              <button onClick={() => { setUploadTarget(null); setImageFile(null); setImagePreview(null); }} className="text-slate-400 hover:text-slate-600">
                <X size={20} />
              </button>
            </div>
            <div className="p-5 space-y-4">
              <p className="text-sm text-slate-600">「{uploadTarget.name}」の画像をアップロードしてください。</p>
              {imagePreview && (
                <img src={imagePreview} alt="プレビュー" className="w-full h-40 object-cover rounded-lg border border-slate-200" />
              )}
              <div className="flex gap-2">
                <button
                  onClick={() => imageInputRef.current?.click()}
                  className="flex-1 py-2 border-2 border-dashed border-slate-300 hover:border-cyan-400 rounded-lg text-sm text-slate-500 hover:text-cyan-600 transition-colors flex items-center justify-center gap-2"
                >
                  <Upload size={16} /> 画像を選択
                </button>
                {imageFile && (
                  <button
                    onClick={() => handleImageUpload(uploadTarget.id)}
                    disabled={isUploading}
                    className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg text-sm font-bold flex items-center gap-1 disabled:opacity-50"
                  >
                    {isUploading ? <Loader2 className="animate-spin" size={14} /> : <Upload size={14} />}
                    アップロード
                  </button>
                )}
              </div>
              <input
                ref={imageInputRef}
                type="file"
                accept="image/jpeg,image/png,image/webp"
                onChange={handleImageFileChange}
                className="hidden"
              />
              <button
                onClick={() => { setUploadTarget(null); setImageFile(null); setImagePreview(null); }}
                className="w-full py-2 text-slate-500 hover:bg-slate-100 rounded-lg text-sm transition-colors"
              >
                スキップ
              </button>
            </div>
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
