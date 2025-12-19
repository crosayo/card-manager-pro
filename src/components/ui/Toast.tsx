
'use client';

import React, { useState, useEffect } from 'react';
import { Check, AlertTriangle, Info, X, ChevronUp, ChevronDown, Copy } from 'lucide-react';
import { ToastType } from '@/types';

interface ToastItemProps {
  toast: ToastType;
  onClose: () => void;
}

const ToastItem: React.FC<ToastItemProps> = ({ toast, onClose }) => {
  const [expanded, setExpanded] = useState(false);
  const [copied, setCopied] = useState(false);
  
  useEffect(() => {
    // エラー以外は自動で閉じる
    if (toast.type !== 'error') {
      const timer = setTimeout(onClose, 5000);
      return () => clearTimeout(timer);
    } else {
      // エラー時は自動で詳細を開く
      if (toast.errorDetail) {
        setExpanded(true);
      }
    }
  }, [onClose, toast.type, toast.errorDetail]);

  const handleCopyError = () => {
    if (!toast.errorDetail) return;
    const text = `Error: ${toast.title}\nMessage: ${toast.message}\nCode: ${toast.errorDetail.code}\nTimestamp: ${toast.errorDetail.timestamp}\nDetails: ${toast.errorDetail.details}`;
    navigator.clipboard.writeText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const bgColor = 
    toast.type === 'success' ? 'bg-green-50 border-green-200' : 
    toast.type === 'error' ? 'bg-red-50 border-red-200' : 'bg-blue-50 border-blue-200';
  
  const iconColor = 
    toast.type === 'success' ? 'text-green-600' : 
    toast.type === 'error' ? 'text-red-600' : 'text-blue-600';

  return (
    <div className={`${bgColor} border rounded-lg shadow-lg p-4 pointer-events-auto transition-all animate-in slide-in-from-right max-w-md w-full`}>
      <div className="flex items-start gap-3">
        <div className={`mt-0.5 ${iconColor} shrink-0`}>
          {toast.type === 'success' && <Check size={20} />}
          {toast.type === 'error' && <AlertTriangle size={20} />}
          {toast.type === 'info' && <Info size={20} />}
        </div>
        <div className="flex-1 min-w-0">
          <h4 className={`font-bold text-sm ${iconColor} break-words`}>{toast.title}</h4>
          {toast.message && <p className="text-sm text-slate-700 mt-1 break-words leading-relaxed">{toast.message}</p>}
          
          {toast.errorDetail && (
            <div className="flex items-center gap-3 mt-2">
              <button 
                onClick={() => setExpanded(!expanded)}
                className="text-xs flex items-center gap-1 text-slate-500 hover:text-slate-800 underline decoration-slate-300 underline-offset-2"
              >
                {expanded ? <ChevronUp size={12} /> : <ChevronDown size={12} />}
                {expanded ? "詳細を隠す" : "エラー詳細を表示"}
              </button>
            </div>
          )}
        </div>
        <button onClick={onClose} className="text-slate-400 hover:text-slate-600 shrink-0">
          <X size={16} />
        </button>
      </div>

      {expanded && toast.errorDetail && (
        <div className="mt-3 bg-slate-800 rounded p-3 text-xs font-mono text-slate-200 overflow-x-auto relative group">
          <button 
            onClick={handleCopyError}
            className="absolute top-2 right-2 p-1.5 bg-white/10 hover:bg-white/20 rounded text-white transition-colors"
            title="エラー内容をコピー"
          >
            {copied ? <Check size={14} className="text-green-400" /> : <Copy size={14} />}
          </button>
          
          <div className="mb-1 text-slate-400">Time: {toast.errorDetail.timestamp}</div>
          <div className="mb-1 text-red-300 font-bold">Code: {toast.errorDetail.code}</div>
          <div className="border-t border-slate-600 pt-2 mt-2 whitespace-pre-wrap break-all leading-relaxed pr-6">
            {toast.errorDetail.details || toast.errorDetail.message}
          </div>
        </div>
      )}
    </div>
  );
};

export const ToastContainer: React.FC<{ toasts: ToastType[], removeToast: (id: number) => void }> = ({ toasts, removeToast }) => {
  return (
    <div className="fixed top-4 right-4 z-50 flex flex-col gap-3 w-full max-w-md pointer-events-none px-4 md:px-0">
      {toasts.map(toast => (
        <ToastItem key={toast.id} toast={toast} onClose={() => removeToast(toast.id)} />
      ))}
    </div>
  );
};
