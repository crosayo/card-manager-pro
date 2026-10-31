
'use client';

import React, { useState, useEffect, useCallback } from 'react';
import { Link2, LoaderCircle, Plus, Copy, Check, Ban, Trash, Clock, Shield, CalendarPlus, RefreshCw, ChevronDown, ChevronRight, SquareCheckBig, Square, X, RotateCcwClock } from 'lucide-react';
import { Invite, InviteAccessLog } from '@/types';
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
const periodLabel = (days: number) => PERIODS.find(p => p.days === days)?.label ?? `${days}日`;

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

// ブラウザ情報（User-Agent）から、端末とブラウザの種類をおおまかに判定する
const describeUserAgent = (ua: string | null): string => {
  if (!ua) return '不明';
  const device =
    /iPhone/.test(ua) ? 'iPhone' :
    /iPad/.test(ua) ? 'iPad' :
    /Android/.test(ua) ? (/Mobile/.test(ua) ? 'Androidスマホ' : 'Androidタブレット') :
    /Windows/.test(ua) ? 'Windows' :
    /Macintosh|Mac OS X/.test(ua) ? 'Mac' :
    /Linux/.test(ua) ? 'Linux' : 'その他';
  const browser =
    /bot|crawler|spider|curl|python|wget/i.test(ua) ? 'ボット・ツール' :
    /Edg\//.test(ua) ? 'Edge' :
    /Line\//.test(ua) ? 'LINE' :
    /CriOS|Chrome\//.test(ua) ? 'Chrome' :
    /FxiOS|Firefox\//.test(ua) ? 'Firefox' :
    /Safari\//.test(ua) ? 'Safari' : 'その他';
  return `${device} / ${browser}`;
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
  const [autoExtend, setAutoExtend] = useState(false);
  const [justCreatedId, setJustCreatedId] = useState<number | null>(null);
  const [copiedId, setCopiedId] = useState<number | null>(null);
  const [extendingId, setExtendingId] = useState<number | null>(null);

  // 一括操作
  const [selectedIds, setSelectedIds] = useState<number[]>([]);
  const [isBulkWorking, setIsBulkWorking] = useState(false);

  // アクセス履歴
  const [openLogsId, setOpenLogsId] = useState<number | null>(null);
  const [logsCache, setLogsCache] = useState<Record<number, InviteAccessLog[]>>({});
  const [isLoadingLogs, setIsLoadingLogs] = useState(false);

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

  const replaceInvites = (updated: Invite[]) => {
    const map = new Map(updated.map(u => [u.id, u]));
    setInvites(prev => prev.map(i => map.get(i.id) ?? i));
  };

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
      const created = await api.createInvite({ label, days, autoExtend });
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
      replaceInvites([await api.extendInvite(invite, extendDays)]);
      setExtendingId(null);
      addToast('success', '有効期限を延長しました');
    } catch (e: any) {
      addToast('error', '延長に失敗しました', e.message);
    }
  };

  const toggleAutoExtend = async (invite: Invite) => {
    // オンにするときの延長幅は、発行時の期間が不明なため「1週間」を既定にする
    const next = invite.autoExtendDays ? null : 7;
    try {
      replaceInvites([await api.setInviteAutoExtend(invite.id, next)]);
      addToast('success', next ? '自動延長をオンにしました' : '自動延長をオフにしました',
        next ? `アクセスされるたびに、その時点から${periodLabel(next)}有効になります。` : undefined);
    } catch (e: any) {
      addToast('error', '変更に失敗しました', e.message);
    }
  };

  const changeAutoExtendDays = async (invite: Invite, newDays: number) => {
    try {
      replaceInvites([await api.setInviteAutoExtend(invite.id, newDays)]);
    } catch (e: any) {
      addToast('error', '変更に失敗しました', e.message);
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
          replaceInvites([await api.revokeInvite(invite.id)]);
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
      message: `「${invite.label || '名前なし'}」の招待リンクを一覧から削除しますか？\nアクセス履歴も削除されます。`,
      variant: 'danger',
      onConfirm: async () => {
        setConfirmDialog(prev => ({ ...prev, isOpen: false }));
        try {
          await api.deleteInvite(invite.id);
          setInvites(prev => prev.filter(i => i.id !== invite.id));
          setSelectedIds(prev => prev.filter(id => id !== invite.id));
          addToast('info', '招待リンクを削除しました');
        } catch (e: any) {
          addToast('error', '削除に失敗しました', e.message);
        }
      },
    });
  };

  // --- 一括操作 ---
  const toggleSelect = (id: number) =>
    setSelectedIds(prev => prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id]);
  const selectedInvites = invites.filter(i => selectedIds.includes(i.id));

  const handleBulkExtend = async (extendDays: number) => {
    setIsBulkWorking(true);
    try {
      replaceInvites(await api.extendInvites(selectedInvites, extendDays));
      addToast('success', `${selectedInvites.length}件の有効期限を${periodLabel(extendDays)}延長しました`);
      setSelectedIds([]);
    } catch (e: any) {
      addToast('error', '一括延長に失敗しました', e.message);
      load();
    } finally {
      setIsBulkWorking(false);
    }
  };

  const handleBulkRevoke = () => {
    setConfirmDialog({
      isOpen: true,
      title: '選択した招待リンクを取り消す',
      message: `${selectedInvites.length}件の招待リンクを取り消しますか？\nこれらのリンクではすぐにアクセスできなくなります。`,
      variant: 'warning',
      onConfirm: async () => {
        setConfirmDialog(prev => ({ ...prev, isOpen: false }));
        setIsBulkWorking(true);
        try {
          replaceInvites(await api.revokeInvites(selectedIds));
          addToast('info', `${selectedInvites.length}件の招待リンクを取り消しました`);
          setSelectedIds([]);
        } catch (e: any) {
          addToast('error', '一括取り消しに失敗しました', e.message);
        } finally {
          setIsBulkWorking(false);
        }
      },
    });
  };

  // --- アクセス履歴 ---
  const toggleLogs = async (invite: Invite) => {
    if (openLogsId === invite.id) { setOpenLogsId(null); return; }
    setOpenLogsId(invite.id);
    setIsLoadingLogs(true);
    try {
      const logs = await api.fetchInviteAccessLogs(invite.id);
      setLogsCache(prev => ({ ...prev, [invite.id]: logs }));
    } catch (e: any) {
      addToast('error', 'アクセス履歴の取得に失敗しました', e.message);
    } finally {
      setIsLoadingLogs(false);
    }
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
        アクセスのたびに日時・IPアドレス・端末の種類を記録します（90日間）。
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
        <label className="flex items-start gap-2 text-sm text-slate-700 cursor-pointer">
          <input type="checkbox" checked={autoExtend} onChange={(e) => setAutoExtend(e.target.checked)} className="mt-0.5" />
          <span>
            <b>自動延長する</b>
            <span className="block text-xs text-slate-500">
              アクセスされるたびに、その時点から{periodLabel(days)}有効になります（使われている間は切れません。{periodLabel(days)}使われないと切れます）。
            </span>
          </span>
        </label>
        <button
          type="submit"
          disabled={isCreating}
          className="bg-cyan-600 hover:bg-cyan-700 text-white px-4 py-2 rounded-lg font-bold text-sm flex items-center gap-2 disabled:opacity-50"
        >
          {isCreating ? <LoaderCircle size={16} className="animate-spin" /> : <Plus size={16} />}
          招待リンクを発行してコピー
        </button>
      </form>

      {/* 一括操作バー */}
      {selectedIds.length > 0 && (
        <div className="sticky top-0 z-10 bg-slate-800 text-white rounded-xl px-4 py-3 mb-3 flex flex-wrap items-center gap-2 shadow-lg">
          <span className="text-sm font-bold mr-2">{selectedIds.length}件を選択中</span>
          <span className="text-xs text-slate-300">延長:</span>
          {PERIODS.map(p => (
            <button
              key={p.days}
              disabled={isBulkWorking}
              onClick={() => handleBulkExtend(p.days)}
              className="px-2 py-1 text-xs font-bold bg-slate-700 hover:bg-slate-600 rounded disabled:opacity-50"
            >
              +{p.label}
            </button>
          ))}
          <button
            disabled={isBulkWorking || !selectedInvites.some(i => getState(i) === 'active')}
            onClick={handleBulkRevoke}
            className="px-2 py-1 text-xs font-bold bg-red-600 hover:bg-red-500 rounded flex items-center gap-1 disabled:opacity-50"
          >
            <Ban size={12} /> 取り消す
          </button>
          {isBulkWorking && <LoaderCircle size={14} className="animate-spin" />}
          <button onClick={() => setSelectedIds([])} className="ml-auto text-slate-300 hover:text-white flex items-center gap-1 text-xs">
            <X size={14} /> 選択解除
          </button>
        </div>
      )}

      {/* 一覧 */}
      {isLoading ? (
        <div className="flex justify-center py-12"><LoaderCircle className="animate-spin text-cyan-600" size={28} /></div>
      ) : sorted.length === 0 ? (
        <div className="bg-white rounded-xl p-10 text-center text-slate-400 border border-slate-200">発行した招待リンクはありません</div>
      ) : (
        <div className="space-y-3">
          {sorted.map(invite => {
            const state = getState(invite);
            const isSelected = selectedIds.includes(invite.id);
            const logs = logsCache[invite.id];
            return (
              <div
                key={invite.id}
                className={`bg-white rounded-xl shadow-sm border p-4 ${
                  isSelected ? 'border-slate-500 ring-2 ring-slate-300'
                    : justCreatedId === invite.id ? 'border-cyan-400 ring-2 ring-cyan-200' : 'border-slate-200'
                }`}
              >
                <div className="flex flex-wrap items-center gap-2 mb-2">
                  {state !== 'revoked' && (
                    <button onClick={() => toggleSelect(invite.id)} className="text-slate-400 hover:text-slate-700" title="選択">
                      {isSelected ? <SquareCheckBig size={18} className="text-slate-700" /> : <Square size={18} />}
                    </button>
                  )}
                  <span className="font-bold text-slate-800">{invite.label || '名前なし'}</span>
                  <span className={`px-2 py-0.5 rounded text-xs font-bold border ${STATE_STYLES[state]}`}>{STATE_LABELS[state]}</span>
                  {invite.autoExtendDays && state !== 'revoked' && (
                    <span className="px-2 py-0.5 rounded text-xs font-bold border bg-cyan-50 text-cyan-700 border-cyan-200 flex items-center gap-1">
                      <RefreshCw size={10} /> 自動延長（{periodLabel(invite.autoExtendDays)}）
                    </span>
                  )}
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
                    <button
                      onClick={() => toggleAutoExtend(invite)}
                      className={`px-3 py-1.5 text-sm border rounded flex items-center gap-1 ${
                        invite.autoExtendDays ? 'text-cyan-700 border-cyan-200 bg-cyan-50 hover:bg-cyan-100' : 'text-slate-600 border-slate-200 hover:bg-slate-50'
                      }`}
                    >
                      <RefreshCw size={14} /> 自動延長: {invite.autoExtendDays ? 'オン' : 'オフ'}
                    </button>
                    {invite.autoExtendDays && (
                      <select
                        value={invite.autoExtendDays}
                        onChange={(e) => changeAutoExtendDays(invite, Number(e.target.value))}
                        className="text-sm border border-slate-200 rounded px-2 py-1.5 text-slate-600"
                        title="アクセスのたびに、この期間だけ有効期限を延ばす"
                      >
                        {PERIODS.map(p => <option key={p.days} value={p.days}>{p.label}ごと</option>)}
                      </select>
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

                {/* アクセス履歴 */}
                <div className="mt-3">
                  <button onClick={() => toggleLogs(invite)} className="text-xs text-slate-500 hover:text-slate-700 flex items-center gap-1">
                    {openLogsId === invite.id ? <ChevronDown size={12} /> : <ChevronRight size={12} />}
                    <RotateCcwClock size={12} /> アクセス履歴
                  </button>
                  {openLogsId === invite.id && (
                    <div className="mt-2 border-l border-slate-200 pl-3">
                      {isLoadingLogs && !logs ? (
                        <div className="flex items-center gap-1 text-xs text-slate-400"><LoaderCircle size={12} className="animate-spin" /> 読み込み中...</div>
                      ) : !logs || logs.length === 0 ? (
                        <p className="text-xs text-slate-400">アクセスの記録はありません</p>
                      ) : (
                        <AccessLogList logs={logs} />
                      )}
                    </div>
                  )}
                </div>

                {state !== 'active' && (
                  <button
                    onClick={() => handleDelete(invite)}
                    className="mt-2 text-xs text-slate-400 hover:text-red-500 flex items-center gap-1"
                  >
                    <Trash size={12} /> 一覧から削除
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

// アクセス履歴の一覧。IPアドレス・端末の種類数を集計し、1回しか出ていない組み合わせを目立たせる
const AccessLogList: React.FC<{ logs: InviteAccessLog[] }> = ({ logs }) => {
  const ipCount = new Set(logs.map(l => l.ip ?? '不明')).size;
  const deviceCount = new Set(logs.map(l => describeUserAgent(l.userAgent))).size;
  const comboCounts = new Map<string, number>();
  for (const l of logs) {
    const key = `${l.ip ?? '不明'}|${describeUserAgent(l.userAgent)}`;
    comboCounts.set(key, (comboCounts.get(key) ?? 0) + 1);
  }
  return (
    <div className="space-y-1">
      <p className="text-xs text-slate-600 mb-1">
        直近{logs.length}件 / IPアドレス <b>{ipCount}</b>種類 / 端末 <b>{deviceCount}</b>種類
        {(ipCount > 3 || deviceCount > 3) && <span className="ml-2 text-amber-600 font-bold">※ 想定より多くの場所・端末から使われていないか確認してください</span>}
      </p>
      <table className="text-xs text-slate-600 w-full">
        <tbody>
          {logs.map(l => {
            const device = describeUserAgent(l.userAgent);
            const isRare = (comboCounts.get(`${l.ip ?? '不明'}|${device}`) ?? 0) === 1 && logs.length > 1;
            return (
              <tr key={l.id} className={isRare ? 'text-amber-700' : ''} title={l.userAgent ?? ''}>
                <td className="pr-3 py-0.5 whitespace-nowrap font-mono">{formatDateTime(l.accessedAt)}</td>
                <td className="pr-3 py-0.5 font-mono">{l.ip ?? '不明'}</td>
                <td className="py-0.5">{device}{isRare && '（この組み合わせは1回のみ）'}</td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
};
