
'use client';

import React, { useState, useEffect, useMemo, useRef } from 'react';
import { ScrollText, LoaderCircle, ExternalLink, X, CalendarDays, Layers, Search, ChevronLeft, ChevronRight } from 'lucide-react';
import { StockLog } from '@/types';
import { api, StockLogFilters } from '@/services/api';
import { RARITY_STYLES, RARITY_DEFAULT_STYLE } from '@/constants';
import Link from 'next/link';
import { PageContainer, PageHeader } from '@/components/layout/Page';

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

const PAGE_SIZE = 50;

// 期間・カード名の入力欄。「絞り込む」を押したときだけ検索条件に反映する（入力のたびに問い合わせない）
type DraftFilters = { from: string; to: string; cardName: string };
const EMPTY_DRAFT: DraftFilters = { from: '', to: '', cardName: '' };

export const LogsView: React.FC = () => {
  const [logs, setLogs] = useState<StockLog[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [filterSource, setFilterSource] = useState<StockLog['source'] | 'all'>('all');
  const [groupBy, setGroupBy] = useState<GroupBy>('date');
  const [selectedLog, setSelectedLog] = useState<StockLog | null>(null);
  const [collapsedGroups, setCollapsedGroups] = useState<Set<string>>(new Set());
  const [totalCount, setTotalCount] = useState(0);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [draft, setDraft] = useState<DraftFilters>(EMPTY_DRAFT);
  const [applied, setApplied] = useState<DraftFilters>(EMPTY_DRAFT);
  const [currentPage, setCurrentPage] = useState(1);
  // 古い問い合わせの結果が後から届いても表示を上書きしないための番号
  const requestSeq = useRef(0);

  useEffect(() => {
    const seq = ++requestSeq.current;
    const load = async () => {
      setIsLoading(true);
      setLoadError(null);
      try {
        const filters: StockLogFilters = {
          source: filterSource === 'all' ? undefined : filterSource,
          from: applied.from || undefined,
          to: applied.to || undefined,
          cardName: applied.cardName.trim() || undefined,
        };
        const result = await api.fetchStockLogs(currentPage, PAGE_SIZE, filters);
        if (seq !== requestSeq.current) return;
        setLogs(result.data);
        setTotalCount(result.count);
      } catch (e) {
        if (seq !== requestSeq.current) return;
        console.error('ログ取得失敗:', e);
        setLogs([]);
        setTotalCount(0);
        setLoadError('ログを取得できませんでした。時間をおいて再度お試しください。');
      } finally {
        if (seq === requestSeq.current) setIsLoading(false);
      }
    };
    load();
  }, [filterSource, applied, currentPage]);

  const totalPages = Math.max(1, Math.ceil(totalCount / PAGE_SIZE));
  const rangeStart = totalCount === 0 ? 0 : (currentPage - 1) * PAGE_SIZE + 1;
  const rangeEnd = Math.min(currentPage * PAGE_SIZE, totalCount);
  // 開始日が終了日より後なら絞り込めない（YYYY-MM-DD は文字列の大小で比べられる）
  const isRangeInvalid = draft.from !== '' && draft.to !== '' && draft.from > draft.to;
  const hasAnyFilter = filterSource !== 'all' || applied.from !== '' || applied.to !== '' || applied.cardName.trim() !== ''
    || draft.from !== '' || draft.to !== '' || draft.cardName !== '';

  const changeSource = (s: StockLog['source'] | 'all') => { setFilterSource(s); setCurrentPage(1); };
  const applyDraft = (e: React.FormEvent) => {
    e.preventDefault();
    if (isRangeInvalid) return;
    setApplied({ ...draft });
    setCurrentPage(1);
  };
  const clearFilters = () => { setDraft(EMPTY_DRAFT); setApplied(EMPTY_DRAFT); setFilterSource('all'); setCurrentPage(1); };

  const grouped = useMemo(() => {
    if (groupBy === 'none') return [{ key: 'all', label: '', logs }];

    const map = new Map<string, StockLog[]>();
    for (const log of logs) {
      const key = groupBy === 'date'
        ? formatDateKey(log.createdAt)
        : (log.itemRarity || (log.supplyId ? 'サプライ' : 'その他'));
      if (!map.has(key)) map.set(key, []);
      map.get(key)!.push(log);
    }
    return Array.from(map.entries()).map(([key, logs]) => ({ key, label: key, logs }));
  }, [logs, groupBy]);

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
    <PageContainer>
      <PageHeader icon={ScrollText} title="在庫変動ログ" />

      {/* コントロールバー */}
      <div className="flex flex-wrap gap-2 mb-4 items-center justify-between">
        {/* 種別フィルター */}
        <div className="flex gap-2 flex-wrap">
          {(['all', 'manual', 'request', 'csv'] as const).map(s => (
            <button
              key={s}
              onClick={() => changeSource(s)}
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

      {/* 期間・カード名の絞り込み（「絞り込む」で反映） */}
      <form onSubmit={applyDraft} className="bg-white rounded-xl border border-slate-200 p-3 mb-4 flex flex-wrap items-end gap-3">
        <label className="flex flex-col gap-1 text-xs font-medium text-slate-500">
          開始日
          <input
            type="date"
            value={draft.from}
            max={draft.to || undefined}
            onChange={(e) => setDraft(prev => ({ ...prev, from: e.target.value }))}
            className="border border-slate-300 rounded-lg px-2 py-1.5 text-sm text-slate-700 focus:ring-2 focus:ring-cyan-500 outline-none"
          />
        </label>
        <label className="flex flex-col gap-1 text-xs font-medium text-slate-500">
          終了日
          <input
            type="date"
            value={draft.to}
            min={draft.from || undefined}
            onChange={(e) => setDraft(prev => ({ ...prev, to: e.target.value }))}
            className="border border-slate-300 rounded-lg px-2 py-1.5 text-sm text-slate-700 focus:ring-2 focus:ring-cyan-500 outline-none"
          />
        </label>
        <label className="flex flex-col gap-1 text-xs font-medium text-slate-500 flex-1 min-w-[180px]">
          カード名・型番
          <input
            type="text"
            value={draft.cardName}
            onChange={(e) => setDraft(prev => ({ ...prev, cardName: e.target.value }))}
            placeholder="例: ブルーアイズ / LOB-JP001"
            className="border border-slate-300 rounded-lg px-2 py-1.5 text-sm text-slate-700 focus:ring-2 focus:ring-cyan-500 outline-none"
          />
        </label>
        <div className="flex gap-2">
          <button
            type="submit"
            disabled={isRangeInvalid}
            className="flex items-center gap-1 px-3 py-1.5 rounded-lg text-sm font-bold bg-cyan-600 hover:bg-cyan-700 text-white disabled:opacity-40"
          >
            <Search size={14} /> 絞り込む
          </button>
          <button
            type="button"
            onClick={clearFilters}
            disabled={!hasAnyFilter}
            className="px-3 py-1.5 rounded-lg text-sm border border-slate-200 bg-white text-slate-600 hover:bg-slate-50 disabled:opacity-40"
          >
            条件をクリア
          </button>
        </div>
        <p className="w-full text-xs text-slate-400">
          期間は日本時間で、開始日・終了日の両方を含みます。カード名はカード名・型番・収録パック名に当たり、在庫一覧の検索と同じく表記ゆれを吸収します（カード名で絞るとサプライのログは出ません）。
          {isRangeInvalid && <span className="text-rose-500 font-bold ml-1">開始日が終了日より後になっています。</span>}
        </p>
      </form>

      {/* 件数とページ送り */}
      <div className="flex flex-wrap items-center justify-between gap-2 mb-3 text-sm text-slate-500">
        <span>
          {totalCount === 0 ? '0件' : `全${totalCount.toLocaleString()}件中 ${rangeStart.toLocaleString()}〜${rangeEnd.toLocaleString()}件`}
        </span>
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => setCurrentPage(p => Math.max(1, p - 1))}
            disabled={currentPage <= 1 || isLoading}
            className="flex items-center gap-1 px-3 py-1.5 rounded-lg border border-slate-200 bg-white hover:bg-slate-50 disabled:opacity-40"
          >
            <ChevronLeft size={14} /> 前へ
          </button>
          <span className="font-bold text-slate-700">{currentPage} <span className="font-normal text-slate-400">/ {totalPages}</span></span>
          <button
            type="button"
            onClick={() => setCurrentPage(p => Math.min(totalPages, p + 1))}
            disabled={currentPage >= totalPages || isLoading}
            className="flex items-center gap-1 px-3 py-1.5 rounded-lg border border-slate-200 bg-white hover:bg-slate-50 disabled:opacity-40"
          >
            次へ <ChevronRight size={14} />
          </button>
        </div>
      </div>

      {isLoading ? (
        <div className="flex items-center justify-center py-20">
          <LoaderCircle className="animate-spin text-cyan-600" size={32} />
        </div>
      ) : loadError ? (
        <div className="bg-white rounded-xl p-12 text-center text-rose-500 border border-rose-200">
          {loadError}
        </div>
      ) : logs.length === 0 ? (
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
                      <tr className="bg-slate-50 border-b border-slate-200 text-slate-500 text-xs font-bold">
                        <th className="px-4 py-2">
                          {groupBy === 'date' ? '時刻' : '日時'}
                        </th>
                        <th className="px-4 py-2">カード名</th>
                        <th className="px-4 py-2">型番</th>
                        {groupBy !== 'rarity' && <th className="px-4 py-2">レアリティ</th>}
                        <th className="px-4 py-2 text-center">変動</th>
                        <th className="px-4 py-2 text-center">変動後</th>
                        <th className="px-4 py-2">種別</th>
                        <th className="px-4 py-2">メモ</th>
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
              <h3 className="text-lg font-bold text-slate-800">ログ詳細</h3>
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
    </PageContainer>
  );
};
