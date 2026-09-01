import React, { useEffect, useRef } from 'react';
import { User, Sparkles } from 'lucide-react';
import { ChatMessage, ThinkingBlock, ToolCall } from '../../types';
import { ThinkingCard } from './ThinkingCard';
import { ToolCallCard } from './ToolCallCard';

interface ChatHistoryProps {
  messages: ChatMessage[];
  currentThinking: ThinkingBlock | null;
  activeToolCalls: ToolCall[];
  currentStreamText: string;
}

export const ChatHistory: React.FC<ChatHistoryProps> = ({
  messages,
  currentThinking,
  activeToolCalls,
  currentStreamText,
}) => {
  const bottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, currentThinking, activeToolCalls, currentStreamText]);

  return (
    <div className="flex-1 overflow-y-auto p-4 space-y-4">
      {messages.map((msg) => (
        <div key={msg.id} className="flex flex-col gap-1.5">
          {/* Message Header */}
          <div className="flex items-center gap-2">
            {msg.role === 'user' ? (
              <div className="w-5 h-5 rounded-full bg-slate-200 dark:bg-zinc-700 flex items-center justify-center">
                <User className="w-3 h-3 text-slate-700 dark:text-zinc-300" />
              </div>
            ) : (
              <div className="w-5 h-5 rounded-full bg-purple-100 dark:bg-purple-600/30 border border-purple-300 dark:border-purple-500/50 flex items-center justify-center">
                <Sparkles className="w-3 h-3 text-purple-600 dark:text-purple-400" />
              </div>
            )}
            <span className="text-[11px] font-semibold text-slate-500 dark:text-zinc-400">
              {msg.role === 'user' ? 'You' : 'OMP Agent'}
            </span>
          </div>

          {/* Thinking Block if attached */}
          {msg.thinking && <ThinkingCard thinking={msg.thinking} />}

          {/* Tool Calls if attached */}
          {msg.toolCalls && msg.toolCalls.length > 0 && (
            <div className="space-y-1">
              {msg.toolCalls.map((tc) => (
                <ToolCallCard key={tc.id} toolCall={tc} />
              ))}
            </div>
          )}

          {/* Message Bubble */}
          <div
            className={`p-3 rounded-xl text-xs leading-relaxed ${
              msg.role === 'user'
                ? 'bg-purple-50/80 dark:bg-surface text-slate-900 dark:text-zinc-100 border border-purple-200 dark:border-border self-end max-w-[90%] shadow-xs'
                : 'bg-transparent text-slate-800 dark:text-zinc-200'
            }`}
          >
            <div className="whitespace-pre-wrap font-sans">{msg.content}</div>
          </div>
        </div>
      ))}

      {/* Active Thinking in Progress */}
      {currentThinking && (
        <ThinkingCard thinking={currentThinking} isStreaming={true} />
      )}

      {/* Active Tool Calls in Progress */}
      {activeToolCalls.length > 0 && (
        <div className="space-y-1">
          {activeToolCalls.map((tc) => (
            <ToolCallCard key={tc.id} toolCall={tc} />
          ))}
        </div>
      )}

      {/* Active Streaming Text */}
      {currentStreamText && (
        <div className="flex flex-col gap-1.5 animate-fadeIn">
          <div className="flex items-center gap-2">
            <div className="w-5 h-5 rounded-full bg-purple-100 dark:bg-purple-600/30 border border-purple-300 dark:border-purple-500/50 flex items-center justify-center">
              <Sparkles className="w-3 h-3 text-purple-600 dark:text-purple-400" />
            </div>
            <span className="text-[11px] font-semibold text-purple-700 dark:text-purple-300">
              OMP Agent
            </span>
          </div>
          <div className="p-3 rounded-xl text-xs leading-relaxed text-slate-800 dark:text-zinc-200 whitespace-pre-wrap">
            {currentStreamText}
            <span className="inline-block w-1.5 h-3.5 ml-1 bg-purple-600 dark:bg-purple-400 animate-pulse" />
          </div>
        </div>
      )}

      <div ref={bottomRef} />
    </div>
  );
};
