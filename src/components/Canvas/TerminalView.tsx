import React, { useState, useEffect, useRef, useCallback } from 'react';
import {
  Terminal,
  Trash2,
  Square,
  Copy,
  Check,
  Clock,
  CheckCircle2,
  AlertCircle,
  CornerDownLeft,
  Sparkles,
} from 'lucide-react';
import { ThemeMode } from '../../types';

export interface TerminalCommandBlock {
  id: string;
  command: string;
  timestamp: number;
  status: 'running' | 'done' | 'aborted' | 'error';
  output: string;
  exitCode?: number;
  durationMs?: number;
  truncated?: boolean;
}

interface TerminalViewProps {
  theme?: ThemeMode;
}

const QUICK_COMMANDS = ['git status -s', 'ls -la', 'pwd', 'git diff --stat'];

export const TerminalView: React.FC<TerminalViewProps> = () => {
  const [blocks, setBlocks] = useState<TerminalCommandBlock[]>([]);
  const [input, setInput] = useState('');
  const [history, setHistory] = useState<string[]>([]);
  const [historyIndex, setHistoryIndex] = useState<number>(-1);
  const [isRunning, setIsRunning] = useState(false);
  const [activeBlockId, setActiveBlockId] = useState<string | null>(null);
  const [copiedId, setCopiedId] = useState<string | null>(null);

  const containerRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const isAutoScrollLockedRef = useRef<boolean>(false);

  // Auto-scroll logic
  const scrollToBottom = useCallback(() => {
    if (!isAutoScrollLockedRef.current && containerRef.current) {
      containerRef.current.scrollTop = containerRef.current.scrollHeight;
    }
  }, []);

  const handleScroll = () => {
    if (!containerRef.current) return;
    const { scrollTop, scrollHeight, clientHeight } = containerRef.current;
    // Neu user cuon len tren qua 40px thi khoa tu dong cuon
    const isAtBottom = scrollHeight - (scrollTop + clientHeight) < 40;
    isAutoScrollLockedRef.current = !isAtBottom;
  };

  // Lang nghe output stream tu engine RPC
  useEffect(() => {
    if (!window.electronAPI?.onBashOutput) return;

    const unsubscribe = window.electronAPI.onBashOutput((data) => {
      if (!data?.text) return;
      setBlocks((prev) => {
        if (prev.length === 0) return prev;
        const next = [...prev];
        const lastIdx = next.length - 1;
        if (next[lastIdx].status === 'running') {
          next[lastIdx] = {
            ...next[lastIdx],
            output: (next[lastIdx].output || '') + data.text,
          };
        }
        return next;
      });
      scrollToBottom();
    });

    return () => {
      unsubscribe();
    };
  }, [scrollToBottom]);

  // Chay lenh bash
  const executeCommand = async (cmdText: string) => {
    const trimmed = cmdText.trim();
    if (!trimmed || isRunning) return;

    const blockId = `cmd_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`;
    const startTime = Date.now();

    const newBlock: TerminalCommandBlock = {
      id: blockId,
      command: trimmed,
      timestamp: startTime,
      status: 'running',
      output: '',
    };

    setBlocks((prev) => [...prev, newBlock]);
    setHistory((prev) => (prev[prev.length - 1] === trimmed ? prev : [...prev, trimmed]));
    setHistoryIndex(-1);
    setInput('');
    setIsRunning(true);
    setActiveBlockId(blockId);
    isAutoScrollLockedRef.current = false;
    setTimeout(scrollToBottom, 50);

    if (!window.electronAPI?.runBash) {
      setBlocks((prev) =>
        prev.map((b) =>
          b.id === blockId
            ? {
                ...b,
                status: 'error',
                output: 'Lỗi: runBash API không khả dụng trong môi trường này.',
                durationMs: Date.now() - startTime,
              }
            : b
        )
      );
      setIsRunning(false);
      setActiveBlockId(null);
      return;
    }

    try {
      const res = await window.electronAPI.runBash(trimmed);
      const durationMs = Date.now() - startTime;

      setBlocks((prev) =>
        prev.map((b) => {
          if (b.id !== blockId) return b;
          if (!res.success) {
            return {
              ...b,
              status: 'error',
              output: b.output ? `${b.output}\n${res.error || 'Lỗi không xác định'}` : res.error || 'Lỗi thực thi lệnh',
              durationMs,
            };
          }
          const data = res.data;
          const finalOutput = data?.output !== undefined ? data.output : b.output;
          const exitCode = data?.exitCode ?? 0;
          return {
            ...b,
            status: exitCode === 0 ? 'done' : 'error',
            output: finalOutput,
            exitCode,
            truncated: data?.truncated,
            durationMs,
          };
        })
      );
    } catch (err: any) {
      const durationMs = Date.now() - startTime;
      setBlocks((prev) =>
        prev.map((b) =>
          b.id === blockId
            ? {
                ...b,
                status: 'error',
                output: b.output ? `${b.output}\n${err?.message || String(err)}` : err?.message || 'Lỗi ngoại lệ khi chạy lệnh',
                durationMs,
              }
            : b
        )
      );
    } finally {
      setIsRunning(false);
      setActiveBlockId(null);
      setTimeout(() => {
        scrollToBottom();
        inputRef.current?.focus();
      }, 50);
    }
  };

  // Huỷ lenh đang chay
  const handleAbort = async () => {
    if (!isRunning) return;
    if (window.electronAPI?.abortBash) {
      await window.electronAPI.abortBash().catch(() => {});
    }
    setBlocks((prev) =>
      prev.map((b) =>
        b.id === activeBlockId
          ? {
              ...b,
              status: 'aborted',
              output: b.output ? `${b.output}\n^C [Đã huỷ lệnh]` : '^C [Đã huỷ lệnh]',
            }
          : b
      )
    );
    setIsRunning(false);
    setActiveBlockId(null);
  };

  // Keyboard navigation
  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'c' && (e.ctrlKey || e.metaKey) && isRunning) {
      e.preventDefault();
      handleAbort();
      return;
    }

    if (e.key === 'Enter') {
      e.preventDefault();
      executeCommand(input);
      return;
    }

    if (e.key === 'ArrowUp') {
      e.preventDefault();
      if (history.length === 0) return;
      const nextIdx = historyIndex === -1 ? history.length - 1 : Math.max(0, historyIndex - 1);
      setHistoryIndex(nextIdx);
      setInput(history[nextIdx] || '');
      return;
    }

    if (e.key === 'ArrowDown') {
      e.preventDefault();
      if (historyIndex === -1) return;
      const nextIdx = historyIndex + 1;
      if (nextIdx >= history.length) {
        setHistoryIndex(-1);
        setInput('');
      } else {
        setHistoryIndex(nextIdx);
        setInput(history[nextIdx] || '');
      }
      return;
    }
  };

  const handleCopyBlockOutput = (block: TerminalCommandBlock) => {
    const textToCopy = `$ ${block.command}\n${block.output || ''}`;
    navigator.clipboard.writeText(textToCopy).catch(() => {});
    setCopiedId(block.id);
    setTimeout(() => setCopiedId(null), 2000);
  };

  return (
    <div className="flex-1 flex flex-col h-full bg-background font-mono text-[12.5px] overflow-hidden text-slate-800 dark:text-zinc-200">
      {/* Top Header Bar */}
      <div className="h-10 bg-surface border-b border-border flex items-center justify-between px-3 shrink-0">
        <div className="flex items-center gap-2">
          <div className="flex items-center gap-1.5 px-2 py-0.5 rounded bg-emerald-500/10 dark:bg-emerald-950/60 border border-emerald-500/20 dark:border-emerald-800/40 text-emerald-700 dark:text-emerald-400 text-[11px] font-medium">
            <Terminal className="w-3.5 h-3.5" />
            <span>Bash Bridge</span>
          </div>
          <span className="text-[11px] text-slate-500 dark:text-zinc-500 hidden sm:inline">
            RPC command console — cwd đồng bộ với engine session
          </span>
        </div>

        <div className="flex items-center gap-1.5">
          {isRunning && (
            <button
              onClick={handleAbort}
              className="flex items-center gap-1 px-2 py-1 rounded bg-rose-500/10 hover:bg-rose-500/20 dark:bg-rose-950/60 dark:hover:bg-rose-900/80 border border-rose-500/20 dark:border-rose-800/50 text-rose-700 dark:text-rose-300 text-xs transition-colors cursor-pointer"
              title="Huỷ lệnh đang chạy (Ctrl+C)"
            >
              <Square className="w-3 h-3 fill-rose-600 dark:fill-rose-400 text-rose-600 dark:text-rose-400" />
              <span>Dừng (Ctrl+C)</span>
            </button>
          )}

          <button
            onClick={() => setBlocks([])}
            disabled={blocks.length === 0}
            className="p-1.5 rounded text-slate-400 dark:text-zinc-400 hover:text-slate-700 dark:hover:text-zinc-200 hover:bg-surface-highlight disabled:opacity-40 transition-colors cursor-pointer"
            title="Xoá lịch sử console"
          >
            <Trash2 className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>

      {/* Output Stream List */}
      <div
        ref={containerRef}
        onScroll={handleScroll}
        className="flex-1 p-3 overflow-y-auto space-y-3 select-text leading-relaxed font-mono"
      >
        {blocks.length === 0 ? (
          <div className="h-full flex flex-col items-center justify-center text-slate-400 dark:text-zinc-500 gap-2 py-12 select-none">
            <Terminal className="w-8 h-8 text-slate-400 dark:text-zinc-600 opacity-60" />
            <p className="text-xs font-medium text-slate-700 dark:text-zinc-300">Chưa có lệnh nào được thực thi trong phiên này.</p>
            <p className="text-[11px] text-slate-500 dark:text-zinc-500 max-w-sm text-center">
              Nhập lệnh shell ở ô bên dưới hoặc bấm vào các lệnh gợi ý để chạy trong ngữ cảnh engine.
            </p>

            <div className="flex flex-wrap gap-1.5 mt-3 justify-center">
              {QUICK_COMMANDS.map((cmd) => (
                <button
                  key={cmd}
                  onClick={() => executeCommand(cmd)}
                  className="flex items-center gap-1 px-2.5 py-1 rounded bg-surface hover:bg-surface-highlight text-slate-700 dark:text-zinc-300 hover:text-slate-900 dark:hover:text-zinc-100 text-[11px] border border-border shadow-xs transition-colors cursor-pointer"
                >
                  <Sparkles className="w-3 h-3 text-amber-500 dark:text-amber-400" />
                  <span>{cmd}</span>
                </button>
              ))}
            </div>
          </div>
        ) : (
          blocks.map((block) => {
            const isBlockRunning = block.status === 'running';
            const isSuccess = block.status === 'done' && (block.exitCode === 0 || block.exitCode === undefined);
            const isError = block.status === 'error' || (block.exitCode !== undefined && block.exitCode !== 0);
            const isAborted = block.status === 'aborted';

            return (
              <div
                key={block.id}
                className="group rounded-lg bg-surface border border-border p-3 transition-colors shadow-xs"
              >
                {/* Command Header */}
                <div className="flex items-center justify-between gap-2 pb-1.5 mb-1.5 border-b border-border/80 select-none">
                  <div className="flex items-center gap-2 min-w-0">
                    <span className="text-emerald-600 dark:text-emerald-400 font-bold">$</span>
                    <span className="text-slate-900 dark:text-zinc-100 font-semibold truncate text-[12px]">
                      {block.command}
                    </span>
                  </div>

                  <div className="flex items-center gap-2 shrink-0 text-[10.5px]">
                    {isBlockRunning && (
                      <span className="flex items-center gap-1 text-amber-700 dark:text-amber-400 bg-amber-500/10 dark:bg-amber-950/40 px-1.5 py-0.5 rounded border border-amber-500/20 dark:border-amber-800/30">
                        <span className="w-1.5 h-1.5 rounded-full bg-amber-500 dark:bg-amber-400 animate-ping" />
                        <span>Đang chạy...</span>
                      </span>
                    )}

                    {isSuccess && (
                      <span className="flex items-center gap-1 text-emerald-700 dark:text-emerald-400 bg-emerald-500/10 dark:bg-emerald-950/40 px-1.5 py-0.5 rounded border border-emerald-500/20 dark:border-emerald-800/30">
                        <CheckCircle2 className="w-3 h-3" />
                        <span>exit 0</span>
                      </span>
                    )}

                    {isError && (
                      <span className="flex items-center gap-1 text-rose-700 dark:text-rose-400 bg-rose-500/10 dark:bg-rose-950/40 px-1.5 py-0.5 rounded border border-rose-500/20 dark:border-rose-800/30">
                        <AlertCircle className="w-3 h-3" />
                        <span>exit {block.exitCode ?? 'err'}</span>
                      </span>
                    )}

                    {isAborted && (
                      <span className="text-slate-600 dark:text-zinc-400 bg-slate-200/60 dark:bg-zinc-800/50 px-1.5 py-0.5 rounded border border-border">
                        Đã dừng
                      </span>
                    )}

                    {block.durationMs !== undefined && (
                      <span className="flex items-center gap-1 text-slate-500 dark:text-zinc-500">
                        <Clock className="w-3 h-3" />
                        <span>{block.durationMs < 1000 ? `${block.durationMs}ms` : `${(block.durationMs / 1000).toFixed(1)}s`}</span>
                      </span>
                    )}

                    <button
                      onClick={() => handleCopyBlockOutput(block)}
                      className="p-1 rounded text-slate-400 dark:text-zinc-500 hover:text-slate-700 dark:hover:text-zinc-200 hover:bg-surface-highlight transition-colors opacity-0 group-hover:opacity-100 cursor-pointer"
                      title="Sao chép output"
                    >
                      {copiedId === block.id ? (
                        <Check className="w-3 h-3 text-emerald-600 dark:text-emerald-400" />
                      ) : (
                        <Copy className="w-3 h-3" />
                      )}
                    </button>
                  </div>
                </div>

                {/* Output content */}
                {block.output ? (
                  <pre className="text-slate-800 dark:text-zinc-200 whitespace-pre-wrap break-all leading-relaxed max-h-[360px] overflow-y-auto text-[12px] bg-background/80 dark:bg-[#0c0d12] border border-border/80 p-2.5 rounded-lg">
                    {block.output}
                  </pre>
                ) : isBlockRunning ? (
                  <p className="text-slate-500 dark:text-zinc-500 italic text-[11px] py-1">Đang chờ output...</p>
                ) : (
                  <p className="text-slate-400 dark:text-zinc-600 italic text-[11px] py-1">(Lệnh không có stdout/stderr)</p>
                )}

                {block.truncated && (
                  <div className="mt-1.5 pt-1.5 border-t border-border/60 text-[10.5px] text-amber-600 dark:text-amber-400/90 italic">
                    Output vượt quá giới hạn an toàn và đã được cắt bớt để bảo vệ giao diện.
                  </div>
                )}
              </div>
            );
          })
        )}
      </div>

      {/* Input Prompt Bottom Bar */}
      <div className="p-2.5 bg-surface border-t border-border shrink-0">
        <form
          onSubmit={(e) => {
            e.preventDefault();
            executeCommand(input);
          }}
          className="flex items-center gap-2 bg-background border border-border focus-within:border-emerald-500 dark:focus-within:border-emerald-500 focus-within:ring-1 focus-within:ring-emerald-500/20 rounded-lg px-2.5 py-1.5 transition-colors"
        >
          <span className="text-emerald-600 dark:text-emerald-400 font-bold select-none">$</span>
          <input
            ref={inputRef}
            type="text"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder={isRunning ? "Đang chạy lệnh... (nhấn Ctrl+C để huỷ)" : "Nhập lệnh bash (e.g. git status, ls, npm test)..."}
            disabled={isRunning}
            className="flex-1 bg-transparent border-0 outline-none text-slate-900 dark:text-zinc-100 placeholder:text-slate-400 dark:placeholder:text-zinc-600 font-mono text-[12px]"
          />

          {isRunning ? (
            <button
              type="button"
              onClick={handleAbort}
              className="p-1 rounded bg-rose-500/10 hover:bg-rose-500/20 dark:bg-rose-950/80 dark:hover:bg-rose-900 border border-rose-500/20 dark:border-rose-800/60 text-rose-700 dark:text-rose-300 transition-colors cursor-pointer"
              title="Huỷ lệnh (Ctrl+C)"
            >
              <Square className="w-3.5 h-3.5 fill-rose-600 dark:fill-rose-400 text-rose-600 dark:text-rose-400" />
            </button>
          ) : (
            <button
              type="submit"
              disabled={!input.trim()}
              className="p-1 rounded bg-emerald-500/10 hover:bg-emerald-500/20 dark:bg-emerald-950/80 dark:hover:bg-emerald-900 border border-emerald-500/20 dark:border-emerald-800/60 text-emerald-700 dark:text-emerald-300 disabled:opacity-40 transition-colors cursor-pointer"
              title="Chạy lệnh (Enter)"
            >
              <CornerDownLeft className="w-3.5 h-3.5" />
            </button>
          )}
        </form>
      </div>
    </div>
  );
};
