
'use client';

import React, { useState, useEffect } from 'react';
import { ScrollText, Loader2, Filter, ExternalLink } from 'lucide-react';
import { StockLog } from '@/types';
import { api } from '@/services/api';
import Link from 'next/link';

const SOURCE_LABELS: Record<StockLog['source'], string> = {
  manual: '手動操作',
  request: 'リクエスト',
  csv: 'CSVインポート',
};

const SOURCE_STYLES: Record<StockLog['source'], string> = {
  manual: 'bg-slate-100 text-slate-600 border-slate-200',
  request: 'bg-cyan-50 text-cyan-700 border-cyan-200',
  csv: 'bg-green-50 text-green-700 border-green-200',
};

export const LogsView: React.FC = () => {
  const [logs, setLogs] = useState<StockLog[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [filterSource, setFilterSource] = useState<StockLog['source'] | 'all'>('all');
  const [itemNames, setItemNames] = useState<Record<number, string>>({});

  useEffect(() => {
    const load = async () => {
      setIsLoading(true);
      try {
        const data = await api.fetchStockLogs(200);
        setLogs(data);
        // アイテム名の取得は在庫一覧から行う（簡略化）
      } catch (e) {
        console.error('ログ取得失敗:', e);
      } finally {
        setIsLoading(false);
      }
    };
    load();
  }, []);

  const filtered = filterSource === 'all'
    ? logs
    : logs.filter(l => l.source === filterSource);

  const formatDate = (iso: string) => {
    const d = new Date(iso);
    return `${d.getFullYear()}/${String(d.getMonth() + 1).padStart(2, '0')}/${String(d.getDate()).padStart(2, '0')} ${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
  };

  return (
    <div className="p-4 md:p-8 pb-20">
      <div className="flex justify-between items-center mb-6">
        <h2 className="text-2xl font-bold text-slate-800 flex items-center gap-2">
          <ScrollText /> 在庫変動ログ
        </h2>
      </div>

      {/* フィルター */}
      <div className="flex gap-2 mb-4 flex-wrap">
        {(['all', 'manual', 'request', 'csv'] as const).map(s => (
          <button
            key={s}
            onClick={() => setFilterSource(s)}
            className={`px-3 py-1.5 rounded-lg text-sm font-bold border transition-colors ${
              filterSource === s
                ? 'bg-cyan-600 text-white border-cyan-600'
                : 'bg-white text-slate-600 border-slate-200 hover:bg-slate-50'
            }`}
          >
            {s === 'all' ? 'すべて' : SOURCE_LABELS[s]}
          </button>
        ))}
      </div>

      {isLoading ? (
        <div className="flex items-center justify-center py-20">
          <Loader2 className="animate-spin text-cyan-600" size={32} />
        </div>
      ) : (
        <div className="bg-white rounded-xl shadow-sm overflow-hidden border border-slate-200">
          <table className="w-full text-left text-sm">
            <thead>
              <tr className="bg-slate-50 border-b border-slate-200 text-slate-500 text-xs uppercase tracking-wider">
                <th className="p-3">日時</th>
                <th className="p-3">対象</th>
                <th className="p-3 text-center">変動</th>
                <th className="p-3 text-center">変動後</th>
                <th className="p-3">種別</th>
                <th className="p-3">メモ</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {filtered.length === 0 ? (
                <tr>
                  <td colSpan={6} className="p-10 text-center text-slate-400">ログがありません</td>
                </tr>
              ) : (
                filtered.map(log => (
                  <tr key={log.id} className="hover:bg-slate-50 transition-colors">
                    <td className="p-3 font-mono text-slate-500 text-xs whitespace-nowrap">{formatDate(log.createdAt)}</td>
                    <td className="p-3 text-slate-700">
                      {log.itemId ? `カード #${log.itemId}` : log.supplyId ? `サプライ #${log.supplyId}` : '-'}
                    </td>
                    <td className="p-3 text-center">
                      <span className={`font-bold text-base ${log.delta > 0 ? 'text-blue-600' : 'text-red-500'}`}>
                        {log.delta > 0 ? `+${log.delta}` : log.delta}
                      </span>
                    </td>
                    <td className="p-3 text-center font-mono text-slate-600">{log.stockAfter}</td>
                    <td className="p-3">
                      <span className={`px-2 py-0.5 rounded text-xs font-bold border ${SOURCE_STYLES[log.source]}`}>
                        {SOURCE_LABELS[log.source]}
                      </span>
                      {log.source === 'request' && (
                        <Link href="/requests" className="ml-2 text-cyan-600 hover:underline inline-flex items-center gap-0.5 text-xs">
                          <ExternalLink size={10} />
                        </Link>
                      )}
                    </td>
                    <td className="p-3 text-slate-500 text-xs">{log.note || '-'}</td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
};
