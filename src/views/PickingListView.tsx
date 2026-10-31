'use client';

import React, { useState, useEffect, useMemo } from 'react';
import Link from 'next/link';
import { ClipboardList, Printer, ArrowLeft, LoaderCircle, TriangleAlert } from 'lucide-react';
import { api } from '@/services/api';
import { CardRequest } from '@/types';
import { useAppContext } from '@/context/AppContext';
import { PageContainer, PageHeader } from '@/components/layout/Page';
import { getErrorMessage } from '@/utils';

// 1行 = 取り出すカード（またはサプライ）1種類。受付中の全リクエストの枚数を合計する
interface PickingRow {
  key: string;
  kind: 'card' | 'supply';
  pack: string;
  releaseDate: string;
  cardId: string;
  name: string;
  rarity: string;
  stock: number | null;  // 削除済みなど不明なら null
  total: number;
  breakdown: { requestId: number; requester: string; quantity: number }[];
}

const buildRows = (requests: CardRequest[], releaseDates: Map<string, string>): PickingRow[] => {
  const rows = new Map<string, PickingRow>();
  for (const req of requests) {
    for (const ri of req.items ?? []) {
      const key = ri.itemId ? `item-${ri.itemId}` : `supply-${ri.supplyId}`;
      let row = rows.get(key);
      if (!row) {
        row = ri.itemId
          ? {
              key, kind: 'card',
              pack: ri.item?.category ?? '',
              releaseDate: releaseDates.get(ri.item?.category ?? '') ?? '',
              cardId: ri.item?.cardId ?? '',
              name: ri.item?.name ?? '不明なカード（削除済み）',
              rarity: ri.item?.rarity ?? '',
              stock: ri.item?.stock ?? null,
              total: 0, breakdown: [],
            }
          : {
              key, kind: 'supply',
              pack: 'サプライ', releaseDate: '', cardId: '', rarity: '',
              name: ri.supply?.name ?? '不明なサプライ（削除済み）',
              stock: ri.supply?.stock ?? null,
              total: 0, breakdown: [],
            };
        rows.set(key, row);
      }
      row.total += ri.quantity;
      row.breakdown.push({ requestId: req.id, requester: req.requesterName, quantity: ri.quantity });
    }
  }
  return Array.from(rows.values());
};

export const PickingListView: React.FC = () => {
  const { addToast, products, rarities } = useAppContext();
  const [requests, setRequests] = useState<CardRequest[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [checked, setChecked] = useState<Record<string, boolean>>({});

  useEffect(() => {
    let cancelled = false;
    api.fetchRequests('pending')
      .then(data => { if (!cancelled) setRequests(data); })
      .catch(e => { if (!cancelled) addToast('error', 'リクエスト取得失敗', getErrorMessage(e)); })
      .finally(() => { if (!cancelled) setIsLoading(false); });
    return () => { cancelled = true; };
  }, [addToast]);

  const rows = useMemo(() => {
    const releaseDates = new Map(products.map(p => [p.name, p.releaseDate]));
    const rarityRank = new Map(rarities.map((r, i) => [r, i]));
    // カードはパックの発売日が新しい順 → パック → 型番 → レアリティ順。サプライは最後に名前順
    return buildRows(requests, releaseDates).sort((a, b) => {
      if (a.kind !== b.kind) return a.kind === 'card' ? -1 : 1;
      return b.releaseDate.localeCompare(a.releaseDate)
        || a.pack.localeCompare(b.pack, 'ja')
        || a.cardId.localeCompare(b.cardId)
        || (rarityRank.get(a.rarity) ?? 999) - (rarityRank.get(b.rarity) ?? 999)
        || a.name.localeCompare(b.name, 'ja');
    });
  }, [requests, products, rarities]);

  const totalQuantity = rows.reduce((sum, r) => sum + r.total, 0);
  const shortageCount = rows.filter(r => r.stock !== null && r.stock < r.total).length;
  const checkedCount = rows.filter(r => checked[r.key]).length;

  return (
    <PageContainer>
      <PageHeader
        icon={ClipboardList}
        title="ピッキングリスト"
        description={isLoading ? undefined : `受付中 ${requests.length}件のリクエスト / ${rows.length}種類・計${totalQuantity}枚`}
      >
        <Link
          href="/requests"
          className="print:hidden px-3 py-2 text-sm text-slate-600 bg-white border border-slate-200 hover:bg-slate-50 rounded-lg flex items-center gap-1"
        >
          <ArrowLeft size={16} /> リクエスト一覧
        </Link>
        <button
          type="button"
          onClick={() => window.print()}
          disabled={rows.length === 0}
          className="print:hidden px-4 py-2 text-sm text-white font-bold bg-cyan-600 hover:bg-cyan-700 rounded-lg flex items-center gap-1 disabled:opacity-40"
        >
          <Printer size={16} /> 印刷
        </button>
      </PageHeader>

      {isLoading ? (
        <div className="flex justify-center py-16">
          <LoaderCircle className="animate-spin text-cyan-600" size={32} />
        </div>
      ) : rows.length === 0 ? (
        <div className="bg-white rounded-xl border border-slate-200 p-8 text-center text-sm text-slate-500">
          受付中のリクエストはありません。
        </div>
      ) : (
        <>
          {shortageCount > 0 && (
            <div className="mb-4 bg-red-50 border border-red-200 text-red-700 rounded-lg px-4 py-2 text-sm flex items-center gap-2">
              <TriangleAlert size={16} className="shrink-0" />
              在庫が足りないものが {shortageCount} 種類あります。
            </div>
          )}
          <p className="print:hidden mb-2 text-xs text-slate-500">取り出したらチェックを付けてください（チェックは保存されません）。{checkedCount}/{rows.length} 種類</p>
          <div className="bg-white rounded-xl shadow-sm border border-slate-200 overflow-x-auto print:shadow-none print:border-0">
            <table className="w-full text-left text-sm">
              <thead className="bg-slate-50 text-slate-500 text-xs font-bold border-b border-slate-200">
                <tr>
                  <th className="p-3 w-10"></th>
                  <th className="p-3">収録パック</th>
                  <th className="p-3">型番</th>
                  <th className="p-3">カード名</th>
                  <th className="p-3">レア</th>
                  <th className="p-3 text-center">枚数</th>
                  <th className="p-3 text-center">在庫</th>
                  <th className="p-3">内訳</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {rows.map(row => {
                  const isShort = row.stock !== null && row.stock < row.total;
                  const isChecked = !!checked[row.key];
                  return (
                    <tr key={row.key} className={`break-inside-avoid ${isChecked ? 'bg-slate-50 text-slate-400' : ''}`}>
                      <td className="p-3">
                        <input
                          type="checkbox"
                          checked={isChecked}
                          onChange={() => setChecked(prev => ({ ...prev, [row.key]: !prev[row.key] }))}
                          className="w-4 h-4 accent-cyan-600"
                          aria-label={`${row.name} を取り出した`}
                        />
                      </td>
                      <td className="p-3 text-xs">{row.pack}</td>
                      <td className="p-3 font-mono text-xs">{row.cardId}</td>
                      <td className={`p-3 font-bold ${isChecked ? 'line-through' : 'text-slate-800'}`}>{row.name}</td>
                      <td className="p-3 text-xs font-bold">{row.rarity}</td>
                      <td className="p-3 text-center text-base font-bold">{row.total}</td>
                      <td className={`p-3 text-center ${isShort ? 'text-red-600 font-bold' : ''}`}>
                        {row.stock ?? '-'}
                        {isShort && <div className="text-[10px]">在庫不足</div>}
                      </td>
                      <td className="p-3 text-xs text-slate-500">
                        {row.breakdown.map(b => `${b.requester} ×${b.quantity}`).join('、')}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </>
      )}
    </PageContainer>
  );
};
