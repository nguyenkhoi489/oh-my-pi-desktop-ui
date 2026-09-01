import React, { useState } from 'react';
import {
  Terminal,
  CheckCircle2,
  XCircle,
  RotateCw,
  ChevronDown,
  ChevronRight,
  ShieldAlert,
} from 'lucide-react';
import { ToolCall } from '../../types';

interface ToolCallCardProps {
  toolCall: ToolCall;
}

export const ToolCallCard: React.FC<ToolCallCardProps> = ({ toolCall }) => {
  const [isExpanded, setIsExpanded] = useState<boolean>(false);

  const getStatusIcon = () => {
    switch (toolCall.status) {
      case 'running':
        return <RotateCw className="w-3.5 h-3.5 text-blue-500 animate-spin" />;
      case 'completed':
        return <CheckCircle2 className="w-3.5 h-3.5 text-codex-accent" />;
      case 'failed':
        return <XCircle className="w-3.5 h-3.5 text-rose-500" />;
      case 'requires_permission':
        return <ShieldAlert className="w-3.5 h-3.5 text-amber-500" />;
      default:
        return <Terminal className="w-3.5 h-3.5 text-slate-400 dark:text-zinc-400" />;
    }
  };

  return (
    <div className="my-1.5 rounded-xl border border-border bg-surface/70 dark:bg-[#14161f] overflow-hidden shadow-xs transition-all">
      <div
        onClick={() => setIsExpanded(!isExpanded)}
        className="flex items-center justify-between px-3.5 py-2 hover:bg-surface-highlight cursor-pointer select-none transition-colors"
      >
        <div className="flex items-center gap-2 min-w-0">
          {getStatusIcon()}
          <span className="font-mono font-medium text-[12.5px] text-slate-800 dark:text-zinc-200 truncate">
            {toolCall.name}
          </span>
          <span className="text-[10px] px-1.5 py-0.2 rounded bg-surface-highlight text-slate-600 dark:text-zinc-400 font-mono">
            tool
          </span>
        </div>

        <div className="flex items-center gap-2">
          {toolCall.endTime && toolCall.startTime && (
            <span className="text-[11px] text-slate-400 dark:text-zinc-500 font-mono">
              {((toolCall.endTime - toolCall.startTime) / 1000).toFixed(1)}s
            </span>
          )}
          <button className="text-slate-400 hover:text-slate-700 dark:hover:text-zinc-200">
            {isExpanded ? (
              <ChevronDown className="w-3.5 h-3.5" />
            ) : (
              <ChevronRight className="w-3.5 h-3.5" />
            )}
          </button>
        </div>
      </div>

      {isExpanded && (
        <div className="p-3.5 border-t border-border bg-panel/80 font-mono text-[12px] space-y-2.5">
          <div>
            <div className="text-slate-400 dark:text-zinc-500 mb-1 font-semibold uppercase text-[10px] tracking-wider">
              Parameters:
            </div>
            <pre className="p-2.5 rounded-lg bg-background text-slate-800 dark:text-zinc-200 border border-border overflow-x-auto text-[11.5px]">
              {JSON.stringify(toolCall.params, null, 2)}
            </pre>
          </div>

          {toolCall.result && (
            <div>
              <div className="text-slate-400 dark:text-zinc-500 mb-1 font-semibold uppercase text-[10px] tracking-wider">
                Result:
              </div>
              <pre className="p-2.5 rounded-lg bg-background text-emerald-600 dark:text-emerald-400 border border-border overflow-x-auto text-[11.5px]">
                {JSON.stringify(toolCall.result, null, 2)}
              </pre>
            </div>
          )}

          {toolCall.error && (
            <div>
              <div className="text-rose-500 mb-1 font-semibold uppercase text-[10px] tracking-wider">
                Error:
              </div>
              <pre className="p-2.5 rounded-lg bg-rose-500/10 text-rose-600 dark:text-rose-400 border border-rose-500/20 overflow-x-auto text-[11.5px]">
                {toolCall.error}
              </pre>
            </div>
          )}
        </div>
      )}
    </div>
  );
};
