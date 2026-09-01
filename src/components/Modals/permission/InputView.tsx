import React, { useState, useEffect } from 'react';
import { Check, X } from 'lucide-react';
import { OmpUiRequest } from '../../../types';

export interface InputViewProps {
  request: OmpUiRequest;
  onSubmit: (value: string) => void;
  onCancel: () => void;
}

export const InputView: React.FC<InputViewProps> = ({
  request,
  onSubmit,
  onCancel,
}) => {
  const [inputValue, setInputValue] = useState<string>(request.prefill || '');

  useEffect(() => {
    setInputValue(request.prefill || '');
  }, [request.id, request.prefill]);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    onSubmit(inputValue);
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      {request.message && (
        <div className="text-xs text-slate-600 dark:text-zinc-300">
          {request.message}
        </div>
      )}

      {request.method === 'editor' ? (
        <textarea
          value={inputValue}
          onChange={(e) => setInputValue(e.target.value)}
          onKeyDown={(e) => {
            if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') {
              e.preventDefault();
              onSubmit(inputValue);
            }
          }}
          placeholder={request.placeholder || 'Nhập nội dung... (⌘+Enter để gửi)'}
          rows={7}
          autoFocus
          className="w-full p-3.5 rounded-xl bg-background border border-border text-xs font-mono focus:outline-none focus:border-emerald-500 text-slate-800 dark:text-zinc-200 resize-y max-h-80"
        />
      ) : (
        <input
          type="text"
          value={inputValue}
          onChange={(e) => setInputValue(e.target.value)}
          placeholder={request.placeholder || 'Nhập giá trị...'}
          autoFocus
          className="w-full px-3.5 py-2.5 rounded-xl bg-background border border-border text-xs focus:outline-none focus:border-emerald-500 text-slate-800 dark:text-zinc-200"
        />
      )}

      <div className="flex items-center justify-between pt-2 border-t border-border/50">
        <button
          type="button"
          onClick={onCancel}
          className="flex items-center gap-1.5 px-3.5 py-2 rounded-xl text-xs font-medium text-slate-500 hover:text-slate-700 dark:hover:text-zinc-300 transition-colors cursor-pointer"
        >
          <span>Hủy (ESC)</span>
        </button>

        <div className="flex items-center gap-2.5">
          <button
            type="button"
            onClick={onCancel}
            className="flex items-center gap-1.5 px-3.5 py-2 rounded-xl text-xs font-medium bg-surface hover:bg-surface-highlight text-slate-700 dark:text-zinc-300 border border-border transition-colors cursor-pointer"
          >
            <X className="w-3.5 h-3.5" />
            <span>Hủy (Cancel)</span>
          </button>

          <button
            type="submit"
            className="flex items-center gap-1.5 px-4 py-2 rounded-xl text-xs font-semibold bg-emerald-600 hover:bg-emerald-500 text-white shadow-sm transition-all cursor-pointer"
          >
            <Check className="w-3.5 h-3.5" />
            <span>Gửi (Submit)</span>
          </button>
        </div>
      </div>
    </form>
  );
};
