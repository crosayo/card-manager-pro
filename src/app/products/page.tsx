'use client';

import React from 'react';
import { ProductsView } from '@/views/ProductsView';
import { useAppContext } from '@/context/AppContext';

export default function ProductsPage() {
  const { products } = useAppContext();
  return <ProductsView products={products} />;
}