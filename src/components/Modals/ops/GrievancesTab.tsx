import React, { useState, useEffect, useCallback, useMemo } from 'react';
import {
  AlertCircle,
  RefreshCw,
  Search,
  Trash2,
  Send,
  Wrench,
  AlertTriangle,
  CheckCircle2,
  ChevronDown,
  ChevronUp,
  X,
  Filter,
  ExternalLink,
  ShieldAlert,
} from 'lucide-react';
import { useI18n } from '../../../i18n/I18nProvider.tsx';
import type {
  GrievanceItem,
  GrievancesListOptions,
  GrievancesListResponse,
  GrievancesCleanOptions,
  GrievancesCleanResponse,
  GrievancesPushResponse,
} from '../../../types/index.ts';

interface GrievancesTabProps {
  listGrievances?: (options?: GrievancesListOptions) => Promise<GrievancesListResponse>;
  cleanGrievances?: (options: GrievancesCleanOptions) => Promise<GrievancesCleanResponse>;
  pushGrievances?: (options?: { profile?: string | null }) => Promise<GrievancesPushResponse>;
}

export const GrievancesTab: React.FC<GrievancesTabProps> = React.memo(({
  listGrievances: listGrievancesProp,
  cleanGrievances: cleanGrievancesProp,
  pushGrievances: pushGrievancesProp,
}) => {
  const { t } = useI18n();

  const listGrievancesRunner = listGrievancesProp || window.electronAPI?.listGrievances;
  const cleanGrievancesRunner = cleanGrievancesProp || window.electronAPI?.cleanGrievances;
  const pushGrievancesRunner = pushGrievancesProp || window.electronAPI?.pushGrievances;

  // Grievance list data and endpoint
  const [grievances, setGrievances] = useState<GrievanceItem[]>([]);
  const [endpoint, setEndpoint] = useState<string>('https://qa.omp.sh/v1/grievances');
  const [isLoading, setIsLoading] = useState<boolean>(false);
  const [fetchError, setFetchError] = useState<string | null>(null);
  const [feedback, setFeedback] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  // Filters and search
  const [selectedTool, setSelectedTool] = useState<string>('all');
  const [searchQuery, setSearchQuery] = useState<string>('');

  // Expanded report rows state
  const [expandedIds, setExpandedIds] = useState<Set<number>>(new Set());

  // Confirmation modals state
  const [confirmDeleteId, setConfirmDeleteId] = useState<number | null>(null);
  const [isDeletingId, setIsDeletingId] = useState<boolean>(false);
  const [showCleanAllConfirm, setShowCleanAllConfirm] = useState<boolean>(false);
  const [isCleaningAll, setIsCleaningAll] = useState<boolean>(false);
  const [showCleanToolConfirm, setShowCleanToolConfirm] = useState<boolean>(false);
  const [isCleaningTool, setIsCleaningTool] = useState<boolean>(false);
  const [showPushConfirm, setShowPushConfirm] = useState<boolean>(false);
  const [isPushing, setIsPushing] = useState<boolean>(false);

  // Fetch grievances list from backend
  const fetchGrievances = useCallback(async () => {
    if (!listGrievancesRunner) {
      setFetchError(t('ops.grievances.error.unavailable'));
      return;
    }

    setIsLoading(true);
    setFetchError(null);

    try {
      const opts: GrievancesListOptions = {
        limit: 200,
        tool: selectedTool !== 'all' ? selectedTool : undefined,
      };
      const res = await listGrievancesRunner(opts);
      if (res.success && res.grievances) {
        setGrievances(res.grievances);
        if (res.endpoint) {
          setEndpoint(res.endpoint);
        }
      } else {
        setFetchError(res.error || t('ops.grievances.error.fetchFailed'));
      }
    } catch (err: any) {
      setFetchError(err?.message || t('ops.grievances.error.fetchFailedConn'));
    } finally {
      setIsLoading(false);
    }
  }, [listGrievancesRunner, selectedTool, t]);

  useEffect(() => {
    fetchGrievances();
  }, [fetchGrievances]);

  // Unique tool names from grievance data
  const availableTools = useMemo(() => {
    const toolsSet = new Set<string>();
    grievances.forEach((item) => {
      if (item.tool) toolsSet.add(item.tool);
    });
    return Array.from(toolsSet).sort();
  }, [grievances]);

  // Filter list by search query
  const filteredGrievances = useMemo(() => {
    let result = grievances;

    if (searchQuery.trim()) {
      const query = searchQuery.trim().toLowerCase();
      result = result.filter(
        (item) =>
          item.id.toString().includes(query) ||
          item.tool.toLowerCase().includes(query) ||
          item.model.toLowerCase().includes(query) ||
          item.version.toLowerCase().includes(query) ||
          item.report.toLowerCase().includes(query)
      );
    }

    return result.slice(0, 200);
  }, [grievances, searchQuery]);

  // Toggle expanded report row
  const toggleExpand = useCallback((id: number) => {
    setExpandedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });
  }, []);

  // Delete single grievance by ID
  const handleDeleteSingle = useCallback(async () => {
    if (!cleanGrievancesRunner || confirmDeleteId === null || isDeletingId) return;

    setIsDeletingId(true);
    setFeedback(null);

    try {
      const res = await cleanGrievancesRunner({ id: confirmDeleteId });
      if (res.success) {
        setFeedback({
          type: 'success',
          text: t('ops.grievances.success.deleted', { id: confirmDeleteId }),
        });
        setConfirmDeleteId(null);
        await fetchGrievances();
      } else {
        setFeedback({
          type: 'error',
          text: res.error || t('ops.grievances.error.deleteFailed'),
        });
      }
    } catch (err: any) {
      setFeedback({
        type: 'error',
        text: err?.message || t('ops.grievances.error.deleteFailed'),
      });
    } finally {
      setIsDeletingId(false);
    }
  }, [cleanGrievancesRunner, confirmDeleteId, isDeletingId, fetchGrievances, t]);

  // Clean all grievances for selected tool
  const handleCleanTool = useCallback(async () => {
    if (!cleanGrievancesRunner || selectedTool === 'all' || isCleaningTool) return;

    setIsCleaningTool(true);
    setFeedback(null);

    try {
      const res = await cleanGrievancesRunner({ tool: selectedTool });
      if (res.success) {
        setFeedback({
          type: 'success',
          text: t('ops.grievances.success.cleaned'),
        });
        setShowCleanToolConfirm(false);
        await fetchGrievances();
      } else {
        setFeedback({
          type: 'error',
          text: res.error || t('ops.grievances.error.cleanToolFailed'),
        });
      }
    } catch (err: any) {
      setFeedback({
        type: 'error',
        text: err?.message || t('ops.grievances.error.cleanToolFailed'),
      });
    } finally {
      setIsCleaningTool(false);
    }
  }, [cleanGrievancesRunner, selectedTool, isCleaningTool, fetchGrievances, t]);

  // Clean all grievances
  const handleCleanAll = useCallback(async () => {
    if (!cleanGrievancesRunner || isCleaningAll) return;

    setIsCleaningAll(true);
    setFeedback(null);

    try {
      const res = await cleanGrievancesRunner({ all: true });
      if (res.success) {
        setFeedback({
          type: 'success',
          text: t('ops.grievances.success.cleaned'),
        });
        setShowCleanAllConfirm(false);
        await fetchGrievances();
      } else {
        setFeedback({
          type: 'error',
          text: res.error || t('ops.grievances.error.cleanAllFailed'),
        });
      }
    } catch (err: any) {
      setFeedback({
        type: 'error',
        text: err?.message || t('ops.grievances.error.cleanAllFailed'),
      });
    } finally {
      setIsCleaningAll(false);
    }
  }, [cleanGrievancesRunner, isCleaningAll, fetchGrievances, t]);

  // Push QA report
  const handlePush = useCallback(async () => {
    if (!pushGrievancesRunner || isPushing) return;

    setIsPushing(true);
    setFeedback(null);

    try {
      const res = await pushGrievancesRunner();
      if (res.success) {
        setFeedback({
          type: 'success',
          text: res.message || t('ops.grievances.success.pushed'),
        });
        setShowPushConfirm(false);
        await fetchGrievances();
      } else {
        setFeedback({
          type: 'error',
          text: res.error || t('ops.grievances.error.pushFailed'),
        });
      }
    } catch (err: any) {
      setFeedback({
        type: 'error',
        text: err?.message || t('ops.grievances.error.pushFailed'),
      });
    } finally {
      setIsPushing(false);
    }
  }, [pushGrievancesRunner, isPushing, fetchGrievances, t]);

  const activeGrievanceToDelete = useMemo(() => {
    if (confirmDeleteId === null) return null;
    return grievances.find((g) => g.id === confirmDeleteId) || null;
  }, [confirmDeleteId, grievances]);

  return (
    <div className="space-y-4">
      {/* Title & Introduction */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-3 border-b border-border">
        <div>
          <h3 className="text-sm font-semibold text-slate-900 dark:text-zinc-100 flex items-center gap-2">
            <Wrench className="w-4 h-4 text-amber-500" />
            <span>{t('ops.grievances.title')}</span>
          </h3>
          <p className="text-xs text-slate-500 dark:text-zinc-400 mt-0.5">
            {t('ops.grievances.desc')}
          </p>
        </div>

        {/* Main action buttons */}
        <div className="flex items-center gap-2 shrink-0">
          <button
            type="button"
            onClick={fetchGrievances}
            disabled={isLoading}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium bg-surface hover:bg-surface-highlight text-slate-700 dark:text-zinc-300 border border-border transition-colors cursor-pointer disabled:opacity-50"
            title={t('ops.grievances.btn.refresh')}
          >
            <RefreshCw className={`w-3.5 h-3.5 ${isLoading ? 'animate-spin' : ''}`} />
            <span>{t('ops.grievances.btn.refresh')}</span>
          </button>

          <button
            type="button"
            onClick={() => setShowPushConfirm(true)}
            disabled={isLoading || grievances.length === 0}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium bg-blue-600 hover:bg-blue-700 text-white shadow-xs transition-colors cursor-pointer disabled:opacity-50"
            title={t('ops.grievances.btn.push')}
          >
            <Send className="w-3.5 h-3.5" />
            <span>{t('ops.grievances.btn.push')}</span>
          </button>

          {selectedTool !== 'all' && (
            <button
              type="button"
              onClick={() => setShowCleanToolConfirm(true)}
              disabled={isLoading || filteredGrievances.length === 0}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium bg-amber-600 hover:bg-amber-700 text-white shadow-xs transition-colors cursor-pointer disabled:opacity-50"
            >
              <Trash2 className="w-3.5 h-3.5" />
              <span>{t('ops.grievances.btn.cleanTool')}</span>
            </button>
          )}

          <button
            type="button"
            onClick={() => setShowCleanAllConfirm(true)}
            disabled={isLoading || grievances.length === 0}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium bg-rose-600 hover:bg-rose-700 text-white shadow-xs transition-colors cursor-pointer disabled:opacity-50"
          >
            <Trash2 className="w-3.5 h-3.5" />
            <span>{t('ops.grievances.btn.cleanAll')}</span>
          </button>
        </div>
      </div>

      {/* Feedback notification */}
      {feedback && (
        <div
          className={`flex items-start justify-between p-3 rounded-xl border text-xs animate-fade-in ${
            feedback.type === 'success'
              ? 'bg-emerald-50 dark:bg-emerald-950/40 border-emerald-200 dark:border-emerald-800 text-emerald-800 dark:text-emerald-200'
              : 'bg-rose-50 dark:bg-rose-950/40 border-rose-200 dark:border-rose-800 text-rose-800 dark:text-rose-200'
          }`}
        >
          <div className="flex items-center gap-2">
            {feedback.type === 'success' ? (
              <CheckCircle2 className="w-4 h-4 shrink-0 text-emerald-500" />
            ) : (
              <AlertCircle className="w-4 h-4 shrink-0 text-rose-500" />
            )}
            <span>{feedback.text}</span>
          </div>
          <button
            type="button"
            onClick={() => setFeedback(null)}
            className="p-1 rounded hover:bg-black/5 dark:hover:bg-white/5 cursor-pointer"
          >
            <X className="w-3.5 h-3.5" />
          </button>
        </div>
      )}

      {/* Data fetch error */}
      {fetchError && (
        <div className="flex items-center gap-2 p-3 rounded-xl bg-rose-50 dark:bg-rose-950/40 border border-rose-200 dark:border-rose-800 text-rose-700 dark:text-rose-300 text-xs">
          <AlertCircle className="w-4 h-4 shrink-0" />
          <span>{fetchError}</span>
        </div>
      )}

      {/* Filter & search bar */}
      <div className="flex flex-col sm:flex-row items-center gap-2.5">
        <div className="relative flex-1 w-full">
          <Search className="w-3.5 h-3.5 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 dark:text-zinc-500" />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder={t('ops.grievances.filter.searchPlaceholder')}
            className="w-full pl-9 pr-8 py-1.5 rounded-lg text-xs bg-surface border border-border focus:border-codex-accent focus:outline-hidden text-slate-900 dark:text-zinc-100 placeholder-slate-400 dark:placeholder-zinc-500 transition-colors"
          />
          {searchQuery && (
            <button
              type="button"
              onClick={() => setSearchQuery('')}
              className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 dark:hover:text-zinc-200 cursor-pointer"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          )}
        </div>

        {/* Tool selector */}
        <div className="flex items-center gap-1.5 w-full sm:w-auto">
          <Filter className="w-3.5 h-3.5 text-slate-400 dark:text-zinc-500 shrink-0" />
          <select
            value={selectedTool}
            onChange={(e) => setSelectedTool(e.target.value)}
            className="w-full sm:w-44 py-1.5 px-2.5 rounded-lg text-xs bg-surface border border-border focus:border-codex-accent focus:outline-hidden text-slate-900 dark:text-zinc-100 cursor-pointer transition-colors"
          >
            <option value="all">
              {t('ops.grievances.filter.allTools', { count: grievances.length })}
            </option>
            {availableTools.map((tool) => (
              <option key={tool} value={tool}>
                {tool}
              </option>
            ))}
          </select>
        </div>
      </div>

      {/* Count info */}
      <div className="flex items-center justify-between text-[11px] text-slate-500 dark:text-zinc-400 px-1">
        <span>{t('ops.grievances.count.total', { count: grievances.length })}</span>
        {searchQuery.trim() && (
          <span>{t('ops.grievances.count.filtered', { count: filteredGrievances.length })}</span>
        )}
      </div>

      {/* Grievances list table */}
      {filteredGrievances.length === 0 ? (
        <div className="flex flex-col items-center justify-center p-8 rounded-xl border border-dashed border-border text-center">
          <AlertCircle className="w-8 h-8 text-slate-300 dark:text-zinc-600 mb-2" />
          <h4 className="text-xs font-semibold text-slate-700 dark:text-zinc-300">
            {grievances.length === 0
              ? t('ops.grievances.empty.title')
              : t('ops.grievances.empty.filtered')}
          </h4>
          <p className="text-[11px] text-slate-500 dark:text-zinc-400 mt-1 max-w-sm">
            {grievances.length === 0
              ? t('ops.grievances.empty.desc')
              : t('ops.grievances.empty.filtered')}
          </p>
        </div>
      ) : (
        <div className="border border-border rounded-xl overflow-hidden bg-surface/30">
          <div className="overflow-x-auto max-h-[480px]">
            <table className="w-full text-left text-xs border-collapse">
              <thead className="bg-surface/80 border-b border-border sticky top-0 z-10 backdrop-blur-xs">
                <tr>
                  <th className="py-2.5 px-3 font-semibold text-slate-700 dark:text-zinc-300 w-16">
                    {t('ops.grievances.col.id')}
                  </th>
                  <th className="py-2.5 px-3 font-semibold text-slate-700 dark:text-zinc-300 w-28">
                    {t('ops.grievances.col.tool')}
                  </th>
                  <th className="py-2.5 px-3 font-semibold text-slate-700 dark:text-zinc-300 w-44">
                    {t('ops.grievances.col.model')}
                  </th>
                  <th className="py-2.5 px-3 font-semibold text-slate-700 dark:text-zinc-300">
                    {t('ops.grievances.col.report')}
                  </th>
                  <th className="py-2.5 px-3 font-semibold text-slate-700 dark:text-zinc-300 text-right w-20">
                    {t('ops.grievances.col.actions')}
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {filteredGrievances.map((item) => {
                  const isExpanded = expandedIds.has(item.id);
                  const isLongReport = item.report.length > 120;

                  return (
                    <tr
                      key={item.id}
                      className="hover:bg-surface-highlight/40 transition-colors group"
                    >
                      <td className="py-2.5 px-3 align-top font-mono text-[11px] text-slate-500 dark:text-zinc-400">
                        #{item.id}
                      </td>
                      <td className="py-2.5 px-3 align-top">
                        <span className="inline-flex items-center px-2 py-0.5 rounded-md text-[11px] font-medium bg-amber-500/10 text-amber-600 dark:text-amber-400 border border-amber-500/20">
                          {item.tool || 'unknown'}
                        </span>
                      </td>
                      <td className="py-2.5 px-3 align-top">
                        <div className="flex flex-col gap-0.5">
                          <span className="font-mono text-[11px] text-slate-800 dark:text-zinc-200 truncate max-w-[170px]" title={item.model}>
                            {item.model}
                          </span>
                          {item.version && (
                            <span className="text-[10px] text-slate-400 dark:text-zinc-500">
                              v{item.version}
                            </span>
                          )}
                        </div>
                      </td>
                      <td className="py-2.5 px-3 align-top">
                        <div className="space-y-1">
                          <p className={`text-[11px] text-slate-700 dark:text-zinc-300 font-mono whitespace-pre-wrap break-words leading-relaxed ${
                            isExpanded ? '' : 'line-clamp-2'
                          }`}>
                            {item.report}
                          </p>
                          {isLongReport && (
                            <button
                              type="button"
                              onClick={() => toggleExpand(item.id)}
                              className="inline-flex items-center gap-1 text-[10px] text-codex-accent hover:underline cursor-pointer"
                            >
                              {isExpanded ? (
                                <>
                                  <ChevronUp className="w-3 h-3" />
                                  <span>{t('ops.grievances.btn.collapse')}</span>
                                </>
                              ) : (
                                <>
                                  <ChevronDown className="w-3 h-3" />
                                  <span>{t('ops.grievances.btn.expand')}</span>
                                </>
                              )}
                            </button>
                          )}
                        </div>
                      </td>
                      <td className="py-2.5 px-3 align-top text-right">
                        <button
                          type="button"
                          onClick={() => setConfirmDeleteId(item.id)}
                          className="p-1.5 rounded-lg text-slate-400 hover:text-rose-600 dark:hover:text-rose-400 hover:bg-rose-50 dark:hover:bg-rose-950/40 transition-colors cursor-pointer opacity-80 group-hover:opacity-100"
                          title={t('ops.grievances.btn.delete')}
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Confirm single delete modal */}
      {confirmDeleteId !== null && (
        <div className="fixed inset-0 z-60 flex items-center justify-center p-4 bg-black/60 backdrop-blur-xs animate-fade-in">
          <div className="w-full max-w-md bg-panel border border-border rounded-xl shadow-2xl p-5 space-y-4 animate-scale-in">
            <div className="flex items-start gap-3">
              <div className="p-2 rounded-xl bg-rose-500/10 text-rose-500 shrink-0">
                <AlertTriangle className="w-5 h-5" />
              </div>
              <div className="flex-1">
                <h4 className="text-sm font-semibold text-slate-900 dark:text-zinc-100">
                  {t('ops.grievances.delete.confirmTitle')}
                </h4>
                <p className="text-xs text-slate-500 dark:text-zinc-400 mt-1">
                  {t('ops.grievances.delete.confirmMsg', {
                    id: confirmDeleteId,
                    tool: activeGrievanceToDelete?.tool || 'unknown',
                  })}
                </p>
              </div>
            </div>

            <div className="flex items-center justify-end gap-2 pt-2 border-t border-border">
              <button
                type="button"
                onClick={() => setConfirmDeleteId(null)}
                disabled={isDeletingId}
                className="px-3 py-1.5 rounded-lg text-xs font-medium text-slate-600 dark:text-zinc-400 hover:bg-surface-highlight transition-colors cursor-pointer disabled:opacity-50"
              >
                {t('ops.grievances.btn.cancel')}
              </button>
              <button
                type="button"
                onClick={handleDeleteSingle}
                disabled={isDeletingId}
                className="flex items-center gap-1.5 px-3.5 py-1.5 rounded-lg text-xs font-medium bg-rose-600 hover:bg-rose-700 text-white shadow-xs transition-colors cursor-pointer disabled:opacity-50"
              >
                {isDeletingId ? (
                  <>
                    <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                    <span>{t('ops.grievances.status.deleting')}</span>
                  </>
                ) : (
                  <>
                    <Trash2 className="w-3.5 h-3.5" />
                    <span>{t('ops.grievances.btn.confirm')}</span>
                  </>
                )}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Confirm clean by tool modal */}
      {showCleanToolConfirm && (
        <div className="fixed inset-0 z-60 flex items-center justify-center p-4 bg-black/60 backdrop-blur-xs animate-fade-in">
          <div className="w-full max-w-md bg-panel border border-border rounded-xl shadow-2xl p-5 space-y-4 animate-scale-in">
            <div className="flex items-start gap-3">
              <div className="p-2 rounded-xl bg-amber-500/10 text-amber-500 shrink-0">
                <AlertTriangle className="w-5 h-5" />
              </div>
              <div className="flex-1">
                <h4 className="text-sm font-semibold text-slate-900 dark:text-zinc-100">
                  {t('ops.grievances.cleanTool.confirmTitle')}
                </h4>
                <p className="text-xs text-slate-500 dark:text-zinc-400 mt-1">
                  {t('ops.grievances.cleanTool.confirmMsg', {
                    tool: selectedTool,
                  })}
                </p>
              </div>
            </div>

            <div className="flex items-center justify-end gap-2 pt-2 border-t border-border">
              <button
                type="button"
                onClick={() => setShowCleanToolConfirm(false)}
                disabled={isCleaningTool}
                className="px-3 py-1.5 rounded-lg text-xs font-medium text-slate-600 dark:text-zinc-400 hover:bg-surface-highlight transition-colors cursor-pointer disabled:opacity-50"
              >
                {t('ops.grievances.btn.cancel')}
              </button>
              <button
                type="button"
                onClick={handleCleanTool}
                disabled={isCleaningTool}
                className="flex items-center gap-1.5 px-3.5 py-1.5 rounded-lg text-xs font-medium bg-amber-600 hover:bg-amber-700 text-white shadow-xs transition-colors cursor-pointer disabled:opacity-50"
              >
                {isCleaningTool ? (
                  <>
                    <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                    <span>{t('ops.grievances.status.cleaning')}</span>
                  </>
                ) : (
                  <>
                    <Trash2 className="w-3.5 h-3.5" />
                    <span>{t('ops.grievances.btn.confirm')}</span>
                  </>
                )}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Confirm clean all modal */}
      {showCleanAllConfirm && (
        <div className="fixed inset-0 z-60 flex items-center justify-center p-4 bg-black/60 backdrop-blur-xs animate-fade-in">
          <div className="w-full max-w-md bg-panel border border-border rounded-xl shadow-2xl p-5 space-y-4 animate-scale-in">
            <div className="flex items-start gap-3">
              <div className="p-2 rounded-xl bg-rose-500/10 text-rose-500 shrink-0">
                <AlertTriangle className="w-5 h-5" />
              </div>
              <div className="flex-1">
                <h4 className="text-sm font-semibold text-slate-900 dark:text-zinc-100">
                  {t('ops.grievances.cleanAll.confirmTitle')}
                </h4>
                <p className="text-xs text-slate-500 dark:text-zinc-400 mt-1">
                  {t('ops.grievances.cleanAll.confirmMsg', {
                    count: grievances.length,
                  })}
                </p>
              </div>
            </div>

            <div className="flex items-center justify-end gap-2 pt-2 border-t border-border">
              <button
                type="button"
                onClick={() => setShowCleanAllConfirm(false)}
                disabled={isCleaningAll}
                className="px-3 py-1.5 rounded-lg text-xs font-medium text-slate-600 dark:text-zinc-400 hover:bg-surface-highlight transition-colors cursor-pointer disabled:opacity-50"
              >
                {t('ops.grievances.btn.cancel')}
              </button>
              <button
                type="button"
                onClick={handleCleanAll}
                disabled={isCleaningAll}
                className="flex items-center gap-1.5 px-3.5 py-1.5 rounded-lg text-xs font-medium bg-rose-600 hover:bg-rose-700 text-white shadow-xs transition-colors cursor-pointer disabled:opacity-50"
              >
                {isCleaningAll ? (
                  <>
                    <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                    <span>{t('ops.grievances.status.cleaning')}</span>
                  </>
                ) : (
                  <>
                    <Trash2 className="w-3.5 h-3.5" />
                    <span>{t('ops.grievances.btn.confirm')}</span>
                  </>
                )}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Confirm Push QA report modal */}
      {showPushConfirm && (
        <div className="fixed inset-0 z-60 flex items-center justify-center p-4 bg-black/60 backdrop-blur-xs animate-fade-in">
          <div className="w-full max-w-lg bg-panel border border-border rounded-xl shadow-2xl p-5 space-y-4 animate-scale-in">
            <div className="flex items-start gap-3">
              <div className="p-2 rounded-xl bg-blue-500/10 text-blue-500 shrink-0">
                <ShieldAlert className="w-5 h-5" />
              </div>
              <div className="flex-1 space-y-2">
                <h4 className="text-sm font-semibold text-slate-900 dark:text-zinc-100">
                  {t('ops.grievances.push.confirmTitle')}
                </h4>
                <p className="text-xs text-slate-600 dark:text-zinc-300 leading-relaxed">
                  {t('ops.grievances.push.confirmMsg')}
                </p>

                {/* Data destination endpoint display */}
                <div className="p-2.5 rounded-lg bg-surface border border-border">
                  <div className="text-[11px] font-medium text-slate-500 dark:text-zinc-400 mb-1">
                    {t('ops.grievances.push.endpointLabel')}
                  </div>
                  <div className="flex items-center gap-1.5 font-mono text-xs text-codex-accent break-all">
                    <ExternalLink className="w-3.5 h-3.5 shrink-0" />
                    <span>{endpoint}</span>
                  </div>
                </div>

                <p className="text-[11px] text-amber-600 dark:text-amber-400 bg-amber-50 dark:bg-amber-950/30 p-2 rounded-lg border border-amber-200 dark:border-amber-800">
                  {t('ops.grievances.push.warning')}
                </p>
              </div>
            </div>

            <div className="flex items-center justify-end gap-2 pt-2 border-t border-border">
              <button
                type="button"
                onClick={() => setShowPushConfirm(false)}
                disabled={isPushing}
                className="px-3 py-1.5 rounded-lg text-xs font-medium text-slate-600 dark:text-zinc-400 hover:bg-surface-highlight transition-colors cursor-pointer disabled:opacity-50"
              >
                {t('ops.grievances.btn.cancel')}
              </button>
              <button
                type="button"
                onClick={handlePush}
                disabled={isPushing}
                className="flex items-center gap-1.5 px-3.5 py-1.5 rounded-lg text-xs font-medium bg-blue-600 hover:bg-blue-700 text-white shadow-xs transition-colors cursor-pointer disabled:opacity-50"
              >
                {isPushing ? (
                  <>
                    <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                    <span>{t('ops.grievances.status.pushing')}</span>
                  </>
                ) : (
                  <>
                    <Send className="w-3.5 h-3.5" />
                    <span>{t('ops.grievances.btn.confirm')}</span>
                  </>
                )}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
});
