import React, { useState, useMemo, useCallback, useEffect, useRef } from 'react';
import {
  Database,
  Trash2,
  Archive,
  RefreshCw,
  AlertTriangle,
  CheckCircle2,
  Sliders,
  AlertCircle,
  Play,
  FileCode2,
  ShieldAlert,
  Info,
  Image as ImageIcon,
  Stethoscope,
  Radio,
} from 'lucide-react';
import { useI18n } from '../../../i18n/I18nProvider.tsx';
import type {
  StorageGcOptions,
  StorageGcReport,
  StorageGcResponse,
  ImageBackendsAction,
  ImageBackendsOptions,
  ImageBackendsResponse,
  ImageStatusData,
  ImageDoctorData,
  ImageProbeData,
  ImagePurgeData,
} from '../../../types';

interface StorageTabProps {
  isStreaming?: boolean;
  runGc?: (options?: StorageGcOptions) => Promise<StorageGcResponse>;
  runImages?: (action?: ImageBackendsAction, options?: ImageBackendsOptions) => Promise<ImageBackendsResponse>;
}
// Format bytes to human readable format (KB, MB, GB)
function formatBytes(bytes: number): string {
  if (!bytes || bytes <= 0) return '0 B';
  const k = 1024;
  const sizes = ['B', 'KB', 'MB', 'GB', 'TB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return `${parseFloat((bytes / Math.pow(k, i)).toFixed(2))} ${sizes[i]}`;
}
export const StorageTab: React.FC<StorageTabProps> = ({
  isStreaming = false,
  runGc: runGcProp,
  runImages: runImagesProp,
}) => {
  const { t } = useI18n();
  const gcRunner = runGcProp || window.electronAPI?.runGc;
  const imagesRunner = runImagesProp || window.electronAPI?.runImages;
  // Form options
  const [blobs, setBlobs] = useState(true);
  const [archive, setArchive] = useState(true);
  const [wal, setWal] = useState(true);
  const [coldArchiveAfterDays, setColdArchiveAfterDays] = useState<string>('30');
  const [retainNewestGlobal, setRetainNewestGlobal] = useState<string>('20');
  const [retainNewestPerCwd, setRetainNewestPerCwd] = useState<string>('10');

  // Execution state
  const [isLoading, setIsLoading] = useState(false);
  const [activeAction, setActiveAction] = useState<'preview' | 'apply' | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [report, setReport] = useState<StorageGcReport | null>(null);
  const [previewedOptionsKey, setPreviewedOptionsKey] = useState<string | null>(null);
  const [showConfirmModal, setShowConfirmModal] = useState(false);

  // Cache key to compare current options with preview options
  const currentOptionsKey = useMemo(() => {
    return JSON.stringify({
      blobs,
      archive,
      wal,
      coldArchiveAfterDays: coldArchiveAfterDays ? parseInt(coldArchiveAfterDays, 10) : undefined,
      retainNewestGlobal: retainNewestGlobal ? parseInt(retainNewestGlobal, 10) : undefined,
      retainNewestPerCwd: retainNewestPerCwd ? parseInt(retainNewestPerCwd, 10) : undefined,
    });
  }, [blobs, archive, wal, coldArchiveAfterDays, retainNewestGlobal, retainNewestPerCwd]);

  const hasPreview = report !== null && report.apply === false;
  const isOptionsChangedSincePreview = hasPreview && previewedOptionsKey !== currentOptionsKey;

  const buildOptions = useCallback(
    (apply: boolean): StorageGcOptions => {
      const opts: StorageGcOptions = {
        apply,
        blobs,
        archive,
        wal,
      };
      if (coldArchiveAfterDays.trim()) {
        const days = parseInt(coldArchiveAfterDays, 10);
        if (!Number.isNaN(days) && days >= 0) {
          opts.coldArchiveAfterDays = days;
        }
      }
      if (retainNewestGlobal.trim()) {
        const globalNum = parseInt(retainNewestGlobal, 10);
        if (!Number.isNaN(globalNum) && globalNum >= 0) {
          opts.retainNewestGlobal = globalNum;
        }
      }
      if (retainNewestPerCwd.trim()) {
        const cwdNum = parseInt(retainNewestPerCwd, 10);
        if (!Number.isNaN(cwdNum) && cwdNum >= 0) {
          opts.retainNewestPerCwd = cwdNum;
        }
      }
      return opts;
    },
    [blobs, archive, wal, coldArchiveAfterDays, retainNewestGlobal, retainNewestPerCwd]
  );

  // Run Dry-run preview
  const handlePreview = async () => {
    if (isLoading) return;
    if (!gcRunner) {
      setError(t('ops.storage.gc.unavailable'));
      return;
    }
    setIsLoading(true);
    setActiveAction('preview');
    setError(null);

    try {
      const opts = buildOptions(false);
      const res: StorageGcResponse = await gcRunner(opts);
      if (res.success && res.report) {
        setReport(res.report);
        setPreviewedOptionsKey(currentOptionsKey);
      } else {
        setError(res.error || t('common.error.generic'));
      }
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      setError(msg);
    } finally {
      setIsLoading(false);
      setActiveAction(null);
    }
  };

  // Open apply confirmation modal
  const handleOpenApplyConfirm = () => {
    if (isStreaming) {
      setError(t('ops.storage.gc.busyWarning'));
      return;
    }
    if (!hasPreview || isOptionsChangedSincePreview) {
      setError(t('ops.storage.gc.requirePreview'));
      return;
    }
    setShowConfirmModal(true);
  };

  // Apply garbage collection (apply: true)
  const handleApply = async () => {
    setShowConfirmModal(false);
    if (isLoading) return;
    if (isStreaming) {
      setError(t('ops.storage.gc.busyWarning'));
      return;
    }
    if (!gcRunner) {
      setError(t('ops.storage.gc.unavailable'));
      return;
    }

    setIsLoading(true);
    setActiveAction('apply');
    setError(null);

    try {
      const opts = buildOptions(true);
      const res: StorageGcResponse = await gcRunner(opts);
      if (res.success && res.report) {
        setReport(res.report);
        setPreviewedOptionsKey(null);
      } else {
        setError(res.error || t('common.error.generic'));
      }
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      setError(msg);
    } finally {
      setIsLoading(false);
      setActiveAction(null);
    }
  };

  // Image Backends state (Phase 11)
  const imagesLoadingRef = useRef(false);
  const [imagesLoading, setImagesLoading] = useState(false);
  const [imagesAction, setImagesAction] = useState<'status' | 'doctor' | 'probe' | 'purge' | null>(null);
  const [imagesError, setImagesError] = useState<string | null>(null);
  const [statusData, setStatusData] = useState<ImageStatusData | null>(null);
  const [doctorData, setDoctorData] = useState<ImageDoctorData | null>(null);
  const [probeData, setProbeData] = useState<ImageProbeData | null>(null);
  const [purgeReport, setPurgeReport] = useState<ImagePurgeData | null>(null);
  const [previewedPurgeAll, setPreviewedPurgeAll] = useState<boolean | null>(null);
  const [probeTimeoutInput, setProbeTimeoutInput] = useState<string>('5');
  const [purgeAll, setPurgeAll] = useState(false);
  const [showPurgeConfirmModal, setShowPurgeConfirmModal] = useState(false);
  const [purgeNotice, setPurgeNotice] = useState<string | null>(null);

  const hasPurgePreview = purgeReport !== null && purgeReport.applied === false;
  const isPurgeOptionsChanged = hasPurgePreview && previewedPurgeAll !== purgeAll;

  const handleFetchStatus = useCallback(async () => {
    if (imagesLoadingRef.current) return;
    if (!imagesRunner) {
      setImagesError(t('ops.storage.images.unavailable'));
      return;
    }
    imagesLoadingRef.current = true;
    setImagesLoading(true);
    setImagesAction('status');
    setImagesError(null);
    try {
      const res = await imagesRunner('status');
      if (res.success && res.data) {
        setStatusData(res.data as ImageStatusData);
      } else {
        setImagesError(res.error || t('common.error.generic'));
      }
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      setImagesError(msg);
    } finally {
      imagesLoadingRef.current = false;
      setImagesLoading(false);
      setImagesAction(null);
    }
  }, [imagesRunner, t]);
  const handleRunDoctor = useCallback(async () => {
    if (imagesLoadingRef.current) return;
    if (!imagesRunner) {
      setImagesError(t('ops.storage.images.unavailable'));
      return;
    }
    imagesLoadingRef.current = true;
    setImagesLoading(true);
    setImagesAction('doctor');
    setImagesError(null);
    try {
      const res = await imagesRunner('doctor');
      if (res.success && res.data) {
        setDoctorData(res.data as ImageDoctorData);
      } else {
        setImagesError(res.error || t('common.error.generic'));
      }
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      setImagesError(msg);
    } finally {
      imagesLoadingRef.current = false;
      setImagesLoading(false);
      setImagesAction(null);
    }
  }, [imagesRunner, t]);

  const handleRunProbe = useCallback(async () => {
    if (imagesLoadingRef.current) return;
    if (!imagesRunner) {
      setImagesError(t('ops.storage.images.unavailable'));
      return;
    }
    imagesLoadingRef.current = true;
    setImagesLoading(true);
    setImagesAction('probe');
    setImagesError(null);
    try {
      const timeoutNum = parseInt(probeTimeoutInput, 10);
      const res = await imagesRunner('probe', {
        timeout: Number.isNaN(timeoutNum) ? 5 : timeoutNum,
      });
      if (res.success && res.data) {
        setProbeData(res.data as ImageProbeData);
      } else {
        setImagesError(res.error || t('common.error.generic'));
      }
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      setImagesError(msg);
    } finally {
      imagesLoadingRef.current = false;
      setImagesLoading(false);
      setImagesAction(null);
    }
  }, [imagesRunner, probeTimeoutInput, t]);

  const handlePurgeDryRun = useCallback(async () => {
    if (imagesLoadingRef.current) return;
    if (!imagesRunner) {
      setImagesError(t('ops.storage.images.unavailable'));
      return;
    }
    imagesLoadingRef.current = true;
    setImagesLoading(true);
    setImagesAction('purge');
    setImagesError(null);
    setPurgeNotice(null);
    try {
      const res = await imagesRunner('purge', {
        apply: false,
        all: purgeAll,
      });
      if (res.success && res.data) {
        setPurgeReport(res.data as ImagePurgeData);
        setPreviewedPurgeAll(purgeAll);
      } else {
        setImagesError(res.error || t('common.error.generic'));
      }
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      setImagesError(msg);
    } finally {
      imagesLoadingRef.current = false;
      setImagesLoading(false);
      setImagesAction(null);
    }
  }, [imagesRunner, purgeAll, t]);

  const handlePurgeApply = useCallback(async () => {
    if (imagesLoadingRef.current) return;
    if (!imagesRunner) {
      setImagesError(t('ops.storage.images.unavailable'));
      return;
    }
    setShowPurgeConfirmModal(false);
    imagesLoadingRef.current = true;
    setImagesLoading(true);
    setImagesAction('purge');
    setImagesError(null);
    try {
      const res = await imagesRunner('purge', {
        apply: true,
        all: purgeAll,
      });
      if (res.success && res.data) {
        const data = res.data as ImagePurgeData;
        setPurgeReport(data);
        setPreviewedPurgeAll(null);
        const deleted = data.providerFiles?.deleted ?? 0;
        const bytes = formatBytes(data.providerFiles?.bytes ?? 0);
        const errors = data.providerFiles?.errors ?? [];
        if (errors.length > 0) {
          setPurgeNotice(
            t('ops.storage.images.purge.partialSummary', {
              deleted,
              bytes,
              errorCount: errors.length,
            })
          );
        } else {
          setPurgeNotice(t('ops.storage.images.purge.deletedSummary', { deleted, bytes }));
        }
        // Refresh status after purge
        const statusRes = await imagesRunner('status');
        if (statusRes.success && statusRes.data) {
          setStatusData(statusRes.data as ImageStatusData);
        }
      } else {
        setImagesError(res.error || t('common.error.generic'));
      }
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      setImagesError(msg);
    } finally {
      imagesLoadingRef.current = false;
      setImagesLoading(false);
      setImagesAction(null);
    }
  }, [imagesRunner, purgeAll, t]);

  const isMountedRef = useRef(false);
  useEffect(() => {
    if (!isMountedRef.current) {
      isMountedRef.current = true;
      handleFetchStatus();
    }
  }, [handleFetchStatus]);

  // Calculate expected deletion metrics for confirmation modal
  const wouldDeleteBlobs = report?.blobs?.wouldDelete ?? 0;
  const wouldDeleteBytes = report?.blobs?.bytes ?? 0;
  const wouldArchiveSessions = report?.archive?.wouldArchive ?? 0;

  return (
    <div className="space-y-6">
      {/* GC Section Header */}
      <div className="flex items-start justify-between">
        <div>
          <h3 className="text-sm font-semibold text-slate-900 dark:text-zinc-100 flex items-center gap-2">
            <Database className="w-4 h-4 text-emerald-500" />
            <span>{t('ops.storage.gc.title')}</span>
          </h3>
          <p className="text-xs text-slate-500 dark:text-zinc-400 mt-1">
            {t('ops.storage.gc.desc')}
          </p>
        </div>
      </div>

      {/* Warning engine is streaming */}
      {isStreaming && (
        <div className="p-3 bg-amber-500/10 border border-amber-500/30 rounded-xl flex items-center gap-2.5 text-xs text-amber-600 dark:text-amber-400">
          <ShieldAlert className="w-4 h-4 shrink-0" />
          <span>{t('ops.storage.gc.busyWarning')}</span>
        </div>
      )}

      {/* Error banner if any */}
      {error && (
        <div className="p-3 bg-rose-500/10 border border-rose-500/30 rounded-xl flex items-start gap-2.5 text-xs text-rose-600 dark:text-rose-400">
          <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
          <span className="break-all">{error}</span>
        </div>
      )}

      {/* GC Options Form */}
      <div className="p-4 bg-surface rounded-xl border border-border space-y-4">
        <div className="flex items-center gap-2 text-xs font-semibold text-slate-800 dark:text-zinc-200">
          <Sliders className="w-3.5 h-3.5 text-codex-accent" />
          <span>{t('ops.storage.gc.optionsTitle')}</span>
        </div>

        {/* Checkboxes */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
          <label className="flex items-start gap-2.5 p-2.5 rounded-lg border border-border/60 hover:border-border cursor-pointer bg-background/40">
            <input
              type="checkbox"
              checked={blobs}
              onChange={(e) => setBlobs(e.target.checked)}
              className="mt-0.5 rounded border-slate-400 text-codex-accent focus:ring-codex-accent"
            />
            <div>
              <div className="text-xs font-medium text-slate-900 dark:text-zinc-100">
                {t('ops.storage.gc.opt.blobs')}
              </div>
              <div className="text-[11px] text-slate-500 dark:text-zinc-400 mt-0.5">
                {t('ops.storage.gc.opt.blobs.desc')}
              </div>
            </div>
          </label>

          <label className="flex items-start gap-2.5 p-2.5 rounded-lg border border-border/60 hover:border-border cursor-pointer bg-background/40">
            <input
              type="checkbox"
              checked={archive}
              onChange={(e) => setArchive(e.target.checked)}
              className="mt-0.5 rounded border-slate-400 text-codex-accent focus:ring-codex-accent"
            />
            <div>
              <div className="text-xs font-medium text-slate-900 dark:text-zinc-100">
                {t('ops.storage.gc.opt.archive')}
              </div>
              <div className="text-[11px] text-slate-500 dark:text-zinc-400 mt-0.5">
                {t('ops.storage.gc.opt.archive.desc')}
              </div>
            </div>
          </label>

          <label className="flex items-start gap-2.5 p-2.5 rounded-lg border border-border/60 hover:border-border cursor-pointer bg-background/40">
            <input
              type="checkbox"
              checked={wal}
              onChange={(e) => setWal(e.target.checked)}
              className="mt-0.5 rounded border-slate-400 text-codex-accent focus:ring-codex-accent"
            />
            <div>
              <div className="text-xs font-medium text-slate-900 dark:text-zinc-100">
                {t('ops.storage.gc.opt.wal')}
              </div>
              <div className="text-[11px] text-slate-500 dark:text-zinc-400 mt-0.5">
                {t('ops.storage.gc.opt.wal.desc')}
              </div>
            </div>
          </label>
        </div>

        {/* Numeric parameters */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 pt-2 border-t border-border/40">
          <div>
            <label className="block text-[11px] font-medium text-slate-600 dark:text-zinc-400 mb-1">
              {t('ops.storage.gc.opt.coldArchiveDays')}
            </label>
            <input
              type="number"
              min="0"
              value={coldArchiveAfterDays}
              onChange={(e) => setColdArchiveAfterDays(e.target.value)}
              placeholder="30"
              className="w-full px-2.5 py-1.5 text-xs bg-background border border-border rounded-lg focus:outline-hidden focus:border-codex-accent text-slate-900 dark:text-zinc-100"
            />
          </div>

          <div>
            <label className="block text-[11px] font-medium text-slate-600 dark:text-zinc-400 mb-1">
              {t('ops.storage.gc.opt.retainGlobal')}
            </label>
            <input
              type="number"
              min="0"
              value={retainNewestGlobal}
              onChange={(e) => setRetainNewestGlobal(e.target.value)}
              placeholder="20"
              className="w-full px-2.5 py-1.5 text-xs bg-background border border-border rounded-lg focus:outline-hidden focus:border-codex-accent text-slate-900 dark:text-zinc-100"
            />
          </div>

          <div>
            <label className="block text-[11px] font-medium text-slate-600 dark:text-zinc-400 mb-1">
              {t('ops.storage.gc.opt.retainCwd')}
            </label>
            <input
              type="number"
              min="0"
              value={retainNewestPerCwd}
              onChange={(e) => setRetainNewestPerCwd(e.target.value)}
              placeholder="10"
              className="w-full px-2.5 py-1.5 text-xs bg-background border border-border rounded-lg focus:outline-hidden focus:border-codex-accent text-slate-900 dark:text-zinc-100"
            />
          </div>
        </div>

        {/* Action buttons & notices */}
        <div className="pt-3 border-t border-border/40 space-y-2.5">
          <div className="text-[11px] text-slate-500 dark:text-zinc-400 flex items-center gap-1.5">
            {isOptionsChangedSincePreview ? (
              <span className="text-amber-500 dark:text-amber-400 flex items-center gap-1.5">
                <AlertTriangle className="w-3.5 h-3.5 shrink-0" />
                <span>{t('ops.storage.gc.optionsChanged')}</span>
              </span>
            ) : hasPreview ? (
              <span className="text-emerald-500 dark:text-emerald-400 flex items-center gap-1.5">
                <CheckCircle2 className="w-3.5 h-3.5 shrink-0" />
                <span>{t('ops.storage.gc.previewBadge')}</span>
              </span>
            ) : (
              <span className="flex items-center gap-1.5">
                <Info className="w-3.5 h-3.5 text-slate-400 shrink-0" />
                <span>{t('ops.storage.gc.requirePreview')}</span>
              </span>
            )}
          </div>

          <div className="flex items-center justify-end gap-2">
            <button
              onClick={handlePreview}
              disabled={isLoading || (!blobs && !archive && !wal)}
              className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium bg-surface-highlight hover:bg-surface border border-border text-slate-700 dark:text-zinc-200 rounded-lg transition-colors disabled:opacity-50 cursor-pointer"
            >
              {isLoading && activeAction === 'preview' ? (
                <RefreshCw className="w-3.5 h-3.5 animate-spin" />
              ) : (
                <Play className="w-3.5 h-3.5 text-emerald-500" />
              )}
              <span>{t('ops.storage.gc.btn.preview')}</span>
            </button>

            <button
              onClick={handleOpenApplyConfirm}
              disabled={
                isLoading ||
                isStreaming ||
                !hasPreview ||
                isOptionsChangedSincePreview ||
                (!blobs && !archive && !wal)
              }
              className="flex items-center gap-1.5 px-3.5 py-1.5 text-xs font-semibold bg-emerald-600 hover:bg-emerald-500 text-white rounded-lg transition-colors shadow-sm disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer"
            >
              {isLoading && activeAction === 'apply' ? (
                <RefreshCw className="w-3.5 h-3.5 animate-spin" />
              ) : (
                <Trash2 className="w-3.5 h-3.5" />
              )}
              <span>{t('ops.storage.gc.btn.apply')}</span>
            </button>
          </div>
        </div>
      </div>

      {/* Report results display */}
      {report && (
        <div className="space-y-4 animate-fade-in">
          <div className="flex items-center justify-between">
            <h4 className="text-xs font-semibold uppercase tracking-wider text-slate-500 dark:text-zinc-400">
              {report.apply
                ? (report.blobs?.errors?.length || report.archive?.errors?.length)
                  ? t('ops.storage.gc.appliedPartialBadge')
                  : t('ops.storage.gc.appliedBadge')
                : t('ops.storage.gc.previewBadge')}
            </h4>
            <span className="text-[11px] font-mono text-slate-400">
              agentDir: {report.agentDir}
            </span>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
            {/* Card 1: Blobs */}
            {report.blobs && (
              <div className="p-3.5 bg-surface rounded-xl border border-border space-y-2">
                <div className="flex items-center justify-between pb-2 border-b border-border/40">
                  <span className="text-xs font-semibold text-slate-900 dark:text-zinc-100 flex items-center gap-1.5">
                    <Trash2 className="w-3.5 h-3.5 text-rose-500" />
                    {t('ops.storage.gc.blobsSection')}
                  </span>
                  <span className="text-[11px] px-1.5 py-0.5 rounded bg-emerald-500/10 text-emerald-500 font-mono">
                    {formatBytes(report.blobs.bytes)}
                  </span>
                </div>
                <div className="text-xs space-y-1 text-slate-600 dark:text-zinc-300">
                  <div className="flex justify-between">
                    <span>{t('ops.storage.gc.blobs.candidates')}</span>
                    <span className="font-mono">{report.blobs.candidates}</span>
                  </div>
                  <div className="flex justify-between">
                    <span>{t('ops.storage.gc.blobs.referenced')}</span>
                    <span className="font-mono">{report.blobs.referenced}</span>
                  </div>
                  <div className="flex justify-between font-semibold">
                    <span>
                      {report.apply ? t('ops.storage.gc.blobs.deleted') : t('ops.storage.gc.blobs.wouldDelete')}
                    </span>
                    <span className="font-mono text-rose-500">
                      {report.apply ? report.blobs.deleted : report.blobs.wouldDelete}
                    </span>
                  </div>
                </div>
                {report.blobs.errors && report.blobs.errors.length > 0 && (
                  <div className="text-[11px] text-rose-500 pt-1 border-t border-rose-500/20">
                    {report.blobs.errors.join(', ')}
                  </div>
                )}
              </div>
            )}

            {/* Card 2: Archive */}
            {report.archive && (
              <div className="p-3.5 bg-surface rounded-xl border border-border space-y-2">
                <div className="flex items-center justify-between pb-2 border-b border-border/40">
                  <span className="text-xs font-semibold text-slate-900 dark:text-zinc-100 flex items-center gap-1.5">
                    <Archive className="w-3.5 h-3.5 text-blue-500" />
                    {t('ops.storage.gc.archiveSection')}
                  </span>
                  <span className="text-[11px] px-1.5 py-0.5 rounded bg-blue-500/10 text-blue-500 font-mono">
                    {report.apply
                      ? t('ops.storage.gc.archive.badgeArchived', { count: report.archive.archived })
                      : t('ops.storage.gc.archive.badgeCandidate', { count: report.archive.wouldArchive })}
                  </span>
                </div>
                <div className="text-xs space-y-1 text-slate-600 dark:text-zinc-300">
                  <div className="flex justify-between">
                    <span>{t('ops.storage.gc.archive.scanned')}</span>
                    <span className="font-mono">{report.archive.scanned}</span>
                  </div>
                  <div className="flex justify-between">
                    <span>{t('ops.storage.gc.archive.skippedActive')}</span>
                    <span className="font-mono">{report.archive.skippedActive}</span>
                  </div>
                  <div className="flex justify-between">
                    <span>{t('ops.storage.gc.archive.keptGlobal')}</span>
                    <span className="font-mono">{report.archive.keptNewestGlobal}</span>
                  </div>
                  <div className="flex justify-between">
                    <span>{t('ops.storage.gc.archive.keptCwd')}</span>
                    <span className="font-mono">{report.archive.keptNewestPerCwd}</span>
                  </div>
                  <div className="flex justify-between font-semibold">
                    <span>
                      {report.apply ? t('ops.storage.gc.archive.archived') : t('ops.storage.gc.archive.wouldArchive')}
                    </span>
                    <span className="font-mono text-blue-500">
                      {report.apply ? report.archive.archived : report.archive.wouldArchive}
                    </span>
                  </div>
                  {report.apply && report.archive.historyRowsDeleted > 0 && (
                    <div className="flex justify-between text-[11px] text-slate-500">
                      <span>{t('ops.storage.gc.archive.historyRowsDeleted')}</span>
                      <span className="font-mono">{report.archive.historyRowsDeleted}</span>
                    </div>
                  )}
                </div>
                {report.archive.errors && report.archive.errors.length > 0 && (
                  <div className="text-[11px] text-rose-500 pt-1 border-t border-rose-500/20">
                    {report.archive.errors.join(', ')}
                  </div>
                )}
              </div>
            )}

            {/* Card 3: WAL */}
            {report.wal && (
              <div className="p-3.5 bg-surface rounded-xl border border-border space-y-2">
                <div className="flex items-center justify-between pb-2 border-b border-border/40">
                  <span className="text-xs font-semibold text-slate-900 dark:text-zinc-100 flex items-center gap-1.5">
                    <FileCode2 className="w-3.5 h-3.5 text-amber-500" />
                    {t('ops.storage.gc.walSection')}
                  </span>
                  <span className="text-[11px] px-1.5 py-0.5 rounded bg-amber-500/10 text-amber-500 font-mono">
                    {formatBytes(report.wal.walBytes)}
                  </span>
                </div>
                <div className="text-xs space-y-1.5 text-slate-600 dark:text-zinc-300">
                  <div className="flex justify-between items-center">
                    <span>{t('ops.storage.gc.wal.status')}</span>
                    <span
                      className={`font-medium ${
                        report.wal.checkpointed || report.wal.wouldCheckpoint
                          ? 'text-emerald-500'
                          : 'text-slate-400'
                      }`}
                    >
                      {report.wal.checkpointed || report.wal.wouldCheckpoint
                        ? t('ops.storage.gc.wal.checkpointed')
                        : t('ops.storage.gc.wal.noNeed')}
                    </span>
                  </div>
                  {report.wal.databases && report.wal.databases.length > 0 && (
                    <div className="pt-1.5 border-t border-border/40 space-y-1">
                      {report.wal.databases.map((db, idx) => {
                        const dbName = db.dbPath.split(/[/\\]/).pop() || db.dbPath;
                        return (
                          <div key={idx} className="flex justify-between text-[11px]">
                            <span className="truncate max-w-[140px]" title={db.dbPath}>
                              {dbName}
                            </span>
                            <span className="font-mono text-slate-400">
                              {formatBytes(db.walBytes)}
                            </span>
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Confirmation Modal */}
      {showConfirmModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-xs animate-fade-in">
          <div className="relative w-full max-w-md bg-panel border border-border rounded-2xl shadow-2xl p-6 space-y-4 animate-scale-in">
            <div className="flex items-start gap-3">
              <div className="p-2.5 rounded-xl bg-amber-500/10 text-amber-500 shrink-0">
                <AlertTriangle className="w-5 h-5" />
              </div>
              <div>
                <h3 className="text-sm font-semibold text-slate-900 dark:text-zinc-100">
                  {t('ops.storage.gc.confirmTitle')}
                </h3>
                <p className="text-xs text-slate-500 dark:text-zinc-400 mt-1">
                  {t('ops.storage.gc.confirmMsg')}
                </p>
              </div>
            </div>

            {/* Expected changes details */}
            <div className="p-3 bg-surface rounded-xl border border-border text-xs text-slate-700 dark:text-zinc-300 space-y-1.5">
              <div className="font-semibold text-slate-900 dark:text-zinc-100">
                {t('ops.storage.gc.confirmDetails', {
                  blobs: wouldDeleteBlobs,
                  bytes: formatBytes(wouldDeleteBytes),
                  sessions: wouldArchiveSessions,
                })}
              </div>
            </div>

            {/* Modal action buttons */}
            <div className="flex items-center justify-end gap-2 pt-2">
              <button
                type="button"
                onClick={() => setShowConfirmModal(false)}
                className="px-3.5 py-1.5 text-xs font-medium text-slate-600 dark:text-zinc-400 hover:text-slate-900 dark:hover:text-zinc-100 hover:bg-surface-highlight rounded-lg transition-colors cursor-pointer"
              >
                {t('common.cancel')}
              </button>
              <button
                type="button"
                onClick={handleApply}
                disabled={isLoading}
                className="flex items-center gap-1.5 px-4 py-1.5 text-xs font-semibold bg-rose-600 hover:bg-rose-500 text-white rounded-lg transition-colors shadow-sm cursor-pointer"
              >
                {isLoading && activeAction === 'apply' ? (
                  <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                ) : (
                  <Trash2 className="w-3.5 h-3.5" />
                )}
                <span>{t('common.confirm')}</span>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Section Image Backends & Images Cache (Phase 11) */}
      <div className="pt-6 border-t border-border/80 space-y-6">
        {/* Image Backends Section Header */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div className="min-w-0 flex-1">
            <h3 className="text-sm font-semibold text-slate-900 dark:text-zinc-100 flex items-center gap-2">
              <ImageIcon className="w-4 h-4 text-indigo-500 shrink-0" />
              <span>{t('ops.storage.images.title')}</span>
            </h3>
            <p className="text-xs text-slate-500 dark:text-zinc-400 mt-1">
              {t('ops.storage.images.desc')}
            </p>
          </div>
          <button
            type="button"
            onClick={handleFetchStatus}
            disabled={imagesLoading}
            className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-slate-700 dark:text-zinc-300 bg-surface hover:bg-surface-highlight border border-border rounded-lg transition-colors cursor-pointer shrink-0 whitespace-nowrap self-start sm:self-center"
          >
            <RefreshCw className={`w-3.5 h-3.5 shrink-0 ${imagesLoading && imagesAction === 'status' ? 'animate-spin' : ''}`} />
            <span>{t('ops.storage.images.btn.checkStatus')}</span>
          </button>
        </div>
        {/* Error if any */}
        {imagesError && (
          <div className="p-3 bg-rose-500/10 border border-rose-500/20 rounded-xl flex items-start gap-2.5 text-rose-600 dark:text-rose-400 text-xs">
            <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
            <span className="flex-1">{imagesError}</span>
          </div>
        )}

        {/* Purge success notice */}
        {purgeNotice && (
          <div className="p-3 bg-emerald-500/10 border border-emerald-500/20 rounded-xl flex items-start gap-2.5 text-emerald-600 dark:text-emerald-400 text-xs">
            <CheckCircle2 className="w-4 h-4 shrink-0 mt-0.5" />
            <span className="flex-1 font-medium">{purgeNotice}</span>
          </div>
        )}

        {/* Overview Status Cards */}
        {statusData && (
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            {/* Card 1: Status & Backends */}
            <div className="p-4 bg-surface rounded-xl border border-border space-y-3">
              <div className="flex items-center justify-between">
                <span className="text-xs font-medium text-slate-500 dark:text-zinc-400">
                  {t('ops.storage.images.statusTitle')}
                </span>
                <span
                  className={`px-2 py-0.5 text-[10px] font-semibold rounded-full ${
                    statusData.enabled
                      ? 'bg-emerald-500/15 text-emerald-500'
                      : 'bg-slate-500/15 text-slate-500 dark:text-zinc-400'
                  }`}
                >
                  {statusData.enabled
                    ? t('ops.storage.images.enabled')
                    : t('ops.storage.images.disabled')}
                </span>
              </div>
              <div className="flex items-center justify-between text-xs">
                <span className="text-slate-600 dark:text-zinc-400">
                  {t('ops.storage.images.daemonState')}:
                </span>
                <span className="font-mono font-medium text-slate-800 dark:text-zinc-200">
                  {statusData.daemon?.state || 'stopped'}
                </span>
              </div>
              <div className="space-y-1 pt-1 border-t border-border/40">
                <span className="text-[11px] text-slate-400 block">
                  {t('ops.storage.images.backends')}:
                </span>
                <div className="flex flex-wrap gap-1">
                  {statusData.backends && statusData.backends.length > 0 ? (
                    statusData.backends.map((b) => (
                      <span
                        key={b}
                        className="px-2 py-0.5 text-[10px] font-mono bg-surface-highlight border border-border rounded-md text-slate-700 dark:text-zinc-300"
                      >
                        {b}
                      </span>
                    ))
                  ) : (
                    <span className="text-[11px] text-slate-400 italic">
                      {t('ops.storage.images.none')}
                    </span>
                  )}
                </div>
              </div>
            </div>

            {/* Card 2: Provider Files */}
            <div className="p-4 bg-surface rounded-xl border border-border space-y-3">
              <span className="text-xs font-medium text-slate-500 dark:text-zinc-400 block">
                {t('ops.storage.images.providerFiles')}
              </span>
              <div className="space-y-1.5 text-xs">
                <div className="flex justify-between">
                  <span className="text-slate-600 dark:text-zinc-400">
                    {t('ops.storage.images.providerFiles.entries')}
                  </span>
                  <span className="font-mono font-semibold text-slate-800 dark:text-zinc-200">
                    {statusData.providerFiles?.entries ?? 0}
                  </span>
                </div>
                <div className="flex justify-between">
                  <span className="text-slate-600 dark:text-zinc-400">
                    {t('ops.storage.images.providerFiles.bytes')}
                  </span>
                  <span className="font-mono font-semibold text-indigo-500">
                    {formatBytes(statusData.providerFiles?.bytes ?? 0)}
                  </span>
                </div>
              </div>
              {statusData.providerFiles?.providers && (
                <div className="pt-1.5 border-t border-border/40 space-y-1 text-[11px]">
                  {Object.entries(statusData.providerFiles.providers).map(([provider, count]) => (
                    <div key={provider} className="flex justify-between text-slate-500 dark:text-zinc-400">
                      <span className="capitalize">{provider}:</span>
                      <span className="font-mono">{count ?? 0}</span>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* Card 3: Storage Savings */}
            <div className="p-4 bg-surface rounded-xl border border-border space-y-3">
              <span className="text-xs font-medium text-slate-500 dark:text-zinc-400 block">
                {t('ops.storage.images.savings')}
              </span>
              <div className="space-y-1.5 text-xs">
                <div className="flex justify-between">
                  <span className="text-slate-600 dark:text-zinc-400">
                    {t('ops.storage.images.savings.savedBytes')}
                  </span>
                  <span className="font-mono font-semibold text-emerald-500">
                    {formatBytes(statusData.savings?.savedBytes ?? 0)}
                  </span>
                </div>
                <div className="flex justify-between">
                  <span className="text-slate-600 dark:text-zinc-400">
                    {t('ops.storage.images.savings.imageCount')}
                  </span>
                  <span className="font-mono font-semibold text-slate-800 dark:text-zinc-200">
                    {statusData.savings?.imageCount ?? 0}
                  </span>
                </div>
                <div className="flex justify-between text-[11px] text-slate-400 pt-1 border-t border-border/40">
                  <span>{t('ops.storage.images.savings.inline')}: {formatBytes(statusData.savings?.inlineBytes ?? 0)}</span>
                  <span>{t('ops.storage.images.savings.ref')}: {formatBytes(statusData.savings?.referenceBytes ?? 0)}</span>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Diagnostics: Doctor & Probe */}
        <div className="p-4 bg-surface rounded-xl border border-border space-y-4">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div>
              <h4 className="text-xs font-semibold text-slate-900 dark:text-zinc-100 flex items-center gap-1.5">
                <Stethoscope className="w-4 h-4 text-emerald-500" />
                <span>{t('ops.storage.images.diagnosticsTitle')}</span>
              </h4>
            </div>
            <div className="flex items-center gap-2 flex-wrap">
              <div className="flex items-center gap-1.5 text-xs text-slate-500">
                <span>{t('ops.storage.images.probeTimeout')}:</span>
                <input
                  type="number"
                  min="1"
                  max="60"
                  value={probeTimeoutInput}
                  onChange={(e) => setProbeTimeoutInput(e.target.value)}
                  className="w-14 px-2 py-1 text-xs font-mono bg-panel border border-border rounded-md text-slate-900 dark:text-zinc-100"
                />
              </div>
              <button
                type="button"
                onClick={handleRunDoctor}
                disabled={imagesLoading}
                className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-slate-700 dark:text-zinc-200 bg-surface-highlight hover:bg-surface border border-border rounded-lg transition-colors cursor-pointer shrink-0 whitespace-nowrap"
              >
                {imagesLoading && imagesAction === 'doctor' ? (
                  <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                ) : (
                  <Stethoscope className="w-3.5 h-3.5 text-emerald-500" />
                )}
                <span>{t('ops.storage.images.btn.doctor')}</span>
              </button>
              <button
                type="button"
                onClick={handleRunProbe}
                disabled={imagesLoading}
                className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-slate-700 dark:text-zinc-200 bg-surface-highlight hover:bg-surface border border-border rounded-lg transition-colors cursor-pointer shrink-0 whitespace-nowrap"
              >
                {imagesLoading && imagesAction === 'probe' ? (
                  <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                ) : (
                  <Radio className="w-3.5 h-3.5 text-sky-500" />
                )}
                <span>{t('ops.storage.images.btn.probe')}</span>
              </button>
            </div>
          </div>

          {/* Doctor Results */}
          {doctorData && (
            <div className="pt-3 border-t border-border/60 space-y-2.5">
              <div className="flex items-center justify-between">
                <span className="text-xs font-semibold text-slate-800 dark:text-zinc-200">
                  {t('ops.storage.images.doctor.results')}
                </span>
                <span
                  className={`px-2 py-0.5 text-[10px] font-semibold rounded-full ${
                    doctorData.healthy
                      ? 'bg-emerald-500/15 text-emerald-500'
                      : 'bg-amber-500/15 text-amber-500'
                  }`}
                >
                  {doctorData.healthy
                    ? t('ops.storage.images.doctor.healthy')
                    : t('ops.storage.images.doctor.unhealthy')}
                </span>
              </div>
              <div className="max-h-48 overflow-y-auto space-y-1.5 pr-1">
                {doctorData.checks?.map((check, idx) => (
                  <div
                    key={idx}
                    className="flex items-start gap-2 p-2 rounded-lg bg-surface-highlight/50 text-xs"
                  >
                    {check.severity === 'ok' ? (
                      <CheckCircle2 className="w-3.5 h-3.5 text-emerald-500 shrink-0 mt-0.5" />
                    ) : check.severity === 'warn' ? (
                       <AlertTriangle className="w-3.5 h-3.5 text-amber-500 shrink-0 mt-0.5" />
                    ) : (
                      <AlertCircle className="w-3.5 h-3.5 text-rose-500 shrink-0 mt-0.5" />
                    )}
                    <div className="flex-1 min-w-0">
                      <span className="font-mono font-medium text-slate-800 dark:text-zinc-200 mr-2">
                        {check.name}
                      </span>
                      <span className="text-slate-500 dark:text-zinc-400">{check.detail}</span>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Probe Results */}
          {probeData && (
            <div className="pt-3 border-t border-border/60 space-y-2">
              <div className="flex items-center justify-between">
                <span className="text-xs font-semibold text-slate-800 dark:text-zinc-200">
                  {t('ops.storage.images.probe.results')}
                </span>
                <span
                  className={`px-2 py-0.5 text-[10px] font-semibold rounded-full ${
                    probeData.ok
                      ? 'bg-emerald-500/15 text-emerald-500'
                      : 'bg-rose-500/15 text-rose-500'
                  }`}
                >
                  {probeData.ok
                    ? t('ops.storage.images.probe.ok')
                    : t('ops.storage.images.probe.failed')}
                </span>
              </div>
              <div className="p-2.5 bg-surface-highlight/50 rounded-lg text-xs space-y-1">
                <div className="flex justify-between text-slate-600 dark:text-zinc-400">
                  <span>{t('ops.storage.images.daemonState')}:</span>
                  <span className="font-mono font-medium text-slate-800 dark:text-zinc-200">
                    {probeData.daemonState || 'unknown'}
                  </span>
                </div>
                {probeData.detail && (
                  <div className="text-slate-500 dark:text-zinc-400 text-[11px] pt-1">
                    {probeData.detail}
                  </div>
                )}
              </div>
            </div>
          )}
        </div>

        {/* Purge: Clean image cache */}
        <div className="p-4 bg-surface rounded-xl border border-border space-y-4">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div>
              <h4 className="text-xs font-semibold text-slate-900 dark:text-zinc-100 flex items-center gap-1.5">
                <Trash2 className="w-4 h-4 text-rose-500" />
                <span>{t('ops.storage.images.purgeTitle')}</span>
              </h4>
            </div>
            <div className="flex items-center gap-2 flex-wrap">
              <button
                type="button"
                onClick={handlePurgeDryRun}
                disabled={imagesLoading}
                className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-slate-700 dark:text-zinc-200 bg-surface-highlight hover:bg-surface border border-border rounded-lg transition-colors cursor-pointer shrink-0 whitespace-nowrap"
              >
                {imagesLoading && imagesAction === 'purge' ? (
                  <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                ) : (
                  <Play className="w-3.5 h-3.5" />
                )}
                <span>{t('ops.storage.images.btn.purgePreview')}</span>
              </button>
              <button
                type="button"
                onClick={() => setShowPurgeConfirmModal(true)}
                disabled={imagesLoading || !hasPurgePreview || isPurgeOptionsChanged || isStreaming}
                className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold bg-rose-600 hover:bg-rose-500 disabled:opacity-50 text-white rounded-lg transition-colors shadow-sm cursor-pointer shrink-0 whitespace-nowrap"
              >
                <Trash2 className="w-3.5 h-3.5" />
                <span>{t('ops.storage.images.btn.purgeApply')}</span>
              </button>
            </div>
          </div>

          {/* Purge Options */}
          <label className="flex items-center gap-2 text-xs text-slate-700 dark:text-zinc-300 cursor-pointer select-none">
            <input
              type="checkbox"
              checked={purgeAll}
              onChange={(e) => setPurgeAll(e.target.checked)}
              className="w-3.5 h-3.5 rounded text-rose-600 focus:ring-rose-500"
            />
            <span>{t('ops.storage.images.purge.all')}</span>
          </label>

          {/* Warning options changed since preview */}
          {isPurgeOptionsChanged && (
            <p className="text-[11px] text-amber-500 flex items-center gap-1">
              <AlertTriangle className="w-3.5 h-3.5 shrink-0" />
              <span>{t('ops.storage.images.purge.optionsChanged')}</span>
            </p>
          )}

          {/* Purge Report Results */}
          {purgeReport && (
            <div className="pt-3 border-t border-border/60 space-y-2">
              <div className="flex items-center justify-between text-xs">
                <span className="font-semibold text-slate-800 dark:text-zinc-200">
                  {purgeReport.applied
                    ? t('ops.storage.gc.appliedBadge')
                    : t('ops.storage.gc.previewBadge')}
                </span>
                <span className="font-mono text-slate-500">
                  {purgeReport.providerFiles?.selected ?? 0} {t('ops.storage.images.providerFiles.entries')} ({formatBytes(purgeReport.providerFiles?.bytes ?? 0)})
                </span>
              </div>
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-xs">
                <div className="p-2 bg-surface-highlight/50 rounded-lg">
                  <span className="text-[11px] text-slate-400 block">{t('ops.storage.images.purge.selected')}</span>
                  <span className="font-mono font-medium text-slate-800 dark:text-zinc-200">
                    {purgeReport.providerFiles?.selected ?? 0}
                  </span>
                </div>
                <div className="p-2 bg-surface-highlight/50 rounded-lg">
                  <span className="text-[11px] text-slate-400 block">{t('ops.storage.images.purge.bytes')}</span>
                  <span className="font-mono font-medium text-indigo-500">
                    {formatBytes(purgeReport.providerFiles?.bytes ?? 0)}
                  </span>
                </div>
                <div className="p-2 bg-surface-highlight/50 rounded-lg">
                  <span className="text-[11px] text-slate-400 block">{t('ops.storage.images.purge.deleted')}</span>
                  <span className="font-mono font-medium text-emerald-500">
                    {purgeReport.providerFiles?.deleted ?? 0}
                  </span>
                </div>
                <div className="p-2 bg-surface-highlight/50 rounded-lg">
                  <span className="text-[11px] text-slate-400 block">{t('ops.storage.images.purge.skippedAuth')}</span>
                  <span className="font-mono font-medium text-slate-800 dark:text-zinc-200">
                    {purgeReport.providerFiles?.skippedAuth ?? 0}
                  </span>
                </div>
              </div>

              {/* Display errors during purge if any */}
              {purgeReport.providerFiles?.errors && purgeReport.providerFiles.errors.length > 0 && (
                <div className="p-2.5 bg-rose-500/10 border border-rose-500/20 rounded-lg text-xs text-rose-600 dark:text-rose-400 space-y-1">
                  <span className="font-semibold block">{t('ops.storage.images.purge.errorsTitle')}</span>
                  <ul className="list-disc list-inside space-y-0.5 text-[11px]">
                    {purgeReport.providerFiles.errors.map((errStr, errIdx) => (
                      <li key={errIdx}>{errStr}</li>
                    ))}
                  </ul>
                </div>
              )}
            </div>
          )}
        </div>
      </div>

      {/* Purge Confirm Modal */}
      {showPurgeConfirmModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-xs animate-fade-in">
          <div className="relative w-full max-w-md bg-panel border border-border rounded-2xl shadow-2xl p-6 space-y-4 animate-scale-in">
            <div className="flex items-start gap-3">
              <div className="p-2.5 rounded-xl bg-rose-500/10 text-rose-500 shrink-0">
                <AlertTriangle className="w-5 h-5" />
              </div>
              <div>
                <h3 className="text-sm font-semibold text-slate-900 dark:text-zinc-100">
                  {t('ops.storage.images.purge.confirmTitle')}
                </h3>
                <p className="text-xs text-slate-500 dark:text-zinc-400 mt-1">
                  {t('ops.storage.images.purge.confirmMsg')}
                </p>
              </div>
            </div>

            <div className="p-3 bg-surface rounded-xl border border-border text-xs text-slate-700 dark:text-zinc-300">
              <div className="font-semibold text-slate-900 dark:text-zinc-100">
                {t('ops.storage.images.purge.confirmDetails', {
                  selected: purgeReport?.providerFiles?.selected ?? 0,
                  bytes: formatBytes(purgeReport?.providerFiles?.bytes ?? 0),
                })}
              </div>
            </div>

            <div className="flex items-center justify-end gap-2 pt-2">
              <button
                type="button"
                onClick={() => setShowPurgeConfirmModal(false)}
                className="px-3.5 py-1.5 text-xs font-medium text-slate-600 dark:text-zinc-400 hover:text-slate-900 dark:hover:text-zinc-100 hover:bg-surface-highlight rounded-lg transition-colors cursor-pointer"
              >
                {t('common.cancel')}
              </button>
              <button
                type="button"
                onClick={handlePurgeApply}
                disabled={imagesLoading}
                className="flex items-center gap-1.5 px-4 py-1.5 text-xs font-semibold bg-rose-600 hover:bg-rose-500 text-white rounded-lg transition-colors shadow-sm cursor-pointer"
              >
                {imagesLoading && imagesAction === 'purge' ? (
                  <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                ) : (
                  <Trash2 className="w-3.5 h-3.5" />
                )}
                <span>{t('common.confirm')}</span>
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
