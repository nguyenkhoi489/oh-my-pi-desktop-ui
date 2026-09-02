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
  Activity,
  BarChart3,
  HardDrive,
  Folder,
  ShieldAlert,
  Clock,
} from 'lucide-react';
import {
  OmpSessionStats,
  OmpContextUsage,
  OmpGlobalUsageData,
  OmpGlobalStatsData,
  GlobalUsageResult,
  GlobalStatsResult,
} from '../../types';

type StatsTab = 'session' | 'usage' | 'stats';

interface SessionStatsPanelProps {
  isOpen: boolean;
  onClose: () => void;
  onRefresh: () => Promise<{ success: boolean; stats?: OmpSessionStats; error?: string }>;
  contextUsage?: OmpContextUsage | null;
  isCompacting?: boolean;
  autoCompactionEnabled?: boolean;
  onCompact?: (customInstructions?: string) => Promise<{ success: boolean; error?: string }>;
  onSetAutoCompaction?: (enabled: boolean) => Promise<{ success: boolean; error?: string }>;
  onGetGlobalUsage?: (forceRefresh?: boolean) => Promise<GlobalUsageResult>;
  onGetGlobalStats?: (forceRefresh?: boolean) => Promise<GlobalStatsResult>;
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
  onGetGlobalUsage,
  onGetGlobalStats,
}) => {
  const [activeTab, setActiveTab] = useState<StatsTab>('session');
  const [sessionStats, setSessionStats] = useState<OmpSessionStats | null>(null);
  const [globalUsage, setGlobalUsage] = useState<OmpGlobalUsageData | null>(null);
  const [globalStats, setGlobalStats] = useState<OmpGlobalStatsData | null>(null);
  const [rawUsageText, setRawUsageText] = useState<string | null>(null);
  const [rawStatsText, setRawStatsText] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);
  const panelRef = useRef<HTMLDivElement>(null);

  const fetchSessionStats = useCallback(async () => {
    try {
      const res = await onRefresh();
      if (res.success && res.stats) {
        setSessionStats(res.stats);
      } else {
        setError(res.error || 'Không thể tải thống kê phiên');
      }
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      setError(msg || 'Lỗi khi gọi get_session_stats');
    }
  }, [onRefresh]);

  const fetchUsageData = useCallback(async (force = false) => {
    try {
      const fetcher = onGetGlobalUsage || window.electronAPI?.getGlobalUsage;
      if (!fetcher) {
        setError('API getGlobalUsage không khả dụng');
        return;
      }
      const res = await fetcher(force);
      if (res.success && res.data) {
        setGlobalUsage(res.data);
        setRawUsageText(null);
      } else if (res.raw) {
        setRawUsageText(res.raw);
        if (res.error) setError(res.error);
      } else {
        setError(res.error || 'Không thể tải hạn mức sử dụng');
      }
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      setError(msg || 'Lỗi khi lấy dữ liệu usage');
    }
  }, [onGetGlobalUsage]);

  const fetchGlobalStatsData = useCallback(async (force = false) => {
    try {
      const fetcher = onGetGlobalStats || window.electronAPI?.getGlobalStats;
      if (!fetcher) {
        setError('API getGlobalStats không khả dụng');
        return;
      }
      const res = await fetcher(force);
      if (res.success && res.data) {
        setGlobalStats(res.data);
        setRawStatsText(null);
      } else if (res.raw) {
        setRawStatsText(res.raw);
        if (res.error) setError(res.error);
      } else {
        setError(res.error || 'Không thể tải thống kê toàn cục');
      }
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      setError(msg || 'Lỗi khi lấy dữ liệu stats');
    }
  }, [onGetGlobalStats]);

  const fetchActiveTabData = useCallback(async (force = false) => {
    setIsLoading(true);
    setError(null);
    try {
      if (activeTab === 'session') {
        await fetchSessionStats();
      } else if (activeTab === 'usage') {
        await fetchUsageData(force);
      } else if (activeTab === 'stats') {
        await fetchGlobalStatsData(force);
      }
    } finally {
      setIsLoading(false);
    }
  }, [activeTab, fetchSessionStats, fetchUsageData, fetchGlobalStatsData]);

  useEffect(() => {
    if (isOpen) {
      fetchActiveTabData(false);
    }
  }, [isOpen, activeTab, fetchActiveTabData]);

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

  const effectiveContext = sessionStats?.contextUsage || contextUsage;
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
    if (pct > 90) return 'bg-rose-500 text-rose-500 border-rose-500/30';
    if (pct > 75) return 'bg-amber-500 text-amber-500 border-amber-500/30';
    return 'bg-emerald-500 text-emerald-500 border-emerald-500/30';
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

  const formatResetTime = (resetsAt?: number) => {
    if (!resetsAt) return null;
    const diff = resetsAt - Date.now();
    if (diff <= 0) return 'Đã reset';
    const mins = Math.floor(diff / 60_000);
    const hours = Math.floor(mins / 60);
    const days = Math.floor(hours / 24);
    if (days > 0) {
      const remHours = hours % 24;
      return `Reset sau ${days}d ${remHours}h`;
    }
    if (hours > 0) {
      const remMins = mins % 60;
      return `Reset sau ${hours}h ${remMins}m`;
    }
    return `Reset sau ${mins}m`;
  };

  const formatProviderLabel = (id: string) => {
    if (!id) return '';
    return id
      .split('-')
      .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
      .join(' ');
  };

  const cleanFolderName = (name: string) => {
    if (!name) return '';
    if (name.startsWith('-')) {
      return '/' + name.slice(1).replace(/-/g, '/');
    }
    return name;
  };

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center pt-14 bg-black/20 backdrop-blur-xs animate-fade-in">
      <div
        ref={panelRef}
        className="w-[520px] max-w-[94vw] bg-panel border border-border rounded-xl shadow-2xl overflow-hidden flex flex-col text-slate-800 dark:text-zinc-200"
      >
        {/* Header */}
        <div className="flex items-center justify-between px-4 py-3 border-b border-border bg-surface">
          <div className="flex items-center gap-2">
            <Gauge className="w-4 h-4 text-codex-accent" />
            <span className="text-xs font-semibold text-slate-900 dark:text-zinc-100">
              Observability & Global Stats
            </span>
          </div>

          <div className="flex items-center gap-1.5">
            <button
              onClick={() => fetchActiveTabData(true)}
              disabled={isLoading}
              className="p-1 rounded-md text-slate-500 hover:text-slate-800 dark:text-zinc-400 dark:hover:text-zinc-100 hover:bg-surface-highlight transition-colors cursor-pointer disabled:opacity-50"
              title="Làm mới (Bỏ qua cache)"
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

        {/* Tab Navigation */}
        <div className="flex items-center gap-1 px-4 py-2 bg-surface/50 border-b border-border text-xs">
          <button
            onClick={() => setActiveTab('session')}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg font-medium transition-colors cursor-pointer ${
              activeTab === 'session'
                ? 'bg-surface-highlight text-slate-900 dark:text-zinc-100 shadow-xs'
                : 'text-slate-500 dark:text-zinc-400 hover:text-slate-800 dark:hover:text-zinc-200'
            }`}
          >
            <Activity className="w-3.5 h-3.5 text-blue-500" />
            <span>Session</span>
          </button>

          <button
            onClick={() => setActiveTab('usage')}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg font-medium transition-colors cursor-pointer ${
              activeTab === 'usage'
                ? 'bg-surface-highlight text-slate-900 dark:text-zinc-100 shadow-xs'
                : 'text-slate-500 dark:text-zinc-400 hover:text-slate-800 dark:hover:text-zinc-200'
            }`}
          >
            <ShieldAlert className="w-3.5 h-3.5 text-amber-500" />
            <span>Usage Limits</span>
          </button>

          <button
            onClick={() => setActiveTab('stats')}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg font-medium transition-colors cursor-pointer ${
              activeTab === 'stats'
                ? 'bg-surface-highlight text-slate-900 dark:text-zinc-100 shadow-xs'
                : 'text-slate-500 dark:text-zinc-400 hover:text-slate-800 dark:hover:text-zinc-200'
            }`}
          >
            <BarChart3 className="w-3.5 h-3.5 text-emerald-500" />
            <span>Global Stats</span>
          </button>
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

          {isLoading && !sessionStats && !globalUsage && !globalStats && (
            <div className="py-8 flex flex-col items-center justify-center gap-2 text-slate-400 dark:text-zinc-500">
              <RotateCw className="w-6 h-6 animate-spin text-codex-accent" />
              <span className="text-xs">Đang tải dữ liệu...</span>
            </div>
          )}

          {/* TAB 1: SESSION STATS */}
          {activeTab === 'session' && (
            <>
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
                          fetchSessionStats();
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
                      {formatNumber(sessionStats?.userMessages)}
                    </span>
                  </div>
                  <div className="p-2.5 rounded-lg bg-surface border border-border flex flex-col">
                    <span className="text-[10.5px] text-slate-500 dark:text-zinc-400">Assistant</span>
                    <span className="text-sm font-semibold font-mono text-slate-900 dark:text-zinc-100">
                      {formatNumber(sessionStats?.assistantMessages)}
                    </span>
                  </div>
                  <div className="p-2.5 rounded-lg bg-surface border border-border flex flex-col">
                    <span className="text-[10.5px] text-slate-500 dark:text-zinc-400">Total</span>
                    <span className="text-sm font-semibold font-mono text-slate-900 dark:text-zinc-100">
                      {formatNumber(sessionStats?.totalMessages)}
                    </span>
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-2 mt-1">
                  <div className="p-2 rounded-lg bg-surface border border-border flex items-center justify-between">
                    <span className="text-[11px] text-slate-500 dark:text-zinc-400 flex items-center gap-1.5">
                      <Wrench className="w-3 h-3 text-blue-500" /> Tool Calls
                    </span>
                    <span className="text-xs font-semibold font-mono text-slate-900 dark:text-zinc-100">
                      {formatNumber(sessionStats?.toolCalls)}
                    </span>
                  </div>
                  <div className="p-2 rounded-lg bg-surface border border-border flex items-center justify-between">
                    <span className="text-[11px] text-slate-500 dark:text-zinc-400 flex items-center gap-1.5">
                      <Layers className="w-3 h-3 text-emerald-500" /> Tool Results
                    </span>
                    <span className="text-xs font-semibold font-mono text-slate-900 dark:text-zinc-100">
                      {formatNumber(sessionStats?.toolResults)}
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
                      {formatNumber(sessionStats?.tokens?.input)}
                    </span>
                  </div>
                  <div className="p-2.5 rounded-lg bg-surface border border-border flex flex-col">
                    <span className="text-[10.5px] text-slate-500 dark:text-zinc-400">Output</span>
                    <span className="text-xs font-semibold font-mono text-slate-900 dark:text-zinc-100">
                      {formatNumber(sessionStats?.tokens?.output)}
                    </span>
                  </div>
                  {sessionStats?.tokens?.reasoning != null && sessionStats.tokens.reasoning > 0 && (
                    <div className="p-2.5 rounded-lg bg-surface border border-border flex flex-col">
                      <span className="text-[10.5px] text-slate-500 dark:text-zinc-400">Reasoning</span>
                      <span className="text-xs font-semibold font-mono text-amber-500">
                        {formatNumber(sessionStats.tokens.reasoning)}
                      </span>
                    </div>
                  )}
                  <div
                    className={`p-2.5 rounded-lg bg-surface border border-border flex flex-col ${
                      !sessionStats?.tokens?.reasoning || sessionStats.tokens.reasoning <= 0 ? 'col-span-2' : ''
                    }`}
                  >
                    <span className="text-[10.5px] text-slate-500 dark:text-zinc-400">Total Tokens</span>
                    <span className="text-xs font-semibold font-mono text-codex-accent">
                      {formatNumber(sessionStats?.tokens?.total)}
                    </span>
                  </div>
                </div>

                {(sessionStats?.tokens?.cacheRead != null || sessionStats?.tokens?.cacheWrite != null) && (
                  <div className="grid grid-cols-2 gap-2 mt-1">
                    <div className="p-2 rounded-lg bg-surface border border-border flex items-center justify-between">
                      <span className="text-[10.5px] text-slate-500 dark:text-zinc-400">Cache Read</span>
                      <span className="text-xs font-mono text-slate-700 dark:text-zinc-300">
                        {formatNumber(sessionStats?.tokens?.cacheRead)}
                      </span>
                    </div>
                    <div className="p-2 rounded-lg bg-surface border border-border flex items-center justify-between">
                      <span className="text-[10.5px] text-slate-500 dark:text-zinc-400">Cache Write</span>
                      <span className="text-xs font-mono text-slate-700 dark:text-zinc-300">
                        {formatNumber(sessionStats?.tokens?.cacheWrite)}
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
                      {formatCost(sessionStats?.cost)}
                    </span>
                  </div>
                </div>

                {sessionStats?.premiumRequests != null && (
                  <div className="text-right">
                    <span className="text-[10.5px] text-slate-500 dark:text-zinc-400 block">Premium Requests</span>
                    <span className="text-xs font-semibold font-mono text-slate-900 dark:text-zinc-100">
                      {formatNumber(sessionStats.premiumRequests)}
                    </span>
                  </div>
                )}
              </div>
            </>
          )}

          {/* TAB 2: USAGE LIMITS (omp usage) */}
          {activeTab === 'usage' && (
            <div className="space-y-4">
              {globalUsage?.reports && globalUsage.reports.length > 0 ? (
                globalUsage.reports.map((report, idx) => (
                  <div key={report.provider || idx} className="p-3.5 rounded-xl bg-surface border border-border space-y-3">
                    {/* Provider Info Header */}
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2 min-w-0">
                        <ShieldAlert className="w-4 h-4 text-amber-500 shrink-0" />
                        <div className="min-w-0">
                          <span className="text-xs font-semibold text-slate-900 dark:text-zinc-100 truncate block">
                            {formatProviderLabel(report.provider)}
                          </span>
                          {report.metadata?.email && (
                            <span className="text-[11px] text-slate-500 dark:text-zinc-400 truncate block">
                              {report.metadata.email}
                            </span>
                          )}
                        </div>
                      </div>

                      <div className="flex items-center gap-1.5 shrink-0">
                        {report.metadata?.planType && (
                          <span className="px-2 py-0.5 rounded-full text-[10px] font-semibold uppercase tracking-wider bg-blue-500/10 text-blue-600 dark:text-blue-400 border border-blue-500/20">
                            {report.metadata.planType}
                          </span>
                        )}
                        {report.metadata?.limitReached ? (
                          <span className="px-2 py-0.5 rounded-full text-[10px] font-medium bg-rose-500/10 text-rose-500 border border-rose-500/20">
                            Limit Reached
                          </span>
                        ) : (
                          <span className="px-2 py-0.5 rounded-full text-[10px] font-medium bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border border-emerald-500/20">
                            Active
                          </span>
                        )}
                      </div>
                    </div>

                    {/* Limits List */}
                    {report.limits && report.limits.length > 0 && (
                      <div className="space-y-2.5 pt-1">
                        {report.limits.map((limit) => {
                          const usedPct =
                            limit.amount?.usedFraction != null
                              ? Math.round(limit.amount.usedFraction * 100)
                              : limit.amount?.used != null
                              ? limit.amount.used
                              : 0;
                          const isNearLimit = usedPct > 80;
                          const resetLabel = formatResetTime(limit.window?.resetsAt);

                          return (
                            <div key={limit.id} className="p-2.5 rounded-lg bg-surface-highlight/50 border border-border/70 space-y-1.5">
                              <div className="flex items-center justify-between text-xs">
                                <span className="font-medium text-slate-700 dark:text-zinc-300">
                                  {limit.label || limit.window?.label || limit.id}
                                </span>
                                <div className="flex items-center gap-1.5">
                                  {isNearLimit && (
                                    <span className="px-1.5 py-0.2 rounded text-[10px] font-semibold bg-amber-500/15 text-amber-600 dark:text-amber-400 border border-amber-500/30">
                                      &gt;80% Quota
                                    </span>
                                  )}
                                  <span className={`font-mono font-semibold ${getMeterColor(usedPct).split(' ')[1]}`}>
                                    {usedPct}%
                                  </span>
                                </div>
                              </div>

                              {/* Progress Bar */}
                              <div className="w-full h-1.5 rounded-full bg-slate-200 dark:bg-zinc-800 overflow-hidden">
                                <div
                                  className={`h-full rounded-full transition-all duration-300 ${getMeterColor(usedPct).split(' ')[0]}`}
                                  style={{ width: `${Math.min(usedPct, 100)}%` }}
                                />
                              </div>

                              {/* Reset Info */}
                              {resetLabel && (
                                <div className="flex items-center justify-between text-[10.5px] text-slate-500 dark:text-zinc-400 pt-0.5">
                                  <span className="flex items-center gap-1">
                                    <Clock className="w-3 h-3 text-slate-400" />
                                    {resetLabel}
                                  </span>
                                  <span>{100 - usedPct}% còn lại</span>
                                </div>
                              )}
                            </div>
                          );
                        })}
                      </div>
                    )}
                  </div>
                ))
              ) : rawUsageText ? (
                <div className="p-3 rounded-lg bg-surface border border-border">
                  <span className="text-[11px] font-semibold uppercase tracking-wider text-slate-400 dark:text-zinc-500 block mb-2">
                    CLI Output
                  </span>
                  <pre className="text-[11px] font-mono whitespace-pre-wrap text-slate-700 dark:text-zinc-300 overflow-x-auto max-h-60">
                    {rawUsageText}
                  </pre>
                </div>
              ) : (
                <div className="py-8 text-center text-slate-400 dark:text-zinc-500 space-y-1">
                  <ShieldAlert className="w-8 h-8 mx-auto text-slate-400/60" />
                  <p className="text-xs font-medium">Chưa có hạn mức provider nào</p>
                  <p className="text-[11px]">Đăng nhập tài khoản qua Cài đặt hoặc chạy omp auth-broker login.</p>
                </div>
              )}
            </div>
          )}

          {/* TAB 3: GLOBAL STATS (omp stats) */}
          {activeTab === 'stats' && (
            <div className="space-y-4">
              {globalStats?.overall ? (
                <>
                  {/* Overall Summary Cards */}
                  <div className="grid grid-cols-3 gap-2">
                    <div className="p-2.5 rounded-lg bg-surface border border-border flex flex-col">
                      <span className="text-[10.5px] text-slate-500 dark:text-zinc-400">Total Requests</span>
                      <span className="text-sm font-semibold font-mono text-slate-900 dark:text-zinc-100">
                        {formatNumber(globalStats.overall.totalRequests)}
                      </span>
                      <span className="text-[10px] text-slate-400 mt-0.5">
                        {formatNumber(globalStats.overall.failedRequests)} lỗi ({((globalStats.overall.errorRate || 0) * 100).toFixed(1)}%)
                      </span>
                    </div>

                    <div className="p-2.5 rounded-lg bg-surface border border-border flex flex-col">
                      <span className="text-[10.5px] text-slate-500 dark:text-zinc-400">Total Tokens</span>
                      <span className="text-sm font-semibold font-mono text-codex-accent">
                        {formatNumber(
                          (globalStats.overall.totalInputTokens || 0) + (globalStats.overall.totalOutputTokens || 0)
                        )}
                      </span>
                      <span className="text-[10px] text-slate-400 mt-0.5">
                        {formatNumber(globalStats.overall.totalInputTokens)} in / {formatNumber(globalStats.overall.totalOutputTokens)} out
                      </span>
                    </div>

                    <div className="p-2.5 rounded-lg bg-surface border border-border flex flex-col">
                      <span className="text-[10.5px] text-slate-500 dark:text-zinc-400">Total Cost</span>
                      <span className="text-sm font-semibold font-mono text-amber-500">
                        {formatCost(globalStats.overall.totalCost)}
                      </span>
                      <span className="text-[10px] text-emerald-500 mt-0.5">
                        {((globalStats.overall.cacheSavings || 0) * 100).toFixed(0)}% cache saving
                      </span>
                    </div>
                  </div>

                  {/* Performance Metrics */}
                  <div className="grid grid-cols-3 gap-2">
                    <div className="p-2 rounded-lg bg-surface border border-border flex items-center justify-between">
                      <span className="text-[10.5px] text-slate-500 dark:text-zinc-400">Avg Duration</span>
                      <span className="text-xs font-mono font-medium text-slate-800 dark:text-zinc-200">
                        {globalStats.overall.avgDuration != null
                          ? `${(globalStats.overall.avgDuration / 1000).toFixed(1)}s`
                          : '--'}
                      </span>
                    </div>

                    <div className="p-2 rounded-lg bg-surface border border-border flex items-center justify-between">
                      <span className="text-[10.5px] text-slate-500 dark:text-zinc-400">Avg TTFT</span>
                      <span className="text-xs font-mono font-medium text-slate-800 dark:text-zinc-200">
                        {globalStats.overall.avgTtft != null
                          ? `${(globalStats.overall.avgTtft / 1000).toFixed(1)}s`
                          : '--'}
                      </span>
                    </div>

                    <div className="p-2 rounded-lg bg-surface border border-border flex items-center justify-between">
                      <span className="text-[10.5px] text-slate-500 dark:text-zinc-400">Speed</span>
                      <span className="text-xs font-mono font-medium text-blue-500">
                        {globalStats.overall.avgTokensPerSecond != null
                          ? `${globalStats.overall.avgTokensPerSecond.toFixed(1)} t/s`
                          : '--'}
                      </span>
                    </div>
                  </div>

                  {/* By Model Breakdown */}
                  {globalStats.byModel && globalStats.byModel.length > 0 && (
                    <div className="space-y-1.5">
                      <div className="text-[11px] font-semibold uppercase tracking-wider text-slate-400 dark:text-zinc-500 flex items-center gap-1.5">
                        <HardDrive className="w-3.5 h-3.5" />
                        By Model
                      </div>

                      <div className="rounded-lg bg-surface border border-border overflow-hidden">
                        <table className="w-full text-left text-xs">
                          <thead>
                            <tr className="border-b border-border text-[10.5px] text-slate-500 dark:text-zinc-400 bg-surface/80">
                              <th className="py-1.5 px-3 font-medium">Model</th>
                              <th className="py-1.5 px-2 font-medium text-right">Reqs</th>
                              <th className="py-1.5 px-2 font-medium text-right">Tokens</th>
                              <th className="py-1.5 px-3 font-medium text-right">Cost</th>
                            </tr>
                          </thead>
                          <tbody className="divide-y divide-border/60 font-mono text-[11px]">
                            {globalStats.byModel.map((item, idx) => (
                              <tr key={item.model + idx} className="hover:bg-surface-highlight/40 transition-colors">
                                <td className="py-1.5 px-3 font-sans truncate max-w-[170px]" title={item.model}>
                                  <span className="font-medium text-slate-800 dark:text-zinc-200 block truncate">
                                    {item.model}
                                  </span>
                                  <span className="text-[9.5px] text-slate-400 block truncate">
                                    {item.provider}
                                  </span>
                                </td>
                                <td className="py-1.5 px-2 text-right text-slate-600 dark:text-zinc-400">
                                  {formatNumber(item.totalRequests)}
                                </td>
                                <td className="py-1.5 px-2 text-right text-slate-600 dark:text-zinc-400">
                                  {formatNumber((item.totalInputTokens || 0) + (item.totalOutputTokens || 0))}
                                </td>
                                <td className="py-1.5 px-3 text-right text-amber-500 font-semibold">
                                  {formatCost(item.totalCost)}
                                </td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    </div>
                  )}

                  {/* By Folder / Workspace Breakdown */}
                  {globalStats.byFolder && globalStats.byFolder.length > 0 && (
                    <div className="space-y-1.5">
                      <div className="text-[11px] font-semibold uppercase tracking-wider text-slate-400 dark:text-zinc-500 flex items-center gap-1.5">
                        <Folder className="w-3.5 h-3.5" />
                        Top Workspaces
                      </div>

                      <div className="space-y-1">
                        {globalStats.byFolder.slice(0, 5).map((f, idx) => (
                          <div
                            key={f.folder + idx}
                            className="p-2 rounded-lg bg-surface border border-border flex items-center justify-between text-xs"
                          >
                            <span className="font-mono text-[11px] text-slate-700 dark:text-zinc-300 truncate max-w-[280px]" title={cleanFolderName(f.folder)}>
                              {cleanFolderName(f.folder)}
                            </span>
                            <div className="flex items-center gap-3 font-mono text-[11px] text-slate-500 dark:text-zinc-400">
                              <span>{formatNumber(f.totalRequests)} reqs</span>
                              <span className="text-amber-500 font-medium">{formatCost(f.totalCost)}</span>
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </>
              ) : rawStatsText ? (
                <div className="p-3 rounded-lg bg-surface border border-border">
                  <span className="text-[11px] font-semibold uppercase tracking-wider text-slate-400 dark:text-zinc-500 block mb-2">
                    CLI Output
                  </span>
                  <pre className="text-[11px] font-mono whitespace-pre-wrap text-slate-700 dark:text-zinc-300 overflow-x-auto max-h-60">
                    {rawStatsText}
                  </pre>
                </div>
              ) : (
                <div className="py-8 text-center text-slate-400 dark:text-zinc-500 space-y-1">
                  <BarChart3 className="w-8 h-8 mx-auto text-slate-400/60" />
                  <p className="text-xs font-medium">Chưa có dữ liệu thống kê toàn cục</p>
                  <p className="text-[11px]">Chạy thêm các phiên làm việc để CLI ghi nhận dữ liệu.</p>
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
