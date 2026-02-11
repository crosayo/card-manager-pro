
'use client';

import React, { useState, useEffect, useRef } from 'react';
import { AlertTriangle, X } from 'lucide-react';

interface ConfirmDialogProps {
  isOpen: boolean;
  title: string;
  message: string;
  /** 確認入力が必要な場合に設定（例: "リセット"）。この文字列を入力しないと実行できない */
  requiredInput?: string;
  confirmLabel?: string;
  cancelLabel?: string;
  variant?: 'danger' | 'warning' | 'info';
  onConfirm: () => void;
  onCancel: () => void;
}

export const ConfirmDialog: React.FC<ConfirmDialogProps> = ({
  isOpen,
  title,
  message,
  requiredInput,
  confirmLabel = '実行',
  cancelLabel = 'キャンセル',
  variant = 'warning',
  onConfirm,
  onCancel,
}) => {
  const [inputValue, setInputValue] = useState('');
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (isOpen) {
      setInputValue('');
      setTimeout(() => inputRef.current?.focus(), 100);
    }
  }, [isOpen]);

  useEffect(() => {
    if (!isOpen) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onCancel();
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, onCancel]);

  if (!isOpen) return null;

  const canConfirm = !requiredInput || inputValue === requiredInput;

  const variantStyles = {
    danger: { bg: 'bg-red-600 hover:bg-red-700', icon: 'text-red-500', border: 'border-red-200' },
    warning: { bg: 'bg-amber-600 hover:bg-amber-700', icon: 'text-amber-500', border: 'border-amber-200' },
    info: { bg: 'bg-cyan-600 hover:bg-cyan-700', icon: 'text-cyan-500', border: 'border-cyan-200' },
  };

  const style = variantStyles[variant];

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4" role="dialog" aria-modal="true" aria-labelledby="confirm-title">
      <div className={`bg-white rounded-xl shadow-xl max-w-md w-full border ${style.border}`}>
        <div className="flex items-center justify-between p-4 border-b border-slate-100">
          <div className="flex items-center gap-3">
            <AlertTriangle className={style.icon} size={20} />
            <h3 id="confirm-title" className="font-bold text-slate-800">{title}</h3>
          </div>
          <button onClick={onCancel} className="text-slate-400 hover:text-slate-600 transition-colors">
            <X size={18} />
          </button>
        </div>

        <div className="p-4">
          <p className="text-sm text-slate-600 whitespace-pre-line">{message}</p>

          {requiredInput && (
            <div className="mt-4">
              <p className="text-xs text-slate-500 mb-2">
                確認のため「<span className="font-bold text-red-600">{requiredInput}</span>」と入力してください
              </p>
              <input
                ref={inputRef}
                type="text"
                value={inputValue}
                onChange={(e) => setInputValue(e.target.value)}
                className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm focus:ring-2 focus:ring-red-300 focus:border-red-400 outline-none"
                placeholder={requiredInput}
              />
            </div>
          )}
        </div>

        <div className="flex justify-end gap-2 p-4 border-t border-slate-100">
          <button
            onClick={onCancel}
            className="px-4 py-2 text-sm text-slate-600 bg-slate-100 hover:bg-slate-200 rounded-lg transition-colors"
          >
            {cancelLabel}
          </button>
          <button
            onClick={() => { if (canConfirm) onConfirm(); }}
            disabled={!canConfirm}
            className={`px-4 py-2 text-sm text-white rounded-lg transition-colors disabled:opacity-40 disabled:cursor-not-allowed ${style.bg}`}
          >
            {confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
};
