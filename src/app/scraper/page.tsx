'use client';

import React from 'react';
import { ScraperView } from '@/views/ScraperView';
import { useAppContext } from '@/context/AppContext';

export default function ScraperPage() {
  const { isLoading, addToast } = useAppContext();

  return (
    <ScraperView
      isLoading={isLoading}
      addToast={addToast}
    />
  );
}
