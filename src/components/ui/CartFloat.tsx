
'use client';

import React, { useState } from 'react';
import { ShoppingCart, X, LoaderCircle, Send, Minus, Plus, CircleCheck, Copy, Check, TriangleAlert, ExternalLink } from 'lucide-react';
import { useCart } from '@/context/CartContext';
import { api } from '@/services/api';
import { useAppContext } from '@/context/AppContext';
import { buildRequestEditUrl, saveRequestToken } from '@/lib/requestTokens';
import { getErrorMessage } from '@/utils';

export const CartFloat: React.FC = () => {
  const { cartItems, removeFromCart, updateQuantity, clearCart, totalCount } = useCart();
  const { addToast, isAdmin, refreshPendingRequestsCount } = useAppContext();
  const [isOpen, setIsOpen] = useState(false);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [requesterName, setRequesterName] = useState('');
  const [message, setMessage] = useState('');
  const [isSending, setIsSending] = useState(false);

  // 送信完了画面（編集用リンクの表示）
  const [completedEditUrl, setCompletedEditUrl] = useState<string | null>(null);
  const [isLinkCopied, setIsLinkCopied] = useState(false);

  const copyEditUrl = async () => {
    if (!completedEditUrl) return;
    try {
      await navigator.clipboard.writeText(completedEditUrl);
      setIsLinkCopied(true);
    } catch {
      addToast('error', 'コピーできませんでした', 'リンクを長押し（または選択）して手動でコピーしてください。');
    }
  };

  const closeCompleted = () => {
    setCompletedEditUrl(null);
    setIsLinkCopied(false);
  };

  if (completedEditUrl) {
    return (
      <div className="fixed inset-0 bg-black/60 z-50 flex items-center justify-center p-4 animate-in fade-in duration-200">
        <div className="bg-white rounded-xl shadow-2xl max-w-md w-full">
          <div className="p-5 text-center border-b border-slate-100">
            <CircleCheck size={44} className="mx-auto text-green-500 mb-2" />
            <h3 className="text-lg font-bold text-slate-800">リクエストを送信しました</h3>
          </div>

          <div className="p-5 space-y-4">
            <div>
              <p className="text-sm font-bold text-slate-700 mb-1">あなた専用の編集用リンク</p>
              <p className="text-xs text-slate-500 mb-2">
                あとから枚数やメモを変更するときに使います。<b>必ずコピーして保存してください。</b>
              </p>
              <div className="flex gap-2">
                <input
                  type="text"
                  readOnly
                  value={completedEditUrl}
                  onFocus={(e) => e.target.select()}
                  className="flex-1 min-w-0 border border-slate-300 rounded px-3 py-2 text-xs font-mono bg-slate-50 text-slate-600"
                />
                <button
                  type="button"
                  onClick={copyEditUrl}
                  className={`shrink-0 px-3 py-2 rounded-lg font-bold text-sm flex items-center gap-1 transition-colors ${
                    isLinkCopied ? 'bg-green-600 text-white' : 'bg-cyan-600 hover:bg-cyan-700 text-white animate-pulse'
                  }`}
                >
                  {isLinkCopied ? <Check size={16} /> : <Copy size={16} />}
                  {isLinkCopied ? 'コピー済み' : 'コピー'}
                </button>
              </div>
            </div>

            <div className="bg-amber-50 border border-amber-200 rounded-lg p-3 text-xs text-amber-800 flex gap-2">
              <TriangleAlert size={16} className="shrink-0 mt-0.5" />
              <div className="space-y-1">
                <p>このリンクを知っている人は誰でもリクエストを編集できます。<b>他の人には共有しないでください。</b></p>
                <p>このブラウザでは、リクエスト一覧からそのまま編集できます。別の端末やブラウザで編集するときにリンクが必要です。</p>
              </div>
            </div>

            <div className="flex gap-3 pt-1">
              <button
                type="button"
                onClick={closeCompleted}
                className="flex-1 py-2 text-slate-600 hover:bg-slate-100 rounded-lg font-medium text-sm"
              >
                {isLinkCopied ? '閉じる' : 'コピーせずに閉じる'}
              </button>
              <a
                href="/requests"
                onClick={closeCompleted}
                className="flex-1 bg-slate-700 hover:bg-slate-800 text-white py-2 rounded-lg font-bold text-sm flex items-center justify-center gap-1"
              >
                <ExternalLink size={14} /> リクエスト一覧へ
              </a>
            </div>
          </div>
        </div>
      </div>
    );
  }

  if (totalCount === 0) return null;

  const handleSend = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!requesterName.trim()) return;
    setIsSending(true);
    try {
      const request = await api.createRequest({
        requesterName: requesterName.trim(),
        message: message.trim() || undefined,
        items: cartItems.map(c => ({
          itemId: c.itemId,
          supplyId: c.supplyId,
          quantity: c.quantity,
        })),
      });
      await api.sendDiscordNotification(request);
      if (isAdmin) refreshPendingRequestsCount();
      clearCart();
      setIsModalOpen(false);
      setIsOpen(false);
      setRequesterName('');
      setMessage('');
      if (request.token) {
        saveRequestToken(request.id, request.token);
        setIsLinkCopied(false);
        setCompletedEditUrl(buildRequestEditUrl(request.token));
      } else {
        addToast('success', 'リクエスト送信完了', 'リクエストを受け付けました。リクエスト一覧で確認できます。');
      }
    } catch (e) {
      addToast('error', '送信失敗', getErrorMessage(e));
    } finally {
      setIsSending(false);
    }
  };

  return (
    <>
      {/* フローティングボタン */}
      <div className="fixed bottom-6 right-6 z-40 flex flex-col items-end gap-2 print:hidden">
        {/* カートポップアップ */}
        {isOpen && (
          <div className="bg-white rounded-xl shadow-2xl border border-slate-200 w-80 max-h-96 flex flex-col animate-in slide-in-from-bottom-2 duration-200">
            <div className="p-3 border-b border-slate-100 flex justify-between items-center bg-slate-50 rounded-t-xl">
              <span className="font-bold text-slate-700 text-sm">カート ({totalCount}枚)</span>
              <button onClick={() => setIsOpen(false)} className="text-slate-400 hover:text-slate-600">
                <X size={16} />
              </button>
            </div>
            <div className="overflow-y-auto flex-1 divide-y divide-slate-50">
              {cartItems.map((item, i) => (
                <div key={i} className="flex items-center gap-2 p-2.5">
                  <div className="flex-1 text-sm text-slate-700 truncate">{item.name}</div>
                  <div className="flex items-center gap-1">
                    <button
                      onClick={() => updateQuantity(i, item.quantity - 1)}
                      className="w-6 h-6 flex items-center justify-center rounded bg-slate-100 hover:bg-slate-200 text-slate-600"
                    >
                      <Minus size={10} />
                    </button>
                    <span className="w-6 text-center text-sm font-bold">{item.quantity}</span>
                    <button
                      onClick={() => updateQuantity(i, item.quantity + 1)}
                      disabled={item.quantity >= item.maxStock}
                      className="w-6 h-6 flex items-center justify-center rounded bg-slate-100 hover:bg-slate-200 text-slate-600 disabled:opacity-30"
                    >
                      <Plus size={10} />
                    </button>
                  </div>
                  <button
                    onClick={() => removeFromCart(i)}
                    className="text-slate-300 hover:text-red-500 ml-1"
                  >
                    <X size={14} />
                  </button>
                </div>
              ))}
            </div>
            <div className="p-3 border-t border-slate-100">
              <button
                onClick={() => setIsModalOpen(true)}
                className="w-full bg-cyan-600 hover:bg-cyan-700 text-white py-2 rounded-lg font-bold text-sm flex items-center justify-center gap-2"
              >
                <Send size={14} /> リクエストを送る
              </button>
            </div>
          </div>
        )}

        {/* フローティングボタン本体 */}
        <button
          onClick={() => setIsOpen(!isOpen)}
          className="w-14 h-14 bg-cyan-600 hover:bg-cyan-700 text-white rounded-full shadow-lg flex items-center justify-center relative transition-transform active:scale-95"
        >
          <ShoppingCart size={22} />
          <span className="absolute -top-1 -right-1 bg-red-500 text-white text-xs font-bold rounded-full w-5 h-5 flex items-center justify-center">
            {Math.min(totalCount, 99)}
          </span>
        </button>
      </div>

      {/* 送信モーダル */}
      {isModalOpen && (
        <div className="fixed inset-0 bg-black/60 z-50 flex items-center justify-center p-4 animate-in fade-in duration-200">
          <div className="bg-white rounded-xl shadow-2xl max-w-md w-full">
            <div className="p-4 border-b border-slate-100 flex justify-between items-center bg-slate-50 rounded-t-xl">
              <h3 className="text-lg font-bold text-slate-800 flex items-center gap-2">
                <Send size={18} className="text-cyan-600" /> リクエスト送信
              </h3>
              <button onClick={() => setIsModalOpen(false)} className="text-slate-400 hover:text-slate-600">
                <X size={20} />
              </button>
            </div>

            <form onSubmit={handleSend} className="p-5 space-y-4">
              {/* カート内容確認 */}
              <div className="bg-slate-50 rounded-lg p-3 text-sm space-y-1">
                {cartItems.map((item, i) => (
                  <div key={i} className="flex justify-between text-slate-600">
                    <span className="truncate">{item.name}</span>
                    <span className="font-bold ml-2 shrink-0">{item.quantity}枚</span>
                  </div>
                ))}
              </div>

              <div>
                <label className="block text-sm font-bold text-slate-700 mb-1">お名前 <span className="text-red-500">*</span></label>
                <input
                  type="text"
                  required
                  value={requesterName}
                  onChange={(e) => setRequesterName(e.target.value)}
                  className="w-full border border-slate-300 rounded px-3 py-2 focus:ring-2 focus:ring-cyan-500 outline-none"
                  placeholder="例: 山田太郎"
                />
              </div>

              <div>
                <label className="block text-sm font-bold text-slate-700 mb-1">一言メモ（任意）</label>
                <textarea
                  value={message}
                  onChange={(e) => setMessage(e.target.value)}
                  className="w-full border border-slate-300 rounded px-3 py-2 focus:ring-2 focus:ring-cyan-500 outline-none h-20 resize-none"
                  placeholder="備考など..."
                />
              </div>

              <div className="flex gap-3 pt-2">
                <button
                  type="button"
                  onClick={() => setIsModalOpen(false)}
                  className="flex-1 py-2 text-slate-600 hover:bg-slate-100 rounded-lg font-medium"
                >
                  キャンセル
                </button>
                <button
                  type="submit"
                  disabled={isSending || !requesterName.trim()}
                  className="flex-1 bg-cyan-600 hover:bg-cyan-700 text-white py-2 rounded-lg font-bold flex items-center justify-center gap-2 disabled:opacity-50"
                >
                  {isSending ? <LoaderCircle className="animate-spin" size={16} /> : <Send size={16} />}
                  送信する
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </>
  );
};
