import React, { useState } from 'react';
import { ChevronDown, ChevronRight, Brain } from 'lucide-react';
import { ThinkingBlock } from '../../types';

interface ThinkingCardProps {
  thinking: ThinkingBlock;
  isStreaming?: boolean;
}

export const ThinkingCard: React.FC<ThinkingCardProps> = ({
  thinking,
  isStreaming = false,
}) => {
  const [isExpanded, setIsExpanded] = useState<boolean>(true);

  return (
    <div className="my-2 rounded-xl border border-border bg-surface/60 dark:bg-[#14161f] overflow-hidden shadow-xs transition-all">
      {/* Thinking Header Bar */}
      <div
        onClick={() => setIsExpanded(!isExpanded)}
        className="flex items-center justify-between px-3.5 py-2 hover:bg-surface-highlight cursor-pointer select-none transition-colors"
      >
        <div className="flex items-center gap-2">
          <Brain className={`w-4 h-4 ${isStreaming ? 'text-codex-accent animate-pulse' : 'text-slate-500 dark:text-zinc-400'}`} />
          <span className="text-xs font-semibold text-slate-800 dark:text-zinc-200">
            {isStreaming ? 'Agent Reasoning...' : 'Reasoning Process'}
          </span>
          {isStreaming && (
            <span className="w-1.5 h-1.5 rounded-full bg-codex-accent animate-ping" />
          )}
        </div>

        <button className="text-slate-400 hover:text-slate-700 dark:hover:text-zinc-200">
          {isExpanded ? (
            <ChevronDown className="w-3.5 h-3.5" />
          ) : (
            <ChevronRight className="w-3.5 h-3.5" />
          )}
        </button>
      </div>

      {/* Thinking Content */}
      {isExpanded && (
        <div className="p-3.5 text-[12px] text-slate-700 dark:text-zinc-300 font-mono leading-relaxed whitespace-pre-wrap border-t border-border bg-panel/80 select-text">
          {thinking.thought}
        </div>
      )}
    </div>
  );
};
