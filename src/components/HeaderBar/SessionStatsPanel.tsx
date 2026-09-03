import React, { useState, useEffect, useCallback, useRef, useMemo } from 'react';
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
  History,
  Users,
  Trash2,
  ExternalLink,
  Play,
  Square,
  TrendingUp,
  CheckCircle2,
} from 'lucide-react';
import {
  OmpSessionStats,
  OmpContextUsage,
  OmpGlobalUsageData,
  OmpGlobalStatsData,
  GlobalUsageResult,
  GlobalStatsResult,
  FetchGlobalUsageOptions,
  OmpUsageHistoryData,
  OmpUsageHistoryEntry,
  UsageHistoryResult,
  FetchUsageHistoryOptions,
  OmpUsageClientsData,
  UsageClientsResult,
  FetchUsageClientsOptions,
  InvalidateUsageOptions,
  UsageInvalidateResult,
  StartStatsDashboardOptions,
  StatsDashboardResult,
  StatsDashboardStatus,
} from '../../types';
import { useI18n } from '../../i18n/I18nProvider.tsx';

const MAX_HISTORY_ROWS = 500;

type StatsTab = 'session' | 'usage' | 'stats';
type UsageSubTab = 'live' | 'history' | 'clients';

interface SessionStatsPanelProps {
  isOpen: boolean;
  onClose: () => void;
  onRefresh: () => Promise<{ success: boolean; stats?: OmpSessionStats; error?: string }>;
  contextUsage?: OmpContextUsage | null;
  isCompacting?: boolean;
  autoCompactionEnabled?: boolean;
  onCompact?: (customInstructions?: string) => Promise<{ success: boolean; error?: string }>;
  onSetAutoCompaction?: (enabled: boolean) => Promise<{ success: boolean; error?: string }>;
  onGetGlobalUsage?: (options?: boolean | FetchGlobalUsageOptions) => Promise<GlobalUsageResult>;
  onGetGlobalStats?: (forceRefresh?: boolean) => Promise<GlobalStatsResult>;
  onGetUsageHistory?: (options?: FetchUsageHistoryOptions) => Promise<UsageHistoryResult>;
  onGetUsageClients?: (options?: FetchUsageClientsOptions) => Promise<UsageClientsResult>;
  onInvalidateUsage?: (options?: InvalidateUsageOptions) => Promise<UsageInvalidateResult>;
  onStartStatsDashboard?: (options?: StartStatsDashboardOptions) => Promise<StatsDashboardResult>;
  onStopStatsDashboard?: () => Promise<StatsDashboardResult>;
  onGetStatsDashboardStatus?: () => Promise<StatsDashboardStatus>;
  onOpenExternal?: (url: string) => Promise<{ success: boolean; error?: string }>;
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
  onGetUsageHistory,
  onGetUsageClients,
  onInvalidateUsage,
  onStartStatsDashboard,
  onStopStatsDashboard,
  onGetStatsDashboardStatus,
  onOpenExternal,
}) => {
  const { t } = useI18n();
  const [activeTab, setActiveTab] = useState<StatsTab>('session');
  const [usageSubTab, setUsageSubTab] = useState<UsageSubTab>('live');

  // Filter controls for Usage limits - redact enabled by default
  const [selectedProvider, setSelectedProvider] = useState<string>('');
  const [selectedDays, setSelectedDays] = useState<number>(7);
  const [redactEnabled, setRedactEnabled] = useState<boolean>(true);

  // Data states
  const [sessionStats, setSessionStats] = useState<OmpSessionStats | null>(null);
  const [globalUsage, setGlobalUsage] = useState<OmpGlobalUsageData | null>(null);
  const [usageHistory, setUsageHistory] = useState<OmpUsageHistoryData | null>(null);
  const [usageClients, setUsageClients] = useState<OmpUsageClientsData | null>(null);
  const [globalStats, setGlobalStats] = useState<OmpGlobalStatsData | null>(null);
  const [dashboardStatus, setDashboardStatus] = useState<StatsDashboardStatus>({
    running: false,
    status: 'stopped',
  });

  const [rawUsageText, setRawUsageText] = useState<string | null>(null);
  const [rawStatsText, setRawStatsText] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState<boolean>(false);
  const [isInvalidating, setIsInvalidating] = useState<boolean>(false);
  const [isDashboardActionLoading, setIsDashboardActionLoading] = useState<boolean>(false);
  const [isTracing, setIsTracing] = useState<boolean>(false);
  const [toastMessage, setToastMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const panelRef = useRef<HTMLDivElement>(null);
  const traceTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const fetchSeqRef = useRef(0);

  useEffect(() => () => {
    if (traceTimerRef.current) clearTimeout(traceTimerRef.current);
  }, []);

  const showToast = useCallback((msg: string) => {
    setToastMessage(msg);
    setTimeout(() => {
      setToastMessage((current) => (current === msg ? null : current));
    }, 3500);
  }, []);

  const fetchSessionStats = useCallback(async () => {
    try {
      const res = await onRefresh();
      if (res.success && res.stats) {
        setSessionStats(res.stats);
      } else {
        setError(res.error || t('stats.sessionStatsError'));
      }
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      setError(msg || t('stats.sessionStatsException'));
    }
  }, [onRefresh, t]);

  const fetchUsageData = useCallback(
    async (force = false) => {
      try {
        const fetcher = onGetGlobalUsage || window.electronAPI?.getGlobalUsage;
        if (!fetcher) {
          setError(t('stats.getGlobalUsageUnavailable'));
          return;
        }
        const res = await fetcher({
          forceRefresh: force,
          provider: selectedProvider || undefined,
          redact: redactEnabled,
        });
        if (res.success && res.data) {
          setGlobalUsage(res.data);
          setRawUsageText(null);
        } else if (res.raw) {
          setRawUsageText(res.raw);
          if (res.error) setError(res.error);
        } else {
          setError(res.error || t('stats.usageFetchError'));
        }
      } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : String(err);
        setError(msg || t('stats.usageFetchError'));
      }
    },
    [onGetGlobalUsage, selectedProvider, redactEnabled, t]
  );

  const fetchHistoryData = useCallback(
    async (force = false) => {
      try {
        const fetcher = onGetUsageHistory || window.electronAPI?.getUsageHistory;
        if (!fetcher) {
          setError(t('stats.getUsageHistoryUnavailable'));
          return;
        }
        const res = await fetcher({
          days: selectedDays,
          provider: selectedProvider || undefined,
          forceRefresh: force,
        });
        if (res.success && res.data) {
          setUsageHistory(res.data);
        } else {
          setError(res.error || t('stats.usageHistoryFetchError'));
        }
      } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : String(err);
        setError(msg || t('stats.usageHistoryFetchError'));
      }
    },
    [onGetUsageHistory, selectedDays, selectedProvider, t]
  );

  const fetchClientsData = useCallback(
    async (force = false) => {
      try {
        const fetcher = onGetUsageClients || window.electronAPI?.getUsageClients;
        if (!fetcher) {
          setError(t('stats.getUsageClientsUnavailable'));
          return;
        }
        const res = await fetcher({
          days: selectedDays,
          forceRefresh: force,
        });
        if (res.success && res.data) {
          setUsageClients(res.data);
        } else {
          setError(res.error || t('stats.usageClientsFetchError'));
        }
      } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : String(err);
        setError(msg || t('stats.usageClientsFetchError'));
      }
    },
    [onGetUsageClients, selectedDays, t]
  );

  const fetchGlobalStatsData = useCallback(
    async (force = false) => {
      try {
        const fetcher = onGetGlobalStats || window.electronAPI?.getGlobalStats;
        if (!fetcher) {
          setError(t('stats.getGlobalStatsUnavailable'));
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
          setError(res.error || t('stats.globalStatsFetchError'));
        }
      } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : String(err);
        setError(msg || t('stats.statsFetchError'));
      }
    },
    [onGetGlobalStats, t]
  );

  const checkDashboardStatus = useCallback(async () => {
    try {
      const fetcher = onGetStatsDashboardStatus || window.electronAPI?.getStatsDashboardStatus;
      if (fetcher) {
        const st = await fetcher();
        setDashboardStatus(st);
      }
    } catch {
      // ignore
    }
  }, [onGetStatsDashboardStatus]);

  const fetchActiveTabData = useCallback(
    async (force = false) => {
      const seq = ++fetchSeqRef.current;
      setIsLoading(true);
      setError(null);
      try {
        if (activeTab === 'session') {
          await fetchSessionStats();
        } else if (activeTab === 'usage') {
          if (usageSubTab === 'live') {
            await fetchUsageData(force);
          } else if (usageSubTab === 'history') {
            await fetchHistoryData(force);
          } else if (usageSubTab === 'clients') {
            await fetchClientsData(force);
          }
        } else if (activeTab === 'stats') {
          await Promise.all([fetchGlobalStatsData(force), checkDashboardStatus()]);
        }
      } finally {
        // Only the latest fetch may clear the loading flag
        if (seq === fetchSeqRef.current) setIsLoading(false);
      }
    },
    [
      activeTab,
      usageSubTab,
      fetchSessionStats,
      fetchUsageData,
      fetchHistoryData,
      fetchClientsData,
      fetchGlobalStatsData,
      checkDashboardStatus,
    ]
  );

  useEffect(() => {
    if (isOpen) {
      fetchActiveTabData(false);
    }
  }, [isOpen, activeTab, usageSubTab, selectedDays, selectedProvider, redactEnabled, fetchActiveTabData]);

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

  const handleInvalidate = async () => {
    setIsInvalidating(true);
    try {
      const fetcher = onInvalidateUsage || window.electronAPI?.invalidateUsage;
      if (!fetcher) {
        setError(t('stats.invalidateUsageUnavailable'));
        return;
      }
      const res = await fetcher({ provider: selectedProvider || undefined });
      if (res.success) {
        showToast(res.message || t('usage.invalidate.success'));
        await fetchActiveTabData(true);
      } else {
        setError(res.error || t('stats.invalidateUsageError'));
      }
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      setError(msg || t('stats.invalidateUsageException'));
    } finally {
      setIsInvalidating(false);
    }
  };

  const handleOpenDashboard = async () => {
    setIsDashboardActionLoading(true);
    try {
      const starter = onStartStatsDashboard || window.electronAPI?.startStatsDashboard;
      const opener = onOpenExternal || window.electronAPI?.openExternal;
      if (!starter || !opener) {
        setError(t('stats.apiUnavailable'));
        return;
      }
      const res = await starter();
      if (res.success && res.status.url) {
        setDashboardStatus(res.status);
        await opener(res.status.url);
      } else {
        setError(res.error || t('stats.startServerError'));
      }
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      setError(msg || t('stats.openDashboardError'));
    } finally {
      setIsDashboardActionLoading(false);
    }
  };

  const handleStopDashboard = async () => {
    setIsDashboardActionLoading(true);
    try {
      const stopper = onStopStatsDashboard || window.electronAPI?.stopStatsDashboard;
      if (stopper) {
        const res = await stopper();
        setDashboardStatus(res.status);
      }
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      setError(msg || t('stats.stopDashboardError'));
    } finally {
      setIsDashboardActionLoading(false);
    }
  };

  const handleTraceSession = async () => {
    setIsTracing(true);
    try {
      // 1. Start stats dashboard first if not running
      const starter = onStartStatsDashboard || window.electronAPI?.startStatsDashboard;
      const opener = onOpenExternal || window.electronAPI?.openExternal;

      let dashboardUrl = dashboardStatus.url;
      if (starter && !dashboardStatus.running) {
        const startRes = await starter();
        if (startRes.success && startRes.status) {
          setDashboardStatus(startRes.status);
          dashboardUrl = startRes.status.url;
        }
      }

      // 2. Listen to command output to capture trace URL if present
      let urlOpened = false;
      let unsubscribe: (() => void) | undefined;

      if (window.electronAPI?.onOmpCommandOutput) {
        unsubscribe = window.electronAPI.onOmpCommandOutput((data) => {
          const match = data.text?.match(/https?:\/\/\S+/);
          if (match && !urlOpened && opener) {
            urlOpened = true;
            opener(match[0]);
            showToast(t('stats.trace.success'));
            unsubscribe?.();
          }
        });
      }

      // 3. Send /trace command via prompt
      if (window.electronAPI?.sendOmpMessage) {
        await window.electronAPI.sendOmpMessage('/trace');
      }

      // 4. Timeout 2.5s fallback to open dashboard URL
      if (traceTimerRef.current) clearTimeout(traceTimerRef.current);
      traceTimerRef.current = setTimeout(async () => {
        traceTimerRef.current = null;
        unsubscribe?.();
        if (!urlOpened && opener) {
          const fallbackUrl = dashboardUrl || 'http://127.0.0.1:3457';
          await opener(fallbackUrl);
          showToast(t('stats.trace.success'));
        }
      }, 2500);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      setError(msg || t('stats.traceError'));
    } finally {
      setIsTracing(false);
    }
  };

  // Group history entries by (provider + limitId) for sparklines
  const groupedSparklines = useMemo(() => {
    if (!usageHistory?.entries || usageHistory.entries.length < 5) return [];

    const groups = new Map<string, { provider: string; limitLabel: string; entries: OmpUsageHistoryEntry[] }>();

    for (const entry of usageHistory.entries) {
      const key = `${entry.provider}::${entry.limitId || entry.label || 'default'}`;
      if (!groups.has(key)) {
        groups.set(key, {
          provider: entry.provider,
          limitLabel: entry.label || entry.windowLabel || entry.limitId || 'Limit',
          entries: [],
        });
      }
      groups.get(key)!.entries.push(entry);
    }

    const result: Array<{
      key: string;
      provider: string;
      limitLabel: string;
      pointsStr: string;
      latestFrac: number;
    }> = [];

    const width = 460;
    const height = 36;
    const padding = 4;

    for (const [key, group] of groups.entries()) {
      if (group.entries.length < 3) continue;
      const sorted = [...group.entries].sort((a, b) => a.recordedAt - b.recordedAt);
      const minTime = sorted[0].recordedAt;
      const maxTime = sorted[sorted.length - 1].recordedAt;
      const timeSpan = maxTime - minTime || 1;

      const points = sorted.map((entry) => {
        const x = padding + ((entry.recordedAt - minTime) / timeSpan) * (width - padding * 2);
        const frac = Math.max(0, Math.min(1, entry.usedFraction || 0));
        const y = height - padding - frac * (height - padding * 2);
        return `${x.toFixed(1)},${y.toFixed(1)}`;
      });

      result.push({
        key,
        provider: group.provider,
        limitLabel: group.limitLabel,
        pointsStr: points.join(' '),
        latestFrac: sorted[sorted.length - 1].usedFraction || 0,
      });
    }

    return result;
  }, [usageHistory]);

  if (!isOpen) return null;

  const effectiveContext = sessionStats?.contextUsage || contextUsage;
  const percent =
    typeof effectiveContext?.percent === 'number'
      ? Math.round(effectiveContext.percent * 10) / 10
      : null;
  const tokens =
    typeof effectiveContext?.tokens === 'number' ? effectiveContext.tokens : null;
  const contextWindow =
    typeof effectiveContext?.contextWindow === 'number'
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
    if (diff <= 0) return t('stats.resetDone');
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

  const availableProviders = Array.from(
    new Set([
      ...(globalUsage?.reports?.map((r) => r.provider).filter(Boolean) || []),
      ...(usageHistory?.entries?.map((e) => e.provider).filter(Boolean) || []),
    ])
  );


  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center pt-14 bg-black/20 backdrop-blur-xs animate-fade-in">
      <div
        ref={panelRef}
        className="w-[560px] max-w-[94vw] bg-panel border border-border rounded-xl shadow-2xl overflow-hidden flex flex-col text-slate-800 dark:text-zinc-200"
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
              title={t('stats.refreshBypassCache')}
            >
              <RotateCw className={`w-3.5 h-3.5 ${isLoading ? 'animate-spin text-codex-accent' : ''}`} />
            </button>
            <button
              onClick={onClose}
              className="p-1 rounded-md text-slate-500 hover:text-slate-800 dark:text-zinc-400 dark:hover:text-zinc-100 hover:bg-surface-highlight transition-colors cursor-pointer"
              title={t('stats.closeEsc')}
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
            <span>{t('stats.tab.session')}</span>
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
            <span>{t('usage.tab.live')}</span>
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
            <span>{t('stats.tab.global')}</span>
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

          {toastMessage && (
            <div className="flex items-center gap-2 p-2.5 rounded-lg text-xs bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border border-emerald-500/20 animate-fade-in">
              <CheckCircle2 className="w-4 h-4 shrink-0 text-emerald-500" />
              <span>{toastMessage}</span>
            </div>
          )}

          {isLoading && !sessionStats && !globalUsage && !globalStats && (
            <div className="py-8 flex flex-col items-center justify-center gap-2 text-slate-400 dark:text-zinc-500">
              <RotateCw className="w-6 h-6 animate-spin text-codex-accent" />
              <span className="text-xs">{t('common.loading')}</span>
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
                      <span>{t('stats.autoCompact')}</span>
                    </label>

                    {onCompact && (
                      <button
                        onClick={async () => {
                          await onCompact();
                          fetchSessionStats();
                        }}
                        disabled={isCompacting}
                        className="flex items-center gap-1.5 px-2.5 py-1 rounded-md text-[11px] font-medium bg-surface-highlight hover:bg-border text-slate-800 dark:text-zinc-200 border border-border transition-colors cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
                        title={t('stats.compactContextTooltip')}
                      >
                        <Minimize2 className={`w-3 h-3 text-codex-accent ${isCompacting ? 'animate-spin' : ''}`} />
                        <span>{isCompacting ? t('stats.compacting') : t('stats.compactContext')}</span>
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
                    <span className="text-[10.5px] text-slate-500 dark:text-zinc-400">{t('stats.session.user')}</span>
                    <span className="text-sm font-semibold font-mono text-slate-900 dark:text-zinc-100">
                      {formatNumber(sessionStats?.userMessages)}
                    </span>
                  </div>
                  <div className="p-2.5 rounded-lg bg-surface border border-border flex flex-col">
                    <span className="text-[10.5px] text-slate-500 dark:text-zinc-400">{t('stats.session.assistant')}</span>
                    <span className="text-sm font-semibold font-mono text-slate-900 dark:text-zinc-100">
                      {formatNumber(sessionStats?.assistantMessages)}
                    </span>
                  </div>
                  <div className="p-2.5 rounded-lg bg-surface border border-border flex flex-col">
                    <span className="text-[10.5px] text-slate-500 dark:text-zinc-400">{t('stats.session.total')}</span>
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
                    <span className="text-[10.5px] text-slate-500 dark:text-zinc-400">{t('stats.session.input')}</span>
                    <span className="text-xs font-semibold font-mono text-slate-900 dark:text-zinc-100">
                      {formatNumber(sessionStats?.tokens?.input)}
                    </span>
                  </div>
                  <div className="p-2.5 rounded-lg bg-surface border border-border flex flex-col">
                    <span className="text-[10.5px] text-slate-500 dark:text-zinc-400">{t('stats.session.output')}</span>
                    <span className="text-xs font-semibold font-mono text-slate-900 dark:text-zinc-100">
                      {formatNumber(sessionStats?.tokens?.output)}
                    </span>
                  </div>
                  {sessionStats?.tokens?.reasoning != null && sessionStats.tokens.reasoning > 0 && (
                    <div className="p-2.5 rounded-lg bg-surface border border-border flex flex-col">
                      <span className="text-[10.5px] text-slate-500 dark:text-zinc-400">{t('stats.session.reasoning')}</span>
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
                    <span className="text-[10.5px] text-slate-500 dark:text-zinc-400">{t('stats.session.totalTokens')}</span>
                    <span className="text-xs font-semibold font-mono text-codex-accent">
                      {formatNumber(sessionStats?.tokens?.total)}
                    </span>
                  </div>
                </div>

                {(sessionStats?.tokens?.cacheRead != null || sessionStats?.tokens?.cacheWrite != null) && (
                  <div className="grid grid-cols-2 gap-2 mt-1">
                    <div className="p-2 rounded-lg bg-surface border border-border flex items-center justify-between">
                      <span className="text-[10.5px] text-slate-500 dark:text-zinc-400">{t('stats.session.cacheRead')}</span>
                      <span className="text-xs font-mono text-slate-700 dark:text-zinc-300">
                        {formatNumber(sessionStats?.tokens?.cacheRead)}
                      </span>
                    </div>
                    <div className="p-2 rounded-lg bg-surface border border-border flex items-center justify-between">
                      <span className="text-[10.5px] text-slate-500 dark:text-zinc-400">{t('stats.session.cacheWrite')}</span>
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
                    <span className="text-[10.5px] text-slate-500 dark:text-zinc-400 block">{t('stats.session.premiumRequests')}</span>
                    <span className="text-xs font-semibold font-mono text-slate-900 dark:text-zinc-100">
                      {formatNumber(sessionStats.premiumRequests)}
                    </span>
                  </div>
                )}
              </div>
            </>
          )}

          {/* TAB 2: USAGE LIMITS & HISTORY (omp usage) */}
          {activeTab === 'usage' && (
            <div className="space-y-3">
              {/* Sub-tab navigation & Controls toolbar */}
              <div className="flex flex-wrap items-center justify-between gap-2 p-2.5 rounded-lg bg-surface border border-border">
                <div className="flex items-center gap-1 bg-panel p-1 rounded-md border border-border text-xs">
                  <button
                    onClick={() => setUsageSubTab('live')}
                    className={`flex items-center gap-1 px-2.5 py-1 rounded font-medium transition-colors cursor-pointer ${
                      usageSubTab === 'live'
                        ? 'bg-surface-highlight text-slate-900 dark:text-zinc-100 shadow-xs'
                        : 'text-slate-500 dark:text-zinc-400 hover:text-slate-800'
                    }`}
                  >
                    <ShieldAlert className="w-3 h-3 text-amber-500" />
                    <span>{t('usage.tab.live')}</span>
                  </button>

                  <button
                    onClick={() => setUsageSubTab('history')}
                    className={`flex items-center gap-1 px-2.5 py-1 rounded font-medium transition-colors cursor-pointer ${
                      usageSubTab === 'history'
                        ? 'bg-surface-highlight text-slate-900 dark:text-zinc-100 shadow-xs'
                        : 'text-slate-500 dark:text-zinc-400 hover:text-slate-800'
                    }`}
                  >
                    <History className="w-3 h-3 text-blue-500" />
                    <span>{t('usage.tab.history')}</span>
                  </button>

                  <button
                    onClick={() => setUsageSubTab('clients')}
                    className={`flex items-center gap-1 px-2.5 py-1 rounded font-medium transition-colors cursor-pointer ${
                      usageSubTab === 'clients'
                        ? 'bg-surface-highlight text-slate-900 dark:text-zinc-100 shadow-xs'
                        : 'text-slate-500 dark:text-zinc-400 hover:text-slate-800'
                    }`}
                  >
                    <Users className="w-3 h-3 text-emerald-500" />
                    <span>{t('usage.tab.clients')}</span>
                  </button>
                </div>

                <div className="flex items-center gap-2 text-xs">
                  {/* Provider filter (Live and History only) */}
                  {usageSubTab !== 'clients' && availableProviders.length > 0 && (
                    <select
                      value={selectedProvider}
                      onChange={(e) => setSelectedProvider(e.target.value)}
                      className="px-2 py-1 rounded bg-panel border border-border text-slate-700 dark:text-zinc-300 text-xs focus:outline-hidden"
                    >
                      <option value="">{t('usage.filter.allProviders')}</option>
                      {availableProviders.map((p) => (
                        <option key={p} value={p}>
                          {formatProviderLabel(p)}
                        </option>
                      ))}
                    </select>
                  )}

                  {/* Days window */}
                  {(usageSubTab === 'history' || usageSubTab === 'clients') && (
                    <select
                      value={selectedDays}
                      onChange={(e) => setSelectedDays(Number(e.target.value))}
                      className="px-2 py-1 rounded bg-panel border border-border text-slate-700 dark:text-zinc-300 text-xs focus:outline-hidden"
                    >
                      <option value={1}>{t('usage.filter.days1')}</option>
                      <option value={7}>{t('usage.filter.days7')}</option>
                      <option value={30}>{t('usage.filter.days30')}</option>
                    </select>
                  )}

                  {/* Redact toggle (for Live tab) */}
                  {usageSubTab === 'live' && (
                    <label className="flex items-center gap-1.5 text-[11px] text-slate-600 dark:text-zinc-400 cursor-pointer select-none">
                      <input
                        type="checkbox"
                        checked={redactEnabled}
                        onChange={(e) => setRedactEnabled(e.target.checked)}
                        className="rounded border-border text-codex-accent focus:ring-codex-accent w-3.5 h-3.5 cursor-pointer"
                      />
                      <span>{t('usage.redact.toggle')}</span>
                    </label>
                  )}

                  {/* Invalidate Cache button */}
                  <button
                    onClick={handleInvalidate}
                    disabled={isInvalidating}
                    className="flex items-center gap-1 px-2 py-1 rounded bg-rose-500/10 hover:bg-rose-500/20 text-rose-600 dark:text-rose-400 border border-rose-500/20 transition-colors cursor-pointer text-[11px] disabled:opacity-50"
                    title={t('usage.invalidate.btn')}
                  >
                    <Trash2 className={`w-3 h-3 ${isInvalidating ? 'animate-spin' : ''}`} />
                    <span>{isInvalidating ? t('usage.invalidate.running') : t('usage.invalidate.btn')}</span>
                  </button>
                </div>
              </div>

              {/* VIEW 1: LIVE LIMITS */}
              {usageSubTab === 'live' && (
                <div className="space-y-3">
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
                                      <span>{t('stats.remainingPercent', { percent: 100 - usedPct })}</span>
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
                      <p className="text-xs font-medium">{t('stats.noProviderLimits')}</p>
                      <p className="text-[11px]">{t('stats.noProviderLimitsDesc')}</p>
                    </div>
                  )}
                </div>
              )}

              {/* VIEW 2: USAGE HISTORY */}
              {usageSubTab === 'history' && (
                <div className="space-y-3">
                  {/* Sparklines trend view grouped by provider & limit */}
                  {groupedSparklines.length > 0 && (
                    <div className="space-y-2">
                      {groupedSparklines.map((spark) => (
                        <div key={spark.key} className="p-3 rounded-xl bg-surface border border-border space-y-1.5">
                          <div className="flex items-center justify-between text-xs text-slate-600 dark:text-zinc-400">
                            <span className="flex items-center gap-1.5 font-medium">
                              <TrendingUp className="w-3.5 h-3.5 text-codex-accent" />
                              {formatProviderLabel(spark.provider)} — {spark.limitLabel} ({selectedDays}d)
                            </span>
                            <span className="font-mono font-semibold text-slate-900 dark:text-zinc-100">
                              Latest: {Math.round(spark.latestFrac * 100)}%
                            </span>
                          </div>
                          <div className="w-full h-9 flex items-center justify-center">
                            <svg viewBox="0 0 460 36" className="w-full h-full overflow-visible text-codex-accent">
                              <polyline
                                fill="none"
                                stroke="currentColor"
                                strokeWidth="2"
                                strokeLinecap="round"
                                strokeLinejoin="round"
                                points={spark.pointsStr}
                              />
                            </svg>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}

                  {/* History table */}
                  {usageHistory?.entries && usageHistory.entries.length > 0 ? (
                    <div className="rounded-lg bg-surface border border-border overflow-hidden">
                      <div className="max-h-64 overflow-y-auto">
                        <table className="w-full text-left text-xs">
                          <thead className="sticky top-0 bg-surface/95 backdrop-blur-xs border-b border-border text-[10.5px] text-slate-500 dark:text-zinc-400">
                            <tr>
                              <th className="py-2 px-3 font-medium">{t('usage.history.recordedAt')}</th>
                              <th className="py-2 px-2 font-medium">{t('usage.history.provider')}</th>
                              <th className="py-2 px-2 font-medium">{t('usage.history.limit')}</th>
                              <th className="py-2 px-2 font-medium text-right">{t('usage.history.used')}</th>
                              <th className="py-2 px-3 font-medium text-right">{t('usage.history.status')}</th>
                            </tr>
                          </thead>
                          <tbody className="divide-y divide-border/60 font-mono text-[11px]">
                            {usageHistory.entries.slice(0, MAX_HISTORY_ROWS).map((entry, idx) => {
                              const usedPct = Math.round((entry.usedFraction || 0) * 100);
                              const dateStr = entry.recordedAt
                                ? new Date(entry.recordedAt).toLocaleString(undefined, {
                                    month: 'numeric',
                                    day: 'numeric',
                                    hour: '2-digit',
                                    minute: '2-digit',
                                  })
                                : '--';

                              return (
                                <tr key={idx} className="hover:bg-surface-highlight/40 transition-colors">
                                  <td className="py-1.5 px-3 font-sans text-slate-600 dark:text-zinc-400 whitespace-nowrap">
                                    {dateStr}
                                  </td>
                                  <td className="py-1.5 px-2 font-medium text-slate-800 dark:text-zinc-200 truncate max-w-[110px]">
                                    {formatProviderLabel(entry.provider)}
                                  </td>
                                  <td className="py-1.5 px-2 text-slate-600 dark:text-zinc-400 truncate max-w-[130px]">
                                    {entry.label || entry.limitId || '--'}
                                  </td>
                                  <td className="py-1.5 px-2 text-right">
                                    <span className={`font-semibold ${getMeterColor(usedPct).split(' ')[1]}`}>
                                      {usedPct}%
                                    </span>
                                  </td>
                                  <td className="py-1.5 px-3 text-right">
                                    <span
                                      className={`px-1.5 py-0.2 rounded text-[9.5px] font-semibold uppercase ${
                                        entry.status === 'ok' || !entry.status
                                          ? 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400'
                                          : 'bg-rose-500/10 text-rose-600 dark:text-rose-400'
                                      }`}
                                    >
                                      {entry.status || 'ok'}
                                    </span>
                                  </td>
                                </tr>
                              );
                            })}
                          </tbody>
                        </table>
                        {usageHistory.entries.length > MAX_HISTORY_ROWS && (
                          <div className="px-3 py-1.5 text-[10px] text-slate-400 border-t border-border/60">
                            {t('usage.history.truncated', { shown: MAX_HISTORY_ROWS, total: usageHistory.entries.length })}
                          </div>
                        )}
                      </div>
                    </div>
                  ) : (
                    <div className="py-8 text-center text-slate-400 dark:text-zinc-500 space-y-1">
                      <History className="w-8 h-8 mx-auto text-slate-400/60" />
                      <p className="text-xs font-medium">{t('usage.history.empty')}</p>
                    </div>
                  )}
                </div>
              )}

              {/* VIEW 3: CLIENTS USAGE */}
              {usageSubTab === 'clients' && (
                <div className="space-y-3">
                  {usageClients?.clients && usageClients.clients.length > 0 ? (
                    <div className="rounded-lg bg-surface border border-border overflow-hidden">
                      <div className="max-h-64 overflow-y-auto">
                        <table className="w-full text-left text-xs">
                          <thead className="sticky top-0 bg-surface/95 backdrop-blur-xs border-b border-border text-[10.5px] text-slate-500 dark:text-zinc-400">
                            <tr>
                              <th className="py-2 px-3 font-medium">{t('usage.clients.name')}</th>
                              <th className="py-2 px-2 font-medium text-right">{t('usage.clients.tokens')}</th>
                              <th className="py-2 px-2 font-medium text-right">{t('usage.clients.cost')}</th>
                              <th className="py-2 px-2 font-medium text-right">{t('usage.clients.sessions')}</th>
                            </tr>
                          </thead>
                          <tbody className="divide-y divide-border/60 font-mono text-[11px]">
                            {usageClients.clients.map((c, idx) => (
                              <tr key={idx} className="hover:bg-surface-highlight/40 transition-colors">
                                <td className="py-2 px-3 font-sans font-medium text-slate-800 dark:text-zinc-200">
                                  {c.client || c.name || c.id || `Client #${idx + 1}`}
                                </td>
                                <td className="py-2 px-2 text-right text-codex-accent font-semibold">
                                  {formatNumber(c.tokens || (c.inputTokens || 0) + (c.outputTokens || 0))}
                                </td>
                                <td className="py-2 px-2 text-right text-amber-500 font-semibold">
                                  {formatCost(c.cost)}
                                </td>
                                <td className="py-2 px-2 text-right text-slate-600 dark:text-zinc-400">
                                  {formatNumber(c.sessions)}
                                </td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    </div>
                  ) : (
                    <div className="py-8 text-center text-slate-400 dark:text-zinc-500 space-y-1">
                      <Users className="w-8 h-8 mx-auto text-slate-400/60" />
                      <p className="text-xs font-medium">{t('usage.clients.empty')}</p>
                    </div>
                  )}
                </div>
              )}
            </div>
          )}

          {/* TAB 3: GLOBAL STATS & DASHBOARD (omp stats) */}
          {activeTab === 'stats' && (
            <div className="space-y-4">
              {/* Stats Dashboard & Trace Action Card */}
              <div className="p-3.5 rounded-xl bg-surface border border-border space-y-3">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <BarChart3 className="w-4 h-4 text-emerald-500" />
                    <div>
                      <span className="text-xs font-semibold text-slate-900 dark:text-zinc-100 block">
                        {t('stats.dashboard.title')}
                      </span>
                      <span className="text-[10.5px] text-slate-500 dark:text-zinc-400 block">
                        {dashboardStatus.running && dashboardStatus.url
                          ? t('stats.dashboard.running', { url: dashboardStatus.url })
                          : t('stats.dashboard.desc')}
                      </span>
                    </div>
                  </div>

                  <div className="flex items-center gap-1.5">
                    {dashboardStatus.running ? (
                      <span className="flex items-center gap-1 px-2 py-0.5 rounded-full text-[10.5px] font-medium bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border border-emerald-500/20">
                        <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
                        Running
                      </span>
                    ) : (
                      <span className="px-2 py-0.5 rounded-full text-[10.5px] font-medium bg-slate-500/10 text-slate-500 border border-border">
                        Stopped
                      </span>
                    )}
                  </div>
                </div>

                <div className="flex items-center gap-2 pt-1">
                  <button
                    onClick={handleOpenDashboard}
                    disabled={isDashboardActionLoading}
                    className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium bg-emerald-600 hover:bg-emerald-700 text-white transition-colors cursor-pointer disabled:opacity-50"
                  >
                    <ExternalLink className={`w-3.5 h-3.5 ${isDashboardActionLoading ? 'animate-spin' : ''}`} />
                    <span>{t('stats.dashboard.open')}</span>
                  </button>

                  <button
                    onClick={handleTraceSession}
                    disabled={isTracing}
                    className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium bg-surface-highlight hover:bg-border text-slate-800 dark:text-zinc-200 border border-border transition-colors cursor-pointer disabled:opacity-50"
                    title={t('stats.trace.btn')}
                  >
                    <Play className={`w-3.5 h-3.5 text-blue-500 ${isTracing ? 'animate-spin' : ''}`} />
                    <span>{t('stats.trace.btn')}</span>
                  </button>

                  {dashboardStatus.running && (
                    <button
                      onClick={handleStopDashboard}
                      disabled={isDashboardActionLoading}
                      className="flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-xs font-medium bg-rose-500/10 hover:bg-rose-500/20 text-rose-600 dark:text-rose-400 border border-rose-500/20 transition-colors cursor-pointer ml-auto disabled:opacity-50"
                    >
                      <Square className="w-3 h-3" />
                      <span>{t('stats.dashboard.stop')}</span>
                    </button>
                  )}
                </div>
              </div>

              {globalStats?.overall ? (
                <>
                  {/* Overall Summary Cards */}
                  <div className="grid grid-cols-3 gap-2">
                    <div className="p-2.5 rounded-lg bg-surface border border-border flex flex-col">
                      <span className="text-[10.5px] text-slate-500 dark:text-zinc-400">{t('stats.totalRequests')}</span>
                      <span className="text-sm font-semibold font-mono text-slate-900 dark:text-zinc-100">
                        {formatNumber(globalStats.overall.totalRequests)}
                      </span>
                      <span className="text-[10px] text-slate-400 mt-0.5">
                        {t('stats.failedRequestsDetail', { count: formatNumber(globalStats.overall.failedRequests), rate: ((globalStats.overall.errorRate || 0) * 100).toFixed(1) })}
                      </span>
                    </div>

                    <div className="p-2.5 rounded-lg bg-surface border border-border flex flex-col">
                      <span className="text-[10.5px] text-slate-500 dark:text-zinc-400">{t('stats.session.totalTokens')}</span>
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
                  <p className="text-xs font-medium">{t('stats.noGlobalStats')}</p>
                  <p className="text-[11px]">{t('stats.noGlobalStatsDesc')}</p>
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
