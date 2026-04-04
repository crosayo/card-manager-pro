
'use client';

import React, { useState, useEffect, useCallback } from 'react';
import { ShoppingBag, Loader2, ChevronDown, ChevronRight, Check, X, Edit3, AlertCircle, Trash2 } from 'lucide-react';
import { CardRequest, RequestItem, RequestEditLog } from '@/types';
import { api } from '@/services/api';
import { useAppContext } from '@/context/AppContext';
import { ConfirmDialog } from '@/components/ui/ConfirmDialog';

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

export const RequestsView: React.FC = () => {
  const { isAdmin, addToast } = useAppContext();
  const [requests, setRequests] = useState<CardRequest[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [statusFilter, setStatusFilter] = useState<CardRequest['status'] | 'all'>('all');
  const [showAll, setShowAll] = useState(false);

  // 編集状態
  const [editingId, setEditingId] = useState<number | null>(null);
  const [editNameInput, setEditNameInput] = useState('');
  const [nameError, setNameError] = useState('');
  const [editMessage, setEditMessage] = useState('');
  const [editQuantities, setEditQuantities] = useState<Record<number, number>>({});

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
      const data = await api.fetchRequests();
      setRequests(data);
    } catch (e: any) {
      addToast('error', 'リクエスト取得失敗', e.message);
    } finally {
      setIsLoading(false);
    }
  }, [addToast]);

  useEffect(() => { load(); }, [load]);

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
    // 管理者の場合は名前確認不要なので requesterName を自動設定
    setEditNameInput(isAdmin ? req.requesterName : '');
    setNameError('');
    setEditMessage(req.message || '');
    const qtys: Record<number, number> = {};
    req.items?.forEach(ri => { qtys[ri.id] = ri.quantity; });
    setEditQuantities(qtys);
  };

  const cancelEdit = () => {
    setEditingId(null);
    setNameError('');
  };

  const submitEdit = async (req: CardRequest) => {
    setIsUpdating(true);
    try {
      const itemChanges = Object.entries(editQuantities)
        .filter(([riId, qty]) => {
          const orig = req.items?.find(ri => ri.id === Number(riId))?.quantity;
          return orig !== qty;
        })
        .map(([riId, qty]) => ({ requestItemId: Number(riId), quantity: qty }));

      const updated = await api.editRequest(req.id, editNameInput, {
        message: editMessage !== req.message ? editMessage : undefined,
        itemChanges: itemChanges.length > 0 ? itemChanges : undefined,
      });

      // 変更があればログ記録
      if (itemChanges.length > 0 || editMessage !== req.message) {
        await api.addRequestEditLog({
          requestId: req.id,
          editorName: editNameInput,
          fieldChanged: itemChanges.length > 0 ? '数量' : 'メモ',
          oldValue: itemChanges.length > 0 ? '（変更前）' : req.message || '',
          newValue: itemChanges.length > 0 ? '（変更後）' : editMessage,
        });
      }

      setRequests(prev => prev.map(r => r.id === req.id ? updated : r));
      setEditingId(null);
      addToast('success', '更新完了', 'リクエストを更新しました。');
    } catch (e: any) {
      if (e.code === 'NAME_MISMATCH') {
        setNameError(e.message);
      } else {
        addToast('error', '更新失敗', e.message);
      }
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

      // 在庫を実際に減らす + ログ記録
      for (const ri of (completingRequest.items || [])) {
        if (ri.itemId) {
          try {
            const updatedItem = await api.updateStock(ri.itemId, -ri.quantity);
            await api.addStockLog({
              itemId: ri.itemId,
              delta: -ri.quantity,
              stockAfter: updatedItem.stock,
              source: 'request',
              requestId: completingRequest.id,
            });
          } catch (e) {
            console.warn('在庫更新/ログ記録失敗:', e);
          }
        }
      }

      setRequests(prev => prev.map(r => r.id === completingRequest.id ? updated : r));
      setCompletingRequest(null);
      addToast('success', '完了処理完了', 'リクエストを完了しました。');
    } catch (e: any) {
      addToast('error', '完了処理失敗', e.message);
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
          addToast('info', 'キャンセル完了', 'リクエストをキャンセルしました。');
        } catch (e: any) {
          addToast('error', 'キャンセル失敗', e.message);
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
          addToast('success', '削除完了', 'リクエストを削除しました。');
        } catch (e: any) {
          addToast('error', '削除失敗', e.message);
        }
      },
    });
  };

  return (
    <div className="p-4 md:p-8 pb-20">
      <div className="flex justify-between items-center mb-6">
        <h2 className="text-2xl font-bold text-slate-800 flex items-center gap-2">
          <ShoppingBag /> リクエスト一覧
        </h2>
      </div>

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
        <div className="mb-4">
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
          <Loader2 className="animate-spin text-cyan-600" size={32} />
        </div>
      ) : filtered.length === 0 ? (
        <div className="bg-white rounded-xl p-12 text-center text-slate-400 border border-slate-200">
          <ShoppingBag size={40} className="mx-auto mb-3 opacity-20" />
          <p>リクエストがありません</p>
        </div>
      ) : (
        <div className="space-y-4">
          {filtered.map(req => (
            <div key={req.id} className="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden">
              {/* ヘッダー */}
              <div className="p-4 border-b border-slate-100 flex flex-wrap gap-3 justify-between items-center bg-slate-50">
                <div className="flex items-center gap-3">
                  <span className="font-bold text-slate-800">{req.requesterName}</span>
                  <span className={`px-2 py-0.5 rounded text-xs font-bold border ${STATUS_STYLES[req.status]}`}>
                    {STATUS_LABELS[req.status]}
                  </span>
                </div>
                <div className="text-xs text-slate-400">{formatDate(req.createdAt)}</div>
              </div>

              {/* アイテム一覧 */}
              <div className="p-4">
                {editingId === req.id ? (
                  <div className="space-y-3">
                    {/* 名前確認（ゲストのみ表示） */}
                    {!isAdmin && (
                      <div>
                        <label className="text-xs font-bold text-slate-600 mb-1 block">本人確認: お名前を入力してください</label>
                        <input
                          type="text"
                          value={editNameInput}
                          onChange={(e) => { setEditNameInput(e.target.value); setNameError(''); }}
                          className={`w-full border rounded px-3 py-1.5 text-sm focus:ring-2 focus:ring-cyan-500 outline-none ${nameError ? 'border-red-400' : 'border-slate-300'}`}
                          placeholder="送信時に入力したお名前"
                        />
                        {nameError && <p className="text-red-500 text-xs mt-1 flex items-center gap-1"><AlertCircle size={10} />{nameError}</p>}
                      </div>
                    )}

                    {/* 数量編集 */}
                    {req.items?.map(ri => (
                      <div key={ri.id} className="flex items-center gap-3 text-sm">
                        <span className="flex-1 text-slate-700">{ri.item?.name || ri.supply?.name || '不明'}</span>
                        <div className="flex items-center gap-2">
                          <button onClick={() => setEditQuantities(prev => ({ ...prev, [ri.id]: Math.max(1, (prev[ri.id] ?? ri.quantity) - 1) }))} className="w-7 h-7 bg-slate-100 hover:bg-slate-200 rounded flex items-center justify-center">-</button>
                          <span className="w-8 text-center font-bold">{editQuantities[ri.id] ?? ri.quantity}</span>
                          <button onClick={() => setEditQuantities(prev => ({ ...prev, [ri.id]: (prev[ri.id] ?? ri.quantity) + 1 }))} className="w-7 h-7 bg-slate-100 hover:bg-slate-200 rounded flex items-center justify-center">+</button>
                        </div>
                      </div>
                    ))}

                    {/* メモ編集 */}
                    <div>
                      <label className="text-xs font-bold text-slate-600 mb-1 block">メモ</label>
                      <textarea
                        value={editMessage}
                        onChange={(e) => setEditMessage(e.target.value)}
                        className="w-full border border-slate-300 rounded px-3 py-1.5 text-sm h-16 resize-none focus:ring-2 focus:ring-cyan-500 outline-none"
                      />
                    </div>

                    <div className="flex gap-2">
                      <button onClick={cancelEdit} className="px-3 py-1.5 text-sm text-slate-600 hover:bg-slate-100 rounded">キャンセル</button>
                      <button
                        onClick={() => submitEdit(req)}
                        disabled={isUpdating || (!isAdmin && !editNameInput.trim())}
                        className="px-4 py-1.5 bg-cyan-600 hover:bg-cyan-700 text-white rounded text-sm font-bold flex items-center gap-1 disabled:opacity-50"
                      >
                        {isUpdating ? <Loader2 size={14} className="animate-spin" /> : <Check size={14} />}
                        更新する
                      </button>
                    </div>
                  </div>
                ) : (
                  <>
                    <div className="space-y-1 mb-3">
                      {req.items?.map(ri => (
                        <div key={ri.id} className="flex justify-between text-sm text-slate-700">
                          <span>{ri.item?.name || ri.supply?.name || '不明'}</span>
                          <span className="font-bold text-slate-600">{ri.quantity}枚{ri.unitPrice ? ` (¥${ri.unitPrice.toLocaleString()})` : ''}</span>
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
                          </div>
                        ))
                      )}
                    </div>
                  )}
                </div>
              </div>

              {/* フッター操作ボタン */}
              {(req.status === 'pending' || isAdmin) && (
                <div className="px-4 py-3 border-t border-slate-100 bg-slate-50 flex gap-2 justify-end flex-wrap">
                  {/* 削除ボタン（管理者のみ、左寄せ） */}
                  {isAdmin && (
                    <button
                      onClick={() => handleDelete(req)}
                      className="px-3 py-1.5 text-sm text-red-500 hover:bg-red-50 border border-red-200 rounded flex items-center gap-1 mr-auto"
                    >
                      <Trash2 size={14} /> 削除
                    </button>
                  )}

                  {/* ゲストの編集ボタン */}
                  {!isAdmin && req.status === 'pending' && editingId !== req.id && (
                    <button
                      onClick={() => startEdit(req)}
                      className="px-3 py-1.5 text-sm text-slate-600 hover:bg-slate-200 bg-slate-100 rounded flex items-center gap-1"
                    >
                      <Edit3 size={14} /> 編集
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
                          <Edit3 size={14} /> 編集
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
              <h3 className="font-bold text-slate-800">完了処理: {completingRequest.requesterName}</h3>
              <button onClick={() => setCompletingRequest(null)} className="text-slate-400 hover:text-slate-600"><X size={20} /></button>
            </div>
            <div className="p-5 space-y-4">
              {/* 単価入力 */}
              <div className="space-y-2">
                {completingRequest.items?.map(ri => (
                  <div key={ri.id} className="flex items-center gap-3">
                    <span className="flex-1 text-sm text-slate-700">{ri.item?.name || ri.supply?.name || '不明'} ×{ri.quantity}</span>
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
                  {isUpdating ? <Loader2 size={16} className="animate-spin" /> : <Check size={16} />}
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
    </div>
  );
};
