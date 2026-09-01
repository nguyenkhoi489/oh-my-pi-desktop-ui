import React, { useEffect, useRef, useState, useMemo } from 'react';
import {
  User,
  Sparkles,
  GitBranch,
  Paperclip,
  FileCode,
  Terminal,
  ChevronDown,
  ChevronUp,
  Copy,
  Check,
} from 'lucide-react';
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
  onOpenFile?: (filePath: string) => void;
}

const SystemMessageCard: React.FC<{ content: string; timestamp?: number }> = ({ content }) => {
  const [isExpanded, setIsExpanded] = useState<boolean>(false);
  const [copied, setCopied] = useState<boolean>(false);

  const lines = useMemo(() => content.split('\n'), [content]);
  const isLong = lines.length > 8 || content.length > 400;

  const displayContent = useMemo(() => {
    if (!isLong || isExpanded) return content;
    return lines.slice(0, 6).join('\n') + '\n...';
  }, [content, lines, isLong, isExpanded]);

  const handleCopy = () => {
    navigator.clipboard.writeText(content);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className="flex flex-col gap-1.5 animate-fade-in my-1">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <div className="w-5 h-5 rounded-md bg-amber-500/10 dark:bg-amber-400/10 flex items-center justify-center shrink-0">
            <Terminal className="w-3 h-3 text-amber-600 dark:text-amber-400" />
          </div>
          <span className="text-xs font-semibold text-slate-700 dark:text-zinc-300">
            Command Output
          </span>
          {isLong && (
            <span className="text-[10.5px] text-slate-400 dark:text-zinc-500">
              ({lines.length} dòng)
            </span>
          )}
        </div>

        <button
          type="button"
          onClick={handleCopy}
          className="text-slate-400 hover:text-slate-600 dark:hover:text-zinc-200 text-[11px] flex items-center gap-1 px-1.5 py-0.5 rounded hover:bg-surface-highlight transition-colors cursor-pointer"
          title="Sao chép kết quả"
        >
          {copied ? (
            <>
              <Check className="w-3 h-3 text-emerald-500" />
              <span className="text-emerald-500 text-[10.5px]">Đã chép</span>
            </>
          ) : (
            <>
              <Copy className="w-3 h-3" />
              <span className="text-[10.5px]">Copy</span>
            </>
          )}
        </button>
      </div>

      <div className="bg-surface/80 dark:bg-[#12131c] border border-border rounded-xl p-3 font-mono text-xs text-slate-800 dark:text-zinc-200 leading-relaxed overflow-x-auto whitespace-pre-wrap select-text shadow-xs">
        {displayContent}
      </div>

      {isLong && (
        <button
          type="button"
          onClick={() => setIsExpanded(!isExpanded)}
          className="self-start text-[11px] font-medium text-blue-600 dark:text-blue-400 hover:underline flex items-center gap-1 pl-1 cursor-pointer"
        >
          {isExpanded ? (
            <>
              <ChevronUp className="w-3 h-3" />
              <span>Thu gọn output</span>
            </>
          ) : (
            <>
              <ChevronDown className="w-3 h-3" />
              <span>Xem đầy đủ ({lines.length} dòng)</span>
            </>
          )}
        </button>
      )}
    </div>
  );
};

export const ChatHistory: React.FC<ChatHistoryProps> = ({
  messages,
  currentThinking,
  activeToolCalls,
  currentStreamText,
  status = 'idle',
  onBranchSession,
  onOpenFile,
}) => {
  const bottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, currentThinking, activeToolCalls, currentStreamText]);

  return (
    <div className="flex-1 overflow-y-auto p-4 space-y-5">
      {messages.map((msg) => {
        if (msg.role === 'fileMention') {
          const files = msg.files || [];
          return (
            <div key={msg.id} className="flex flex-col gap-2 animate-fade-in">
              <div className="flex items-center gap-2">
                <div className="w-6 h-6 rounded-md bg-blue-500/10 flex items-center justify-center shrink-0">
                  <Paperclip className="w-3.5 h-3.5 text-blue-500" />
                </div>
                <span className="text-xs font-semibold text-slate-700 dark:text-zinc-300">
                  Attached Context
                </span>
                <span className="text-[11px] text-slate-400">
                  ({files.length} file{files.length > 1 ? 's' : ''})
                </span>
              </div>

              <div className="flex flex-wrap gap-2 pl-8">
                {files.map((file, idx) => (
                  <button
                    key={`${file.path}-${idx}`}
                    onClick={() => onOpenFile?.(file.path)}
                    className="flex items-center gap-2 px-3 py-1.5 rounded-xl bg-surface border border-border hover:border-blue-500/50 hover:bg-surface-highlight text-xs font-mono transition-all cursor-pointer shadow-xs group text-left"
                    title={`Xem file ${file.path} trong editor`}
                  >
                    <FileCode className="w-3.5 h-3.5 text-blue-500 group-hover:scale-110 transition-transform shrink-0" />
                    <span className="text-slate-800 dark:text-zinc-200 font-medium truncate max-w-xs">
                      {file.path}
                    </span>
                    {typeof file.lineCount === 'number' && (
                      <span className="text-[10.5px] text-slate-400 dark:text-zinc-500 font-sans">
                        ({file.lineCount} lines)
                      </span>
                    )}
                  </button>
                ))}
              </div>
            </div>
          );
        }

        if (msg.role === 'system') {
          return <SystemMessageCard key={msg.id} content={msg.content} timestamp={msg.timestamp} />;
        }

        return (
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
        );
      })}

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
