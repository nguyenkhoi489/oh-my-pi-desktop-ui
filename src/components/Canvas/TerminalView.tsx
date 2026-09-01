import React, { useState } from 'react';
import { Terminal, Trash2 } from 'lucide-react';
import { ThemeMode } from '../../types';

interface TerminalViewProps {
  theme?: ThemeMode;
}

export const TerminalView: React.FC<TerminalViewProps> = () => {
  const [logs, setLogs] = useState<string[]>([
    '[omp] Initializing oh-my-pi RPC daemon...',
    '[omp] Tree-sitter parsers loaded: TypeScript, Rust, Python, Go',
    '[omp] Connected to Language Server Protocol (LSP)',
    '[omp] Ready for prompt requests on stdio.',
  ]);

  return (
    <div className="flex-1 flex flex-col h-full bg-slate-900 dark:bg-[#0b0c0e] font-mono text-xs overflow-hidden text-slate-100">
      <div className="h-10 bg-slate-800 dark:bg-surface border-b border-slate-700 dark:border-border flex items-center justify-between px-3 shrink-0">
        <div className="flex items-center gap-2">
          <Terminal className="w-4 h-4 text-emerald-400" />
          <span className="text-xs font-semibold text-slate-200 dark:text-zinc-300">
            OMP Process Console & Terminal Output
          </span>
        </div>

        <button
          onClick={() => setLogs([])}
          className="p-1 rounded text-slate-400 hover:text-slate-200 hover:bg-slate-700 dark:text-zinc-500 dark:hover:text-zinc-300 dark:hover:bg-surface-highlight transition-colors"
          title="Clear console"
        >
          <Trash2 className="w-3.5 h-3.5" />
        </button>
      </div>

      <div className="flex-1 p-3 overflow-y-auto space-y-1 text-slate-300 dark:text-zinc-400 select-text">
        {logs.map((log, idx) => (
          <div key={idx} className="leading-relaxed">
            <span className="text-slate-500 dark:text-zinc-600 mr-2">$</span>
            <span>{log}</span>
          </div>
        ))}
      </div>
    </div>
  );
};
