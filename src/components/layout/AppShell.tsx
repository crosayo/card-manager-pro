'use client';

import React, { useState } from 'react';
import { Database, Menu } from 'lucide-react';
import { Sidebar } from './Sidebar';
import { ToastContainer } from '../ui/Toast';
import { useAppContext } from '@/context/AppContext';

export const AppShell = ({ children }: { children: React.ReactNode }) => {
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);
  const { isAdmin, handleLoginToggle, isLoading, toasts, removeToast, products } = useAppContext();

  return (
    <div className="flex min-h-screen bg-slate-100 text-slate-800 font-sans">
      <ToastContainer toasts={toasts} removeToast={removeToast} />

      <div className="md:hidden fixed top-0 left-0 right-0 h-16 bg-slate-900 z-20 flex items-center justify-between px-4 shadow-md">
         <div className="flex items-center gap-2 text-cyan-400 font-bold">
           <Database size={20} />
           <span>Card Manager</span>
         </div>
         <button onClick={() => setIsMobileMenuOpen(true)} className="text-white p-2">
           <Menu size={24} />
         </button>
      </div>

      <Sidebar 
        isMobileMenuOpen={isMobileMenuOpen}
        setIsMobileMenuOpen={setIsMobileMenuOpen}
        products={products}
        isAdmin={isAdmin}
        handleLoginToggle={handleLoginToggle}
        isLoading={isLoading}
      />

      <div className="md:ml-64 flex-1 relative pt-16 md:pt-0">
        {children}
      </div>
    </div>
  );
};