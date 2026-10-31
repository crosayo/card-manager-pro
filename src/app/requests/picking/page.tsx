'use client';

import React, { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useAppContext } from '@/context/AppContext';
import { PickingListView } from '@/views/PickingListView';
import { LoaderCircle } from 'lucide-react';

export default function PickingPage() {
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
        <LoaderCircle className="animate-spin text-cyan-600" size={32} />
      </div>
    );
  }

  return <PickingListView />;
}
