import React, { useState, useEffect, KeyboardEvent } from 'react';
import { Sparkles, X, Code, FileText, Play } from 'lucide-react';

interface OmnibarModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSubmit: (prompt: string) => void;
}

export const OmnibarModal: React.FC<OmnibarModalProps> = ({
  isOpen,
  onClose,
  onSubmit,
}) => {
  const [prompt, setPrompt] = useState<string>('');

  useEffect(() => {
    const handleGlobalKeyDown = (e: globalThis.KeyboardEvent) => {
      if (e.key === 'Escape' && isOpen) {
        onClose();
      }
    };
    window.addEventListener('keydown', handleGlobalKeyDown);
    return () => window.removeEventListener('keydown', handleGlobalKeyDown);
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  const handleKeyDown = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter' && prompt.trim()) {
      onSubmit(prompt);
      setPrompt('');
      onClose();
    }
  };

  const quickActions = [
    { label: '/plan Lên kế hoạch tính năng', icon: FileText, cmd: '/plan ' },
    { label: '/diff Xem các file vừa sửa', icon: Code, cmd: '/diff' },
    { label: '/test Chạy kiểm thử tự động', icon: Play, cmd: '/test' },
  ];

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center pt-24 bg-black/40 backdrop-blur-xs animate-fadeIn">
      <div className="w-full max-w-xl bg-panel border border-border rounded-2xl shadow-2xl overflow-hidden glow-purple">
        {/* Input Bar */}
        <div className="flex items-center px-4 py-3 border-b border-border bg-surface">
          <Sparkles className="w-4 h-4 text-purple-600 dark:text-purple-400 mr-3 shrink-0 animate-pulse" />
          <input
            autoFocus
            type="text"
            value={prompt}
            onChange={(e) => setPrompt(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="Yêu cầu OMP Agent hoặc gõ lệnh nhanh..."
            className="flex-1 bg-transparent text-sm text-slate-900 dark:text-zinc-100 placeholder-slate-400 dark:placeholder-zinc-500 outline-none font-sans"
          />
          <button
            onClick={onClose}
            className="p-1 rounded text-slate-400 dark:text-zinc-500 hover:text-slate-700 dark:hover:text-zinc-300"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Quick Suggestion List */}
        <div className="p-2 space-y-1">
          <div className="text-[10px] font-semibold text-slate-400 dark:text-zinc-500 uppercase px-2 py-1">
            Gợi ý thao tác nhanh
          </div>
          {quickActions.map((act, i) => {
            const Icon = act.icon;
            return (
              <div
                key={i}
                onClick={() => {
                  setPrompt(act.cmd);
                }}
                className="flex items-center justify-between px-3 py-2 rounded-lg text-xs text-slate-700 dark:text-zinc-300 hover:bg-surface-highlight hover:text-purple-700 dark:hover:text-purple-200 cursor-pointer transition-colors"
              >
                <div className="flex items-center gap-2">
                  <Icon className="w-3.5 h-3.5 text-slate-500 dark:text-zinc-400" />
                  <span>{act.label}</span>
                </div>
                <span className="text-[10px] text-slate-400 dark:text-zinc-500 font-mono">Select</span>
              </div>
            );
          })}
        </div>

        {/* Footer info */}
        <div className="px-4 py-2 bg-surface border-t border-border flex items-center justify-between text-[11px] text-slate-500 dark:text-zinc-500">
          <span>Nhấn <kbd className="px-1.5 py-0.5 rounded bg-slate-200 dark:bg-zinc-800 text-slate-800 dark:text-zinc-300 font-medium">↵</kbd> để chạy</span>
          <span>Nhấn <kbd className="px-1.5 py-0.5 rounded bg-slate-200 dark:bg-zinc-800 text-slate-800 dark:text-zinc-300 font-medium">Esc</kbd> để đóng</span>
        </div>
      </div>
    </div>
  );
};
