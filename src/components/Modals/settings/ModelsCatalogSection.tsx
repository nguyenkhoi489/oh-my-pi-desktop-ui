import React, { useState, useCallback, useRef } from 'react';
import {
  Search,
  RefreshCw,
  Boxes,
  Copy,
  Check,
  Brain,
  Sparkles,
  Coins,
  AlertCircle,
} from 'lucide-react';
import type { OmpFoundModel } from '../../../types/index.ts';
import { useI18n } from '../../../i18n/I18nProvider.tsx';

export interface ModelsCatalogSectionProps {
  onRefreshModels?: () => Promise<unknown>;
}

const MAX_CATALOG_RESULTS = 50;

export const ModelsCatalogSection: React.FC<ModelsCatalogSectionProps> = React.memo(({ onRefreshModels }) => {
  const { t } = useI18n();

  // State for model catalog search (omp models find)
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [isSearching, setIsSearching] = useState<boolean>(false);
  const [foundModels, setFoundModels] = useState<OmpFoundModel[]>([]);
  const [hasSearched, setHasSearched] = useState<boolean>(false);
  const [searchError, setSearchError] = useState<string | null>(null);

  // State for catalog refresh (omp models refresh)
  const [isRefreshingCatalog, setIsRefreshingCatalog] = useState<boolean>(false);
  const [refreshSuccessMsg, setRefreshSuccessMsg] = useState<string | null>(null);

  // Copy selector state
  const [copiedSelector, setCopiedSelector] = useState<string | null>(null);
  const copyTimeoutRef = useRef<NodeJS.Timeout | null>(null);

  const handleCopySelector = useCallback((selector: string) => {
    if (navigator.clipboard) {
      navigator.clipboard.writeText(selector).catch(() => {});
    }
    setCopiedSelector(selector);
    if (copyTimeoutRef.current) {
      clearTimeout(copyTimeoutRef.current);
      copyTimeoutRef.current = null;
    }
    copyTimeoutRef.current = setTimeout(() => {
      setCopiedSelector(null);
    }, 2000);
  }, []);

  // Execute search
  const executeSearch = useCallback(async (query: string) => {
    const cleanQuery = query.trim();
    if (!cleanQuery) {
      setFoundModels([]);
      setHasSearched(false);
      setSearchError(null);
      return;
    }

    if (!window.electronAPI?.findModels) {
      setSearchError(t('settings.modelsCatalog.searchNotReady'));
      return;
    }

    setIsSearching(true);
    setSearchError(null);
    setHasSearched(true);

    try {
      const res = await window.electronAPI.findModels(cleanQuery);
      if (res.success && Array.isArray(res.models)) {
        setFoundModels(res.models);
      } else {
        setSearchError(res.error || t('settings.modelsCatalog.searchFailed'));
        setFoundModels([]);
      }
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      setSearchError(msg || t('settings.modelsCatalog.searchError'));
      setFoundModels([]);
    } finally {
      setIsSearching(false);
    }
  }, [t]);

  const handleSearchSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    executeSearch(searchQuery);
  };

  // Refresh upstream model catalog
  const handleRefreshCatalog = useCallback(async () => {
    if (!window.electronAPI?.runMaintenanceTask || isRefreshingCatalog) return;
    setIsRefreshingCatalog(true);
    setRefreshSuccessMsg(null);

    try {
      const res = await window.electronAPI.runMaintenanceTask('models-refresh', ['models', 'refresh']);
      if (res.success) {
        if (onRefreshModels) {
          await onRefreshModels().catch(() => {});
        }
        setRefreshSuccessMsg(t('settings.providers.refreshSuccess'));
        setTimeout(() => setRefreshSuccessMsg(null), 4000);
      } else {
        setSearchError(res.error || t('settings.modelsCatalog.refreshFailed'));
      }
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      setSearchError(msg || t('settings.modelsCatalog.refreshError'));
    } finally {
      setIsRefreshingCatalog(false);
    }
  }, [isRefreshingCatalog, onRefreshModels, t]);

  const displayedModels = foundModels.slice(0, MAX_CATALOG_RESULTS);

  return (
    <div className="space-y-4 pt-4 border-t border-border">
      {/* Header & Controls */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <h3 className="text-xs font-semibold text-slate-900 dark:text-zinc-100 flex items-center gap-1.5">
            <Boxes className="w-3.5 h-3.5 text-codex-accent" />
            <span>{t('settings.providers.modelsFindTitle')}</span>
          </h3>
          <p className="text-[11px] text-slate-500 dark:text-zinc-400">
            {t('settings.providers.modelsFindDesc')}
          </p>
        </div>

        <button
          type="button"
          onClick={handleRefreshCatalog}
          disabled={isRefreshingCatalog}
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium bg-surface hover:bg-surface-highlight text-slate-700 dark:text-zinc-300 border border-border transition-colors cursor-pointer disabled:opacity-50 shrink-0"
          title={t('settings.providers.refreshCatalog')}
        >
          <RefreshCw className={`w-3.5 h-3.5 ${isRefreshingCatalog ? 'animate-spin' : ''}`} />
          <span>{isRefreshingCatalog ? t('settings.providers.refreshingCatalog') : t('settings.providers.refreshCatalog')}</span>
        </button>
      </div>

      {refreshSuccessMsg && (
        <div className="p-3 bg-emerald-500/10 border border-emerald-500/30 rounded-xl flex items-center gap-2 text-xs text-emerald-600 dark:text-emerald-400 font-medium animate-fade-in">
          <Sparkles className="w-4 h-4 shrink-0" />
          <span>{refreshSuccessMsg}</span>
        </div>
      )}

      {/* Search Input Form */}
      <form onSubmit={handleSearchSubmit} className="flex items-center gap-2">
        <div className="relative flex-1">
          <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none" />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder={t('settings.providers.searchModelsPlaceholder')}
            className="w-full pl-9 pr-3 py-2 text-xs bg-surface border border-border rounded-xl text-slate-900 dark:text-zinc-100 placeholder-slate-400 focus:outline-none focus:border-codex-accent focus:ring-1 focus:ring-codex-accent transition-all"
          />
        </div>
        <button
          type="submit"
          disabled={isSearching || !searchQuery.trim()}
          className="flex items-center gap-1.5 px-4 py-2 bg-codex-accent hover:bg-codex-accent/90 text-white rounded-xl text-xs font-medium transition-colors cursor-pointer disabled:opacity-50 shrink-0"
        >
          <Search className="w-3.5 h-3.5" />
          <span>{isSearching ? t('settings.providers.searching') : t('settings.providers.searchBtn')}</span>
        </button>
      </form>

      {/* Error Message */}
      {searchError && (
        <div className="p-3 bg-rose-500/10 border border-rose-500/20 rounded-xl flex items-center gap-2 text-xs text-rose-600 dark:text-rose-400">
          <AlertCircle className="w-4 h-4 shrink-0" />
          <span>{searchError}</span>
        </div>
      )}

      {/* Results Container */}
      {hasSearched ? (
        displayedModels.length > 0 ? (
          <div className="space-y-2">
            <div className="flex items-center justify-between text-[11px] text-slate-500 dark:text-zinc-400 px-1">
              <span>
                {t('settings.modelsCatalog.foundCount', { count: foundModels.length })}
                {foundModels.length > MAX_CATALOG_RESULTS ? t('settings.modelsCatalog.foundTruncated', { max: MAX_CATALOG_RESULTS }) : ''}
              </span>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-2.5 max-h-[420px] overflow-y-auto pr-1">
              {displayedModels.map((m) => {
                const isCopied = copiedSelector === m.selector;
                return (
                  <div
                    key={`${m.provider}-${m.id}`}
                    className="p-3 rounded-xl border border-border bg-surface/30 hover:bg-surface/60 transition-colors flex flex-col justify-between space-y-2.5 text-left"
                  >
                    <div>
                      {/* Provider & Selector */}
                      <div className="flex items-start justify-between gap-2">
                        <div className="space-y-0.5">
                          <div className="flex items-center gap-1.5 flex-wrap">
                            <span className="font-semibold text-xs text-slate-900 dark:text-zinc-100">
                              {m.name || m.id}
                            </span>
                            {m.reasoning && (
                              <span className="px-1.5 py-0.2 rounded text-[10px] font-medium bg-purple-500/10 text-purple-600 dark:text-purple-400 border border-purple-500/20 flex items-center gap-1">
                                <Brain className="w-2.5 h-2.5" />
                                <span>Reasoning</span>
                              </span>
                            )}
                          </div>
                          <div className="font-mono text-[11px] text-slate-500 dark:text-zinc-400">
                            {m.selector}
                          </div>
                        </div>

                        {/* Copy Selector Action */}
                        <button
                          type="button"
                          onClick={() => handleCopySelector(m.selector)}
                          className="p-1.5 rounded-lg hover:bg-surface-highlight text-slate-400 hover:text-slate-800 dark:hover:text-zinc-200 transition-colors cursor-pointer shrink-0"
                          title={t('settings.providers.copySelector')}
                        >
                          {isCopied ? (
                            <Check className="w-3.5 h-3.5 text-emerald-500" />
                          ) : (
                            <Copy className="w-3.5 h-3.5" />
                          )}
                        </button>
                      </div>
                    </div>

                    {/* Metadata: Context, Max Tokens, Cost */}
                    <div className="pt-2 border-t border-border/50 flex flex-wrap items-center justify-between gap-2 text-[10.5px]">
                      <div className="flex items-center gap-2 text-slate-500 dark:text-zinc-400">
                        {m.contextWindow && (
                          <span className="px-1.5 py-0.5 rounded bg-surface border border-border font-mono">
                            {t('settings.providers.contextWindow', {
                              count: Math.round(m.contextWindow / 1000),
                            })}
                          </span>
                        )}
                        {m.maxTokens && (
                          <span className="px-1.5 py-0.5 rounded bg-surface border border-border font-mono">
                            {t('settings.providers.maxTokens', {
                              count: Math.round(m.maxTokens / 1000),
                            })}
                          </span>
                        )}
                      </div>

                      {m.cost && (
                        <div className="flex items-center gap-1 text-slate-600 dark:text-zinc-300 font-mono">
                          <Coins className="w-3 h-3 text-amber-500" />
                          <span>
                            {m.cost.input !== undefined ? t('settings.providers.costIn', { cost: m.cost.input }) : ''}
                            {m.cost.output !== undefined ? ` · ${t('settings.providers.costOut', { cost: m.cost.output })}` : ''}
                          </span>
                        </div>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        ) : (
          <div className="p-6 bg-surface/30 rounded-xl border border-dashed border-border text-center text-xs text-slate-500 dark:text-zinc-400">
            {t('settings.providers.searchEmpty', { query: searchQuery })}
          </div>
        )
      ) : (
        <div className="p-4 bg-surface/20 rounded-xl border border-border text-center text-xs text-slate-400 dark:text-zinc-500">
          {t('settings.providers.searchNoQuery')}
        </div>
      )}
    </div>
  );
});
