'use client';

import React, { useState, useEffect, useCallback } from 'react';
import { ShoppingCart, Minus, Plus, X } from 'lucide-react';
import { useCart } from '@/context/CartContext';

// カートに入れる対象（カードまたはサプライ）。maxStock は「在庫 − 受付中枚数」など、選べる上限
export interface QuantityTarget {
  itemId?: number;
  supplyId?: number;
  name: string;
  maxStock: number;
}

interface QuantityDialogProps {
  target: QuantityTarget | null;
  quantity: number;
  setQuantity: (quantity: number) => void;
  isUpdate: boolean;  // すでにカートにある場合は枚数の変更
  onConfirm: () => void;
  onCancel: () => void;
}

export const QuantityDialog: React.FC<QuantityDialogProps> = ({
  target,
  quantity,
  setQuantity,
  isUpdate,
  onConfirm,
  onCancel,
}) => {
  useEffect(() => {
    if (!target) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onCancel();
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [target, onCancel]);

  if (!target) return null;

  const max = Math.max(1, target.maxStock);
  const clamp = (n: number) => Math.min(max, Math.max(1, Math.floor(n) || 1));

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4" role="dialog" aria-modal="true" aria-labelledby="quantity-title" onClick={onCancel}>
      <form
        className="bg-white rounded-xl shadow-xl max-w-sm w-full border border-slate-200"
        onClick={(e) => e.stopPropagation()}
        onSubmit={(e) => { e.preventDefault(); onConfirm(); }}
      >
        <div className="flex items-center justify-between p-4 border-b border-slate-100">
          <div className="flex items-center gap-3 min-w-0">
            <ShoppingCart className="text-cyan-500 shrink-0" size={20} />
            <h3 id="quantity-title" className="font-bold text-slate-800">{isUpdate ? 'カートの枚数を変更' : '枚数を選んでカートへ'}</h3>
          </div>
          <button type="button" onClick={onCancel} className="text-slate-400 hover:text-slate-600 transition-colors" aria-label="閉じる">
            <X size={18} />
          </button>
        </div>

        <div className="p-4 space-y-4">
          <p className="text-sm text-slate-700 font-bold break-words">{target.name}</p>
          <div className="flex items-center justify-center gap-3">
            <button
              type="button"
              onClick={() => setQuantity(clamp(quantity - 1))}
              disabled={quantity <= 1}
              className="w-10 h-10 flex items-center justify-center rounded-lg bg-slate-100 hover:bg-slate-200 text-slate-600 disabled:opacity-30"
              aria-label="1枚減らす"
            >
              <Minus size={16} />
            </button>
            <input
              type="number"
              inputMode="numeric"
              min={1}
              max={max}
              value={quantity}
              onChange={(e) => setQuantity(clamp(Number(e.target.value)))}
              autoFocus
              onFocus={(e) => e.target.select()}
              className="w-20 text-center text-lg font-bold px-2 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-cyan-300 focus:border-cyan-400 outline-none"
              aria-label="枚数"
            />
            <button
              type="button"
              onClick={() => setQuantity(clamp(quantity + 1))}
              disabled={quantity >= max}
              className="w-10 h-10 flex items-center justify-center rounded-lg bg-slate-100 hover:bg-slate-200 text-slate-600 disabled:opacity-30"
              aria-label="1枚増やす"
            >
              <Plus size={16} />
            </button>
          </div>
          <p className="text-xs text-slate-500 text-center">最大 {max} 枚まで選べます</p>
        </div>

        <div className="flex justify-end gap-2 p-4 border-t border-slate-100">
          <button
            type="button"
            onClick={onCancel}
            className="px-4 py-2 text-sm text-slate-600 bg-slate-100 hover:bg-slate-200 rounded-lg transition-colors"
          >
            キャンセル
          </button>
          <button
            type="submit"
            className="px-4 py-2 text-sm text-white rounded-lg transition-colors bg-cyan-600 hover:bg-cyan-700"
          >
            {isUpdate ? '枚数を変更' : 'カートに追加'}
          </button>
        </div>
      </form>
    </div>
  );
};

// 個数選択ダイアログの開閉とカートへの反映をまとめたフック。
// open(対象) で開き、カートにあればその枚数で開いて変更、なければ1枚から選んで追加する
export const useQuantityDialog = (onDone?: (target: QuantityTarget, quantity: number, isUpdate: boolean) => void) => {
  const { cartItems, addToCart, updateQuantity } = useCart();
  const [target, setTarget] = useState<QuantityTarget | null>(null);
  const [quantity, setQuantity] = useState(1);

  const findIndex = useCallback((t: QuantityTarget) => cartItems.findIndex(c =>
    (t.itemId !== undefined && c.itemId === t.itemId) ||
    (t.supplyId !== undefined && c.supplyId === t.supplyId)
  ), [cartItems]);

  const open = useCallback((t: QuantityTarget) => {
    if (t.maxStock <= 0) return;
    const index = findIndex(t);
    setQuantity(index >= 0 ? Math.min(cartItems[index].quantity, t.maxStock) : 1);
    setTarget(t);
  }, [findIndex, cartItems]);

  const close = useCallback(() => setTarget(null), []);

  const confirm = () => {
    if (!target) return;
    const index = findIndex(target);
    const qty = Math.min(Math.max(1, quantity), target.maxStock);
    if (index >= 0) {
      updateQuantity(index, qty);
    } else {
      addToCart({ itemId: target.itemId, supplyId: target.supplyId, name: target.name, quantity: qty, maxStock: target.maxStock });
    }
    onDone?.(target, qty, index >= 0);
    setTarget(null);
  };

  const dialog = (
    <QuantityDialog
      target={target}
      quantity={quantity}
      setQuantity={setQuantity}
      isUpdate={target ? findIndex(target) >= 0 : false}
      onConfirm={confirm}
      onCancel={close}
    />
  );

  return { open, dialog };
};
