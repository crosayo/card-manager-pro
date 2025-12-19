
'use client';

import React, { useEffect, useState } from 'react';
import { DashboardView } from '@/views/DashboardView';
import { Loader2 } from 'lucide-react';
import { api } from '@/services/api';

export default function DashboardPage() {
  const [stats, setStats] = useState({
    totalCards: 0,
    totalStock: 0,
    lowStock: 0
  });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const fetchStats = async () => {
      try {
        const data = await api.fetchDashboardStats();
        setStats(data);
      } catch (e: any) {
        console.error("Failed to fetch stats", e);
        setError("データの取得に失敗しました。");
      } finally {
        setLoading(false);
      }
    };
    fetchStats();
  }, []);

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[50vh]">
        <Loader2 className="animate-spin text-cyan-600" size={32} />
      </div>
    );
  }

  if (error) {
    return (
      <div className="p-8 text-center text-red-600 bg-red-50 m-4 rounded-lg border border-red-200">
        <p className="font-bold">{error}</p>
        <p className="text-sm mt-2">システム設定を確認してください。</p>
      </div>
    );
  }

  return <DashboardView stats={stats} />;
}
