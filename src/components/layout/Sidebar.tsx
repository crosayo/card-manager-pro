
'use client';

import React, { useMemo, useState, useEffect, useRef } from 'react';
import Link from 'next/link';
import { usePathname, useSearchParams } from 'next/navigation';
import { Database, X, LayoutDashboard, Layers, Menu, Download, Settings, LogOut, LogIn, Calendar, ChevronDown, ChevronRight, Folder, Info, ScrollText, ShoppingBag, Package, Inbox } from 'lucide-react';
import { Product, TabType, Season } from '@/types';
import { useAppContext } from '@/context/AppContext';
import { RARITY_STYLES, RARITY_DEFAULT_STYLE } from '@/constants';
import { api } from '@/services/api';

interface SidebarProps {
  isMobileMenuOpen: boolean;
  setIsMobileMenuOpen: (open: boolean) => void;
  products: Product[];
  isAdmin: boolean;
  handleLoginToggle: () => void;
  isLoading: boolean;
  selectedCategory?: string | null;
}

export const Sidebar: React.FC<SidebarProps> = ({
  isMobileMenuOpen,
  setIsMobileMenuOpen,
  products,
  isAdmin,
  handleLoginToggle,
  isLoading,
  selectedCategory: selectedCategoryProp,
}) => {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const { seasons, systemInfo, rarities, selectedRarities, setSelectedRarities, showOnlyInStock, setShowOnlyInStock } = useAppContext();
  const [expandedSeasons, setExpandedSeasons] = useState<Record<string, boolean>>({});
  const [isChangelogOpen, setIsChangelogOpen] = useState(false);
  const [isSuppliesOpen, setIsSuppliesOpen] = useState(false);
  const [pendingRequestsCount, setPendingRequestsCount] = useState(0);
  const initializedRef = useRef(false);

  // URLパラメータからselectedCategoryを取得（propsが未指定の場合も対応）
  const categoryParam = searchParams.get('category');
  const selectedCategory = selectedCategoryProp ?? (categoryParam ? decodeURIComponent(categoryParam) : null);

  // adminOnly: true の項目はゲストには非表示
  const menuItems: { id: TabType; path: string; icon: any; label: string; adminOnly: boolean; guestOnly?: boolean; badge?: boolean }[] = [
    { id: 'dashboard', path: '/dashboard', icon: LayoutDashboard, label: 'ダッシュボード', adminOnly: false },
    { id: 'inventory', path: '/inventory', icon: Layers, label: '在庫一覧', adminOnly: false },
    { id: 'supplies', path: '/supplies', icon: Package, label: 'サプライ', adminOnly: false },
    { id: 'requests', path: '/requests', icon: ShoppingBag, label: 'リクエスト', adminOnly: false, guestOnly: true },
    { id: 'requests', path: '/requests', icon: Inbox, label: 'リクエスト管理', adminOnly: true, badge: true },
    { id: 'products', path: '/products', icon: Menu, label: '製品マスタ', adminOnly: true },
    { id: 'logs', path: '/logs', icon: ScrollText, label: '在庫ログ', adminOnly: true },
    { id: 'scraper', path: '/scraper', icon: Download, label: 'Wiki取込', adminOnly: true },
    { id: 'settings', path: '/settings', icon: Settings, label: 'システム設定', adminOnly: true },
  ];

  const isActive = (path: string) => {
    if (path === '/inventory' && (pathname === '/inventory' || pathname === '/')) return true;
    if (path !== '/' && pathname.startsWith(path)) return true;
    return false;
  };

  const handleItemClick = () => {
    if (window.innerWidth < 768) setIsMobileMenuOpen(false);
  };

  const groupedProducts = useMemo(() => {
    const sortedProducts = [...products]
      .filter(p => p.isSidebarVisible)
      .sort((a, b) => new Date(b.releaseDate).getTime() - new Date(a.releaseDate).getTime());
    
    const sortedSeasons = [...seasons].sort((a, b) => new Date(b.startDate).getTime() - new Date(a.startDate).getTime());
    
    const groups: Record<string, Product[]> = {};
    sortedSeasons.forEach(s => { groups[s.name] = []; });
    groups['その他'] = [];

    sortedProducts.forEach(p => {
      const pDate = new Date(p.releaseDate);
      let matched = false;
      for (const season of sortedSeasons) {
        if (pDate >= new Date(season.startDate)) {
          groups[season.name].push(p);
          matched = true;
          break;
        }
      }
      if (!matched) {
        groups['その他'].push(p);
      }
    });
    return groups;
  }, [products, seasons]);

  // 管理者ログイン時に未対応リクエスト件数を取得
  useEffect(() => {
    if (!isAdmin) { setPendingRequestsCount(0); return; }
    api.fetchPendingRequestsCount().then(setPendingRequestsCount).catch(() => {});
  }, [isAdmin]);

  useEffect(() => {
    if (selectedCategory) {
      // selectedCategoryに対応するシーズンだけを展開する（手動で折りたたんだシーズンは強制展開しない）
      for (const [seasonName, prods] of Object.entries(groupedProducts) as [string, Product[]][]) {
        if (prods.some(p => p.name === selectedCategory)) {
          setExpandedSeasons(prev => ({ ...prev, [seasonName]: true }));
          break;
        }
      }
    }
  }, [selectedCategory]); // groupedProductsの変化（データ取得完了など）だけでは展開状態をリセットしない

  useEffect(() => {
    // 初回のみ: 最初のシーズンを展開する
    if (!initializedRef.current && !selectedCategory) {
      const firstAvailableSeason = seasons.find(s => groupedProducts[s.name]?.length > 0);
      if (firstAvailableSeason) {
        setExpandedSeasons({ [firstAvailableSeason.name]: true });
        initializedRef.current = true;
      }
    }
  }, [seasons, groupedProducts, selectedCategory]);

  const toggleSeason = (seasonName: string) => {
    setExpandedSeasons(prev => ({
      ...prev,
      [seasonName]: !prev[seasonName]
    }));
  };

  return (
    <>
      {isMobileMenuOpen && (
        <div 
          className="fixed inset-0 bg-black/50 z-20 md:hidden"
          onClick={() => setIsMobileMenuOpen(false)}
        />
      )}
      
      <div className={`
        fixed top-0 left-0 h-screen w-64 bg-slate-900 text-white flex flex-col shadow-xl z-30 transition-transform duration-300 ease-in-out
        ${isMobileMenuOpen ? 'translate-x-0' : '-translate-x-full'} md:translate-x-0
      `}>
        <div className="p-6 border-b border-slate-700 flex justify-between items-center bg-slate-950">
          <Link 
            href="/inventory" 
            onClick={handleItemClick}
            className="group block"
          >
            <h1 className="text-xl font-bold flex items-center gap-2 text-cyan-400 group-hover:text-cyan-300 transition-colors">
              <Database size={24} />
              <span>Card Manager</span>
            </h1>
            <button 
              onClick={(e) => {
                e.preventDefault();
                setIsChangelogOpen(true);
              }}
              className="text-xs text-slate-400 mt-1 hover:text-white transition-colors flex items-center gap-1"
            >
              Ver {systemInfo.version}
              <Info size={10} />
            </button>
          </Link>
          <button 
            onClick={() => setIsMobileMenuOpen(false)} 
            className="md:hidden text-slate-400 hover:text-white"
          >
            <X size={24} />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto custom-scrollbar">
          <div className="px-3 py-4">
            <p className="text-xs font-bold text-slate-500 uppercase mb-2 px-3 tracking-wider">Menu</p>
            <div className="space-y-1">
              {menuItems
                .filter(item => (isAdmin || !item.adminOnly) && (!item.guestOnly || !isAdmin))
                .map((item) => (
                  <Link
                    key={item.label}
                    href={item.path}
                    onClick={handleItemClick}
                    className={`w-full text-left px-3 py-2 rounded-lg flex items-center gap-3 transition-all ${
                      isActive(item.path)
                        ? 'bg-cyan-600/20 text-cyan-300 border border-cyan-700/50'
                        : 'text-slate-300 hover:bg-slate-800 hover:text-white border border-transparent'
                    }`}
                  >
                    <item.icon size={18} />
                    <span className="flex-1">{item.label}</span>
                    {item.badge && pendingRequestsCount > 0 && (
                      <span className="bg-red-500 text-white text-xs font-bold rounded-full px-1.5 py-0.5 min-w-[20px] text-center leading-none">
                        {Math.min(pendingRequestsCount, 99)}
                      </span>
                    )}
                  </Link>
              ))}
            </div>
          </div>

          <div className="px-3 pb-8">
            {/* フィルターパネル */}
            <div className="px-3 pt-4 pb-3 border-t border-slate-800 space-y-3">
              {/* レアリティフィルター */}
              <div>
                <p className="text-xs font-bold text-slate-500 uppercase tracking-wider mb-2">レアリティ</p>
                <div className="flex flex-wrap gap-1">
                  {(() => {
                    // 選択中パックに存在するレアリティのみ表示（未選択時は全レアリティ）
                    const availableRarities = selectedCategory
                      ? rarities.filter(r => products.some(p => p.name === selectedCategory))
                      : rarities;
                    return rarities.map(r => {
                      const style = RARITY_STYLES[r] ?? RARITY_DEFAULT_STYLE;
                      const isSelected = selectedRarities.includes(r);
                      return (
                        <button
                          key={r}
                          onClick={() => {
                            if (isSelected) {
                              setSelectedRarities(selectedRarities.filter(x => x !== r));
                            } else {
                              setSelectedRarities([...selectedRarities, r]);
                            }
                          }}
                          className={`px-2 py-0.5 rounded text-xs font-bold border transition-all ${
                            isSelected
                              ? `${style.bg} ${style.text} ${style.border} ring-1 ring-offset-1 ring-offset-slate-900`
                              : 'bg-slate-800 text-slate-400 border-slate-700 hover:bg-slate-700 hover:text-slate-200'
                          }`}
                        >
                          {r}
                        </button>
                      );
                    });
                  })()}
                </div>
                {selectedRarities.length > 0 && (
                  <button
                    onClick={() => setSelectedRarities([])}
                    className="text-xs text-slate-500 hover:text-slate-300 mt-1 underline"
                  >
                    解除
                  </button>
                )}
              </div>

              {/* 在庫フィルター */}
              <div>
                <p className="text-xs font-bold text-slate-500 uppercase tracking-wider mb-2">在庫</p>
                <button
                  onClick={() => setShowOnlyInStock(!showOnlyInStock)}
                  className={`w-full flex items-center gap-2 px-3 py-1.5 rounded-lg border text-sm font-bold transition-all ${
                    showOnlyInStock
                      ? 'bg-amber-500/20 text-amber-300 border-amber-600'
                      : 'bg-slate-800 text-slate-400 border-slate-700 hover:bg-slate-700 hover:text-slate-200'
                  }`}
                >
                  <span className={`w-3 h-3 rounded-full border-2 flex-shrink-0 ${showOnlyInStock ? 'bg-amber-400 border-amber-400' : 'border-slate-500'}`} />
                  在庫ありのみ表示
                </button>
              </div>
            </div>

            {/* サプライセクション */}
            <div className="border-t border-slate-800 pt-3 mb-2">
              <button
                onClick={() => setIsSuppliesOpen(prev => !prev)}
                className={`w-full flex items-center justify-between px-3 py-2 text-xs font-bold uppercase tracking-wider transition-colors rounded-lg ${
                  isSuppliesOpen ? 'bg-slate-800 text-slate-200' : 'text-slate-500 hover:bg-slate-800/50 hover:text-slate-300'
                }`}
              >
                <div className="flex items-center gap-2">
                  <Package size={14} className={isSuppliesOpen ? 'text-cyan-500' : 'text-slate-600'} />
                  サプライ
                </div>
                {isSuppliesOpen ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
              </button>
              {isSuppliesOpen && (
                <div className="bg-slate-900/50 py-1 space-y-0.5 animate-in slide-in-from-top-1 duration-200">
                  {[
                    { label: 'スリーブ', category: 'sleeve' },
                    { label: 'プレイマット', category: 'playmat' },
                    { label: 'その他', category: 'other' },
                  ].map(({ label, category }) => {
                    const isSelected = pathname === '/supplies' && searchParams.get('category') === category;
                    return (
                      <Link
                        key={category}
                        href={`/supplies?category=${category}`}
                        onClick={handleItemClick}
                        className={`block w-full text-left pl-9 pr-3 py-1.5 text-sm transition-colors border-l-2 ${
                          isSelected
                            ? 'text-white bg-slate-800 border-cyan-500'
                            : 'text-slate-400 hover:text-white hover:bg-slate-800/50 border-transparent hover:border-slate-600'
                        }`}
                      >
                        {label}
                      </Link>
                    );
                  })}
                </div>
              )}
            </div>

            <div className="flex justify-between items-center mb-2 px-3 border-t border-slate-800 pt-3">
              <p className="text-xs font-bold text-slate-500 uppercase tracking-wider">Product Filter</p>
            </div>
            
            <div className="space-y-1">
              {seasons.map(season => {
                const seasonProducts = groupedProducts[season.name];
                if (!seasonProducts || seasonProducts.length === 0) return null;
                const isExpanded = expandedSeasons[season.name];

                return (
                  <div key={season.id} className="rounded-lg overflow-hidden">
                    <button
                      onClick={() => toggleSeason(season.name)}
                      className={`
                        w-full flex items-center justify-between px-3 py-2 text-xs font-bold uppercase tracking-wider transition-colors
                        ${isExpanded ? 'bg-slate-800 text-slate-200' : 'text-slate-500 hover:bg-slate-800/50 hover:text-slate-300'}
                      `}
                    >
                      <div className="flex items-center gap-2">
                        <Folder size={14} className={isExpanded ? 'text-cyan-500' : 'text-slate-600'} />
                        {season.name}
                      </div>
                      {isExpanded ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
                    </button>
                    
                    {isExpanded && (
                      <div className="bg-slate-900/50 py-1 space-y-0.5 animate-in slide-in-from-top-1 duration-200">
                        {seasonProducts.map(product => (
                          <Link
                            key={product.id}
                            href={`/inventory?category=${encodeURIComponent(product.name)}`}
                            onClick={handleItemClick}
                            className={`
                              group relative block w-full text-left pl-9 pr-3 py-1.5 text-sm transition-colors border-l-2
                              ${(selectedCategory === product.name)
                                ? 'text-white bg-slate-800 border-cyan-500'
                                : 'text-slate-400 hover:text-white hover:bg-slate-800/50 border-transparent hover:border-slate-600'
                              }
                            `}
                          >
                            <div className="truncate">{product.name}</div>
                            <div className="text-[10px] opacity-40 font-mono mt-0.5 group-hover:opacity-80 transition-opacity flex items-center gap-1">
                               <Calendar size={10} />
                               {product.releaseDate}
                            </div>
                          </Link>
                        ))}
                      </div>
                    )}
                  </div>
                );
              })}
              
              {groupedProducts['その他'] && groupedProducts['その他'].length > 0 && (
                 <div className="rounded-lg overflow-hidden">
                    <button
                      onClick={() => toggleSeason('その他')}
                      className={`
                        w-full flex items-center justify-between px-3 py-2 text-xs font-bold uppercase tracking-wider transition-colors
                        ${expandedSeasons['その他'] ? 'bg-slate-800 text-slate-200' : 'text-slate-500 hover:bg-slate-800/50 hover:text-slate-300'}
                      `}
                    >
                      <div className="flex items-center gap-2">
                        <Folder size={14} className={expandedSeasons['その他'] ? 'text-cyan-500' : 'text-slate-600'} />
                        その他
                      </div>
                      {expandedSeasons['その他'] ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
                    </button>
                    
                    {expandedSeasons['その他'] && (
                      <div className="bg-slate-900/50 py-1 space-y-0.5 animate-in slide-in-from-top-1 duration-200">
                        {groupedProducts['その他'].map(product => (
                          <Link
                            key={product.id}
                            href={`/inventory?category=${encodeURIComponent(product.name)}`}
                            onClick={handleItemClick}
                            className={`
                              group relative block w-full text-left pl-9 pr-3 py-1.5 text-sm transition-colors border-l-2
                              ${(selectedCategory === product.name)
                                ? 'text-white bg-slate-800 border-cyan-500'
                                : 'text-slate-400 hover:text-white hover:bg-slate-800/50 border-transparent hover:border-slate-600'
                              }
                            `}
                          >
                            <div className="truncate">{product.name}</div>
                            <div className="text-[10px] opacity-40 font-mono mt-0.5 group-hover:opacity-80 transition-opacity flex items-center gap-1">
                               <Calendar size={10} />
                               {product.releaseDate}
                            </div>
                          </Link>
                        ))}
                      </div>
                    )}
                 </div>
              )}
            </div>
          </div>
        </div>

        <div className="p-4 border-t border-slate-700 bg-slate-900">
          <button 
            onClick={handleLoginToggle}
            disabled={isLoading}
            className={`w-full flex items-center gap-3 px-4 py-3 rounded-lg transition-colors ${isAdmin ? 'bg-slate-800 text-red-300 hover:bg-slate-700' : 'bg-cyan-700 text-white hover:bg-cyan-600'}`}
          >
            {isAdmin ? <LogOut size={18} /> : <LogIn size={18} />}
            <div className="flex-1 text-left">
              <div className="text-sm font-bold">{isAdmin ? '管理者' : 'ゲスト'}</div>
              <div className="text-xs opacity-75">{isAdmin ? 'authenticated' : 'public role'}</div>
            </div>
          </button>
        </div>
      </div>

      {/* 更新履歴モーダル */}
      {isChangelogOpen && (
        <div className="fixed inset-0 bg-black/60 z-50 flex items-center justify-center p-4 animate-in fade-in">
          <div className="bg-white rounded-xl shadow-2xl max-w-lg w-full max-h-[80vh] flex flex-col">
            <div className="p-5 border-b flex justify-between items-center bg-slate-50 rounded-t-xl">
              <h3 className="text-lg font-bold flex items-center gap-2">
                <Info size={20} className="text-cyan-600" />
                システム更新情報
              </h3>
              <button onClick={() => setIsChangelogOpen(false)} className="text-slate-400 hover:text-slate-600">
                <X size={24} />
              </button>
            </div>
            <div className="p-6 overflow-y-auto">
              <div className="mb-4">
                <span className="text-2xl font-bold text-slate-800">Ver {systemInfo.version}</span>
                <span className="ml-3 text-sm text-slate-500">Last Updated: {systemInfo.lastUpdated}</span>
              </div>
              <div className="prose prose-sm text-slate-600 whitespace-pre-wrap leading-relaxed">
                {systemInfo.changelog}
              </div>
            </div>
          </div>
        </div>
      )}
    </>
  );
};
