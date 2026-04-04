
'use client';

import React, { Suspense } from 'react';
import { Loader2 } from 'lucide-react';
import { RequestsView } from '@/views/RequestsView';

export default function RequestsPage() {
  return (
    <Suspense fallback={
      <div className="flex items-center justify-center min-h-screen">
        <Loader2 className="animate-spin text-cyan-600" size={32} />
      </div>
    }>
      <RequestsView />
    </Suspense>
  );
}
