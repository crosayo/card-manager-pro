'use client';

import React from 'react';
import { SettingsView } from '@/views/SettingsView';
import { useAppContext } from '@/context/AppContext';

// 設定画面の本体（クライアント側）。DB 構成 SQL は server component の page.tsx が supabase/schema.sql から読んで渡す
export function SettingsPageClient({ schemaSql }: { schemaSql: string }) {
  const { isAdmin, isLoading, addToast } = useAppContext();
  
  // rarities の状態管理は SettingsView 内部および AppContext で行うため、ここでは不要

  return (
    <SettingsView
      isAdmin={isAdmin}
      schemaSql={schemaSql}
      isLoading={isLoading}
      addToast={addToast}
    />
  );
}
