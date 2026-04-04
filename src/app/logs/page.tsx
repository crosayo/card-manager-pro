
'use client';

import React, { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useAppContext } from '@/context/AppContext';
import { LogsView } from '@/views/LogsView';
import { Loader2 } from 'lucide-react';

export default function LogsPage() {
  const { isAdmin, isLoading } = useAppContext();
  const router = useRouter();

  useEffect(() => {
    if (!isLoading && !isAdmin) {
      router.push('/login');
    }
  }, [isAdmin, isLoading, router]);

  if (isLoading || !isAdmin) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <Loader2 className="animate-spin text-cyan-600" size={32} />
      </div>
    );
  }

  return <LogsView />;
}
