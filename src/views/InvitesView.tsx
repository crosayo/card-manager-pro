
'use client';

import React, { useState, useEffect, useCallback } from 'react';
import { Link2, Loader2, Plus, Copy, Check, Ban, Trash2, Clock, Shield, CalendarPlus } from 'lucide-react';
import { Invite } from '@/types';
import { api } from '@/services/api';
import { useAppContext } from '@/context/AppContext';
import { ConfirmDialog } from '@/components/ui/ConfirmDialog';
import { buildInviteUrl } from '@/lib/invite';

// 有効期間の選択肢（日数）
const PERIODS: { days: number; label: string }[] = [
  { days: 1, label: '1日' },
  { days: 7, label: '1週間' },
  { days: 14, label: '2週間' },
  { days: 21, label: '3週間' },
  { days: 28, label: '4週間' },
];

const formatDateTime = (iso: string) => {
  const d = new Date(iso);
  return `${d.getFullYear()}/${String(d.getMonth() + 1).padStart(2, '0')}/${String(d.getDate()).padStart(2, '0')} ${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
};

const getState = (invite: Invite): 'active' | 'expired' | 'revoked' => {
  if (invite.revokedAt) return 'revoked';
  return new Date(invite.expiresAt).getTime() > Date.now() ? 'active' : 'expired';
};

const formatRemaining = (iso: string) => {
  const ms = new Date(iso).getTime() - Date.now();
  if (ms <= 0) return '';
  const hours = Math.floor(ms / (60 * 60 * 1000));
  return hours >= 24 ? `残り${Math.floor(hours / 24)}日` : `残り${Math.max(1, hours)}時間`;
};

const STATE_LABELS = { active: '有効', expired: '期限切れ', revoked: '取消済み' };
const STATE_STYLES = {
  active: 'bg-green-100 text-green-700 border-green-200',
  expired: 'bg-slate-100 text-slate-500 border-slate-200',
  revoked: 'bg-red-50 text-red-500 border-red-200',
};

export const InvitesView: React.FC = () => {
  const { isAdmin, addToast } = useAppContext();
  const [invites, setInvites] = useState<Invite[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isCreating, setIsCreating] = useState(false);
  const [label, setLabel] = useState('');
  const [days, setDays] = useState(7);
  const [justCreatedId, setJustCreatedId] = useState<number | null>(null);
  const [copiedId, setCopiedId] = useState<number | null>(null);
  const [extendingId, setExtendingId] = useState<number | null>(null);
  const [confirmDialog, setConfirmDialog] = useState<{
    isOpen: boolean; title: string; message: string; variant: 'danger' | 'warning' | 'info'; onConfirm: () => void;
  }>({ isOpen: false, title: '', message: '', variant: 'warning', onConfirm: () => {} });

  const load = useCallback(async () => {
    setIsLoading(true);
    try {
      setInvites(await api.fetchInvites());
    } catch (e: any) {
      addToast('error', '招待リンクの取得に失敗しました', e.message);
    } finally {
      setIsLoading(false);
    }
  }, [addToast]);

  useEffect(() => { if (isAdmin) load(); }, [isAdmin, load]);

  const replaceInvite = (updated: Invite) => setInvites(prev => prev.map(i => i.id === updated.id ? updated : i));

  const copyLink = async (invite: Invite) => {
    try {
      await navigator.clipboard.writeText(buildInviteUrl(invite.code));
      setCopiedId(invite.id);
      setTimeout(() => setCopiedId(prev => prev === invite.id ? null : prev), 2000);
    } catch {
      addToast('error', 'コピーできませんでした', 'ブラウザがクリップボードへのアクセスを許可していません。');
    }
  };

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsCreating(true);
    try {
      const created = await api.createInvite({ label, days });
      setInvites(prev => [created, ...prev]);
      setJustCreatedId(created.id);
      setLabel('');
      await copyLink(created);
      addToast('success', '招待リンクを発行しました', 'リンクをコピーしました。渡したい相手に送ってください。');
    } catch (e: any) {
      addToast('error', '発行に失敗しました', e.message);
    } finally {
      setIsCreating(false);
    }
  };

  const handleExtend = async (invite: Invite, extendDays: number) => {
    try {
      replaceInvite(await api.extendInvite(invite, extendDays));
      setExtendingId(null);
      addToast('success', '有効期限を延長しました');
    } catch (e: any) {
      addToast('error', '延長に失敗しました', e.message);
    }
  };

  const handleRevoke = (invite: Invite) => {
    setConfirmDialog({
      isOpen: true,
      title: '招待リンクを取り消す',
      message: `「${invite.label || '名前なし'}」の招待リンクを取り消しますか？\nこのリンクではすぐにアクセスできなくなります。`,
      variant: 'warning',
      onConfirm: async () => {
        setConfirmDialog(prev => ({ ...prev, isOpen: false }));
        try {
          replaceInvite(await api.revokeInvite(invite.id));
          addToast('info', '招待リンクを取り消しました');
        } catch (e: any) {
          addToast('error', '取り消しに失敗しました', e.message);
        }
      },
    });
  };

  const handleDelete = (invite: Invite) => {
    setConfirmDialog({
      isOpen: true,
      title: '招待リンクを削除',
      message: `「${invite.label || '名前なし'}」の招待リンクを一覧から削除しますか？\nこのリンクではアクセスできなくなります。`,
      variant: 'danger',
      onConfirm: async () => {
        setConfirmDialog(prev => ({ ...prev, isOpen: false }));
        try {
          await api.deleteInvite(invite.id);
          setInvites(prev => prev.filter(i => i.id !== invite.id));
          addToast('info', '招待リンクを削除しました');
        } catch (e: any) {
          addToast('error', '削除に失敗しました', e.message);
        }
      },
    });
  };

  if (!isAdmin) {
    return (
      <div className="p-4 md:p-8">
        <div className="bg-red-50 p-6 rounded-lg text-red-600 border border-red-200 flex items-center gap-3">
          <Shield size={24} />
          <div className="font-bold">このページにアクセスする権限がありません</div>
        </div>
      </div>
    );
  }

  // 有効なものを上に、その中では期限が近い順
  const sorted = [...invites].sort((a, b) => {
    const order = { active: 0, expired: 1, revoked: 2 };
    const diff = order[getState(a)] - order[getState(b)];
    if (diff !== 0) return diff;
    return getState(a) === 'active'
      ? new Date(a.expiresAt).getTime() - new Date(b.expiresAt).getTime()
      : new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime();
  });

  return (
    <div className="p-4 md:p-8 pb-20 max-w-4xl">
      <h2 className="text-2xl font-bold text-slate-800 flex items-center gap-2 mb-2">
        <Link2 /> 招待リンク
      </h2>
      <p className="text-sm text-slate-500 mb-6">
        ログインしていない人は、有効な招待リンクを開いた場合だけ在庫の閲覧とリクエストができます。
      </p>

      {/* 発行フォーム */}
      <form onSubmit={handleCreate} className="bg-white rounded-xl shadow-sm border border-slate-200 p-5 mb-6 space-y-4">
        <div>
          <label className="block text-sm font-bold text-slate-700 mb-1">渡す相手（メモ・任意）</label>
          <input
            type="text"
            value={label}
            onChange={(e) => setLabel(e.target.value)}
            maxLength={50}
            placeholder="例: 山田さん / ショップ大会の参加者"
            className="w-full border border-slate-300 rounded px-3 py-2 text-sm focus:ring-2 focus:ring-cyan-500 outline-none"
          />
        </div>
        <div>
          <label className="block text-sm font-bold text-slate-700 mb-1">有効期間</label>
          <div className="flex flex-wrap gap-2">
            {PERIODS.map(p => (
              <button
                key={p.days}
                type="button"
                onClick={() => setDays(p.days)}
                className={`px-3 py-1.5 rounded-lg text-sm font-bold border transition-colors ${
                  days === p.days ? 'bg-cyan-600 text-white border-cyan-600' : 'bg-white text-slate-600 border-slate-200 hover:bg-slate-50'
                }`}
              >
                {p.label}
              </button>
            ))}
          </div>
        </div>
        <button
          type="submit"
          disabled={isCreating}
          className="bg-cyan-600 hover:bg-cyan-700 text-white px-4 py-2 rounded-lg font-bold text-sm flex items-center gap-2 disabled:opacity-50"
        >
          {isCreating ? <Loader2 size={16} className="animate-spin" /> : <Plus size={16} />}
          招待リンクを発行してコピー
        </button>
      </form>

      {/* 一覧 */}
      {isLoading ? (
        <div className="flex justify-center py-12"><Loader2 className="animate-spin text-cyan-600" size={28} /></div>
      ) : sorted.length === 0 ? (
        <div className="bg-white rounded-xl p-10 text-center text-slate-400 border border-slate-200">発行した招待リンクはありません</div>
      ) : (
        <div className="space-y-3">
          {sorted.map(invite => {
            const state = getState(invite);
            return (
              <div
                key={invite.id}
                className={`bg-white rounded-xl shadow-sm border p-4 ${justCreatedId === invite.id ? 'border-cyan-400 ring-2 ring-cyan-200' : 'border-slate-200'}`}
              >
                <div className="flex flex-wrap items-center gap-2 mb-2">
                  <span className="font-bold text-slate-800">{invite.label || '名前なし'}</span>
                  <span className={`px-2 py-0.5 rounded text-xs font-bold border ${STATE_STYLES[state]}`}>{STATE_LABELS[state]}</span>
                  {state === 'active' && <span className="text-xs text-cyan-700">{formatRemaining(invite.expiresAt)}</span>}
                </div>
                <div className="text-xs text-slate-500 space-y-0.5 mb-3">
                  <div className="flex items-center gap-1"><Clock size={11} /> 有効期限: {formatDateTime(invite.expiresAt)}</div>
                  <div>発行: {formatDateTime(invite.createdAt)} / 最終アクセス: {invite.lastUsedAt ? formatDateTime(invite.lastUsedAt) : 'なし'}（{invite.useCount}回）</div>
                </div>

                {state !== 'revoked' && (
                  <div className="flex flex-wrap gap-2">
                    {state === 'active' && (
                      <button
                        onClick={() => copyLink(invite)}
                        className="px-3 py-1.5 text-sm text-cyan-700 hover:bg-cyan-50 border border-cyan-200 rounded flex items-center gap-1"
                      >
                        {copiedId === invite.id ? <Check size={14} /> : <Copy size={14} />}
                        {copiedId === invite.id ? 'コピーしました' : 'リンクをコピー'}
                      </button>
                    )}
                    {extendingId === invite.id ? (
                      <div className="flex flex-wrap items-center gap-1">
                        <span className="text-xs text-slate-500">延長:</span>
                        {PERIODS.map(p => (
                          <button
                            key={p.days}
                            onClick={() => handleExtend(invite, p.days)}
                            className="px-2 py-1 text-xs font-bold text-slate-600 border border-slate-200 rounded hover:bg-slate-50"
                          >
                            +{p.label}
                          </button>
                        ))}
                        <button onClick={() => setExtendingId(null)} className="px-2 py-1 text-xs text-slate-400 hover:text-slate-600">やめる</button>
                      </div>
                    ) : (
                      <button
                        onClick={() => setExtendingId(invite.id)}
                        className="px-3 py-1.5 text-sm text-slate-600 hover:bg-slate-50 border border-slate-200 rounded flex items-center gap-1"
                      >
                        <CalendarPlus size={14} /> {state === 'expired' ? '再度有効にする' : '延長'}
                      </button>
                    )}
                    {state === 'active' && (
                      <button
                        onClick={() => handleRevoke(invite)}
                        className="px-3 py-1.5 text-sm text-red-500 hover:bg-red-50 border border-red-200 rounded flex items-center gap-1"
                      >
                        <Ban size={14} /> 取り消す
                      </button>
                    )}
                  </div>
                )}
                {state !== 'active' && (
                  <button
                    onClick={() => handleDelete(invite)}
                    className="mt-2 text-xs text-slate-400 hover:text-red-500 flex items-center gap-1"
                  >
                    <Trash2 size={12} /> 一覧から削除
                  </button>
                )}
              </div>
            );
          })}
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
