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
    <div className="my-2 rounded-lg border border-purple-200 dark:border-purple-500/30 bg-purple-50/60 dark:bg-purple-950/20 overflow-hidden shadow-xs">
      {/* Thinking Header Bar */}
      <div
        onClick={() => setIsExpanded(!isExpanded)}
        className="flex items-center justify-between px-3 py-2 bg-purple-100/60 dark:bg-purple-900/20 hover:bg-purple-100 dark:hover:bg-purple-900/30 cursor-pointer select-none transition-colors"
      >
        <div className="flex items-center gap-2">
          <Brain className={`w-3.5 h-3.5 ${isStreaming ? 'text-purple-600 dark:text-purple-400 animate-pulse' : 'text-purple-600 dark:text-purple-400'}`} />
          <span className="text-xs font-semibold text-purple-900 dark:text-purple-200">
            {isStreaming ? 'Agent Reasoning...' : 'Reasoning Process'}
          </span>
          {isStreaming && (
            <span className="w-1.5 h-1.5 rounded-full bg-purple-600 dark:bg-purple-400 animate-ping" />
          )}
        </div>

        <button className="text-purple-600 dark:text-purple-400">
          {isExpanded ? (
            <ChevronDown className="w-3.5 h-3.5" />
          ) : (
            <ChevronRight className="w-3.5 h-3.5" />
          )}
        </button>
      </div>

      {/* Thinking Content */}
      {isExpanded && (
        <div className="p-3 text-xs text-purple-950 dark:text-purple-200/90 font-mono leading-relaxed whitespace-pre-wrap border-t border-purple-200 dark:border-purple-500/20 bg-white/70 dark:bg-[#0e0f14]/60">
          {thinking.thought}
        </div>
      )}
    </div>
  );
};
