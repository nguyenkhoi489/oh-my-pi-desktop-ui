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
    <div className="fixed inset-0 z-50 flex items-start justify-center pt-24 bg-black/60 backdrop-blur-sm animate-fade-in p-4">
      <div className="w-full max-w-xl bg-panel border border-border rounded-2xl shadow-2xl overflow-hidden">
        {/* Input Bar */}
        <div className="flex items-center px-4 py-3.5 border-b border-border bg-surface">
          <Sparkles className="w-4 h-4 text-codex-accent mr-3 shrink-0" />
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
            className="p-1 rounded-md text-slate-400 hover:text-slate-700 dark:hover:text-zinc-200 cursor-pointer"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Quick Suggestion List */}
        <div className="p-2.5 space-y-1">
          <div className="text-[11px] font-bold text-slate-400 dark:text-zinc-500 uppercase px-2.5 py-1 tracking-wider">
            Quick Actions
          </div>
          {quickActions.map((act, i) => {
            const Icon = act.icon;
            return (
              <div
                key={i}
                onClick={() => {
                  setPrompt(act.cmd);
                }}
                className="flex items-center justify-between px-3 py-2.5 rounded-xl text-xs text-slate-700 dark:text-zinc-300 hover:bg-surface-highlight hover:text-slate-900 dark:hover:text-zinc-100 cursor-pointer transition-colors"
              >
                <div className="flex items-center gap-2.5">
                  <Icon className="w-4 h-4 text-slate-400 dark:text-zinc-400" />
                  <span className="font-medium">{act.label}</span>
                </div>
                <span className="text-[11px] text-slate-400 dark:text-zinc-500 font-mono">Select</span>
              </div>
            );
          })}
        </div>

        {/* Footer info */}
        <div className="px-4 py-2.5 bg-surface border-t border-border flex items-center justify-between text-xs text-slate-500 dark:text-zinc-400">
          <span>Nhấn <kbd className="px-1.5 py-0.5 rounded bg-surface-highlight text-slate-800 dark:text-zinc-200 font-medium border border-border">↵</kbd> để chạy</span>
          <span>Nhấn <kbd className="px-1.5 py-0.5 rounded bg-surface-highlight text-slate-800 dark:text-zinc-200 font-medium border border-border">Esc</kbd> để đóng</span>
        </div>
      </div>
    </div>
  );
};
