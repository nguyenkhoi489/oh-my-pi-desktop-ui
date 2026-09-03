import React, { useEffect, useRef, useState, useMemo } from 'react';
import {
  X,
  Bot,
  Loader2,
  RefreshCw,
  ArrowDown,
  Cpu,
  User,
  Sparkles,
  AlertCircle,
  FileText,
  Radio,
  Clock,
  Terminal,
} from 'lucide-react';
import { OmpSubagentInfo } from '../../types';
import { useSubagentTranscript } from '../../hooks/useSubagentTranscript';
import { ThinkingCard } from './ThinkingCard';
import { ToolCallCard } from './ToolCallCard';
import { MarkdownRenderer } from '../Common/MarkdownRenderer';
import { useI18n } from '../../i18n/I18nProvider';

interface SubagentTranscriptProps {
  subagent: OmpSubagentInfo | null;
  isOpen: boolean;
  onClose: () => void;
}

export const SubagentTranscript: React.FC<SubagentTranscriptProps> = ({
  subagent,
  isOpen,
  onClose,
}) => {
  const { t } = useI18n();
  const [autoScroll, setAutoScroll] = useState<boolean>(true);
  const scrollContainerRef = useRef<HTMLDivElement>(null);

  const {
    messages,
    isLoading,
    isTailing,
    error,
    sessionFile,
    fromByte,
    refresh,
  } = useSubagentTranscript({
    subagent,
    isOpen,
  });

  const isRunning = subagent?.status === 'running' || subagent?.status === 'started';

  // Listen for Escape key to close drawer
  useEffect(() => {
    if (!isOpen) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        onClose();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, onClose]);

  // Auto-scroll to bottom on new messages
  useEffect(() => {
    if (autoScroll && scrollContainerRef.current) {
      scrollContainerRef.current.scrollTop = scrollContainerRef.current.scrollHeight;
    }
  }, [messages, autoScroll]);

  // Track user scroll position for auto-scroll
  const handleScroll = () => {
    if (!scrollContainerRef.current) return;
    const { scrollTop, scrollHeight, clientHeight } = scrollContainerRef.current;
    const isAtBottom = scrollHeight - scrollTop - clientHeight < 50;
    if (isAtBottom !== autoScroll) {
      setAutoScroll(isAtBottom);
    }
  };

  const scrollToBottom = () => {
    if (scrollContainerRef.current) {
      scrollContainerRef.current.scrollTo({
        top: scrollContainerRef.current.scrollHeight,
        behavior: 'smooth',
      });
      setAutoScroll(true);
    }
  };

  const formattedByteSize = useMemo(() => {
    if (fromByte < 1024) return `${fromByte} B`;
    if (fromByte < 1024 * 1024) return `${(fromByte / 1024).toFixed(1)} KB`;
    return `${(fromByte / (1024 * 1024)).toFixed(1)} MB`;
  }, [fromByte]);

  if (!isOpen || !subagent) {
    return null;
  }

  return (
    <div className="fixed inset-0 z-50 flex justify-end bg-black/50 backdrop-blur-xs animate-in fade-in duration-200">
      <div
        className="w-full max-w-2xl h-full bg-panel border-l border-border flex flex-col shadow-2xl animate-in slide-in-from-right duration-300 select-text"
        role="dialog"
        aria-modal="true"
        aria-labelledby="subagent-transcript-title"
      >
        {/* Header Bar */}
        <div className="flex items-center justify-between px-4 py-3 border-b border-border bg-surface shrink-0">
          <div className="flex items-center gap-2.5 min-w-0 flex-1">
            <div className="w-8 h-8 rounded-lg bg-blue-500/10 flex items-center justify-center shrink-0 border border-blue-500/20">
              <Bot className="w-4 h-4 text-blue-500" />
            </div>
            <div className="flex flex-col min-w-0">
              <div className="flex items-center gap-2">
                <span
                  id="subagent-transcript-title"
                  className="font-bold text-sm text-slate-900 dark:text-zinc-100 truncate"
                >
                  {subagent.id}
                </span>
                {subagent.agent && (
                  <span className="px-1.5 py-0.5 rounded text-[10.5px] font-mono font-medium bg-surface-highlight text-slate-600 dark:text-zinc-400 border border-border">
                    {subagent.agent}
                  </span>
                )}
              </div>
              <div className="flex items-center gap-2 text-[11px] text-slate-500 dark:text-zinc-400 truncate">
                <span className="flex items-center gap-1">
                  <Clock className="w-3 h-3" />
                  {subagent.status || 'unknown'}
                </span>
                {sessionFile && (
                  <>
                    <span>•</span>
                    <span className="font-mono truncate" title={sessionFile}>
                      {sessionFile.split('/').pop()}
                    </span>
                  </>
                )}
              </div>
            </div>
          </div>

          <div className="flex items-center gap-1.5 shrink-0 ml-3">
            <span
              className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-semibold ${
                isRunning
                  ? 'bg-blue-500/10 text-blue-600 dark:text-blue-400 border border-blue-500/25'
                  : 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border border-emerald-500/25'
              }`}
            >
              {isRunning ? (
                <>
                  <Loader2 className="w-3 h-3 animate-spin" />
                  <span>Running</span>
                </>
              ) : (
                <span>{subagent.status}</span>
              )}
            </span>

            <button
              onClick={() => refresh()}
              disabled={isLoading}
              className="p-1.5 rounded-lg text-slate-400 hover:text-slate-700 dark:hover:text-zinc-200 hover:bg-surface-highlight transition-colors disabled:opacity-50"
              title={t('subagent.refreshTranscript')}
            >
              <RefreshCw className={`w-4 h-4 ${isLoading ? 'animate-spin' : ''}`} />
            </button>

            <button
              onClick={onClose}
              className="p-1.5 rounded-lg text-slate-400 hover:text-slate-700 dark:hover:text-zinc-200 hover:bg-surface-highlight transition-colors"
              title={t('subagent.closeTranscript')}
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>

        {/* Task / Description Banner */}
        {(subagent.description || subagent.task) && (
          <div className="px-4 py-2.5 bg-surface/50 border-b border-border text-xs text-slate-600 dark:text-zinc-300 leading-relaxed shrink-0">
            <div className="font-semibold text-slate-700 dark:text-zinc-200 mb-0.5 flex items-center gap-1.5">
              <FileText className="w-3.5 h-3.5 text-blue-500" />
              <span>{t('subagent.taskLabel')}</span>
            </div>
            <div className="line-clamp-3 whitespace-pre-wrap font-sans pl-5 text-[11.5px]">
              {subagent.description || subagent.task}
            </div>
          </div>
        )}

        {/* Messages Transcript Scroll Area */}
        <div
          ref={scrollContainerRef}
          onScroll={handleScroll}
          className="flex-1 overflow-y-auto p-4 space-y-4 min-h-0"
        >
          {isLoading && messages.length === 0 && (
            <div className="h-full flex flex-col items-center justify-center gap-3 text-slate-400 dark:text-zinc-500 p-8">
              <Loader2 className="w-8 h-8 animate-spin text-blue-500" />
              <span className="text-sm font-medium">{t('subagent.loading')}</span>
            </div>
          )}

          {error && messages.length === 0 && (
            <div className="p-4 rounded-xl bg-amber-500/10 border border-amber-500/20 text-amber-700 dark:text-amber-400 flex items-start gap-3 my-4">
              <AlertCircle className="w-5 h-5 shrink-0 mt-0.5" />
              <div className="flex flex-col gap-1 text-xs leading-relaxed">
                <span className="font-semibold text-[13px]">{t('subagent.loadError')}</span>
                <span>{error}</span>
                <span className="text-slate-400 dark:text-zinc-500 mt-1">
                  {t('subagent.readErrorHint')}
                </span>
              </div>
            </div>
          )}

          {!isLoading && !error && messages.length === 0 && (
            <div className="h-full flex flex-col items-center justify-center gap-2 text-slate-400 dark:text-zinc-500 p-8 text-center">
              <Terminal className="w-8 h-8 text-slate-400 dark:text-zinc-600" />
              <span className="text-sm font-semibold text-slate-600 dark:text-zinc-400">
                {t('subagent.empty')}
              </span>
              <span className="text-xs max-w-sm">
                {t('subagent.noMessagesDesc')}
              </span>
            </div>
          )}

          {messages.map((msg) => {
            if (msg.role === 'user') {
              return (
                <div
                  key={msg.id}
                  className="flex flex-col items-end gap-1.5 self-end max-w-[85%] ml-auto animate-fade-in"
                >
                  <div className="flex items-center gap-1.5 justify-end">
                    <span className="text-xs font-semibold text-slate-700 dark:text-zinc-300">
                      Assignment
                    </span>
                    <div className="w-5 h-5 rounded-md bg-surface-highlight flex items-center justify-center shrink-0">
                      <User className="w-3 h-3 text-slate-600 dark:text-zinc-300" />
                    </div>
                  </div>
                  <div className="w-full p-3.5 rounded-2xl text-[13px] leading-relaxed bg-surface-highlight text-slate-900 dark:text-zinc-100 border border-border shadow-xs">
                    <div className="whitespace-pre-wrap font-sans break-words">{msg.content}</div>
                  </div>
                </div>
              );
            }

            if (msg.role === 'system') {
              return (
                <div
                  key={msg.id}
                  className="p-2.5 rounded-lg bg-surface border border-border text-xs text-slate-500 dark:text-zinc-400 flex items-center gap-2 font-mono"
                >
                  <Terminal className="w-3.5 h-3.5 shrink-0 text-slate-400" />
                  <span className="truncate">{msg.content}</span>
                </div>
              );
            }

            return (
              <div key={msg.id} className="flex flex-col gap-2 animate-fade-in">
                <div className="flex items-center gap-2">
                  <div className="w-5 h-5 rounded-md bg-blue-500/10 flex items-center justify-center shrink-0 border border-blue-500/20">
                    <Sparkles className="w-3 h-3 text-blue-500" />
                  </div>
                  <span className="text-xs font-semibold text-slate-700 dark:text-zinc-300">
                    {subagent.agent || subagent.id}
                  </span>
                </div>

                {msg.thinking && (
                  <ThinkingCard thinking={msg.thinking} isStreaming={false} />
                )}

                {msg.toolCalls && msg.toolCalls.length > 0 && (
                  <div className="space-y-1.5 my-1">
                    {msg.toolCalls.map((toolCall) => (
                      <ToolCallCard key={toolCall.id} toolCall={toolCall} />
                    ))}
                  </div>
                )}

                {msg.content && (
                  <div className="p-3.5 rounded-2xl bg-surface border border-border text-[13px] leading-relaxed text-slate-900 dark:text-zinc-100 shadow-xs">
                    <MarkdownRenderer content={msg.content} />
                  </div>
                )}
              </div>
            );
          })}
        </div>

        {/* Footer Status Bar */}
        <div className="flex items-center justify-between px-4 py-2 bg-surface border-t border-border text-[11px] text-slate-500 dark:text-zinc-400 shrink-0 select-none">
          <div className="flex items-center gap-2">
            {isTailing ? (
              <span className="flex items-center gap-1 text-blue-500 dark:text-blue-400 font-medium">
                <Radio className="w-3 h-3 animate-pulse" />
                <span>{t('subagent.realtimeTailing')}</span>
              </span>
            ) : (
              <span className="flex items-center gap-1 text-slate-400">
                <Cpu className="w-3 h-3" />
                <span>{t('subagent.staticStatus')}</span>
              </span>
            )}
            <span>•</span>
            <span>{t('subagent.messagesCount', { count: messages.length })}</span>
            <span>•</span>
            <span>{formattedByteSize}</span>
          </div>

          {!autoScroll && messages.length > 0 && (
            <button
              onClick={scrollToBottom}
              className="flex items-center gap-1 text-blue-500 hover:text-blue-600 dark:hover:text-blue-400 font-medium cursor-pointer"
            >
              <span>{t('subagent.scrollToBottom')}</span>
              <ArrowDown className="w-3 h-3" />
            </button>
          )}
        </div>
      </div>
    </div>
  );
};
