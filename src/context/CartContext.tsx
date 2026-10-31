'use client';

import React, { createContext, useContext, useCallback, useSyncExternalStore } from 'react';

export interface CartItem {
  itemId?: number;
  supplyId?: number;
  name: string;
  quantity: number;
  maxStock: number;
}

interface CartContextType {
  cartItems: CartItem[];
  addToCart: (item: CartItem) => void;
  removeFromCart: (index: number) => void;
  updateQuantity: (index: number, quantity: number) => void;
  clearCart: () => void;
  totalCount: number;
}

const CartContext = createContext<CartContextType | undefined>(undefined);

// カートの中身はブラウザ（localStorage）に保存し、再読み込みしても残す。
// localStorage はプライベートブラウズ等で使えない場合があるため、失敗時はメモリ上だけで保持する。
// サーバー描画時は空のカートとして描き、ハイドレーション後に保存内容へ切り替える（useSyncExternalStore）
const STORAGE_KEY = 'card-manager:cart';
const EMPTY: CartItem[] = [];
let cartState: CartItem[] | null = null;  // 未読み込みは null
const listeners = new Set<() => void>();

const isCartItem = (v: unknown): v is CartItem => {
  if (!v || typeof v !== 'object') return false;
  const c = v as Record<string, unknown>;
  return typeof c.name === 'string' && typeof c.quantity === 'number' && c.quantity > 0 &&
    typeof c.maxStock === 'number' && (typeof c.itemId === 'number' || typeof c.supplyId === 'number');
};

const readCart = (): CartItem[] => {
  if (cartState) return cartState;
  try {
    const parsed: unknown = JSON.parse(window.localStorage.getItem(STORAGE_KEY) ?? '[]');
    cartState = Array.isArray(parsed) ? parsed.filter(isCartItem) : [];
  } catch {
    cartState = [];
  }
  return cartState;
};

const writeCart = (next: CartItem[]) => {
  cartState = next;
  try {
    if (next.length === 0) window.localStorage.removeItem(STORAGE_KEY);
    else window.localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
  } catch {
    // 保存できない環境ではメモリ上の値のみ使う
  }
  listeners.forEach(l => l());
};

const subscribe = (listener: () => void) => {
  listeners.add(listener);
  // 別のタブでカートが変わったら、このタブにも反映する
  const onStorage = (e: StorageEvent) => {
    if (e.key !== STORAGE_KEY) return;
    cartState = null;
    listener();
  };
  window.addEventListener('storage', onStorage);
  return () => {
    listeners.delete(listener);
    window.removeEventListener('storage', onStorage);
  };
};

export const CartProvider = ({ children }: { children: React.ReactNode }) => {
  const cartItems = useSyncExternalStore(subscribe, readCart, () => EMPTY);

  const addToCart = useCallback((item: CartItem) => {
    const prev = readCart();
    const existingIndex = prev.findIndex(c =>
      (item.itemId && c.itemId === item.itemId) ||
      (item.supplyId && c.supplyId === item.supplyId)
    );
    if (existingIndex >= 0) {
      const updated = [...prev];
      const newQty = updated[existingIndex].quantity + item.quantity;
      updated[existingIndex] = {
        ...updated[existingIndex],
        quantity: Math.min(newQty, item.maxStock),
      };
      writeCart(updated);
      return;
    }
    writeCart([...prev, item]);
  }, []);

  const removeFromCart = useCallback((index: number) => {
    writeCart(readCart().filter((_, i) => i !== index));
  }, []);

  const updateQuantity = useCallback((index: number, quantity: number) => {
    const updated = [...readCart()];
    if (quantity <= 0) {
      writeCart(updated.filter((_, i) => i !== index));
      return;
    }
    updated[index] = { ...updated[index], quantity: Math.min(quantity, updated[index].maxStock) };
    writeCart(updated);
  }, []);

  const clearCart = useCallback(() => writeCart([]), []);

  const totalCount = cartItems.reduce((sum, item) => sum + item.quantity, 0);

  return (
    <CartContext.Provider value={{ cartItems, addToCart, removeFromCart, updateQuantity, clearCart, totalCount }}>
      {children}
    </CartContext.Provider>
  );
};

export const useCart = () => {
  const ctx = useContext(CartContext);
  if (!ctx) throw new Error('useCart must be used within CartProvider');
  return ctx;
};
