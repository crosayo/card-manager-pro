import React from 'react';
import type { LucideIcon } from 'lucide-react';

// 全ページ共通の外枠。最大幅 7xl の中央寄せで、どのページでも見出しの左端がそろう。
// narrow: 設定などフォーム中心のページ。枠の中で幅 4xl・左寄せにする（左端は他のページと同じ）
export const PageContainer: React.FC<{ narrow?: boolean; children: React.ReactNode }> = ({ narrow, children }) => (
  <div className="p-4 md:p-8 pb-24 max-w-7xl mx-auto">
    {narrow ? <div className="max-w-4xl">{children}</div> : children}
  </div>
);

// 全ページ共通の見出し。左にアイコンとタイトル（＋説明）、右に children（操作ボタンなど）
export const PageHeader: React.FC<{
  icon: LucideIcon;
  title: string;
  description?: React.ReactNode;
  children?: React.ReactNode;
}> = ({ icon: Icon, title, description, children }) => (
  <div className="flex flex-wrap items-center justify-between gap-4 mb-6">
    <div className="min-w-0">
      <h2 className="text-2xl font-bold text-slate-800 flex items-center gap-2">
        <Icon size={24} className="text-cyan-600 shrink-0" />
        {title}
      </h2>
      {description && <div className="mt-1 text-sm text-slate-500">{description}</div>}
    </div>
    {children && <div className="flex flex-wrap items-center gap-2">{children}</div>}
  </div>
);
