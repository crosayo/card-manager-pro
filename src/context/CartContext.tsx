
'use client';

import React, { createContext, useContext, useState, useCallback } from 'react';

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

export const CartProvider = ({ children }: { children: React.ReactNode }) => {
  const [cartItems, setCartItems] = useState<CartItem[]>([]);

  const addToCart = useCallback((item: CartItem) => {
    setCartItems(prev => {
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
        return updated;
      }
      return [...prev, item];
    });
  }, []);

  const removeFromCart = useCallback((index: number) => {
    setCartItems(prev => prev.filter((_, i) => i !== index));
  }, []);

  const updateQuantity = useCallback((index: number, quantity: number) => {
    setCartItems(prev => {
      const updated = [...prev];
      if (quantity <= 0) {
        return updated.filter((_, i) => i !== index);
      }
      updated[index] = { ...updated[index], quantity: Math.min(quantity, updated[index].maxStock) };
      return updated;
    });
  }, []);

  const clearCart = useCallback(() => setCartItems([]), []);

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
