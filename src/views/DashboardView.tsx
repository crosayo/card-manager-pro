
'use client';

import React, { useState } from 'react';
import Link from 'next/link';
import { LayoutDashboard, Layers, Package, AlertCircle, Info, Plus, X, Trash2, Calendar, Search, Megaphone, Bell, ArrowRight, Download, Database } from 'lucide-react';
import { StatsWidget } from '../components/ui/StatsWidget';
import { useAppContext } from '@/context/AppContext';
import { ConfirmDialog } from '@/components/ui/ConfirmDialog';

interface DashboardViewProps {
  stats: {
    totalCards: number;
    totalStock: number;
    lowStock: number;
  };
}

export const DashboardView: React.FC<DashboardViewProps> = ({ stats }) => {
  const { news, isAdmin, addNews, deleteNews } = useAppContext();
  const isDataEmpty = stats.totalCards === 0;

  // News Modal State
  const [isNewsModalOpen, setIsNewsModalOpen] = useState(false);
  const [newsContent, setNewsContent] = useState('');
  const [newsType, setNewsType] = useState<'info' | 'alert' | 'success'>('info');
  const [newsDuration, setNewsDuration] = useState('1w');
  const [deleteTarget, setDeleteTarget] = useState<number | null>(null);

  const handleAddNews = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newsContent) return;

    let endDate: string | null = null;
    if (newsDuration !== 'permanent') {
      const date = new Date();
      if (newsDuration === '1w') date.setDate(date.getDate() + 7);
      if (newsDuration === '2w') date.setDate(date.getDate() + 14);
      if (newsDuration === '4w') date.setDate(date.getDate() + 28);
      endDate = date.toISOString().split('T')[0];
    }

    await addNews({
      content: newsContent,
      type: newsType,
      startDate: new Date().toISOString().split('T')[0],
      endDate: endDate
    });
    
    setIsNewsModalOpen(false);
    setNewsContent('');
    setNewsType('info');
  };

  const handleDeleteNews = (id: number) => {
    setDeleteTarget(id);
  };

  return (
    <div className="p-4 md:p-8 pb-24 max-w-7xl mx-auto">
      <div className="flex justify-between items-center mb-8">
        <h2 className="text-2xl font-bold text-slate-800 flex items-center gap-3">
          <div className="bg-cyan-600 p-2 rounded-lg text-white">
            <LayoutDashboard size={24} />
          </div>
          ダッシュボード
        </h2>
        <div className="text-xs font-mono text-slate-400 bg-slate-100 px-3 py-1 rounded-full border border-slate-200">
          SYSTEM: ONLINE
        </div>
      </div>

      {/* 1. クイックナビゲーション（在庫一覧への導線強化） */}
      <div className="mb-8">
        <Link href="/inventory" className="block w-full bg-gradient-to-r from-blue-700 to-cyan-600 hover:from-blue-800 hover:to-cyan-700 text-white p-8 rounded-2xl shadow-xl transition-all transform hover:scale-[1.01] group relative overflow-hidden">
          <div className="absolute top-0 right-0 w-96 h-96 bg-white/10 rounded-full -mr-32 -mt-32 blur-3xl pointer-events-none"></div>
          <div className="flex items-center justify-between relative z-10">
             <div className="flex items-center gap-6">
                <div className="bg-white/20 p-5 rounded-2xl backdrop-blur-md shadow-inner">
                  <Search size={40} className="text-white" />
                </div>
                <div>
                   <h3 className="text-3xl font-bold mb-2 tracking-tight">在庫一覧・検索へ</h3>
                   <p className="text-cyan-100 font-medium text-lg">すべてのカード在庫の確認、検索、編集はこちらから</p>
                </div>
             </div>
             <div className="bg-white/10 p-4 rounded-full group-hover:bg-white/20 transition-all">
               <ArrowRight size={32} className="group-hover:translate-x-2 transition-transform" />
             </div>
          </div>
        </Link>
      </div>
      
      {/* 2. 統計情報 */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-8">
        <StatsWidget 
          label="登録カード種類" 
          value={stats.totalCards.toLocaleString()} 
          icon={Layers} 
          color="bg-blue-600" 
          subtext="DB登録済みのユニーク型番数" 
        />
        <StatsWidget 
          label="総在庫数" 
          value={stats.totalStock.toLocaleString()} 
          icon={Package} 
          color="bg-emerald-600" 
          subtext="全カードの物理在庫合計" 
        />
        <StatsWidget 
          label="欠品アラート" 
          value={stats.lowStock.toLocaleString()} 
          icon={AlertCircle} 
          color="bg-rose-600" 
          subtext="在庫1枚以下の重要項目" 
        />
      </div>

      {/* 3. お知らせ掲示板（メインコンテンツ） */}
      <div className="bg-white rounded-2xl shadow-sm border border-slate-200 overflow-hidden">
        <div className="p-6 border-b border-slate-100 flex justify-between items-center bg-slate-50/50">
          <h3 className="text-lg font-bold text-slate-800 flex items-center gap-3">
            <Megaphone className="text-cyan-600" size={22} />
            業務連絡・お知らせ掲示板
          </h3>
          {isAdmin && (
            <button 
              onClick={() => setIsNewsModalOpen(true)}
              className="text-sm bg-slate-800 hover:bg-slate-700 text-white px-4 py-2 rounded-xl flex items-center gap-2 font-bold shadow-md transition-all active:scale-95"
            >
              <Plus size={18} /> 新規投稿
            </button>
          )}
        </div>

        <div className="p-6">
          {news.length === 0 ? (
            <div className="py-20 flex flex-col items-center justify-center text-slate-400 bg-slate-50/50 rounded-xl border-2 border-dashed border-slate-200">
              <Bell size={48} className="opacity-10 mb-4" />
              <p className="font-medium">現在、掲示されているお知らせはありません</p>
            </div>
          ) : (
            <div className="grid grid-cols-1 gap-4">
              {news.map(item => (
                <div 
                  key={item.id} 
                  className={`
                    group relative p-5 rounded-xl border transition-all hover:shadow-md
                    ${item.type === 'alert' 
                      ? 'bg-rose-50 border-rose-100 text-rose-900 shadow-sm' 
                      : item.type === 'success'
                        ? 'bg-emerald-50 border-emerald-100 text-emerald-900'
                        : 'bg-slate-50 border-slate-200 text-slate-800'}
                  `}
                >
                  <div className="flex items-start gap-4">
                    <div className={`
                      shrink-0 w-10 h-10 rounded-full flex items-center justify-center shadow-inner
                      ${item.type === 'alert' ? 'bg-rose-200 text-rose-700' : item.type === 'success' ? 'bg-emerald-200 text-emerald-700' : 'bg-slate-200 text-slate-600'}
                    `}>
                      {item.type === 'alert' ? <AlertCircle size={20} /> : <Info size={20} />}
                    </div>
                    <div className="flex-1">
                      <div className="flex items-center gap-2 mb-1">
                        <span className={`
                          text-[10px] font-black uppercase tracking-widest px-2 py-0.5 rounded
                          ${item.type === 'alert' ? 'bg-rose-600 text-white' : item.type === 'success' ? 'bg-emerald-600 text-white' : 'bg-slate-600 text-white'}
                        `}>
                          {item.type === 'alert' ? '重要' : 'お知らせ'}
                        </span>
                        <span className="text-xs font-mono text-slate-400">{item.startDate}</span>
                      </div>
                      <div className="text-sm font-bold leading-relaxed whitespace-pre-wrap">{item.content}</div>
                      {item.endDate && (
                        <div className="inline-flex items-center gap-1.5 mt-3 px-2 py-1 bg-white/60 border border-slate-200/50 rounded-md text-[11px] font-medium text-slate-500">
                          <Calendar size={12} /> 有効期限: {item.endDate}
                        </div>
                      )}
                    </div>
                  </div>
                  
                  {isAdmin && (
                    <button 
                      onClick={() => handleDeleteNews(item.id)}
                      className="absolute top-4 right-4 p-2 bg-white/80 hover:bg-rose-600 hover:text-white rounded-lg text-slate-400 opacity-0 group-hover:opacity-100 transition-all shadow-sm"
                      title="削除"
                    >
                      <Trash2 size={16} />
                    </button>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* データ空アラート */}
      {isDataEmpty && (
        <div className="mt-8 bg-gradient-to-r from-cyan-600 to-blue-700 text-white p-8 rounded-2xl shadow-xl animate-in slide-in-from-bottom-4">
          <div className="flex flex-col md:flex-row items-center justify-between gap-8">
            <div className="flex items-start gap-6">
              <div className="bg-white/20 p-4 rounded-2xl backdrop-blur-md border border-white/30">
                <Database size={40} className="text-white" />
              </div>
              <div>
                <h3 className="text-2xl font-bold mb-2 tracking-tight">データベースが未構築です</h3>
                <p className="text-cyan-100 max-w-xl text-sm leading-relaxed opacity-90">
                  現在カードデータが登録されていません。システム設定からバックアップを復元するか、Wiki取込機能を使用して在庫マスターを構築してください。
                </p>
                <div className="flex flex-col sm:flex-row gap-4 mt-6">
                  <Link 
                    href="/scraper"
                    className="bg-white text-blue-700 px-6 py-3 rounded-xl font-bold hover:bg-cyan-50 transition-all shadow-lg flex items-center justify-center gap-2 text-sm"
                  >
                    <Download size={18} /> Wikiから構築を開始
                  </Link>
                  <Link 
                    href="/settings"
                    className="bg-blue-800/40 text-white border border-white/20 px-6 py-3 rounded-xl font-bold hover:bg-blue-800/60 transition-all flex items-center justify-center gap-2 text-sm"
                  >
                     設定画面へ移動 <ArrowRight size={18} />
                  </Link>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* お知らせ作成モーダル */}
      {isNewsModalOpen && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-md z-50 flex items-center justify-center p-4 animate-in fade-in duration-300">
          <div className="bg-white rounded-2xl shadow-2xl max-w-md w-full overflow-hidden border border-slate-200">
            <div className="bg-slate-50 p-6 border-b border-slate-100 flex justify-between items-center">
              <h3 className="font-bold text-xl text-slate-800">お知らせを投稿</h3>
              <button onClick={() => setIsNewsModalOpen(false)} className="text-slate-400 hover:text-slate-600 transition-colors">
                <X size={28} />
              </button>
            </div>
            
            <form onSubmit={handleAddNews} className="p-8 space-y-6">
              <div>
                <label className="block text-sm font-black text-slate-700 mb-2 uppercase tracking-widest">メッセージ内容</label>
                <textarea
                  required
                  value={newsContent}
                  onChange={(e) => setNewsContent(e.target.value)}
                  className="w-full border border-slate-200 bg-slate-50 rounded-xl px-4 py-3 focus:ring-2 focus:ring-cyan-500 focus:bg-white outline-none h-32 text-sm transition-all"
                  placeholder="入荷情報、買取強化、休業連絡など..."
                />
              </div>

              <div>
                <label className="block text-sm font-black text-slate-700 mb-2 uppercase tracking-widest">重要度・カラー</label>
                <div className="grid grid-cols-2 gap-3">
                  <button 
                    type="button"
                    onClick={() => setNewsType('info')}
                    className={`p-3 rounded-xl border font-bold text-xs flex items-center justify-center gap-2 transition-all ${newsType === 'info' ? 'bg-slate-800 text-white border-slate-800' : 'bg-white text-slate-600 border-slate-200 hover:border-slate-400'}`}
                  >
                    <div className="w-2 h-2 rounded-full bg-cyan-400"></div> お知らせ (緑)
                  </button>
                  <button 
                    type="button"
                    onClick={() => setNewsType('alert')}
                    className={`p-3 rounded-xl border font-bold text-xs flex items-center justify-center gap-2 transition-all ${newsType === 'alert' ? 'bg-rose-600 text-white border-rose-600 shadow-md shadow-rose-200' : 'bg-white text-slate-600 border-slate-200 hover:border-slate-400'}`}
                  >
                    <div className="w-2 h-2 rounded-full bg-white animate-pulse"></div> 重要 (赤)
                  </button>
                </div>
              </div>

              <div>
                <label className="block text-sm font-black text-slate-700 mb-2 uppercase tracking-widest">表示期限</label>
                <select 
                  value={newsDuration}
                  onChange={(e) => setNewsDuration(e.target.value)}
                  className="w-full border border-slate-200 bg-slate-50 rounded-xl px-4 py-3 focus:ring-2 focus:ring-cyan-500 focus:bg-white outline-none text-sm transition-all cursor-pointer"
                >
                  <option value="1w">1週間掲示 (7日間)</option>
                  <option value="2w">2週間掲示 (14日間)</option>
                  <option value="4w">4週間掲示 (28日間)</option>
                  <option value="permanent">無期限掲示 (手動削除)</option>
                </select>
              </div>

              <div className="pt-4 flex gap-3">
                <button
                  type="button"
                  onClick={() => setIsNewsModalOpen(false)}
                  className="flex-1 px-4 py-3 text-slate-600 hover:bg-slate-100 rounded-xl font-bold transition-colors"
                >
                  キャンセル
                </button>
                <button
                  type="submit"
                  className="flex-[2] px-6 py-3 bg-cyan-600 hover:bg-cyan-700 text-white rounded-xl font-bold shadow-lg shadow-cyan-200 transition-all active:scale-95"
                >
                  この内容で投稿する
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      <ConfirmDialog
        isOpen={deleteTarget !== null}
        title="お知らせ削除"
        message="このお知らせを削除しますか？"
        variant="warning"
        confirmLabel="削除"
        onConfirm={() => {
          if (deleteTarget !== null) deleteNews(deleteTarget);
          setDeleteTarget(null);
        }}
        onCancel={() => setDeleteTarget(null)}
      />
    </div>
  );
};
