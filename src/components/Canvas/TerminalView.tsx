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
    <div className="flex-1 flex flex-col h-full bg-[#0c0d11] font-mono text-[12.5px] overflow-hidden text-zinc-200">
      <div className="h-11 bg-surface border-b border-border flex items-center justify-between px-4 shrink-0">
        <div className="flex items-center gap-2.5">
          <Terminal className="w-4 h-4 text-emerald-400" />
          <span className="text-xs font-semibold text-slate-800 dark:text-zinc-200">
            OMP Process Console & Terminal Output
          </span>
        </div>

        <button
          onClick={() => setLogs([])}
          className="p-1.5 rounded-lg text-slate-400 hover:text-slate-700 dark:text-zinc-400 dark:hover:text-zinc-100 hover:bg-surface-highlight transition-colors cursor-pointer"
          title="Clear console"
        >
          <Trash2 className="w-3.5 h-3.5" />
        </button>
      </div>

      <div className="flex-1 p-4 overflow-y-auto space-y-1.5 text-zinc-300 select-text leading-relaxed">
        {logs.map((log, idx) => (
          <div key={idx} className="flex items-start gap-2">
            <span className="text-zinc-500 select-none font-mono">$</span>
            <span className="font-mono">{log}</span>
          </div>
        ))}
      </div>
    </div>
  );
};
