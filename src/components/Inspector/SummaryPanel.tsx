import React, { memo, useState, useCallback } from 'react';
import {
  Gauge,
  Activity,
  Cpu,
  Folder,
  MessageSquare,
  RefreshCw,
  Coins,
  Layers,
  Sparkles,
} from 'lucide-react';
import { useI18n } from '../../i18n/I18nProvider';
import type { OmpContextUsage, OmpSessionStats } from '../../types';

export interface SummaryPanelProps {
  contextUsage?: OmpContextUsage | null;
  tokensPerSecond?: number | null;
  sessionStats?: OmpSessionStats | null;
  onRefreshStats?: () => Promise<unknown>;
  model?: string;
  workspacePath?: string;
  className?: string;
}

function formatTokens(count: number): string {
  if (count >= 1_000_000) {
    return `${(count / 1_000_000).toFixed(1)}M`;
  }
  if (count >= 1_000) {
    return `${(count / 1_000).toFixed(1)}k`;
  }
  return String(count);
}

export const SummaryPanel: React.FC<SummaryPanelProps> = memo(function SummaryPanel({
  contextUsage,
  tokensPerSecond,
  sessionStats,
  onRefreshStats,
  model,
  workspacePath,
  className = '',
}) {
  const { t } = useI18n();
  const [isRefreshing, setIsRefreshing] = useState<boolean>(false);

  const handleRefresh = useCallback(async () => {
    if (!onRefreshStats || isRefreshing) return;
    setIsRefreshing(true);
    try {
      await onRefreshStats();
    } finally {
      setIsRefreshing(false);
    }
  }, [onRefreshStats, isRefreshing]);

  const effectiveContext = sessionStats?.contextUsage || contextUsage;
  const percent =
    typeof effectiveContext?.percent === 'number' && !Number.isNaN(effectiveContext.percent)
      ? Math.round(effectiveContext.percent * 10) / 10
      : null;

  const tokens = effectiveContext?.tokens;
  const contextWindow = effectiveContext?.contextWindow;

  const getMeterColor = (pct: number) => {
    if (pct > 85) return 'bg-rose-500 text-rose-500';
    if (pct > 65) return 'bg-amber-500 text-amber-500';
    return 'bg-emerald-500 text-emerald-500';
  };

  const meterColor = percent !== null ? getMeterColor(percent) : 'bg-slate-400 text-slate-400';

  const tokenUsage = sessionStats?.tokens;
  const totalMessages =
    sessionStats?.totalMessages ??
    (sessionStats?.userMessages != null
      ? sessionStats.userMessages + (sessionStats.assistantMessages ?? 0)
      : undefined);

  return (
    <div className={`flex flex-col h-full w-full bg-background overflow-y-auto p-4 select-none ${className}`}>
      {/* Header Bar */}
      <div className="flex items-center justify-between pb-3 mb-4 border-b border-border">
        <div className="flex items-center gap-2">
          <Gauge className="w-4 h-4 text-accent" />
          <h2 className="text-xs font-semibold uppercase tracking-wider text-slate-700 dark:text-zinc-300">
            {t('summary.title')}
          </h2>
        </div>
        {onRefreshStats && (
          <button
            type="button"
            onClick={handleRefresh}
            disabled={isRefreshing}
            title={t('summary.refreshStats')}
            className="p-1.5 rounded-lg hover:bg-surface-highlight text-slate-500 dark:text-zinc-400 hover:text-accent transition-colors disabled:opacity-50"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${isRefreshing ? 'animate-spin' : ''}`} />
          </button>
        )}
      </div>

      {/* Context Window Usage Card */}
      <div className="bg-surface rounded-xl border border-border p-3.5 mb-3 shadow-xs">
        <div className="flex items-center justify-between mb-2">
          <span className="text-xs font-medium text-slate-600 dark:text-zinc-400">
            {t('summary.contextUsage')}
          </span>
          <span className="text-xs font-semibold text-slate-800 dark:text-zinc-200">
            {percent !== null ? `${percent}%` : '—'}
          </span>
        </div>

        {/* Progress Bar */}
        <div className="w-full h-2 bg-surface-highlight rounded-full overflow-hidden mb-3">
          <div
            className={`h-full transition-all duration-300 ${meterColor.split(' ')[0]}`}
            style={{ width: `${Math.min(100, Math.max(0, percent ?? 0))}%` }}
          />
        </div>

        {/* Token Metrics Row */}
        <div className="grid grid-cols-2 gap-2 text-xs">
          <div className="bg-surface-highlight/50 rounded-lg p-2">
            <div className="text-[11px] text-slate-500 dark:text-zinc-400">
              {t('summary.tokensUsed')}
            </div>
            <div className="text-sm font-semibold font-mono text-slate-800 dark:text-zinc-200 mt-0.5">
              {typeof tokens === 'number' ? formatTokens(tokens) : '—'}
            </div>
          </div>
          <div className="bg-surface-highlight/50 rounded-lg p-2">
            <div className="text-[11px] text-slate-500 dark:text-zinc-400">
              {t('summary.contextWindow')}
            </div>
            <div className="text-sm font-semibold font-mono text-slate-800 dark:text-zinc-200 mt-0.5">
              {typeof contextWindow === 'number' ? formatTokens(contextWindow) : '—'}
            </div>
          </div>
        </div>
      </div>

      {/* Processing Speed & Performance */}
      <div className="bg-surface rounded-xl border border-border p-3.5 mb-3 shadow-xs">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Activity className="w-4 h-4 text-indigo-500" />
            <span className="text-xs font-medium text-slate-600 dark:text-zinc-400">
              {t('summary.tokensPerSecond')}
            </span>
          </div>
          <span className="text-xs font-semibold font-mono text-slate-800 dark:text-zinc-200">
            {typeof tokensPerSecond === 'number'
              ? t('summary.speedUnit', { speed: tokensPerSecond.toFixed(1) })
              : '—'}
          </span>
        </div>
      </div>

      {/* Session Metadata Card */}
      <div className="bg-surface rounded-xl border border-border p-3.5 mb-3 shadow-xs space-y-2.5">
        {/* Model */}
        {model && (
          <div className="flex items-center justify-between text-xs">
            <div className="flex items-center gap-2 text-slate-500 dark:text-zinc-400">
              <Cpu className="w-3.5 h-3.5" />
              <span>{t('summary.activeModel')}</span>
            </div>
            <span className="font-mono font-medium text-slate-800 dark:text-zinc-200 truncate max-w-[180px]">
              {model}
            </span>
          </div>
        )}

        {/* Workspace */}
        {workspacePath && (
          <div className="flex items-center justify-between text-xs">
            <div className="flex items-center gap-2 text-slate-500 dark:text-zinc-400">
              <Folder className="w-3.5 h-3.5" />
              <span>{t('summary.workspace')}</span>
            </div>
            <span
              title={workspacePath}
              className="font-mono text-slate-800 dark:text-zinc-200 truncate max-w-[180px]"
            >
              {workspacePath.split('/').pop() || workspacePath}
            </span>
          </div>
        )}

        {/* Message Count */}
        {typeof totalMessages === 'number' && (
          <div className="flex items-center justify-between text-xs">
            <div className="flex items-center gap-2 text-slate-500 dark:text-zinc-400">
              <MessageSquare className="w-3.5 h-3.5" />
              <span>{t('summary.messagesCount')}</span>
            </div>
            <span className="font-mono font-semibold text-slate-800 dark:text-zinc-200">
              {totalMessages}
            </span>
          </div>
        )}
      </div>

      {/* Detailed Token Breakdown (if available) */}
      {tokenUsage && (
        <div className="bg-surface rounded-xl border border-border p-3.5 shadow-xs">
          <div className="flex items-center gap-1.5 mb-2.5">
            <Coins className="w-3.5 h-3.5 text-amber-500" />
            <span className="text-xs font-semibold text-slate-700 dark:text-zinc-300">
              {t('summary.tokenBreakdown')}
            </span>
          </div>
          <div className="space-y-1.5 text-[11px]">
            {typeof tokenUsage.input === 'number' && (
              <div className="flex justify-between text-slate-600 dark:text-zinc-400">
                <span className="flex items-center gap-1.5">
                  <Layers className="w-3 h-3 text-blue-500" />
                  {t('summary.inputTokens')}
                </span>
                <span className="font-mono">{formatTokens(tokenUsage.input)}</span>
              </div>
            )}
            {typeof tokenUsage.output === 'number' && (
              <div className="flex justify-between text-slate-600 dark:text-zinc-400">
                <span className="flex items-center gap-1.5">
                  <Sparkles className="w-3 h-3 text-emerald-500" />
                  {t('summary.outputTokens')}
                </span>
                <span className="font-mono">{formatTokens(tokenUsage.output)}</span>
              </div>
            )}
            {typeof tokenUsage.reasoning === 'number' && tokenUsage.reasoning > 0 && (
              <div className="flex justify-between text-slate-600 dark:text-zinc-400">
                <span className="flex items-center gap-1.5">
                  <Cpu className="w-3 h-3 text-purple-500" />
                  {t('summary.reasoningTokens')}
                </span>
                <span className="font-mono">{formatTokens(tokenUsage.reasoning)}</span>
              </div>
            )}
            {typeof tokenUsage.cacheRead === 'number' && tokenUsage.cacheRead > 0 && (
              <div className="flex justify-between text-slate-600 dark:text-zinc-400">
                <span>{t('summary.cacheReadTokens')}</span>
                <span className="font-mono">{formatTokens(tokenUsage.cacheRead)}</span>
              </div>
            )}
            {typeof tokenUsage.cacheWrite === 'number' && tokenUsage.cacheWrite > 0 && (
              <div className="flex justify-between text-slate-600 dark:text-zinc-400">
                <span>{t('summary.cacheWriteTokens')}</span>
                <span className="font-mono">{formatTokens(tokenUsage.cacheWrite)}</span>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
});
