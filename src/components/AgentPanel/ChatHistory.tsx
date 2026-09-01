import React, { useEffect, useRef } from 'react';
import { User, Sparkles, GitBranch } from 'lucide-react';
import { ChatMessage, ThinkingBlock, ToolCall, OmpAgentStatus } from '../../types';
import { ThinkingCard } from './ThinkingCard';
import { ToolCallCard } from './ToolCallCard';
import { MarkdownRenderer } from '../Common/MarkdownRenderer';

interface ChatHistoryProps {
  messages: ChatMessage[];
  currentThinking: ThinkingBlock | null;
  activeToolCalls: ToolCall[];
  currentStreamText: string;
  status?: OmpAgentStatus;
  onBranchSession?: (entryId: string) => void;
}

export const ChatHistory: React.FC<ChatHistoryProps> = ({
  messages,
  currentThinking,
  activeToolCalls,
  currentStreamText,
  status = 'idle',
  onBranchSession,
}) => {
  const bottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, currentThinking, activeToolCalls, currentStreamText]);

  return (
    <div className="flex-1 overflow-y-auto p-4 space-y-5">
      {messages.map((msg) => (
        <div key={msg.id} className="flex flex-col gap-2">
          {/* Message Header */}
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              {msg.role === 'user' ? (
                <div className="w-6 h-6 rounded-md bg-surface-highlight flex items-center justify-center shrink-0">
                  <User className="w-3.5 h-3.5 text-slate-600 dark:text-zinc-300" />
                </div>
              ) : (
                <div className="w-6 h-6 rounded-md bg-blue-500/10 flex items-center justify-center shrink-0">
                  <Sparkles className="w-3.5 h-3.5 text-blue-600 dark:text-blue-400" />
                </div>
              )}
              <span className="text-xs font-semibold text-slate-700 dark:text-zinc-300">
                {msg.role === 'user' ? 'You' : 'OMP Agent'}
              </span>
            </div>

            {msg.role === 'user' && msg.entryId && (
              <button
                onClick={() => {
                  if (status === 'idle' && onBranchSession) {
                    onBranchSession(msg.entryId!);
                  }
                }}
                disabled={status !== 'idle'}
                className={`flex items-center gap-1 px-1.5 py-0.5 rounded text-[11px] font-medium transition-colors ${
                  status !== 'idle'
                    ? 'opacity-40 cursor-not-allowed text-slate-400'
                    : 'text-slate-400 hover:text-blue-500 hover:bg-surface-highlight cursor-pointer'
                }`}
                title={status !== 'idle' ? 'Đang xử lý...' : 'Tạo nhánh mới từ tin nhắn này'}
              >
                <GitBranch className="w-3 h-3" />
                <span>Branch</span>
              </button>
            )}
          </div>

          {/* Thinking Block if attached */}
          {msg.thinking && <ThinkingCard thinking={msg.thinking} />}

          {/* Tool Calls if attached */}
          {msg.toolCalls && msg.toolCalls.length > 0 && (
            <div className="space-y-1.5">
              {msg.toolCalls.map((tc) => (
                <ToolCallCard key={tc.id} toolCall={tc} />
              ))}
            </div>
          )}

          {/* Message Bubble */}
          <div
            className={`p-3.5 rounded-2xl text-[13.5px] leading-relaxed ${
              msg.role === 'user'
                ? 'bg-surface-highlight text-slate-900 dark:text-zinc-100 border border-border self-end max-w-[90%] shadow-xs'
                : 'bg-transparent text-slate-800 dark:text-zinc-200'
            }`}
          >
            {msg.role === 'user' ? (
              <div className="whitespace-pre-wrap font-sans">{msg.content}</div>
            ) : (
              <MarkdownRenderer content={msg.content} />
            )}
          </div>
        </div>
      ))}

      {/* Active Thinking in Progress */}
      {currentThinking && (
        <ThinkingCard thinking={currentThinking} isStreaming={true} />
      )}

      {/* Active Tool Calls in Progress */}
      {activeToolCalls.length > 0 && (
        <div className="space-y-1.5">
          {activeToolCalls.map((tc) => (
            <ToolCallCard key={tc.id} toolCall={tc} />
          ))}
        </div>
      )}

      {/* Active Streaming Text */}
      {currentStreamText && (
        <div className="flex flex-col gap-2 animate-fade-in">
          <div className="flex items-center gap-2">
            <div className="w-6 h-6 rounded-md bg-blue-500/10 flex items-center justify-center shrink-0">
              <Sparkles className="w-3.5 h-3.5 text-blue-600 dark:text-blue-400 animate-pulse" />
            </div>
            <span className="text-xs font-semibold text-blue-600 dark:text-blue-400">
              OMP Agent
            </span>
          </div>
          <div className="p-3.5 rounded-2xl text-[13.5px] leading-relaxed text-slate-800 dark:text-zinc-200">
            <MarkdownRenderer content={currentStreamText} isStreaming={true} />
          </div>
        </div>
      )}

      <div ref={bottomRef} />
    </div>
  );
};
