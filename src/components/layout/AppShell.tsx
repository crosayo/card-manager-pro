'use client';

import React, { useState, Suspense } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { Database, Menu, Loader2, Lock, LogIn, Clock } from 'lucide-react';
import { Sidebar } from './Sidebar';
import { ToastContainer } from '../ui/Toast';
import { CartFloat } from '../ui/CartFloat';
import { useAppContext } from '@/context/AppContext';

const formatExpiry = (iso: string) => {
  const d = new Date(iso);
  return `${d.getMonth() + 1}/${d.getDate()} ${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
};

// 招待制: 未ログインの閲覧者は、有効な招待リンクがある場合だけ画面を表示する
// （データ自体の保護はDB側で行っており、ここは表示の出し分けのみ）
export const AppShell = ({ children }: { children: React.ReactNode }) => {
  const pathname = usePathname();
  const { isAdmin, isAuthReady, inviteStatus, toasts, removeToast } = useAppContext();

  // ログイン画面は常に表示（管理者が招待リンクなしでもログインできるように）
  if (pathname === '/login' || isAdmin) return <MainLayout>{children}</MainLayout>;

  if (!isAuthReady || inviteStatus.state === 'checking') {
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-100">
        <Loader2 className="animate-spin text-cyan-600" size={32} />
      </div>
    );
  }

  if (inviteStatus.state !== 'valid') {
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-100 p-4">
        <ToastContainer toasts={toasts} removeToast={removeToast} />
        <div className="bg-white rounded-xl shadow-sm border border-slate-200 max-w-md w-full p-8 text-center">
          <Lock size={40} className="mx-auto text-slate-400 mb-3" />
          <h1 className="text-lg font-bold text-slate-800 mb-2">招待リンクが必要です</h1>
          <p className="text-sm text-slate-600 mb-1">
            {inviteStatus.state === 'invalid'
              ? 'この招待リンクは有効期限が切れたか、取り消されています。'
              : 'このサイトは招待制です。'}
          </p>
          <p className="text-sm text-slate-600 mb-6">管理者から受け取った招待リンクを開いてください。</p>
          <Link href="/login" className="inline-flex items-center gap-1 text-xs text-slate-400 hover:text-slate-600">
            <LogIn size={12} /> 管理者ログイン
          </Link>
        </div>
      </div>
    );
  }

  return (
    <MainLayout>
      {inviteStatus.expiresAt && (
        <div className="bg-cyan-50 border-b border-cyan-100 text-cyan-800 text-xs px-4 py-1.5 flex items-center gap-1.5">
          <Clock size={12} className="shrink-0" />
          招待リンクで閲覧中（{formatExpiry(inviteStatus.expiresAt)} まで有効）
        </div>
      )}
      {children}
    </MainLayout>
  );
};

const MainLayout = ({ children }: { children: React.ReactNode }) => {
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

      <Suspense fallback={<div className="fixed top-0 left-0 h-screen w-64 bg-slate-900" />}>
        <Sidebar
          isMobileMenuOpen={isMobileMenuOpen}
          setIsMobileMenuOpen={setIsMobileMenuOpen}
          products={products}
          isAdmin={isAdmin}
          handleLoginToggle={handleLoginToggle}
          isLoading={isLoading}
        />
      </Suspense>

      <div className="md:ml-64 flex-1 relative pt-16 md:pt-0">
        {children}
        <CartFloat />
      </div>
    </div>
  );
};