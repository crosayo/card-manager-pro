
'use client';

import React, { useState, useEffect } from 'react';
import { ScrollText, Loader2, ExternalLink, X } from 'lucide-react';
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

const formatDate = (iso: string) => {
  const d = new Date(iso);
  return `${d.getFullYear()}/${String(d.getMonth() + 1).padStart(2, '0')}/${String(d.getDate()).padStart(2, '0')} ${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
};

const formatDateFull = (iso: string) => {
  const d = new Date(iso);
  return `${d.getFullYear()}年${d.getMonth() + 1}月${d.getDate()}日 ${String(d.getHours()).padStart(2, '0')}時${String(d.getMinutes()).padStart(2, '0')}分${String(d.getSeconds()).padStart(2, '0')}秒`;
};

export const LogsView: React.FC = () => {
  const [logs, setLogs] = useState<StockLog[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [filterSource, setFilterSource] = useState<StockLog['source'] | 'all'>('all');
  const [selectedLog, setSelectedLog] = useState<StockLog | null>(null);

  useEffect(() => {
    const load = async () => {
      setIsLoading(true);
      try {
        const data = await api.fetchStockLogs(200);
        setLogs(data);
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

  const getTargetLabel = (log: StockLog) => {
    if (log.itemName) return log.itemName;
    if (log.supplyName) return log.supplyName;
    if (log.itemId) return `カード #${log.itemId}`;
    if (log.supplyId) return `サプライ #${log.supplyId}`;
    return '-';
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
                <th className="p-3">カード名</th>
                <th className="p-3">型番</th>
                <th className="p-3 text-center">変動</th>
                <th className="p-3 text-center">変動後</th>
                <th className="p-3">種別</th>
                <th className="p-3">メモ</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {filtered.length === 0 ? (
                <tr>
                  <td colSpan={7} className="p-10 text-center text-slate-400">ログがありません</td>
                </tr>
              ) : (
                filtered.map(log => (
                  <tr key={log.id} className="hover:bg-slate-50 transition-colors">
                    <td className="p-3">
                      <button
                        onClick={() => setSelectedLog(log)}
                        className="font-mono text-slate-500 text-xs whitespace-nowrap hover:text-cyan-600 hover:underline cursor-pointer"
                      >
                        {formatDate(log.createdAt)}
                      </button>
                    </td>
                    <td className="p-3 text-slate-700 text-xs max-w-[140px] truncate" title={getTargetLabel(log)}>
                      {getTargetLabel(log)}
                    </td>
                    <td className="p-3 font-mono text-slate-500 text-xs whitespace-nowrap">
                      {log.itemCardId || '-'}
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

      {/* 詳細モーダル */}
      {selectedLog && (
        <div className="fixed inset-0 bg-black/60 z-50 flex items-center justify-center p-4 animate-in fade-in duration-200" onClick={() => setSelectedLog(null)}>
          <div className="bg-white rounded-xl shadow-2xl max-w-sm w-full" onClick={e => e.stopPropagation()}>
            <div className="p-4 border-b border-slate-100 bg-slate-50 rounded-t-xl flex justify-between items-center">
              <h3 className="font-bold text-slate-800">ログ詳細</h3>
              <button onClick={() => setSelectedLog(null)} className="text-slate-400 hover:text-slate-600">
                <X size={20} />
              </button>
            </div>
            <div className="p-5 space-y-3 text-sm">
              <div className="flex justify-between">
                <span className="text-slate-500 font-medium">日時</span>
                <span className="text-slate-800 font-mono text-xs">{formatDateFull(selectedLog.createdAt)}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-500 font-medium">対象</span>
                <span className="text-slate-800">{getTargetLabel(selectedLog)}</span>
              </div>
              {selectedLog.itemCardId && (
                <div className="flex justify-between">
                  <span className="text-slate-500 font-medium">型番</span>
                  <span className="text-slate-800 font-mono">{selectedLog.itemCardId}</span>
                </div>
              )}
              <div className="flex justify-between">
                <span className="text-slate-500 font-medium">変動数</span>
                <span className={`font-bold text-base ${selectedLog.delta > 0 ? 'text-blue-600' : 'text-red-500'}`}>
                  {selectedLog.delta > 0 ? `+${selectedLog.delta}` : selectedLog.delta}
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-500 font-medium">変動後在庫</span>
                <span className="text-slate-800 font-mono">{selectedLog.stockAfter}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-500 font-medium">種別</span>
                <span className={`px-2 py-0.5 rounded text-xs font-bold border ${SOURCE_STYLES[selectedLog.source]}`}>
                  {SOURCE_LABELS[selectedLog.source]}
                </span>
              </div>
              {selectedLog.requestId && (
                <div className="flex justify-between">
                  <span className="text-slate-500 font-medium">リクエストID</span>
                  <Link href="/requests" className="text-cyan-600 hover:underline flex items-center gap-1 text-xs">
                    #{selectedLog.requestId} <ExternalLink size={10} />
                  </Link>
                </div>
              )}
              {selectedLog.note && (
                <div>
                  <span className="text-slate-500 font-medium block mb-1">メモ</span>
                  <p className="text-slate-800 bg-slate-50 rounded px-3 py-2 text-xs">{selectedLog.note}</p>
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
