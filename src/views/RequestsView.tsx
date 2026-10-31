
'use client';

import React, { useState, useEffect, useCallback } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import Link from 'next/link';
import { ShoppingBag, ClipboardList, LoaderCircle, ChevronDown, ChevronRight, Check, X, PenLine, Trash, RefreshCw, Link2, Info, Undo2, TriangleAlert } from 'lucide-react';
import { CardRequest, Item, RequestItem, RequestEditLog } from '@/types';
import { api } from '@/services/api';
import { useAppContext } from '@/context/AppContext';
import { ConfirmDialog } from '@/components/ui/ConfirmDialog';
import { RARITY_STYLES, RARITY_DEFAULT_STYLE } from '@/constants';
import { buildRequestEditUrl, getSavedRequestTokens, saveRequestToken } from '@/lib/requestTokens';
import { getErrorMessage } from '@/utils';
import { PageContainer, PageHeader } from '@/components/layout/Page';

const STATUS_LABELS: Record<CardRequest['status'], string> = {
  pending: '受付中',
  completed: '完了',
  cancelled: 'キャンセル',
};

const STATUS_STYLES: Record<CardRequest['status'], string> = {
  pending: 'bg-cyan-100 text-cyan-700 border-cyan-200',
  completed: 'bg-green-100 text-green-700 border-green-200',
  cancelled: 'bg-slate-100 text-slate-500 border-slate-200',
};

const formatDate = (iso: string) => {
  const d = new Date(iso);
  return `${d.getFullYear()}/${String(d.getMonth() + 1).padStart(2, '0')}/${String(d.getDate()).padStart(2, '0')} ${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
};

// 在庫の増減指示（カードなら itemId、サプライなら supplyId のどちらか一方）
type StockAdjustment = { itemId?: number; supplyId?: number; delta: number; label: string };

// リクエスト明細から在庫の増減指示を作る（カード・サプライ以外の明細は対象外）
const toAdjustment = (ri: RequestItem, delta: number): StockAdjustment | null => {
  const label = ri.item?.name || ri.supply?.name || '不明';
  if (ri.itemId) return { itemId: ri.itemId, delta, label };
  if (ri.supplyId) return { supplyId: ri.supplyId, delta, label };
  return null;
};

const getRarityStyle = (rarity: string): string => {
  const style = RARITY_STYLES[rarity] ?? RARITY_DEFAULT_STYLE;
  return `${style.bg} ${style.text} border ${style.border}`;
};

export const RequestsView: React.FC = () => {
  const { isAdmin, addToast, rarities, refreshPendingRequestsCount } = useAppContext();
  const router = useRouter();
  const searchParams = useSearchParams();
  const [requests, setRequests] = useState<CardRequest[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [statusFilter, setStatusFilter] = useState<CardRequest['status'] | 'all'>('all');
  const [showAll, setShowAll] = useState(false);

  // このブラウザで編集できるリクエスト（requestId -> 編集用トークン）
  const [ownedTokens, setOwnedTokens] = useState<Record<number, string>>({});
  const [highlightId, setHighlightId] = useState<number | null>(null);

  // 編集状態
  const [editingId, setEditingId] = useState<number | null>(null);
  const [editMessage, setEditMessage] = useState('');
  const [editQuantities, setEditQuantities] = useState<Record<number, number>>({});
  const [removedItemIds, setRemovedItemIds] = useState<number[]>([]);

  // バリアント変更状態
  const [swappingItemId, setSwappingItemId] = useState<number | null>(null);
  const [swapAlternatives, setSwapAlternatives] = useState<Item[]>([]);
  const [isLoadingSwap, setIsLoadingSwap] = useState(false);

  // 変更パネル（管理者用）: 枚数と変更先（今のカード・同名の別型番・別レアリティ）をまとめて選ぶ
  const [changingItemId, setChangingItemId] = useState<number | null>(null);
  const [changeOptions, setChangeOptions] = useState<Item[]>([]);
  const [changePending, setChangePending] = useState<Record<number, number>>({});
  const [changeTargetId, setChangeTargetId] = useState<number | null>(null);
  const [changeQuantity, setChangeQuantity] = useState(1);
  const [isLoadingChange, setIsLoadingChange] = useState(false);

  // 完了モーダル状態（管理者用）
  const [completingRequest, setCompletingRequest] = useState<CardRequest | null>(null);
  const [unitPrices, setUnitPrices] = useState<Record<number, number>>({});
  const [adminMemo, setAdminMemo] = useState('');
  const [isUpdating, setIsUpdating] = useState(false);

  // 折りたたみ状態
  const [expandedLogs, setExpandedLogs] = useState<Record<number, boolean>>({});
  const [logsCache, setLogsCache] = useState<Record<number, RequestEditLog[]>>({});

  // 確認ダイアログ
  const [confirmDialog, setConfirmDialog] = useState<{
    isOpen: boolean; title: string; message: string; variant: 'danger' | 'warning' | 'info'; onConfirm: () => void;
  }>({ isOpen: false, title: '', message: '', variant: 'warning', onConfirm: () => {} });

  const load = useCallback(async () => {
    setIsLoading(true);
    try {
      const data = await api.fetchRequests(undefined, { includeToken: isAdmin });
      setRequests(data);
      // 一覧を読んだ時点の件数にバッジをそろえる（新着が届いていた場合も反映）
      if (isAdmin) refreshPendingRequestsCount();
    } catch (e) {
      addToast('error', 'リクエスト取得失敗', getErrorMessage(e));
    } finally {
      setIsLoading(false);
    }
  }, [addToast, isAdmin, refreshPendingRequestsCount]);

  // eslint-disable-next-line react-hooks/set-state-in-effect -- 表示時のデータ取得（外部との同期）
  useEffect(() => { load(); }, [load]);

  // eslint-disable-next-line react-hooks/set-state-in-effect -- localStorage はサーバー描画時に読めないため、ハイドレーション後に読む
  useEffect(() => { setOwnedTokens(getSavedRequestTokens()); }, []);

  // 編集用リンク（/requests?token=...）から開かれた場合: トークンを照合してこのブラウザに保存する
  const tokenParam = searchParams.get('token');
  useEffect(() => {
    if (!tokenParam) return;
    let cancelled = false;
    (async () => {
      try {
        const requestId = await api.resolveRequestToken(tokenParam);
        if (cancelled) return;
        if (requestId === null) {
          addToast('error', '編集用リンクが無効です', 'リクエストが処理済み（完了・キャンセル）か、リンクが間違っています。処理済みのリクエストは編集できません。');
        } else {
          saveRequestToken(requestId, tokenParam);
          setOwnedTokens(getSavedRequestTokens());
          setHighlightId(requestId);
          setShowAll(true);
          addToast('success', '編集できるようになりました', 'このブラウザで、あなたのリクエストを編集できます。');
        }
      } catch (e) {
        if (!cancelled) addToast('error', '編集用リンクの確認に失敗しました', getErrorMessage(e));
      } finally {
        // トークンをアドレスバーや履歴に残さない
        if (!cancelled) router.replace('/requests');
      }
    })();
    return () => { cancelled = true; };
  }, [tokenParam, addToast, router]);

  // 編集用リンクから開いたリクエストまでスクロール
  useEffect(() => {
    if (highlightId === null || isLoading) return;
    document.getElementById(`request-${highlightId}`)?.scrollIntoView({ behavior: 'smooth', block: 'center' });
  }, [highlightId, isLoading]);

  const copyEditLink = async (token: string) => {
    try {
      await navigator.clipboard.writeText(buildRequestEditUrl(token));
      addToast('success', 'コピーしました', '編集用リンクをコピーしました。他の人には共有しないでください。');
    } catch {
      addToast('error', 'コピーできませんでした', 'ブラウザがクリップボードへのアクセスを許可していません。');
    }
  };

  const filtered = requests.filter(r => {
    if (isAdmin) {
      return statusFilter === 'all' || r.status === statusFilter;
    }
    // ゲスト: デフォルトは pending のみ、showAll で全件
    return showAll || r.status === 'pending';
  });

  const toggleLogs = async (requestId: number) => {
    if (logsCache[requestId]) {
      setExpandedLogs(prev => ({ ...prev, [requestId]: !prev[requestId] }));
      return;
    }
    try {
      const logs = await api.fetchRequestEditLogs(requestId);
      setLogsCache(prev => ({ ...prev, [requestId]: logs }));
      setExpandedLogs(prev => ({ ...prev, [requestId]: true }));
    } catch (e) {
      console.error('ログ取得失敗:', e);
    }
  };

  const startEdit = (req: CardRequest) => {
    setEditingId(req.id);
    setEditMessage(req.message || '');
    const qtys: Record<number, number> = {};
    req.items?.forEach(ri => { qtys[ri.id] = ri.quantity; });
    setEditQuantities(qtys);
    setRemovedItemIds([]);
  };

  const cancelEdit = () => {
    setEditingId(null);
    setRemovedItemIds([]);
    setSwappingItemId(null);
    setSwapAlternatives([]);
    setChangingItemId(null);
  };

  const toggleRemoveItem = (riId: number) => {
    setRemovedItemIds(prev => prev.includes(riId) ? prev.filter(id => id !== riId) : [...prev, riId]);
    if (swappingItemId === riId) {
      setSwappingItemId(null);
      setSwapAlternatives([]);
    }
    if (changingItemId === riId) setChangingItemId(null);
  };

  // 完了済みリクエストの編集時: 完了時に減らした在庫との差分を在庫へ反映する（管理者のみ）
  // delta は在庫の増減（例: 枚数を2→1にしたら +1、削除したら +元の枚数）
  const applyStockAdjustments = async (
    requestId: number,
    adjustments: StockAdjustment[],
    note?: string
  ): Promise<string[]> => {
    const failures: string[] = [];
    for (const adj of adjustments) {
      if (adj.delta === 0) continue;
      try {
        // カードは items、サプライは supplies の在庫を増減する
        const stockAfter = adj.itemId
          ? (await api.updateStock(adj.itemId, adj.delta)).stock
          : (await api.updateSupplyStock(adj.supplyId!, adj.delta)).stock;
        api.addStockLog({
          itemId: adj.itemId,
          supplyId: adj.supplyId,
          delta: adj.delta,
          stockAfter,
          source: 'request',
          requestId,
          note,
        }).catch(e => console.warn('ログ記録失敗:', e));
      } catch (e) {
        console.error('在庫調整失敗:', e);
        failures.push(`${adj.label}（${adj.delta > 0 ? '+' : ''}${adj.delta}枚: ${getErrorMessage(e)}）`);
      }
    }
    return failures;
  };

  const notifyStockFailures = (failures: string[]) => {
    addToast('error', '在庫の調整に失敗したカードがあります', 'リクエストの変更は保存済みです。以下のカードの在庫を手動で調整してください。', {
      code: 'STOCK_ADJUST_FAILED',
      message: failures.join('\n'),
      timestamp: new Date().toLocaleString(),
    });
  };

  const openSwap = async (ri: RequestItem) => {
    if (swappingItemId === ri.id) {
      setSwappingItemId(null);
      setSwapAlternatives([]);
      return;
    }
    setSwappingItemId(ri.id);
    setIsLoadingSwap(true);
    try {
      const all = await api.fetchItemsByName(ri.item!.name);
      // 設定のレアリティ順でソート、現在のアイテムは除外
      const rarityMap = new Map(rarities.map((r, i) => [r, i]));
      const alts = all
        .filter(a => a.id !== ri.itemId)
        .sort((a, b) => {
          if (a.cardId !== b.cardId) return a.cardId.localeCompare(b.cardId);
          return (rarityMap.get(a.rarity) ?? 999) - (rarityMap.get(b.rarity) ?? 999);
        });
      setSwapAlternatives(alts);
    } catch {
      setSwapAlternatives([]);
    } finally {
      setIsLoadingSwap(false);
    }
  };

  const doSwap = async (req: CardRequest, ri: RequestItem, newItem: Item) => {
    try {
      let updated: CardRequest;
      let stockFailures: string[] = [];
      if (isAdmin) {
        await api.swapRequestItem(ri.id, newItem.id);
        const oldLabel = `${ri.item?.name ?? ''} ${ri.item?.cardId ?? ''} ${ri.item?.rarity ?? ''}`.trim();
        const newLabel = `${newItem.name} ${newItem.cardId} ${newItem.rarity}`;
        await api.addRequestEditLog({
          requestId: req.id,
          editorName: '管理者',
          fieldChanged: 'カード変更',
          oldValue: oldLabel,
          newValue: newLabel,
        }).catch(e => console.warn('ログ記録失敗:', e));
        // 完了済みなら、元のカードの在庫を戻し、差し替え先の在庫を減らす
        if (req.status === 'completed' && ri.itemId) {
          stockFailures = await applyStockAdjustments(req.id, [
            { itemId: ri.itemId, delta: ri.quantity, label: oldLabel },
            { itemId: newItem.id, delta: -ri.quantity, label: newLabel },
          ], '完了済みリクエストの編集');
        }
        updated = await api.fetchRequestById(req.id, { includeToken: true });
      } else {
        updated = await api.swapRequestItemByToken(ownedTokens[req.id], ri.id, newItem.id);
      }
      setRequests(prev => prev.map(r => r.id === req.id ? updated : r));
      setLogsCache(prev => { const next = { ...prev }; delete next[req.id]; return next; });
      setExpandedLogs(prev => ({ ...prev, [req.id]: false }));
      setSwappingItemId(null);
      setSwapAlternatives([]);
      if (stockFailures.length > 0) {
        notifyStockFailures(stockFailures);
      } else {
        addToast('success', 'カード変更完了', `${newItem.rarity} / ${newItem.cardId} に変更しました。`);
      }
    } catch (e) {
      addToast('error', '変更失敗', getErrorMessage(e));
    }
  };

  const closeChange = () => {
    setChangingItemId(null);
    setChangeOptions([]);
  };

  // 変更パネルを開く。同名のカードを全て取得し、今のカードを先頭に、残りを型番 → レアリティ順に並べる
  const openChange = async (ri: RequestItem) => {
    if (!ri.item || changingItemId === ri.id) { closeChange(); return; }
    setSwappingItemId(null);
    setChangingItemId(ri.id);
    setChangeTargetId(ri.item.id);
    setChangeQuantity(editQuantities[ri.id] ?? ri.quantity);
    setIsLoadingChange(true);
    try {
      const [all, pending] = await Promise.all([
        api.fetchItemsByName(ri.item.name),
        api.fetchPendingQuantities(),
      ]);
      const rarityMap = new Map(rarities.map((r, i) => [r, i]));
      const others = all
        .filter(a => a.id !== ri.item!.id)
        .sort((a, b) => a.cardId.localeCompare(b.cardId) || (rarityMap.get(a.rarity) ?? 999) - (rarityMap.get(b.rarity) ?? 999));
      setChangeOptions([all.find(a => a.id === ri.item!.id) ?? ri.item, ...others]);
      setChangePending(pending);
    } catch (e) {
      addToast('error', '候補の取得に失敗しました', getErrorMessage(e));
      closeChange();
    } finally {
      setIsLoadingChange(false);
    }
  };

  // 変更パネルの内容をすぐに保存する（カードの差し替え・枚数変更・編集履歴、完了済みなら在庫の差分も反映）
  const applyChange = async (req: CardRequest, ri: RequestItem) => {
    const target = changeOptions.find(o => o.id === changeTargetId);
    if (!ri.item || !target) return;
    const quantity = Math.max(1, changeQuantity);
    const isSwap = target.id !== ri.item.id;
    if (!isSwap && quantity === ri.quantity) { closeChange(); return; }
    setIsUpdating(true);
    try {
      const oldLabel = `${ri.item.name} ${ri.item.cardId} ${ri.item.rarity}`;
      const newLabel = `${target.name} ${target.cardId} ${target.rarity}`;
      if (isSwap) {
        await api.swapRequestItem(ri.id, target.id);
        await api.addRequestEditLog({ requestId: req.id, editorName: '管理者', fieldChanged: 'カード変更', oldValue: oldLabel, newValue: newLabel })
          .catch(e => console.warn('ログ記録失敗:', e));
      }
      if (quantity !== ri.quantity) {
        await api.editRequestAsAdmin(req.id, { itemChanges: [{ requestItemId: ri.id, quantity }] });
        await api.addRequestEditLog({ requestId: req.id, editorName: '管理者', fieldChanged: '数量', oldValue: `${ri.item.name}: ${ri.quantity}枚`, newValue: `${target.name}: ${quantity}枚` })
          .catch(e => console.warn('ログ記録失敗:', e));
      }
      // 完了済みなら、元のカードの在庫を戻し、変更先の在庫を減らす（同じカードなら枚数の差分だけ）
      let stockFailures: string[] = [];
      if (req.status === 'completed') {
        const adjustments: StockAdjustment[] = isSwap
          ? [{ itemId: ri.item.id, delta: ri.quantity, label: oldLabel }, { itemId: target.id, delta: -quantity, label: newLabel }]
          : [{ itemId: ri.item.id, delta: ri.quantity - quantity, label: oldLabel }];
        stockFailures = await applyStockAdjustments(req.id, adjustments, '完了済みリクエストの編集');
      }
      const updated = await api.fetchRequestById(req.id, { includeToken: true });
      setRequests(prev => prev.map(r => r.id === req.id ? updated : r));
      setEditQuantities(prev => ({ ...prev, [ri.id]: quantity }));
      setLogsCache(prev => { const next = { ...prev }; delete next[req.id]; return next; });
      setExpandedLogs(prev => ({ ...prev, [req.id]: false }));
      closeChange();
      if (stockFailures.length > 0) {
        notifyStockFailures(stockFailures);
      } else {
        addToast('success', '変更しました', `${newLabel} / ${quantity}枚`);
      }
    } catch (e) {
      addToast('error', '変更失敗', getErrorMessage(e));
    } finally {
      setIsUpdating(false);
    }
  };

  const submitEdit = async (req: CardRequest) => {
    setIsUpdating(true);
    try {
      // 削除するカードは枚数変更の対象から外す
      const itemChanges = Object.entries(editQuantities)
        .filter(([riId, qty]) => {
          if (removedItemIds.includes(Number(riId))) return false;
          const orig = req.items?.find(ri => ri.id === Number(riId))?.quantity;
          return orig !== qty;
        })
        .map(([riId, qty]) => ({ requestItemId: Number(riId), quantity: qty }));

      const messageChanged = editMessage !== (req.message || '');
      const params = {
        message: messageChanged ? editMessage : undefined,
        itemChanges: itemChanges.length > 0 ? itemChanges : undefined,
        itemsToRemove: removedItemIds.length > 0 ? removedItemIds : undefined,
      };

      let updated: CardRequest;
      let stockFailures: string[] = [];
      if (isAdmin) {
        updated = await api.editRequestAsAdmin(req.id, params);
        // 管理者の編集履歴はクライアントから記録（申請者の編集はDB関数内で記録される）
        const findItem = (riId: number) => req.items?.find(x => x.id === riId);
        const itemName = (riId: number) => {
          const ri = findItem(riId);
          return ri?.item?.name || ri?.supply?.name || '不明';
        };
        if (removedItemIds.length > 0) {
          await api.addRequestEditLog({
            requestId: req.id,
            editorName: '管理者',
            fieldChanged: '削除',
            oldValue: removedItemIds.map(id => `${itemName(id)}: ${findItem(id)?.quantity}枚`).join(', '),
          });
        }
        // 完了済みなら、枚数の差分・削除分を在庫へ反映（完了時に減らした在庫を戻す）
        if (req.status === 'completed') {
          const adjustments: StockAdjustment[] = [];
          for (const c of itemChanges) {
            const ri = findItem(c.requestItemId);
            const adj = ri && toAdjustment(ri, ri.quantity - c.quantity);
            if (adj) adjustments.push(adj);
          }
          for (const id of removedItemIds) {
            const ri = findItem(id);
            const adj = ri && toAdjustment(ri, ri.quantity);
            if (adj) adjustments.push(adj);
          }
          stockFailures = await applyStockAdjustments(req.id, adjustments, '完了済みリクエストの編集');
        }
        if (itemChanges.length > 0) {
          await api.addRequestEditLog({
            requestId: req.id,
            editorName: '管理者',
            fieldChanged: '数量',
            oldValue: itemChanges.map(c => `${itemName(c.requestItemId)}: ${req.items?.find(x => x.id === c.requestItemId)?.quantity}枚`).join(', '),
            newValue: itemChanges.map(c => `${itemName(c.requestItemId)}: ${c.quantity}枚`).join(', '),
          });
        }
        if (messageChanged) {
          await api.addRequestEditLog({
            requestId: req.id,
            editorName: '管理者',
            fieldChanged: 'メモ',
            oldValue: req.message || '',
            newValue: editMessage,
          });
        }
      } else {
        updated = await api.editRequestByToken(ownedTokens[req.id], params);
      }

      setRequests(prev => prev.map(r => r.id === req.id ? updated : r));
      setLogsCache(prev => { const next = { ...prev }; delete next[req.id]; return next; });
      setExpandedLogs(prev => ({ ...prev, [req.id]: false }));
      setEditingId(null);
      setRemovedItemIds([]);
      if (stockFailures.length > 0) {
        notifyStockFailures(stockFailures);
      } else {
        addToast('success', '更新完了', req.status === 'completed'
          ? 'リクエストを更新し、在庫に反映しました。'
          : 'リクエストを更新しました。');
      }
    } catch (e) {
      addToast('error', '更新失敗', getErrorMessage(e));
    } finally {
      setIsUpdating(false);
    }
  };

  const openCompleteModal = (req: CardRequest) => {
    setCompletingRequest(req);
    const prices: Record<number, number> = {};
    req.items?.forEach(ri => { prices[ri.id] = ri.unitPrice ?? 0; });
    setUnitPrices(prices);
    setAdminMemo('');
  };

  const priceTotal = Object.values(unitPrices).reduce((sum, p) => sum + (p || 0), 0);

  const confirmComplete = async () => {
    if (!completingRequest) return;
    setIsUpdating(true);
    try {
      const updated = await api.updateRequestStatus(completingRequest.id, 'completed', {
        unitPrices,
        priceTotal,
        adminMemo,
      });

      // 在庫を実際に減らす + ログ記録（カード・サプライとも）
      const adjustments = (completingRequest.items || [])
        .map(ri => toAdjustment(ri, -ri.quantity))
        .filter((adj): adj is StockAdjustment => adj !== null);
      const stockFailures = await applyStockAdjustments(completingRequest.id, adjustments);

      setRequests(prev => prev.map(r => r.id === completingRequest.id ? updated : r));
      setCompletingRequest(null);
      refreshPendingRequestsCount();
      if (stockFailures.length > 0) {
        addToast('error', '在庫の減算に失敗したものがあります', 'リクエストは完了済みです。以下の在庫を手動で調整してください。', {
          code: 'STOCK_DECREMENT_FAILED',
          message: stockFailures.join('\n'),
          timestamp: new Date().toLocaleString(),
        });
      } else {
        addToast('success', '完了処理完了', 'リクエストを完了しました。');
      }
    } catch (e) {
      addToast('error', '完了処理失敗', getErrorMessage(e));
    } finally {
      setIsUpdating(false);
    }
  };

  const handleCancel = (req: CardRequest) => {
    setConfirmDialog({
      isOpen: true,
      title: 'リクエストをキャンセル',
      message: `「${req.requesterName}」のリクエストをキャンセルしますか？`,
      variant: 'warning',
      onConfirm: async () => {
        setConfirmDialog(prev => ({ ...prev, isOpen: false }));
        try {
          const updated = await api.updateRequestStatus(req.id, 'cancelled');
          setRequests(prev => prev.map(r => r.id === req.id ? updated : r));
          refreshPendingRequestsCount();
          addToast('info', 'キャンセル完了', 'リクエストをキャンセルしました。');
        } catch (e) {
          addToast('error', 'キャンセル失敗', getErrorMessage(e));
        }
      },
    });
  };

  const handleDelete = (req: CardRequest) => {
    setConfirmDialog({
      isOpen: true,
      title: 'リクエストを削除',
      message: `「${req.requesterName}」のリクエストを完全に削除しますか？この操作は取り消せません。`,
      variant: 'danger',
      onConfirm: async () => {
        setConfirmDialog(prev => ({ ...prev, isOpen: false }));
        try {
          await api.deleteRequest(req.id);
          setRequests(prev => prev.filter(r => r.id !== req.id));
          refreshPendingRequestsCount();
          addToast('success', '削除完了', 'リクエストを削除しました。');
        } catch (e) {
          addToast('error', '削除失敗', getErrorMessage(e));
        }
      },
    });
  };

  return (
    <PageContainer>
      <PageHeader icon={ShoppingBag} title="リクエスト一覧">
        {isAdmin && (
          <Link
            href="/requests/picking"
            className="px-4 py-2 text-sm text-white font-bold bg-cyan-600 hover:bg-cyan-700 rounded-lg flex items-center gap-1"
          >
            <ClipboardList size={16} /> ピッキングリスト
          </Link>
        )}
      </PageHeader>

      {/* フィルター */}
      {isAdmin ? (
        <div className="flex gap-2 mb-4 flex-wrap">
          {(['all', 'pending', 'completed', 'cancelled'] as const).map(s => (
            <button
              key={s}
              onClick={() => setStatusFilter(s)}
              className={`px-3 py-1.5 rounded-lg text-sm font-bold border transition-colors ${
                statusFilter === s
                  ? 'bg-cyan-600 text-white border-cyan-600'
                  : 'bg-white text-slate-600 border-slate-200 hover:bg-slate-50'
              }`}
            >
              {s === 'all' ? 'すべて' : STATUS_LABELS[s]}
            </button>
          ))}
        </div>
      ) : (
        <div className="mb-4 space-y-3">
          <div className="bg-cyan-50 border border-cyan-200 rounded-lg px-4 py-3 text-xs text-cyan-800 flex gap-2">
            <Info size={16} className="shrink-0 mt-0.5" />
            <p>
              リクエストを編集するには、送信完了時に表示された<b>編集用リンク</b>を開いてください。
              送信したブラウザでは、そのまま「編集」ボタンから編集できます。
            </p>
          </div>
          <button
            onClick={() => setShowAll(!showAll)}
            className="text-sm text-cyan-600 hover:underline flex items-center gap-1"
          >
            {showAll ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
            {showAll ? '受付中のみ表示' : '過去のリクエストを見る'}
          </button>
        </div>
      )}

      {isLoading ? (
        <div className="flex items-center justify-center py-20">
          <LoaderCircle className="animate-spin text-cyan-600" size={32} />
        </div>
      ) : filtered.length === 0 ? (
        <div className="bg-white rounded-xl p-12 text-center text-slate-400 border border-slate-200">
          <ShoppingBag size={40} className="mx-auto mb-3 opacity-20" />
          <p>リクエストがありません</p>
        </div>
      ) : (
        <div className="space-y-4">
          {filtered.map(req => (
            <div
              key={req.id}
              id={`request-${req.id}`}
              className={`bg-white rounded-xl shadow-sm border overflow-hidden ${
                highlightId === req.id ? 'border-cyan-400 ring-2 ring-cyan-300' : 'border-slate-200'
              }`}
            >
              {/* ヘッダー */}
              <div className="p-4 border-b border-slate-100 flex flex-wrap gap-3 justify-between items-center bg-slate-50">
                <div className="flex items-center gap-3">
                  <span className="font-bold text-slate-800">{req.requesterName}</span>
                  <span className={`px-2 py-0.5 rounded text-xs font-bold border ${STATUS_STYLES[req.status]}`}>
                    {STATUS_LABELS[req.status]}
                  </span>
                  {!isAdmin && ownedTokens[req.id] && (
                    <span className="px-2 py-0.5 rounded text-xs font-bold bg-amber-100 text-amber-700 border border-amber-200">
                      あなたのリクエスト
                    </span>
                  )}
                </div>
                <div className="text-xs text-slate-400">{formatDate(req.createdAt)}</div>
              </div>

              {/* アイテム一覧 */}
              <div className="p-4">
                {editingId === req.id ? (
                  <div className="space-y-3">
                    {req.status === 'completed' && (
                      <div className="bg-amber-50 border border-amber-200 rounded-lg px-3 py-2 text-xs text-amber-800 flex gap-2">
                        <TriangleAlert size={14} className="shrink-0 mt-0.5" />
                        <p>完了済みのリクエストです。枚数の変更・削除・カードの変更は、<b>差分が在庫に自動で反映されます</b>。</p>
                      </div>
                    )}

                    {/* 数量編集 */}
                    {req.items?.map(ri => {
                      const isRemoved = removedItemIds.includes(ri.id);
                      return (
                      <div key={ri.id} className="space-y-1">
                        <div className={`flex items-center gap-3 text-sm ${isRemoved ? 'opacity-50' : ''}`}>
                          <div className="flex-1 min-w-0">
                            <div className={`text-slate-700 font-medium ${isRemoved ? 'line-through' : ''}`}>{ri.item?.name || ri.supply?.name || '不明'}</div>
                            {isRemoved && <div className="text-[11px] text-red-500 font-bold">更新すると削除されます</div>}
                            {ri.item && !isRemoved && (
                              <div className="flex items-center gap-1.5 mt-0.5 flex-wrap">
                                <span className="font-mono text-xs text-slate-400">{ri.item.cardId}</span>
                                <span className={`px-1.5 py-0.5 rounded text-[11px] font-bold border ${getRarityStyle(ri.item.rarity)}`}>
                                  {ri.item.rarity}
                                </span>
                                {/* 管理者は削除ボタン横の「変更」を使う */}
                                {!isAdmin && (
                                  <button
                                    type="button"
                                    onClick={() => openSwap(ri)}
                                    className="text-[11px] text-cyan-500 hover:text-cyan-700 hover:underline flex items-center gap-0.5"
                                  >
                                    <RefreshCw size={10} />
                                    別バリアント
                                  </button>
                                )}
                              </div>
                            )}
                          </div>
                          <div className="flex items-center gap-2 shrink-0">
                            {!isRemoved && (
                              <>
                                <button onClick={() => setEditQuantities(prev => ({ ...prev, [ri.id]: Math.max(1, (prev[ri.id] ?? ri.quantity) - 1) }))} className="w-7 h-7 bg-slate-100 hover:bg-slate-200 rounded flex items-center justify-center">-</button>
                                <span className="w-8 text-center font-bold">{editQuantities[ri.id] ?? ri.quantity}</span>
                                <button onClick={() => setEditQuantities(prev => ({ ...prev, [ri.id]: (prev[ri.id] ?? ri.quantity) + 1 }))} className="w-7 h-7 bg-slate-100 hover:bg-slate-200 rounded flex items-center justify-center">+</button>
                              </>
                            )}
                            {isAdmin && ri.item && !isRemoved && (
                              <button
                                type="button"
                                onClick={() => openChange(ri)}
                                className={`px-2 h-7 rounded text-xs font-bold flex items-center gap-1 border ${
                                  changingItemId === ri.id
                                    ? 'bg-cyan-600 text-white border-cyan-600'
                                    : 'bg-white text-cyan-600 border-cyan-200 hover:bg-cyan-50'
                                }`}
                                title="枚数の調整・同名の別型番／別レアリティへの変更"
                              >
                                <RefreshCw size={12} /> 変更
                              </button>
                            )}
                            <button
                              type="button"
                              onClick={() => toggleRemoveItem(ri.id)}
                              className={`px-2 h-7 rounded text-xs font-bold flex items-center gap-1 border ${
                                isRemoved
                                  ? 'bg-white text-slate-600 border-slate-300 hover:bg-slate-50'
                                  : 'bg-white text-red-500 border-red-200 hover:bg-red-50'
                              }`}
                              title={isRemoved ? '削除を取り消す' : 'このカードをリクエストから削除'}
                            >
                              {isRemoved ? <><Undo2 size={12} /> 元に戻す</> : <><Trash size={12} /> 削除</>}
                            </button>
                          </div>
                        </div>

                        {/* バリアント選択パネル */}
                        {swappingItemId === ri.id && (
                          <div className="ml-2 p-2 bg-cyan-50 border border-cyan-200 rounded-lg text-xs">
                            {isLoadingSwap ? (
                              <div className="flex items-center gap-1 text-slate-400 py-1">
                                <LoaderCircle size={12} className="animate-spin" /> 読み込み中...
                              </div>
                            ) : swapAlternatives.length === 0 ? (
                              <p className="text-slate-400 py-1">他のバリアントはありません</p>
                            ) : (
                              <div className="space-y-1">
                                <p className="text-slate-500 mb-1.5 font-bold">変更先を選択:</p>
                                {swapAlternatives.map(alt => (
                                  <button
                                    key={alt.id}
                                    type="button"
                                    onClick={() => doSwap(req, ri, alt)}
                                    className="w-full flex items-center gap-2 px-2 py-1.5 rounded hover:bg-white border border-transparent hover:border-cyan-300 transition-colors text-left"
                                  >
                                    <span className={`px-1.5 py-0.5 rounded font-bold border ${getRarityStyle(alt.rarity)}`}>
                                      {alt.rarity}
                                    </span>
                                    <span className="font-mono text-slate-500">{alt.cardId}</span>
                                    <span className="text-slate-400 ml-auto">在庫: {alt.stock}</span>
                                  </button>
                                ))}
                              </div>
                            )}
                          </div>
                        )}

                        {/* 変更パネル（管理者用） */}
                        {changingItemId === ri.id && (
                          <div className="ml-2 p-3 bg-cyan-50 border border-cyan-200 rounded-lg text-xs space-y-3">
                            {isLoadingChange ? (
                              <div className="flex items-center gap-1 text-slate-400 py-1">
                                <LoaderCircle size={12} className="animate-spin" /> 読み込み中...
                              </div>
                            ) : (
                              <>
                                <div className="space-y-1">
                                  <p className="text-slate-500 font-bold">変更先（同名のカード）</p>
                                  {changeOptions.map(opt => {
                                    const isCurrent = opt.id === ri.item?.id;
                                    // 他のリクエストで受付中の枚数（今のカードは、このリクエストが受付中ならその分を除く）
                                    const pending = Math.max(0, (changePending[opt.id] ?? 0) - (isCurrent && req.status === 'pending' ? ri.quantity : 0));
                                    // 出せる枚数。完了済みの今のカードは、完了時に減らした分が戻る前提で足す
                                    const available = opt.stock - pending + (isCurrent && req.status === 'completed' ? ri.quantity : 0);
                                    const isShort = available < changeQuantity;
                                    return (
                                      <label
                                        key={opt.id}
                                        className={`flex items-center gap-2 px-2 py-1.5 rounded border cursor-pointer transition-colors ${
                                          changeTargetId === opt.id ? 'bg-white border-cyan-400' : 'border-transparent hover:bg-white hover:border-cyan-200'
                                        }`}
                                      >
                                        <input
                                          type="radio"
                                          name={`change-${ri.id}`}
                                          checked={changeTargetId === opt.id}
                                          onChange={() => setChangeTargetId(opt.id)}
                                          className="accent-cyan-600"
                                        />
                                        <span className={`px-1.5 py-0.5 rounded font-bold border ${getRarityStyle(opt.rarity)}`}>{opt.rarity}</span>
                                        <span className="font-mono text-slate-500">{opt.cardId}</span>
                                        {isCurrent && <span className="text-slate-400">（今のカード）</span>}
                                        <span className={`ml-auto text-right ${isShort ? 'text-red-600 font-bold' : 'text-slate-500'}`}>
                                          在庫 {opt.stock}{pending > 0 ? ` / 他で受付中 ${pending}` : ''}
                                          {isShort && <span className="block text-[10px]">足りません</span>}
                                        </span>
                                      </label>
                                    );
                                  })}
                                  {changeOptions.length <= 1 && <p className="text-slate-400">同名の別型番・別レアリティは登録されていません。</p>}
                                </div>
                                <div className="flex items-center gap-2">
                                  <span className="text-slate-500 font-bold">枚数</span>
                                  <button type="button" onClick={() => setChangeQuantity(q => Math.max(1, q - 1))} className="w-7 h-7 bg-white border border-slate-200 hover:bg-slate-50 rounded flex items-center justify-center">-</button>
                                  <span className="w-8 text-center font-bold text-sm">{changeQuantity}</span>
                                  <button type="button" onClick={() => setChangeQuantity(q => q + 1)} className="w-7 h-7 bg-white border border-slate-200 hover:bg-slate-50 rounded flex items-center justify-center">+</button>
                                </div>
                                {req.status === 'completed' && (
                                  <p className="text-amber-700">完了済みのため、変更すると在庫の差分が自動で反映されます。</p>
                                )}
                                <div className="flex justify-end gap-2">
                                  <button type="button" onClick={closeChange} className="px-3 py-1.5 text-slate-600 hover:bg-white rounded">閉じる</button>
                                  <button
                                    type="button"
                                    onClick={() => applyChange(req, ri)}
                                    disabled={isUpdating}
                                    className="px-3 py-1.5 bg-cyan-600 hover:bg-cyan-700 text-white rounded font-bold flex items-center gap-1 disabled:opacity-50"
                                  >
                                    {isUpdating ? <LoaderCircle size={12} className="animate-spin" /> : <Check size={12} />}
                                    この内容で変更
                                  </button>
                                </div>
                              </>
                            )}
                          </div>
                        )}
                      </div>
                      );
                    })}

                    {/* メモ編集 */}
                    <div>
                      <label className="text-xs font-bold text-slate-600 mb-1 block">メモ</label>
                      <textarea
                        value={editMessage}
                        onChange={(e) => setEditMessage(e.target.value)}
                        className="w-full border border-slate-300 rounded px-3 py-1.5 text-sm h-16 resize-none focus:ring-2 focus:ring-cyan-500 outline-none"
                      />
                    </div>

                    {(req.items?.length ?? 0) > 0 && removedItemIds.length >= (req.items?.length ?? 0) && (
                      <p className="text-xs text-red-500">
                        すべてのカードは削除できません。{isAdmin ? 'リクエスト自体を取り消す場合は「キャンセル」を使ってください。' : 'リクエスト自体を取り消したい場合は管理者に連絡してください。'}
                      </p>
                    )}

                    <div className="flex gap-2">
                      <button onClick={cancelEdit} className="px-3 py-1.5 text-sm text-slate-600 hover:bg-slate-100 rounded">キャンセル</button>
                      <button
                        onClick={() => submitEdit(req)}
                        disabled={isUpdating || ((req.items?.length ?? 0) > 0 && removedItemIds.length >= (req.items?.length ?? 0))}
                        className="px-4 py-1.5 bg-cyan-600 hover:bg-cyan-700 text-white rounded text-sm font-bold flex items-center gap-1 disabled:opacity-50"
                      >
                        {isUpdating ? <LoaderCircle size={14} className="animate-spin" /> : <Check size={14} />}
                        更新する
                      </button>
                    </div>
                  </div>
                ) : (
                  <>
                    <div className="space-y-2 mb-3">
                      {req.items?.map(ri => (
                        <div key={ri.id} className="flex justify-between items-start text-sm text-slate-700 gap-2">
                          <div className="flex flex-col gap-0.5 min-w-0">
                            <span className="font-medium">{ri.item?.name || ri.supply?.name || '不明'}</span>
                            {ri.item && (
                              <div className="flex items-center gap-1.5 flex-wrap">
                                <span className="font-mono text-xs text-slate-400">{ri.item.cardId}</span>
                                <span className={`px-1.5 py-0.5 rounded text-[11px] font-bold border ${getRarityStyle(ri.item.rarity)}`}>
                                  {ri.item.rarity}
                                </span>
                                {/* 受付中で在庫が足りないカード。管理者は「編集 → 変更」で別型番・別レアリティに変えられる */}
                                {isAdmin && req.status === 'pending' && ri.item.stock < ri.quantity && (
                                  <span className="px-1.5 py-0.5 rounded text-[11px] font-bold bg-red-50 text-red-600 border border-red-200">
                                    在庫不足（在庫 {ri.item.stock}）
                                  </span>
                                )}
                              </div>
                            )}
                          </div>
                          <span className="font-bold text-slate-600 shrink-0">{ri.quantity}枚{ri.unitPrice ? ` (¥${ri.unitPrice.toLocaleString()})` : ''}</span>
                        </div>
                      ))}
                    </div>

                    {req.message && (
                      <div className="bg-slate-50 rounded px-3 py-2 text-sm text-slate-600 mb-3">
                        <span className="text-slate-400 text-xs">メモ: </span>{req.message}
                      </div>
                    )}

                    {req.priceTotal && (
                      <div className="text-sm font-bold text-slate-700 mb-2">合計: ¥{req.priceTotal.toLocaleString()}</div>
                    )}

                    {req.adminMemo && (
                      <div className="bg-yellow-50 border border-yellow-200 rounded px-3 py-2 text-sm text-yellow-800 mb-2">
                        <span className="font-bold">管理者メモ: </span>{req.adminMemo}
                      </div>
                    )}
                  </>
                )}

                {/* 編集ログ折りたたみ */}
                <div className="mt-3">
                  <button
                    onClick={() => toggleLogs(req.id)}
                    className="text-xs text-slate-400 hover:text-slate-600 flex items-center gap-1"
                  >
                    {expandedLogs[req.id] ? <ChevronDown size={12} /> : <ChevronRight size={12} />}
                    編集履歴
                  </button>
                  {expandedLogs[req.id] && logsCache[req.id] && (
                    <div className="mt-2 space-y-1 text-xs text-slate-500 pl-4 border-l border-slate-200">
                      {logsCache[req.id].length === 0 ? (
                        <p>変更履歴なし</p>
                      ) : (
                        logsCache[req.id].map(log => (
                          <div key={log.id}>
                            <span className="text-slate-400">{formatDate(log.createdAt)}</span>
                            <span className="ml-2">{log.editorName}が「{log.fieldChanged}」を変更</span>
                            {(log.oldValue || log.newValue) && (
                              <div className="text-slate-400 pl-2">
                                {log.oldValue || '（なし）'} → {log.newValue || '（なし）'}
                              </div>
                            )}
                          </div>
                        ))
                      )}
                    </div>
                  )}
                </div>
              </div>

              {/* フッター操作ボタン */}
              {(isAdmin || (req.status === 'pending' && ownedTokens[req.id])) && (
                <div className="px-4 py-3 border-t border-slate-100 bg-slate-50 flex gap-2 justify-end flex-wrap">
                  {/* 削除ボタン（管理者のみ、左寄せ） */}
                  {isAdmin && (
                    <button
                      onClick={() => handleDelete(req)}
                      className="px-3 py-1.5 text-sm text-red-500 hover:bg-red-50 border border-red-200 rounded flex items-center gap-1 mr-auto"
                    >
                      <Trash size={14} /> 削除
                    </button>
                  )}

                  {/* 編集用リンクのコピー（申請者: 別端末用 / 管理者: リンクを紛失した申請者への再送用） */}
                  {req.status === 'pending' && (isAdmin ? req.token : ownedTokens[req.id]) && (
                    <button
                      onClick={() => copyEditLink((isAdmin ? req.token : ownedTokens[req.id])!)}
                      className="px-3 py-1.5 text-sm text-cyan-700 hover:bg-cyan-50 border border-cyan-200 rounded flex items-center gap-1"
                      title={isAdmin ? '申請者に送る編集用リンクをコピー' : '別の端末で編集するためのリンクをコピー'}
                    >
                      <Link2 size={14} /> 編集用リンクをコピー
                    </button>
                  )}

                  {/* 申請者の編集ボタン（このブラウザに編集用トークンがある場合のみ） */}
                  {!isAdmin && req.status === 'pending' && ownedTokens[req.id] && editingId !== req.id && (
                    <button
                      onClick={() => startEdit(req)}
                      className="px-3 py-1.5 text-sm text-slate-600 hover:bg-slate-200 bg-slate-100 rounded flex items-center gap-1"
                    >
                      <PenLine size={14} /> 編集
                    </button>
                  )}

                  {/* 管理者の編集ボタン（処理済みのリクエストも管理者のみ編集できる） */}
                  {isAdmin && req.status !== 'pending' && editingId !== req.id && (
                    <button
                      onClick={() => startEdit(req)}
                      className="px-3 py-1.5 text-sm text-slate-600 hover:bg-slate-200 bg-slate-100 rounded flex items-center gap-1"
                    >
                      <PenLine size={14} /> 編集
                    </button>
                  )}

                  {/* 管理者の操作ボタン */}
                  {isAdmin && req.status === 'pending' && (
                    <>
                      {editingId !== req.id && (
                        <button
                          onClick={() => startEdit(req)}
                          className="px-3 py-1.5 text-sm text-slate-600 hover:bg-slate-200 bg-slate-100 rounded flex items-center gap-1"
                        >
                          <PenLine size={14} /> 編集
                        </button>
                      )}
                      <button
                        onClick={() => handleCancel(req)}
                        className="px-3 py-1.5 text-sm text-slate-500 hover:bg-red-50 hover:text-red-600 border border-slate-200 rounded flex items-center gap-1"
                      >
                        <X size={14} /> キャンセル
                      </button>
                      <button
                        onClick={() => openCompleteModal(req)}
                        className="px-4 py-1.5 bg-green-600 hover:bg-green-700 text-white text-sm font-bold rounded flex items-center gap-1"
                      >
                        <Check size={14} /> 完了にする
                      </button>
                    </>
                  )}
                </div>
              )}
            </div>
          ))}
        </div>
      )}

      {/* 完了モーダル（管理者） */}
      {completingRequest && (
        <div className="fixed inset-0 bg-black/60 z-50 flex items-center justify-center p-4 animate-in fade-in duration-200">
          <div className="bg-white rounded-xl shadow-2xl max-w-lg w-full">
            <div className="p-4 border-b border-slate-100 bg-slate-50 rounded-t-xl flex justify-between items-center">
              <h3 className="text-lg font-bold text-slate-800">完了処理: {completingRequest.requesterName}</h3>
              <button onClick={() => setCompletingRequest(null)} className="text-slate-400 hover:text-slate-600"><X size={20} /></button>
            </div>
            <div className="p-5 space-y-4">
              {/* 単価入力 */}
              <div className="space-y-2">
                {completingRequest.items?.map(ri => (
                  <div key={ri.id} className="flex items-center gap-3">
                    <div className="flex-1 min-w-0">
                      <div className="text-sm text-slate-700">{ri.item?.name || ri.supply?.name || '不明'} ×{ri.quantity}</div>
                      {ri.item && (
                        <div className="flex items-center gap-1.5 mt-0.5">
                          <span className="font-mono text-xs text-slate-400">{ri.item.cardId}</span>
                          <span className={`px-1.5 py-0.5 rounded text-[11px] font-bold border ${getRarityStyle(ri.item.rarity)}`}>
                            {ri.item.rarity}
                          </span>
                        </div>
                      )}
                    </div>
                    <div className="flex items-center gap-1">
                      <span className="text-sm text-slate-500">¥</span>
                      <input
                        type="number"
                        min={0}
                        value={unitPrices[ri.id] ?? 0}
                        onChange={(e) => setUnitPrices(prev => ({ ...prev, [ri.id]: Number(e.target.value) }))}
                        className="w-24 border border-slate-300 rounded px-2 py-1 text-sm text-right"
                      />
                    </div>
                  </div>
                ))}
              </div>

              <div className="bg-slate-50 rounded px-3 py-2 text-right font-bold text-slate-800">
                合計: ¥{priceTotal.toLocaleString()}
              </div>

              <div>
                <label className="text-sm font-bold text-slate-700 mb-1 block">管理者メモ（任意）</label>
                <textarea
                  value={adminMemo}
                  onChange={(e) => setAdminMemo(e.target.value)}
                  className="w-full border border-slate-300 rounded px-3 py-2 text-sm h-16 resize-none focus:ring-2 focus:ring-cyan-500 outline-none"
                  placeholder="備考など..."
                />
              </div>

              <div className="flex gap-3 pt-2">
                <button onClick={() => setCompletingRequest(null)} className="flex-1 py-2 text-slate-600 hover:bg-slate-100 rounded-lg font-medium">キャンセル</button>
                <button
                  onClick={confirmComplete}
                  disabled={isUpdating}
                  className="flex-1 bg-green-600 hover:bg-green-700 text-white py-2 rounded-lg font-bold flex items-center justify-center gap-2 disabled:opacity-50"
                >
                  {isUpdating ? <LoaderCircle size={16} className="animate-spin" /> : <Check size={16} />}
                  確定する
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      <ConfirmDialog
        isOpen={confirmDialog.isOpen}
        title={confirmDialog.title}
        message={confirmDialog.message}
        variant={confirmDialog.variant}
        onConfirm={confirmDialog.onConfirm}
        onCancel={() => setConfirmDialog(prev => ({ ...prev, isOpen: false }))}
      />
    </PageContainer>
  );
};
