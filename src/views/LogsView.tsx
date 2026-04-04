
'use client';

import React, { useState, useEffect, useMemo } from 'react';
import { ScrollText, Loader2, ExternalLink, X, CalendarDays, Layers } from 'lucide-react';
import { StockLog } from '@/types';
import { api } from '@/services/api';
import { RARITY_STYLES, RARITY_DEFAULT_STYLE } from '@/constants';
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

const formatTime = (iso: string) => {
  const d = new Date(iso);
  return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
};

const formatDateKey = (iso: string) => {
  const d = new Date(iso);
  return `${d.getFullYear()}/${String(d.getMonth() + 1).padStart(2, '0')}/${String(d.getDate()).padStart(2, '0')}`;
};

const formatDateFull = (iso: string) => {
  const d = new Date(iso);
  return `${d.getFullYear()}年${d.getMonth() + 1}月${d.getDate()}日 ${String(d.getHours()).padStart(2, '0')}時${String(d.getMinutes()).padStart(2, '0')}分${String(d.getSeconds()).padStart(2, '0')}秒`;
};

type GroupBy = 'none' | 'date' | 'rarity';

export const LogsView: React.FC = () => {
  const [logs, setLogs] = useState<StockLog[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [filterSource, setFilterSource] = useState<StockLog['source'] | 'all'>('all');
  const [groupBy, setGroupBy] = useState<GroupBy>('date');
  const [selectedLog, setSelectedLog] = useState<StockLog | null>(null);
  const [collapsedGroups, setCollapsedGroups] = useState<Set<string>>(new Set());

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

  const filtered = useMemo(() =>
    filterSource === 'all' ? logs : logs.filter(l => l.source === filterSource),
    [logs, filterSource]
  );

  const grouped = useMemo(() => {
    if (groupBy === 'none') return [{ key: 'all', label: '', logs: filtered }];

    const map = new Map<string, StockLog[]>();
    for (const log of filtered) {
      const key = groupBy === 'date'
        ? formatDateKey(log.createdAt)
        : (log.itemRarity || (log.supplyId ? 'サプライ' : 'その他'));
      if (!map.has(key)) map.set(key, []);
      map.get(key)!.push(log);
    }
    return Array.from(map.entries()).map(([key, logs]) => ({ key, label: key, logs }));
  }, [filtered, groupBy]);

  const toggleGroup = (key: string) => {
    setCollapsedGroups(prev => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  };

  const getTargetLabel = (log: StockLog) => {
    if (log.itemName) return log.itemName;
    if (log.supplyName) return log.supplyName;
    if (log.itemId) return `カード #${log.itemId}`;
    if (log.supplyId) return `サプライ #${log.supplyId}`;
    return '-';
  };

  const getRarityStyle = (rarity: string | null | undefined) => {
    if (!rarity) return null;
    return RARITY_STYLES[rarity] ?? RARITY_DEFAULT_STYLE;
  };

  return (
    <div className="p-4 md:p-8 pb-20">
      <div className="flex justify-between items-center mb-6">
        <h2 className="text-2xl font-bold text-slate-800 flex items-center gap-2">
          <ScrollText /> 在庫変動ログ
        </h2>
      </div>

      {/* コントロールバー */}
      <div className="flex flex-wrap gap-2 mb-4 items-center justify-between">
        {/* 種別フィルター */}
        <div className="flex gap-2 flex-wrap">
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

        {/* グループ化 */}
        <div className="flex items-center gap-1.5">
          <span className="text-xs text-slate-500 font-medium">まとめる:</span>
          <button
            onClick={() => setGroupBy('date')}
            className={`flex items-center gap-1 px-3 py-1.5 rounded-lg text-sm border transition-colors ${
              groupBy === 'date'
                ? 'bg-indigo-600 text-white border-indigo-600'
                : 'bg-white text-slate-600 border-slate-200 hover:bg-slate-50'
            }`}
          >
            <CalendarDays size={13} /> 日付
          </button>
          <button
            onClick={() => setGroupBy('rarity')}
            className={`flex items-center gap-1 px-3 py-1.5 rounded-lg text-sm border transition-colors ${
              groupBy === 'rarity'
                ? 'bg-indigo-600 text-white border-indigo-600'
                : 'bg-white text-slate-600 border-slate-200 hover:bg-slate-50'
            }`}
          >
            <Layers size={13} /> レアリティ
          </button>
          {groupBy !== 'none' && (
            <button
              onClick={() => setGroupBy('none')}
              className="text-xs text-slate-400 hover:text-slate-600 px-2 py-1.5"
            >
              解除
            </button>
          )}
        </div>
      </div>

      {isLoading ? (
        <div className="flex items-center justify-center py-20">
          <Loader2 className="animate-spin text-cyan-600" size={32} />
        </div>
      ) : filtered.length === 0 ? (
        <div className="bg-white rounded-xl p-12 text-center text-slate-400 border border-slate-200">
          ログがありません
        </div>
      ) : (
        <div className="space-y-3">
          {grouped.map(group => {
            const isCollapsed = collapsedGroups.has(group.key);
            const rarityStyle = groupBy === 'rarity' ? getRarityStyle(group.key) : null;

            return (
              <div key={group.key} className="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden">
                {/* グループヘッダー */}
                {groupBy !== 'none' && (
                  <button
                    onClick={() => toggleGroup(group.key)}
                    className="w-full flex items-center justify-between px-4 py-2.5 bg-slate-50 border-b border-slate-200 hover:bg-slate-100 transition-colors"
                  >
                    <div className="flex items-center gap-2">
                      {groupBy === 'date' && <CalendarDays size={14} className="text-indigo-500" />}
                      {groupBy === 'rarity' && rarityStyle && (
                        <span className={`px-2 py-0.5 rounded text-xs font-bold border ${rarityStyle.bg} ${rarityStyle.text} ${rarityStyle.border}`}>
                          {group.label}
                        </span>
                      )}
                      {groupBy === 'rarity' && !rarityStyle && (
                        <span className="px-2 py-0.5 rounded text-xs font-bold border bg-slate-100 text-slate-600 border-slate-200">
                          {group.label}
                        </span>
                      )}
                      <span className={`font-bold text-sm ${groupBy === 'date' ? 'text-slate-700' : 'text-slate-500'}`}>
                        {groupBy === 'date' ? group.label : ''}
                      </span>
                      <span className="text-xs text-slate-400 font-normal">{group.logs.length}件</span>
                    </div>
                    <span className="text-slate-400 text-xs">{isCollapsed ? '▶' : '▼'}</span>
                  </button>
                )}

                {/* ログ一覧テーブル */}
                {!isCollapsed && (
                  <table className="w-full text-left text-sm">
                    <thead>
                      <tr className="text-slate-400 text-xs border-b border-slate-100">
                        <th className="px-4 py-2 font-medium">
                          {groupBy === 'date' ? '時刻' : '日時'}
                        </th>
                        <th className="px-4 py-2 font-medium">カード名</th>
                        <th className="px-4 py-2 font-medium">型番</th>
                        {groupBy !== 'rarity' && <th className="px-4 py-2 font-medium">レアリティ</th>}
                        <th className="px-4 py-2 font-medium text-center">変動</th>
                        <th className="px-4 py-2 font-medium text-center">変動後</th>
                        <th className="px-4 py-2 font-medium">種別</th>
                        <th className="px-4 py-2 font-medium">メモ</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-50">
                      {group.logs.map(log => {
                        const rStyle = getRarityStyle(log.itemRarity);
                        return (
                          <tr key={log.id} className="hover:bg-slate-50/80 transition-colors">
                            <td className="px-4 py-2.5">
                              <button
                                onClick={() => setSelectedLog(log)}
                                className="font-mono text-slate-500 text-xs whitespace-nowrap hover:text-cyan-600 hover:underline"
                              >
                                {groupBy === 'date' ? formatTime(log.createdAt) : formatDateKey(log.createdAt) + ' ' + formatTime(log.createdAt)}
                              </button>
                            </td>
                            <td className="px-4 py-2.5 text-slate-700 text-xs max-w-[130px] truncate" title={getTargetLabel(log)}>
                              {getTargetLabel(log)}
                            </td>
                            <td className="px-4 py-2.5 font-mono text-slate-400 text-xs whitespace-nowrap">
                              {log.itemCardId || <span className="text-slate-300">-</span>}
                            </td>
                            {groupBy !== 'rarity' && (
                              <td className="px-4 py-2.5">
                                {rStyle ? (
                                  <span className={`px-1.5 py-0.5 rounded text-xs font-bold border ${rStyle.bg} ${rStyle.text} ${rStyle.border}`}>
                                    {log.itemRarity}
                                  </span>
                                ) : (
                                  <span className="text-slate-300 text-xs">-</span>
                                )}
                              </td>
                            )}
                            <td className="px-4 py-2.5 text-center">
                              <span className={`font-bold ${log.delta > 0 ? 'text-blue-600' : 'text-red-500'}`}>
                                {log.delta > 0 ? `+${log.delta}` : log.delta}
                              </span>
                            </td>
                            <td className="px-4 py-2.5 text-center font-mono text-slate-500 text-xs">
                              {log.stockAfter}
                            </td>
                            <td className="px-4 py-2.5">
                              <span className={`px-1.5 py-0.5 rounded text-xs font-bold border ${SOURCE_STYLES[log.source]}`}>
                                {SOURCE_LABELS[log.source]}
                              </span>
                              {log.source === 'request' && (
                                <Link href="/requests" className="ml-1 text-cyan-500 hover:text-cyan-700 inline-flex items-center">
                                  <ExternalLink size={10} />
                                </Link>
                              )}
                            </td>
                            <td className="px-4 py-2.5 text-slate-400 text-xs max-w-[100px] truncate" title={log.note || ''}>
                              {log.note || <span className="text-slate-200">-</span>}
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                )}
              </div>
            );
          })}
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
                <span className="text-slate-800 text-right max-w-[200px]">{getTargetLabel(selectedLog)}</span>
              </div>
              {selectedLog.itemCardId && (
                <div className="flex justify-between">
                  <span className="text-slate-500 font-medium">型番</span>
                  <span className="text-slate-800 font-mono">{selectedLog.itemCardId}</span>
                </div>
              )}
              {selectedLog.itemRarity && (
                <div className="flex justify-between items-center">
                  <span className="text-slate-500 font-medium">レアリティ</span>
                  {(() => {
                    const s = getRarityStyle(selectedLog.itemRarity);
                    return s ? (
                      <span className={`px-2 py-0.5 rounded text-xs font-bold border ${s.bg} ${s.text} ${s.border}`}>
                        {selectedLog.itemRarity}
                      </span>
                    ) : <span>{selectedLog.itemRarity}</span>;
                  })()}
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
