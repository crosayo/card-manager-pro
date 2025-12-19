
'use client';

import React from 'react';
import { SettingsView } from '@/views/SettingsView';
import { useAppContext } from '@/context/AppContext';

export default function SettingsPage() {
  const { isAdmin, isLoading, addToast } = useAppContext();
  
  // rarities の状態管理は SettingsView 内部および AppContext で行うため、ここでは不要

  return (
    <SettingsView
      isAdmin={isAdmin}
      isLoading={isLoading}
      addToast={addToast}
    />
  );
}
