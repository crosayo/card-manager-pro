
'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { Loader2 } from 'lucide-react';

export default function RootPage() {
  const router = useRouter();

  useEffect(() => {
    // アクセス時に在庫一覧へリダイレクト
    router.replace('/inventory');
  }, [router]);

  return (
    <div className="flex items-center justify-center min-h-screen bg-slate-100">
      <div className="flex flex-col items-center gap-3 text-slate-500">
        <Loader2 className="animate-spin text-cyan-600" size={32} />
        <p className="text-sm font-bold">Loading...</p>
      </div>
    </div>
  );
}
