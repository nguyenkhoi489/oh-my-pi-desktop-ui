import React, { useState } from 'react';
import {
  Wrench,
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
        return <RotateCw className="w-3.5 h-3.5 text-blue-600 dark:text-blue-400 animate-spin" />;
      case 'completed':
        return <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600 dark:text-emerald-400" />;
      case 'failed':
        return <XCircle className="w-3.5 h-3.5 text-rose-600 dark:text-red-400" />;
      case 'requires_permission':
        return <ShieldAlert className="w-3.5 h-3.5 text-amber-600 dark:text-amber-400" />;
      default:
        return <Wrench className="w-3.5 h-3.5 text-slate-500 dark:text-zinc-400" />;
    }
  };

  return (
    <div className="my-1.5 rounded-lg border border-border bg-surface overflow-hidden text-xs shadow-xs">
      <div
        onClick={() => setIsExpanded(!isExpanded)}
        className="flex items-center justify-between px-3 py-2 hover:bg-surface-highlight cursor-pointer select-none transition-colors"
      >
        <div className="flex items-center gap-2 min-w-0">
          {getStatusIcon()}
          <span className="font-mono font-medium text-slate-800 dark:text-zinc-200 truncate">
            {toolCall.name}
          </span>
          <span className="text-[10px] px-1.5 py-0.2 rounded bg-slate-200 dark:bg-zinc-800 text-slate-700 dark:text-zinc-400 font-mono">
            tool
          </span>
        </div>

        <div className="flex items-center gap-2">
          {toolCall.endTime && toolCall.startTime && (
            <span className="text-[10px] text-slate-500 dark:text-zinc-500 font-mono">
              {((toolCall.endTime - toolCall.startTime) / 1000).toFixed(1)}s
            </span>
          )}
          {isExpanded ? (
            <ChevronDown className="w-3 h-3 text-slate-500 dark:text-zinc-400" />
          ) : (
            <ChevronRight className="w-3 h-3 text-slate-500 dark:text-zinc-400" />
          )}
        </div>
      </div>

      {isExpanded && (
        <div className="p-3 border-t border-border bg-slate-50 dark:bg-[#0b0c0e] font-mono text-[11px] space-y-2">
          <div>
            <div className="text-slate-500 dark:text-zinc-500 mb-1 font-semibold uppercase text-[10px]">Parameters:</div>
            <pre className="p-2 rounded bg-white dark:bg-surface text-slate-800 dark:text-zinc-300 border border-border overflow-x-auto">
              {JSON.stringify(toolCall.params, null, 2)}
            </pre>
          </div>

          {toolCall.result && (
            <div>
              <div className="text-slate-500 dark:text-zinc-500 mb-1 font-semibold uppercase text-[10px]">Result:</div>
              <pre className="p-2 rounded bg-emerald-50 dark:bg-surface text-emerald-800 dark:text-emerald-400/90 border border-emerald-200 dark:border-border overflow-x-auto">
                {JSON.stringify(toolCall.result, null, 2)}
              </pre>
            </div>
          )}

          {toolCall.error && (
            <div>
              <div className="text-rose-600 dark:text-red-400 mb-1 font-semibold uppercase text-[10px]">Error:</div>
              <pre className="p-2 rounded bg-rose-50 dark:bg-red-950/30 text-rose-800 dark:text-red-300 border border-rose-200 dark:border-red-500/20 overflow-x-auto">
                {toolCall.error}
              </pre>
            </div>
          )}
        </div>
      )}
    </div>
  );
};
