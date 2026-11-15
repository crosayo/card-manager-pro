'use client';

import React from 'react';
import { ChevronLeft, ChevronRight, ChevronsLeft, ChevronsRight } from 'lucide-react';

// 在庫一覧の下部ページ送り（最初へ・-5・前へ・次へ・+5・最後へ）。B6 で InventoryList.tsx から分けた
interface InventoryPaginationProps {
  currentPage: number;
  totalPages: number;
  isLoading: boolean;
  setCurrentPage: (page: number) => void;
}

export const InventoryPagination: React.FC<InventoryPaginationProps> = ({
  currentPage,
  totalPages,
  isLoading,
  setCurrentPage,
}) => {
  const gotoFirst = () => setCurrentPage(1);
  const gotoLast = () => setCurrentPage(totalPages);
  const prev5 = () => setCurrentPage(Math.max(1, currentPage - 5));
  const next5 = () => setCurrentPage(Math.min(totalPages, currentPage + 5));

  return (
      <div className="flex justify-center items-center mt-8 text-sm text-slate-500">
         <div className="flex items-center gap-2 bg-white px-4 py-2 rounded-full shadow-sm border border-slate-100">
           {/* 最初へ */}
           <button
             onClick={gotoFirst}
             disabled={currentPage === 1 || isLoading}
             className="p-2 rounded-full hover:bg-slate-100 disabled:opacity-30 disabled:hover:bg-transparent transition-colors"
             title="最初のページ"
           >
             <ChevronsLeft size={20} />
           </button>
           
           {/* 5ページ前 */}
           <button
             onClick={prev5}
             disabled={currentPage === 1 || isLoading}
             className="p-2 rounded-full hover:bg-slate-100 disabled:opacity-30 disabled:hover:bg-transparent transition-colors text-xs font-bold w-10"
             title="5ページ戻る"
           >
             -5
           </button>

           {/* 前へ */}
           <button
             onClick={() => setCurrentPage(Math.max(1, currentPage - 1))}
             disabled={currentPage === 1 || isLoading}
             className="p-2 rounded-full hover:bg-slate-100 disabled:opacity-30 disabled:hover:bg-transparent transition-colors"
           >
             <ChevronLeft size={20} />
           </button>

           <span className="font-bold text-slate-800 text-base mx-2">
             {currentPage} <span className="text-slate-400 text-sm font-normal">/ {Math.max(1, totalPages)}</span>
           </span>

           {/* 次へ */}
           <button
             onClick={() => setCurrentPage(Math.min(totalPages, currentPage + 1))}
             disabled={currentPage >= totalPages || isLoading}
             className="p-2 rounded-full hover:bg-slate-100 disabled:opacity-30 disabled:hover:bg-transparent transition-colors"
           >
             <ChevronRight size={20} />
           </button>

           {/* 5ページ次 */}
           <button
             onClick={next5}
             disabled={currentPage >= totalPages || isLoading}
             className="p-2 rounded-full hover:bg-slate-100 disabled:opacity-30 disabled:hover:bg-transparent transition-colors text-xs font-bold w-10"
             title="5ページ進む"
           >
             +5
           </button>

           {/* 最後へ */}
           <button
             onClick={gotoLast}
             disabled={currentPage >= totalPages || isLoading}
             className="p-2 rounded-full hover:bg-slate-100 disabled:opacity-30 disabled:hover:bg-transparent transition-colors"
             title="最後のページ"
           >
             <ChevronsRight size={20} />
           </button>
         </div>
      </div>
  );
};
