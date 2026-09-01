import React, { useState, useEffect, useCallback, useRef } from 'react';
import {
  X,
  RotateCw,
  Gauge,
  MessageSquare,
  Wrench,
  Coins,
  Layers,
  Sparkles,
  AlertCircle,
  Database,
  Minimize2,
} from 'lucide-react';
import { OmpSessionStats, OmpContextUsage } from '../../types';
interface SessionStatsPanelProps {
  isOpen: boolean;
  onClose: () => void;
  onRefresh: () => Promise<{ success: boolean; stats?: OmpSessionStats; error?: string }>;
  contextUsage?: OmpContextUsage | null;
  isCompacting?: boolean;
  autoCompactionEnabled?: boolean;
  onCompact?: (customInstructions?: string) => Promise<{ success: boolean; error?: string }>;
  onSetAutoCompaction?: (enabled: boolean) => Promise<{ success: boolean; error?: string }>;
}

export const SessionStatsPanel: React.FC<SessionStatsPanelProps> = ({
  isOpen,
  onClose,
  onRefresh,
  contextUsage,
  isCompacting = false,
  autoCompactionEnabled = false,
  onCompact,
  onSetAutoCompaction,
}) => {
  const [stats, setStats] = useState<OmpSessionStats | null>(null);
  const [isLoading, setIsLoading] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);
  const panelRef = useRef<HTMLDivElement>(null);

  const fetchStats = useCallback(async () => {
    setIsLoading(true);
    setError(null);
    try {
      const res = await onRefresh();
      if (res.success && res.stats) {
        setStats(res.stats);
      } else {
        setError(res.error || 'Không thể tải thống kê phiên');
      }
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      setError(msg || 'Lỗi khi gọi get_session_stats');
    } finally {
      setIsLoading(false);
    }
  }, [onRefresh]);

  useEffect(() => {
    if (isOpen) {
      fetchStats();
    }
  }, [isOpen, fetchStats]);

  useEffect(() => {
    if (!isOpen) return;

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        onClose();
      }
    };

    const handleClickOutside = (e: MouseEvent) => {
      if (panelRef.current && !panelRef.current.contains(e.target as Node)) {
        onClose();
      }
    };

    document.addEventListener('keydown', handleKeyDown);
    document.addEventListener('mousedown', handleClickOutside);
    return () => {
      document.removeEventListener('keydown', handleKeyDown);
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  const effectiveContext = stats?.contextUsage || contextUsage;
  const percent = typeof effectiveContext?.percent === 'number'
    ? Math.round(effectiveContext.percent * 10) / 10
    : null;
  const tokens = typeof effectiveContext?.tokens === 'number'
    ? effectiveContext.tokens
    : null;
  const contextWindow = typeof effectiveContext?.contextWindow === 'number'
    ? effectiveContext.contextWindow
    : null;

  const getMeterColor = (pct: number) => {
    if (pct > 90) return 'bg-rose-500 text-rose-500';
    if (pct > 75) return 'bg-amber-500 text-amber-500';
    return 'bg-emerald-500 text-emerald-500';
  };

  const formatNumber = (num?: number | null) => {
    if (num == null || isNaN(num)) return '0';
    return num.toLocaleString();
  };

  const formatCost = (cost?: number | null) => {
    if (cost == null || isNaN(cost)) return '$0.00';
    if (cost < 0.01 && cost > 0) return `$${cost.toFixed(4)}`;
    return `$${cost.toFixed(2)}`;
  };

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center pt-14 bg-black/20 backdrop-blur-xs animate-fade-in">
      <div
        ref={panelRef}
        className="w-[440px] max-w-[92vw] bg-panel border border-border rounded-xl shadow-2xl overflow-hidden flex flex-col text-slate-800 dark:text-zinc-200"
      >
        {/* Header */}
        <div className="flex items-center justify-between px-4 py-3 border-b border-border bg-surface">
          <div className="flex items-center gap-2">
            <Gauge className="w-4 h-4 text-codex-accent" />
            <span className="text-xs font-semibold text-slate-900 dark:text-zinc-100">
              Session Stats & Observability
            </span>
          </div>

          <div className="flex items-center gap-1.5">
            <button
              onClick={fetchStats}
              disabled={isLoading}
              className="p-1 rounded-md text-slate-500 hover:text-slate-800 dark:text-zinc-400 dark:hover:text-zinc-100 hover:bg-surface-highlight transition-colors cursor-pointer disabled:opacity-50"
              title="Làm mới thống kê"
            >
              <RotateCw className={`w-3.5 h-3.5 ${isLoading ? 'animate-spin text-codex-accent' : ''}`} />
            </button>
            <button
              onClick={onClose}
              className="p-1 rounded-md text-slate-500 hover:text-slate-800 dark:text-zinc-400 dark:hover:text-zinc-100 hover:bg-surface-highlight transition-colors cursor-pointer"
              title="Đóng (ESC)"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          </div>
        </div>

        {/* Content */}
        <div className="p-4 space-y-4 max-h-[75vh] overflow-y-auto">
          {error && (
            <div className="flex items-start gap-2 p-2.5 rounded-lg text-xs bg-rose-500/10 text-rose-600 dark:text-rose-400 border border-rose-500/20">
              <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
              <div className="flex-1 min-w-0">
                <p className="font-medium">{error}</p>
              </div>
            </div>
          )}

          {/* Context Window Usage Bar */}
          {percent != null && (
            <div className="p-3 rounded-lg bg-surface border border-border space-y-2">
              <div className="flex items-center justify-between text-xs font-medium">
                <span className="flex items-center gap-1.5 text-slate-600 dark:text-zinc-400">
                  <Database className="w-3.5 h-3.5 text-codex-accent" />
                  Context Window
                </span>
                <span className={`font-mono font-semibold ${getMeterColor(percent).split(' ')[1]}`}>
                  {percent}%
                </span>
              </div>

              {/* Progress Bar */}
              <div className="w-full h-2 rounded-full bg-slate-200 dark:bg-zinc-800 overflow-hidden">
                <div
                  className={`h-full rounded-full transition-all duration-300 ${getMeterColor(percent).split(' ')[0]}`}
                  style={{ width: `${Math.min(percent, 100)}%` }}
                />
              </div>

              {tokens != null && contextWindow != null && (
                <div className="flex items-center justify-between text-[11px] font-mono text-slate-500 dark:text-zinc-400">
                  <span>{formatNumber(tokens)} tokens</span>
                  <span>{formatNumber(contextWindow)} max</span>
                </div>
              )}
              {/* Compact Action & Auto-Compaction Toggle */}
              <div className="pt-2 border-t border-border flex items-center justify-between gap-2">
                <label className="flex items-center gap-2 text-[11.5px] text-slate-600 dark:text-zinc-400 cursor-pointer select-none">
                  <input
                    type="checkbox"
                    checked={autoCompactionEnabled}
                    onChange={(e) => onSetAutoCompaction?.(e.target.checked)}
                    className="rounded border-border text-codex-accent focus:ring-codex-accent w-3.5 h-3.5 cursor-pointer"
                  />
                  <span>Tự động nén</span>
                </label>

                {onCompact && (
                  <button
                    onClick={async () => {
                      await onCompact();
                      fetchStats();
                    }}
                    disabled={isCompacting}
                    className="flex items-center gap-1.5 px-2.5 py-1 rounded-md text-[11px] font-medium bg-surface-highlight hover:bg-border text-slate-800 dark:text-zinc-200 border border-border transition-colors cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
                    title="Nén ngữ cảnh hội thoại hiện tại"
                  >
                    <Minimize2 className={`w-3 h-3 text-codex-accent ${isCompacting ? 'animate-spin' : ''}`} />
                    <span>{isCompacting ? 'Đang nén...' : 'Nén context'}</span>
                  </button>
                )}
              </div>
            </div>
          )}

          {/* Messages Breakdown */}
          <div className="space-y-1.5">
            <div className="text-[11px] font-semibold uppercase tracking-wider text-slate-400 dark:text-zinc-500 flex items-center gap-1.5">
              <MessageSquare className="w-3.5 h-3.5" />
              Messages
            </div>
            <div className="grid grid-cols-3 gap-2">
              <div className="p-2.5 rounded-lg bg-surface border border-border flex flex-col">
                <span className="text-[10.5px] text-slate-500 dark:text-zinc-400">User</span>
                <span className="text-sm font-semibold font-mono text-slate-900 dark:text-zinc-100">
                  {formatNumber(stats?.userMessages)}
                </span>
              </div>
              <div className="p-2.5 rounded-lg bg-surface border border-border flex flex-col">
                <span className="text-[10.5px] text-slate-500 dark:text-zinc-400">Assistant</span>
                <span className="text-sm font-semibold font-mono text-slate-900 dark:text-zinc-100">
                  {formatNumber(stats?.assistantMessages)}
                </span>
              </div>
              <div className="p-2.5 rounded-lg bg-surface border border-border flex flex-col">
                <span className="text-[10.5px] text-slate-500 dark:text-zinc-400">Total</span>
                <span className="text-sm font-semibold font-mono text-slate-900 dark:text-zinc-100">
                  {formatNumber(stats?.totalMessages)}
                </span>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-2 mt-1">
              <div className="p-2 rounded-lg bg-surface border border-border flex items-center justify-between">
                <span className="text-[11px] text-slate-500 dark:text-zinc-400 flex items-center gap-1.5">
                  <Wrench className="w-3 h-3 text-blue-500" /> Tool Calls
                </span>
                <span className="text-xs font-semibold font-mono text-slate-900 dark:text-zinc-100">
                  {formatNumber(stats?.toolCalls)}
                </span>
              </div>
              <div className="p-2 rounded-lg bg-surface border border-border flex items-center justify-between">
                <span className="text-[11px] text-slate-500 dark:text-zinc-400 flex items-center gap-1.5">
                  <Layers className="w-3 h-3 text-emerald-500" /> Tool Results
                </span>
                <span className="text-xs font-semibold font-mono text-slate-900 dark:text-zinc-100">
                  {formatNumber(stats?.toolResults)}
                </span>
              </div>
            </div>
          </div>

          {/* Tokens Breakdown */}
          <div className="space-y-1.5">
            <div className="text-[11px] font-semibold uppercase tracking-wider text-slate-400 dark:text-zinc-500 flex items-center gap-1.5">
              <Sparkles className="w-3.5 h-3.5" />
              Tokens
            </div>
            <div className="grid grid-cols-2 gap-2">
              <div className="p-2.5 rounded-lg bg-surface border border-border flex flex-col">
                <span className="text-[10.5px] text-slate-500 dark:text-zinc-400">Input</span>
                <span className="text-xs font-semibold font-mono text-slate-900 dark:text-zinc-100">
                  {formatNumber(stats?.tokens?.input)}
                </span>
              </div>
              <div className="p-2.5 rounded-lg bg-surface border border-border flex flex-col">
                <span className="text-[10.5px] text-slate-500 dark:text-zinc-400">Output</span>
                <span className="text-xs font-semibold font-mono text-slate-900 dark:text-zinc-100">
                  {formatNumber(stats?.tokens?.output)}
                </span>
              </div>
              {stats?.tokens?.reasoning != null && stats.tokens.reasoning > 0 && (
                <div className="p-2.5 rounded-lg bg-surface border border-border flex flex-col">
                  <span className="text-[10.5px] text-slate-500 dark:text-zinc-400">Reasoning</span>
                  <span className="text-xs font-semibold font-mono text-amber-500">
                    {formatNumber(stats.tokens.reasoning)}
                  </span>
                </div>
              )}
              <div className="p-2.5 rounded-lg bg-surface border border-border flex flex-col">
                <span className="text-[10.5px] text-slate-500 dark:text-zinc-400">Total Tokens</span>
                <span className="text-xs font-semibold font-mono text-codex-accent">
                  {formatNumber(stats?.tokens?.total)}
                </span>
              </div>
            </div>

            {(stats?.tokens?.cacheRead != null || stats?.tokens?.cacheWrite != null) && (
              <div className="grid grid-cols-2 gap-2 mt-1">
                <div className="p-2 rounded-lg bg-surface border border-border flex items-center justify-between">
                  <span className="text-[10.5px] text-slate-500 dark:text-zinc-400">Cache Read</span>
                  <span className="text-xs font-mono text-slate-700 dark:text-zinc-300">
                    {formatNumber(stats?.tokens?.cacheRead)}
                  </span>
                </div>
                <div className="p-2 rounded-lg bg-surface border border-border flex items-center justify-between">
                  <span className="text-[10.5px] text-slate-500 dark:text-zinc-400">Cache Write</span>
                  <span className="text-xs font-mono text-slate-700 dark:text-zinc-300">
                    {formatNumber(stats?.tokens?.cacheWrite)}
                  </span>
                </div>
              </div>
            )}
          </div>

          {/* Cost & Premium Requests */}
          <div className="p-3 rounded-lg bg-surface border border-border flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Coins className="w-4 h-4 text-amber-500" />
              <div>
                <span className="text-[10.5px] text-slate-500 dark:text-zinc-400 block">Est. Cost</span>
                <span className="text-xs font-semibold font-mono text-slate-900 dark:text-zinc-100">
                  {formatCost(stats?.cost)}
                </span>
              </div>
            </div>

            {stats?.premiumRequests != null && (
              <div className="text-right">
                <span className="text-[10.5px] text-slate-500 dark:text-zinc-400 block">Premium Requests</span>
                <span className="text-xs font-semibold font-mono text-slate-900 dark:text-zinc-100">
                  {formatNumber(stats.premiumRequests)}
                </span>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};
