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
  ZoomIn,
  AlertTriangle,
  RotateCcw,
  Wrench,
} from 'lucide-react';
import { ChatMessage, ThinkingBlock, ToolCall, OmpAgentStatus } from '../../types';
import { ThinkingCard } from './ThinkingCard';
import { ToolCallCard } from './ToolCallCard';
import { MarkdownRenderer } from '../Common/MarkdownRenderer';
import { isImageFile } from '../../utils/imageAttachment';
import { ImageLightboxModal } from './ImageLightboxModal';
import { AttachmentImage } from '../Common/AttachmentImage';
import { stripAnsi } from '../../../shared/text/strip-ansi';
import { useI18n } from '../../i18n/I18nProvider';

interface ChatHistoryProps {
  messages: ChatMessage[];
  currentThinking: ThinkingBlock | null;
  activeToolCalls: ToolCall[];
  currentStreamText: string;
  status?: OmpAgentStatus;
  onBranchSession?: (entryId: string) => void;
  onOpenFile?: (filePath: string) => void;
  onOpenBrowser?: (url: string) => void;
  onRetry?: (prompt?: string) => void;
  onRepairSession?: () => void;
}

interface ErrorAssistantCardProps {
  errorMessage?: string;
  stopReason?: string | null;
  content?: string;
  onRetry?: () => void;
  onRepair?: () => void;
  onRollback?: () => void;
  onOpenBrowser?: (url: string) => void;
}
const ErrorAssistantCard: React.FC<ErrorAssistantCardProps> = ({
  errorMessage,
  stopReason,
  content,
  onRetry,
  onRepair,
  onRollback,
  onOpenBrowser,
}) => {
  const { t } = useI18n();
  const [showDetails, setShowDetails] = useState<boolean>(false);

  return (
    <div className="p-3.5 rounded-2xl border border-rose-500/30 bg-rose-500/5 dark:bg-rose-950/20 text-[13px] flex flex-col gap-2.5 min-w-0 max-w-full my-1">
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-2 text-rose-600 dark:text-rose-400 font-semibold text-xs">
          <AlertTriangle className="w-4 h-4 shrink-0" />
          <span>{t('chatHistory.apiErrorTitle')}</span>
          {stopReason && (
            <span className="text-[10.5px] px-1.5 py-0.5 rounded bg-rose-500/10 text-rose-600 dark:text-rose-400 font-mono font-normal">
              {stopReason}
            </span>
          )}
        </div>
        {errorMessage && (
          <button
            type="button"
            onClick={() => setShowDetails((p) => !p)}
            className="flex items-center gap-1 text-[11px] text-rose-600 dark:text-rose-400 hover:underline cursor-pointer select-none"
          >
            <span>{t('chatHistory.apiErrorDetails')}</span>
            {showDetails ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />}
          </button>
        )}
      </div>

      {content && content.trim().length > 0 && (
        <div className="text-slate-800 dark:text-zinc-200">
          <MarkdownRenderer content={content} onOpenUrl={onOpenBrowser} />
        </div>
      )}

      {showDetails && errorMessage && (
        <div className="p-2.5 rounded-lg bg-black/5 dark:bg-black/30 font-mono text-[11px] text-rose-700 dark:text-rose-300 break-all whitespace-pre-wrap select-text border border-rose-500/20">
          {errorMessage}
        </div>
      )}

      {/* Fast recovery action buttons */}
      <div className="flex flex-wrap items-center gap-2 pt-1 border-t border-rose-500/15">
        {onRetry && (
          <button
            type="button"
            onClick={onRetry}
            className="flex items-center gap-1.5 px-2.5 py-1 rounded-md text-xs font-medium bg-rose-600 hover:bg-rose-700 text-white shadow-xs transition-colors cursor-pointer"
          >
            <RotateCcw className="w-3 h-3" />
            <span>{t('chatHistory.retryAction')}</span>
          </button>
        )}
        {onRepair && (
          <button
            type="button"
            onClick={onRepair}
            className="flex items-center gap-1.5 px-2.5 py-1 rounded-md text-xs font-medium bg-rose-500/10 hover:bg-rose-500/20 text-rose-700 dark:text-rose-300 border border-rose-500/30 transition-colors cursor-pointer"
          >
            <Wrench className="w-3 h-3" />
            <span>{t('chatHistory.repairAction')}</span>
          </button>
        )}
        {onRollback && (
          <button
            type="button"
            onClick={onRollback}
            className="flex items-center gap-1.5 px-2.5 py-1 rounded-md text-xs font-medium text-slate-600 dark:text-zinc-400 hover:text-slate-900 dark:hover:text-zinc-200 hover:bg-slate-100 dark:hover:bg-zinc-800 transition-colors cursor-pointer"
          >
            <GitBranch className="w-3 h-3" />
            <span>{t('chatHistory.rollbackAction')}</span>
          </button>
        )}
      </div>
    </div>
  );
};

const SystemMessageCard: React.FC<{ content: string; timestamp?: number }> = ({ content }) => {
  const { t } = useI18n();
  const [isExpanded, setIsExpanded] = useState<boolean>(false);
  const [copied, setCopied] = useState<boolean>(false);

  const cleanContent = useMemo(() => stripAnsi(content), [content]);
  const lines = useMemo(() => cleanContent.split('\n'), [cleanContent]);
  const isLong = lines.length > 8 || cleanContent.length > 400;

  const displayContent = useMemo(() => {
    if (!isLong || isExpanded) return cleanContent;
    return lines.slice(0, 6).join('\n') + '\n...';
  }, [cleanContent, lines, isLong, isExpanded]);

  const handleCopy = () => {
    navigator.clipboard.writeText(cleanContent);
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
              {t('chatHistory.linesCount', { count: lines.length })}
            </span>
          )}
        </div>

        <button
          type="button"
          onClick={handleCopy}
          className="text-slate-400 hover:text-slate-600 dark:hover:text-zinc-200 text-[11px] flex items-center gap-1 px-1.5 py-0.5 rounded hover:bg-surface-highlight transition-colors cursor-pointer"
          title={t('chatHistory.copyResult')}
        >
          {copied ? (
            <>
              <Check className="w-3 h-3 text-emerald-500" />
              <span className="text-emerald-500 text-[10.5px]">{t('chatHistory.copied')}</span>
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
              <span>{t('chatHistory.collapseOutput')}</span>
            </>
          ) : (
            <>
              <ChevronDown className="w-3 h-3" />
              <span>{t('chatHistory.viewFullLines', { count: lines.length })}</span>
            </>
          )}
        </button>
      )}
    </div>
  );
};

const ChatHistoryComponent: React.FC<ChatHistoryProps> = ({
  messages,
  currentThinking,
  activeToolCalls,
  currentStreamText,
  status = 'idle',
  onBranchSession,
  onOpenFile,
  onRetry,
  onRepairSession,
  onOpenBrowser,
}) => {
  const { t } = useI18n();
  const [lightboxImage, setLightboxImage] = useState<{ url: string; name: string } | null>(null);
  const [copiedMsgId, setCopiedMsgId] = useState<string | null>(null);
  const handleCopyMessage = (text: string, msgId: string) => {
    navigator.clipboard.writeText(text);
    setCopiedMsgId(msgId);
    setTimeout(() => setCopiedMsgId(null), 2000);
  };
  const containerRef = useRef<HTMLDivElement>(null);
  const bottomRef = useRef<HTMLDivElement>(null);
  const stickToBottomRef = useRef<boolean>(true);

  // Consider stuck-to-bottom only when user is near bottom
  const handleScroll = () => {
    const el = containerRef.current;
    if (!el) return;
    stickToBottomRef.current = el.scrollHeight - el.scrollTop - el.clientHeight < 80;
  };

  useEffect(() => {
    if (stickToBottomRef.current) {
      bottomRef.current?.scrollIntoView({ behavior: 'auto' });
    }
  }, [messages, currentThinking, activeToolCalls, currentStreamText]);

  return (
    <div ref={containerRef} onScroll={handleScroll} className="flex-1 overflow-y-auto p-4 space-y-5">
      {messages.map((msg, index) => {
        if (msg.role === 'fileMention') {
          // Skip duplicate fileMention card adjacent to user message or previous card
          const nextMsg = messages[index + 1];
          const afterNextMsg = messages[index + 2];
          if (nextMsg && nextMsg.role === 'user' && afterNextMsg && afterNextMsg.role === 'fileMention') {
            const curPaths = (msg.files || []).map((f) => f.path).sort().join('|');
            const targetPaths = (afterNextMsg.files || []).map((f) => f.path).sort().join('|');
            if (curPaths === targetPaths) {
              return null;
            }
          }
          const prevMsg = messages[index - 1];
          if (prevMsg && prevMsg.role === 'fileMention') {
            const curPaths = (msg.files || []).map((f) => f.path).sort().join('|');
            const prevPaths = (prevMsg.files || []).map((f) => f.path).sort().join('|');
            if (curPaths === prevPaths) {
              return null;
            }
          }
          const files = msg.files || [];
          return (
            <div key={msg.id} className="flex flex-col items-end gap-1.5 self-end max-w-[85%] ml-auto animate-fade-in">
              <div className="flex items-center gap-1.5 justify-end">
                <span className="text-xs font-semibold text-slate-700 dark:text-zinc-300">
                  Attached Context
                </span>
                <span className="text-[11px] text-slate-400">
                  ({files.length} file{files.length > 1 ? 's' : ''})
                </span>
                <div className="w-6 h-6 rounded-md bg-blue-500/10 flex items-center justify-center shrink-0">
                  <Paperclip className="w-3.5 h-3.5 text-blue-500" />
                </div>
              </div>

              <div className="flex flex-wrap gap-2 justify-end">
                {files.map((file, idx) => {
                  const isImg = isImageFile(file.path);
                  if (isImg) {
                    return (
                      <button
                        key={`${file.path}-${idx}`}
                        type="button"
                        onClick={() => setLightboxImage({ url: file.path, name: file.name || file.path })}
                        className="flex items-center gap-2.5 p-1.5 pr-3 rounded-xl bg-surface border border-border hover:border-blue-500/50 hover:bg-surface-highlight text-xs transition-all cursor-pointer shadow-xs group text-left"
                        title={t('chatHistory.viewImageZoom', { path: file.path })}
                      >
                        <div className="w-10 h-10 rounded-lg overflow-hidden shrink-0 bg-surface-highlight border border-border/60 flex items-center justify-center relative">
                          <AttachmentImage
                            src={file.path}
                            alt={file.name || file.path}
                            className="w-full h-full object-cover group-hover:scale-110 transition-transform"
                          />
                          <div className="absolute inset-0 bg-black/25 opacity-0 group-hover:opacity-100 flex items-center justify-center transition-opacity">
                            <ZoomIn className="w-3.5 h-3.5 text-white drop-shadow" />
                          </div>
                        </div>
                        <div className="flex flex-col min-w-0 max-w-xs">
                          <span className="text-slate-800 dark:text-zinc-200 font-medium font-mono text-[11.5px] truncate">
                            {file.name || file.path}
                          </span>
                          <span className="text-[10px] text-slate-400 dark:text-zinc-500 uppercase font-sans">
                            {t('chatHistory.imageAttachment')}
                          </span>
                        </div>
                      </button>
                    );
                  }
                  return (
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
                  );
                })}
              </div>
            </div>
          );
        }

        if (msg.role === 'system') {
          return <SystemMessageCard key={msg.id} content={msg.content} timestamp={msg.timestamp} />;
        }

        if (msg.role === 'user') {
          return (
            <div key={msg.id} className="flex flex-col items-end gap-1.5 self-end max-w-[85%] ml-auto animate-fade-in">
              {/* User Header directly above the message bubble */}
              <div className="flex items-center gap-1.5 justify-end">
                {msg.steering && (
                  <span className="px-1.5 py-0.5 rounded text-[10px] font-semibold tracking-wide lowercase bg-amber-500/15 text-amber-600 dark:text-amber-400 border border-amber-500/25">
                    steered
                  </span>
                )}
                {msg.queued && (
                  <span className="px-1.5 py-0.5 rounded text-[10px] font-semibold tracking-wide lowercase bg-blue-500/15 text-blue-600 dark:text-blue-400 border border-blue-500/25">
                    queued
                  </span>
                )}
                {msg.entryId && (
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
                    title={status !== 'idle' ? t('chatHistory.processing') : t('chatHistory.branchFromMessage')}
                  >
                    <GitBranch className="w-3 h-3" />
                    <span>Branch</span>
                  </button>
                )}
                <span className="text-xs font-semibold text-slate-700 dark:text-zinc-300">
                  You
                </span>
                <div className="w-5 h-5 rounded-md bg-surface-highlight flex items-center justify-center shrink-0">
                  <User className="w-3 h-3 text-slate-600 dark:text-zinc-300" />
                </div>
              </div>

              {/* Message Bubble */}
              <div className="w-full p-3.5 rounded-2xl text-[13.5px] leading-relaxed bg-surface-highlight text-slate-900 dark:text-zinc-100 border border-border shadow-xs">
                <div className="whitespace-pre-wrap font-sans break-words">{msg.content}</div>
              </div>
            </div>
          );
        }

        return (
          <div key={msg.id} className="flex flex-col gap-2 min-w-0 max-w-full">
            {/* Assistant Message Header */}
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <div className="w-6 h-6 rounded-md bg-blue-500/10 flex items-center justify-center shrink-0">
                  <Sparkles className="w-3.5 h-3.5 text-blue-600 dark:text-blue-400" />
                </div>
                <span className="text-xs font-semibold text-slate-700 dark:text-zinc-300">
                  OMP Agent
                </span>
              </div>
              {msg.content && msg.content.trim().length > 0 && (
                <button
                  type="button"
                  onClick={() => handleCopyMessage(msg.content, msg.id)}
                  className="text-slate-400 hover:text-slate-600 dark:hover:text-zinc-200 text-[11px] flex items-center gap-1 px-1.5 py-0.5 rounded hover:bg-surface-highlight transition-colors cursor-pointer"
                  title={t('chatHistory.copyResponse')}
                >
                  {copiedMsgId === msg.id ? (
                    <>
                      <Check className="w-3 h-3 text-emerald-500" />
                      <span className="text-emerald-500 text-[10.5px]">{t('chatHistory.copied')}</span>
                    </>
                  ) : (
                    <>
                      <Copy className="w-3 h-3" />
                      <span className="text-[10.5px]">Copy</span>
                    </>
                  )}
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

            {/* Message Bubble or Error Card */}
            {msg.role === 'assistant' && (msg.stopReason === 'error' || Boolean(msg.isError) || Boolean(msg.errorMessage)) ? (
              <ErrorAssistantCard
                errorMessage={msg.errorMessage}
                stopReason={msg.stopReason}
                content={msg.content}
                onRetry={
                  onRetry
                    ? () => {
                        const prevUserMsg = messages.slice(0, index).reverse().find((m) => m.role === 'user');
                        onRetry(prevUserMsg?.content);
                      }
                    : undefined
                }
                onRepair={onRepairSession}
                onRollback={
                  onBranchSession
                    ? () => {
                        const prevEntryId = messages.slice(0, index).reverse().find((m) => m.entryId)?.entryId || msg.entryId;
                        if (prevEntryId) {
                          onBranchSession(prevEntryId);
                        }
                      }
                    : undefined
                }
                onOpenBrowser={onOpenBrowser}
              />
            ) : (
              msg.content && msg.content.trim().length > 0 && (
                <div className="p-3.5 rounded-2xl text-[13.5px] leading-relaxed bg-transparent text-slate-800 dark:text-zinc-200 min-w-0 max-w-full overflow-hidden break-words">
                  <MarkdownRenderer content={msg.content} onOpenUrl={onOpenBrowser} />
                </div>
              )
            )}
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
            <ToolCallCard key={tc.id} toolCall={tc} onOpenBrowser={onOpenBrowser} />
          ))}
        </div>
      )}

      {/* Active Streaming Text */}
      {currentStreamText && (
        <div className="flex flex-col gap-2 animate-fade-in min-w-0 max-w-full">
          <div className="flex items-center gap-2">
            <div className="w-6 h-6 rounded-md bg-blue-500/10 flex items-center justify-center shrink-0">
              <Sparkles className="w-3.5 h-3.5 text-blue-600 dark:text-blue-400 animate-pulse" />
            </div>
            <span className="text-xs font-semibold text-blue-600 dark:text-blue-400">
              OMP Agent
            </span>
          </div>
          <div className="p-3.5 rounded-2xl text-[13.5px] leading-relaxed text-slate-800 dark:text-zinc-200 min-w-0 max-w-full overflow-hidden break-words">
            <MarkdownRenderer content={currentStreamText} isStreaming={true} onOpenUrl={onOpenBrowser} />
          </div>
        </div>
      )}

      <div ref={bottomRef} />

      {/* Image Lightbox Modal */}
      <ImageLightboxModal
        isOpen={!!lightboxImage}
        imageUrl={lightboxImage?.url || ''}
        imageName={lightboxImage?.name}
        onClose={() => setLightboxImage(null)}
      />
    </div>
  );
};

export const ChatHistory = React.memo(ChatHistoryComponent);
