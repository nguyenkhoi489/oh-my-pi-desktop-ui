import React, { useState, useEffect, useRef, useCallback } from 'react';
import {
  RefreshCw,
  Download,
  Terminal,
  CheckCircle2,
  Play,
  Sparkles,
  Layers,
  Cpu,
  Square,
  AlertTriangle,
  Radio,
  Zap,
  RotateCw,
  Package,
  Wrench,
  Trash2,
  GitCommit,
} from 'lucide-react';
import type {
  EngineUpdateCheckResult,
  EngineComponentStatus,
  TinyModelItem,
  MaintenanceEvent,
  TaskOutputEvent,
} from '../../../types/index.ts';
import { stripAnsi } from '../../../utils/cleanseArgs.ts';
import { useI18n } from '../../../i18n/I18nProvider.tsx';

export interface EngineTabProps {
  onRestartEngine?: () => void;
  isEngineRunning?: boolean;
  onOpenCommitModal?: () => void;
}

export const EngineTab: React.FC<EngineTabProps> = React.memo(({ onRestartEngine, isEngineRunning, onOpenCommitModal }) => {
  const { t } = useI18n();

  // Engine Maintenance State
  const [updateInfo, setUpdateInfo] = useState<EngineUpdateCheckResult | null>(null);
  const [isCheckingUpdate, setIsCheckingUpdate] = useState<boolean>(false);
  const [components, setComponents] = useState<EngineComponentStatus[]>([]);
  const [tinyModels, setTinyModels] = useState<TinyModelItem[]>([]);

  // Update Channel State (Phase 7)
  const [currentChannel, setCurrentChannel] = useState<'stable' | 'canary' | string>('stable');
  const [isLoadingChannel, setIsLoadingChannel] = useState<boolean>(false);
  const [pendingAction, setPendingAction] = useState<{
    type: 'channel-switch' | 'update-force' | 'update-plugins';
    targetChannel?: 'stable' | 'canary';
  } | null>(null);

  // Active Task and Log stream
  const [activeTaskId, setActiveTaskId] = useState<string | null>(null);
  const [taskStatus, setTaskStatus] = useState<'idle' | 'running' | 'done' | 'error'>('idle');
  const [logs, setLogs] = useState<string[]>([]);
  const [needRestart, setNeedRestart] = useState<boolean>(false);
  const logsEndRef = useRef<HTMLDivElement>(null);
  // Cleanse Runner State (Phase 15)
  const [cleanseRequest, setCleanseRequest] = useState<string>('');
  const [cleanseAgents, setCleanseAgents] = useState<number>(2);
  const [cleanseModel, setCleanseModel] = useState<string>('');
  const [cleanseTests, setCleanseTests] = useState<boolean>(false);
  const [cleanseAll, setCleanseAll] = useState<boolean>(true);
  const [isCleanseRunning, setIsCleanseRunning] = useState<boolean>(false);
  const [cleanseStatus, setCleanseStatus] = useState<'idle' | 'running' | 'done' | 'error'>('idle');
  const [cleanseLogs, setCleanseLogs] = useState<string[]>([]);
  const cleanseLogsEndRef = useRef<HTMLDivElement>(null);


  // Fetch update channel info from omp config
  const fetchUpdateChannel = useCallback(async () => {
    if (!window.electronAPI?.getEngineConfig) return;
    setIsLoadingChannel(true);
    try {
      const res = await window.electronAPI.getEngineConfig({ forceRefresh: true });
      if (res.success && Array.isArray(res.entries)) {
        const channelEntry = res.entries.find((e) => e.key === 'update.channel');
        if (channelEntry && typeof channelEntry.value === 'string' && channelEntry.value.trim()) {
          setCurrentChannel(channelEntry.value.trim().toLowerCase());
        } else {
          setCurrentChannel('stable');
        }
      }
    } catch {
      setCurrentChannel('stable');
    } finally {
      setIsLoadingChannel(false);
    }
  }, []);

  // Fetch status of components and tiny models
  const fetchStatus = useCallback(async () => {
    if (!window.electronAPI) return;

    // Check components
    try {
      const res = await window.electronAPI.checkEngineComponents();
      if (res.success && res.components) {
        setComponents(res.components);
      }
    } catch {}

    // List tiny models
    try {
      const res = await window.electronAPI.listTinyModels();
      if (res.success && res.models) {
        setTinyModels(res.models);
      }
    } catch {}
  }, []);

  // Check for engine updates
  const handleCheckUpdate = useCallback(async () => {
    if (!window.electronAPI?.checkEngineUpdate) return;
    setIsCheckingUpdate(true);
    try {
      const res = await window.electronAPI.checkEngineUpdate();
      setUpdateInfo(res);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      setUpdateInfo({
        success: false,
        currentVersion: 'unknown',
        hasUpdate: false,
        error: msg || t('ops.engine.updateCheckError'),
      });
    } finally {
      setIsCheckingUpdate(false);
    }
  }, []);

  useEffect(() => {
    fetchStatus();
    handleCheckUpdate();
    fetchUpdateChannel();
  }, [fetchStatus, handleCheckUpdate, fetchUpdateChannel]);

  // Listen for output streaming from maintenance tasks
  useEffect(() => {
    if (!window.electronAPI?.onMaintenanceOutput) return;

    const unsubscribe = window.electronAPI.onMaintenanceOutput((event: MaintenanceEvent) => {
      if (event.type === 'stdout' || event.type === 'stderr') {
        if (event.text) {
          setLogs((prev) => [...prev, event.text!]);
        }
      } else if (event.type === 'status') {
        if (event.status) {
          setTaskStatus(event.status);
          if (event.status === 'done' || event.status === 'error') {
            setActiveTaskId(null);
            fetchStatus();
            handleCheckUpdate();
            fetchUpdateChannel();
          }
        }
      }
    });

    return () => {
      unsubscribe();
    };
  }, [fetchStatus, handleCheckUpdate, fetchUpdateChannel]);

  useEffect(() => {
    logsEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [logs]);

  // Listen for output streaming from Cleanse runner
  useEffect(() => {
    if (!window.electronAPI?.onCleanseOutput) return;

    const unsubscribe = window.electronAPI.onCleanseOutput((event: TaskOutputEvent) => {
      if (event.type === 'stdout' || event.type === 'stderr') {
        if (event.text) {
          const stripped = stripAnsi(event.text);
          setCleanseLogs((prev) => [...prev, stripped]);
        }
      } else if (event.type === 'status') {
        if (event.status) {
          setCleanseStatus(event.status);
          if (event.status === 'done' || event.status === 'error') {
            setIsCleanseRunning(false);
          }
        }
        if (event.text) {
          setCleanseLogs((prev) => [...prev, `[${(event.status || 'status').toUpperCase()}] ${stripAnsi(event.text || '')}`]);
        }
      }
    });

    return () => {
      unsubscribe();
    };
  }, []);

  useEffect(() => {
    cleanseLogsEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [cleanseLogs]);

  // Run Cleanse task
  const handleRunCleanse = useCallback(async () => {
    if (!window.electronAPI?.runCleanse || isCleanseRunning) return;
    setIsCleanseRunning(true);
    setCleanseStatus('running');
    const cmdPreview = `> omp cleanse ${cleanseRequest.trim() ? `"${cleanseRequest.trim()}" ` : ''}${(!cleanseRequest.trim() || cleanseAll) ? '--all ' : ''}-n ${cleanseAgents}${cleanseModel.trim() ? ` -m ${cleanseModel.trim()}` : ''}${cleanseTests ? ' -t' : ''}`;
    setCleanseLogs([cmdPreview.trim()]);

    try {
      const res = await window.electronAPI.runCleanse({
        request: cleanseRequest.trim() || undefined,
        agents: cleanseAgents,
        model: cleanseModel.trim() || undefined,
        tests: cleanseTests,
        all: cleanseAll || !cleanseRequest.trim(),
      });
      if (!res.success) {
        setCleanseStatus('error');
        setCleanseLogs((prev) => [...prev, `[Error] ${res.error || t('ops.engine.cleanseStartError')}`]);
        setIsCleanseRunning(false);
      }
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      setCleanseStatus('error');
      setCleanseLogs((prev) => [...prev, `[Exception] ${msg}`]);
      setIsCleanseRunning(false);
    }
  }, [cleanseRequest, cleanseAgents, cleanseModel, cleanseTests, cleanseAll, isCleanseRunning]);

  // Cancel Cleanse task
  const handleCancelCleanse = useCallback(async () => {
    if (!window.electronAPI?.cancelCleanse) return;
    await window.electronAPI.cancelCleanse().catch(() => {});
    setIsCleanseRunning(false);
    setCleanseStatus('idle');
    setCleanseLogs((prev) => [...prev, t('ops.engine.cleanseCancelled')]);
  }, []);

  // Run maintenance task
  const runTask = useCallback(async (taskId: string, args: string[]) => {
    if (!window.electronAPI?.runMaintenanceTask || activeTaskId) return;
    setActiveTaskId(taskId);
    setTaskStatus('running');
    setLogs([`> omp ${args.join(' ')}`]);
    setNeedRestart(false);

    try {
      const res = await window.electronAPI.runMaintenanceTask(taskId, args);
      if (!res.success) {
        setTaskStatus('error');
        setLogs((prev) => [...prev, `[Error] ${res.error || t('ops.engine.taskStartError')}`]);
        setActiveTaskId(null);
      } else if (args.includes('update') || args.includes('setup')) {
        setNeedRestart(true);
      }
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      setTaskStatus('error');
      setLogs((prev) => [...prev, `[Exception] ${msg}`]);
      setActiveTaskId(null);
    }
  }, [activeTaskId]);

  // Cancel active maintenance task
  const cancelCurrentTask = useCallback(async () => {
    if (!window.electronAPI?.cancelMaintenanceTask) return;
    await window.electronAPI.cancelMaintenanceTask().catch(() => {});
    setActiveTaskId(null);
    setTaskStatus('idle');
    setLogs((prev) => [...prev, t('ops.engine.taskCancelled')]);
  }, [t]);

  // Check if engine is running to confirm stopping before update
  const executeUpdateAction = useCallback(async (action: {
    type: 'channel-switch' | 'update-force' | 'update-plugins';
    targetChannel?: 'stable' | 'canary';
  }) => {
    setPendingAction(null);

    // Check if engine is running
    let isRunning = Boolean(isEngineRunning);
    if (!isRunning && window.electronAPI?.getEngineState) {
      try {
        const stateRes = await window.electronAPI.getEngineState();
        if (stateRes.success && stateRes.state?.status && stateRes.state.status !== 'idle') {
          isRunning = true;
        }
      } catch {}
    }

    if (isRunning && window.electronAPI?.stopOmpProcess) {
      setLogs((prev) => [...prev, '[Notice] Stopping OMP engine before update...']);
      await window.electronAPI.stopOmpProcess().catch(() => {});
    }

    if (action.type === 'channel-switch' && action.targetChannel) {
      const flag = action.targetChannel === 'canary' ? '--canary' : '--stable';
      await runTask(`update-channel-${action.targetChannel}`, ['update', flag]);
    } else if (action.type === 'update-force') {
      await runTask('update-force', ['update', '--force']);
    } else if (action.type === 'update-plugins') {
      await runTask('update-plugins', ['update', '--plugins']);
    }
  }, [isEngineRunning, runTask]);

  const handleRequestChannelSwitch = (targetChannel: 'stable' | 'canary') => {
    setPendingAction({
      type: 'channel-switch',
      targetChannel,
    });
  };

  const handleRequestUpdateForce = () => {
    setPendingAction({
      type: 'update-force',
    });
  };

  const handleRequestUpdatePlugins = () => {
    setPendingAction({
      type: 'update-plugins',
    });
  };

  return (
    <div className="space-y-6">
      {/* Update Action Confirmation Dialog */}
      {pendingAction && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-xs animate-fade-in">
          <div className="w-full max-w-md p-5 rounded-2xl bg-panel border border-border shadow-2xl space-y-4 animate-scale-in">
            <div className="flex items-start gap-3">
              <div className="p-2 rounded-xl bg-amber-500/10 text-amber-600 dark:text-amber-400 shrink-0">
                <AlertTriangle className="w-5 h-5" />
              </div>
              <div className="space-y-1">
                <h4 className="text-sm font-semibold text-slate-900 dark:text-zinc-100">
                  {pendingAction.type === 'channel-switch'
                    ? pendingAction.targetChannel === 'canary'
                      ? t('ops.engine.switchCanary')
                      : t('ops.engine.switchStable')
                    : pendingAction.type === 'update-force'
                      ? t('ops.engine.updateForce')
                      : t('ops.engine.updatePlugins')}
                </h4>
                <p className="text-xs text-slate-600 dark:text-zinc-300 leading-relaxed">
                  {pendingAction.type === 'channel-switch'
                    ? pendingAction.targetChannel === 'canary'
                      ? t('ops.engine.switchCanaryConfirm')
                      : t('ops.engine.switchStableConfirm')
                    : t('ops.engine.updateConfirmStop')}
                </p>
              </div>
            </div>

            <div className="flex items-center justify-end gap-2 pt-2 border-t border-border">
              <button
                type="button"
                onClick={() => setPendingAction(null)}
                className="px-3 py-1.5 rounded-lg text-xs font-medium bg-surface hover:bg-surface-highlight text-slate-700 dark:text-zinc-300 border border-border transition-colors cursor-pointer"
              >
                {t('ops.engine.cancel')}
              </button>
              <button
                type="button"
                onClick={() => executeUpdateAction(pendingAction)}
                className="px-3.5 py-1.5 rounded-lg text-xs font-medium bg-codex-accent hover:bg-codex-accent/90 text-white shadow-sm transition-colors cursor-pointer"
              >
                {t('ops.engine.confirmUpdate')}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* 1. Version & Update Card */}
      <div className="p-4 rounded-xl border border-border bg-surface/30 space-y-3">
        <div className="flex items-center justify-between">
          <div>
            <h3 className="text-xs font-semibold text-slate-900 dark:text-zinc-100 flex items-center gap-2">
              <span>{t('ops.engine.versionTitle')}</span>
              {updateInfo?.currentVersion && (
                <span className="px-2 py-0.5 rounded-full text-[11px] font-mono font-medium bg-codex-accent/10 text-codex-accent border border-codex-accent/20">
                  v{updateInfo.currentVersion}
                </span>
              )}
            </h3>
            <p className="text-[11px] text-slate-500 dark:text-zinc-400 mt-0.5">
              {t('ops.engine.versionDesc')}
            </p>
          </div>

          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={handleCheckUpdate}
              disabled={isCheckingUpdate || Boolean(activeTaskId)}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium bg-surface hover:bg-surface-highlight text-slate-700 dark:text-zinc-300 border border-border transition-colors cursor-pointer disabled:opacity-50"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${isCheckingUpdate ? 'animate-spin' : ''}`} />
              <span>{isCheckingUpdate ? t('ops.engine.checkingUpdate') : t('ops.engine.checkUpdate')}</span>
            </button>

            {updateInfo?.hasUpdate && (
              <button
                type="button"
                onClick={handleRequestUpdateForce}
                disabled={Boolean(activeTaskId)}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium bg-emerald-600 hover:bg-emerald-700 text-white shadow-sm transition-colors cursor-pointer disabled:opacity-50"
              >
                <Download className="w-3.5 h-3.5" />
                <span>{t('ops.engine.installVersion', { version: updateInfo.latestVersion || 'latest' })}</span>
              </button>
            )}
          </div>
        </div>

        {updateInfo?.hasUpdate && (
          <div className="p-3 rounded-lg bg-emerald-500/10 border border-emerald-500/20 text-emerald-700 dark:text-emerald-400 text-xs flex items-center gap-2">
            <Sparkles className="w-4 h-4 shrink-0" />
            <span>
              {t('ops.engine.newVersionAvailable', { version: updateInfo.latestVersion || 'latest' })}
            </span>
          </div>
        )}
      </div>

      {/* 2. Update Channel & Fast Action Controls (Phase 7) */}
      <div className="p-4 rounded-xl border border-border bg-surface/30 space-y-3">
        <div className="flex items-center justify-between">
          <div className="space-y-0.5">
            <h3 className="text-xs font-semibold text-slate-900 dark:text-zinc-100 flex items-center gap-2">
              <Radio className="w-3.5 h-3.5 text-codex-accent" />
              <span>{t('ops.engine.updateChannel')}</span>
              <span
                className={`px-2 py-0.5 rounded-md text-[10.5px] font-mono font-medium border uppercase ${
                  currentChannel === 'canary'
                    ? 'bg-amber-500/10 text-amber-600 dark:text-amber-400 border-amber-500/20'
                    : 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border-emerald-500/20'
                }`}
              >
                {currentChannel === 'canary' ? t('ops.engine.channelCanary') : t('ops.engine.channelStable')}
              </span>
            </h3>
            <p className="text-[11px] text-slate-500 dark:text-zinc-400">
              {t('ops.engine.updateChannelDesc')}
            </p>
          </div>

          <div className="flex items-center gap-2">
            {currentChannel === 'canary' ? (
              <button
                type="button"
                onClick={() => handleRequestChannelSwitch('stable')}
                disabled={Boolean(activeTaskId) || isLoadingChannel}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium bg-surface hover:bg-surface-highlight text-emerald-700 dark:text-emerald-400 border border-emerald-500/30 transition-colors cursor-pointer disabled:opacity-50"
                title={t('ops.engine.switchStable')}
              >
                <RotateCw className="w-3.5 h-3.5" />
                <span>{t('ops.engine.switchStable')}</span>
              </button>
            ) : (
              <button
                type="button"
                onClick={() => handleRequestChannelSwitch('canary')}
                disabled={Boolean(activeTaskId) || isLoadingChannel}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium bg-surface hover:bg-surface-highlight text-amber-700 dark:text-amber-400 border border-amber-500/30 transition-colors cursor-pointer disabled:opacity-50"
                title={t('ops.engine.switchCanary')}
              >
                <Zap className="w-3.5 h-3.5" />
                <span>{t('ops.engine.switchCanary')}</span>
              </button>
            )}
          </div>
        </div>

        {/* Quick action buttons: Force update & Update plugins */}
        <div className="flex flex-wrap items-center gap-2 pt-2 border-t border-border/60">
          <button
            type="button"
            onClick={handleRequestUpdateForce}
            disabled={Boolean(activeTaskId)}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium bg-surface hover:bg-surface-highlight text-slate-700 dark:text-zinc-300 border border-border transition-colors cursor-pointer disabled:opacity-50"
          >
            <RefreshCw className="w-3.5 h-3.5" />
            <span>{t('ops.engine.updateForce')}</span>
          </button>

          <button
            type="button"
            onClick={handleRequestUpdatePlugins}
            disabled={Boolean(activeTaskId)}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium bg-surface hover:bg-surface-highlight text-slate-700 dark:text-zinc-300 border border-border transition-colors cursor-pointer disabled:opacity-50"
          >
            <Package className="w-3.5 h-3.5" />
            <span>{t('ops.engine.updatePlugins')}</span>
          </button>
        </div>
      </div>

      {/* 3. Optional System Components */}
      <div className="space-y-3">
        <h3 className="text-xs font-semibold text-slate-900 dark:text-zinc-100 flex items-center gap-2">
          <Layers className="w-4 h-4 text-codex-accent" />
          <span>{t('ops.engine.componentsTitle')}</span>
        </h3>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          {components.map((comp) => (
            <div
              key={comp.id}
              className="p-3.5 rounded-xl border border-border bg-surface/30 flex flex-col justify-between space-y-2"
            >
              <div>
                <div className="flex items-center justify-between">
                  <span className="font-semibold text-xs text-slate-800 dark:text-zinc-200">
                    {comp.name}
                  </span>
                  {comp.isInstalled ? (
                    <span className="flex items-center gap-1 text-[11px] text-emerald-600 dark:text-emerald-400 font-medium">
                      <CheckCircle2 className="w-3.5 h-3.5" />
                      <span>{t('ops.engine.installed')}</span>
                    </span>
                  ) : (
                    <span className="text-[11px] text-slate-400 dark:text-zinc-500">
                      {t('ops.engine.notInstalled')}
                    </span>
                  )}
                </div>
                <p className="text-[11px] text-slate-500 dark:text-zinc-400 mt-1">
                  {comp.description}
                </p>
                {comp.details && (
                  <p className="text-[10px] text-slate-400 dark:text-zinc-500 mt-1 font-mono truncate">
                    {comp.details}
                  </p>
                )}
              </div>

              <div className="pt-2 flex justify-end">
                <button
                  type="button"
                  onClick={() => runTask(`setup-${comp.id}`, ['setup', comp.id])}
                  disabled={Boolean(activeTaskId)}
                  className="flex items-center gap-1 px-3 py-1 rounded-lg text-xs font-medium bg-panel border border-border hover:bg-surface-highlight text-slate-700 dark:text-zinc-300 transition-colors cursor-pointer disabled:opacity-50"
                >
                  <Play className="w-3 h-3" />
                  <span>{comp.isInstalled ? t('ops.engine.reinstall') : t('ops.engine.install')}</span>
                </button>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* 4. Tiny Local Models */}
      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <h3 className="text-xs font-semibold text-slate-900 dark:text-zinc-100 flex items-center gap-2">
            <Cpu className="w-4 h-4 text-codex-accent" />
            <span>{t('ops.engine.tinyModelsTitle')}</span>
          </h3>
          <button
            type="button"
            onClick={() => runTask('download-tiny-models', ['tiny-models', 'download', 'all'])}
            disabled={Boolean(activeTaskId)}
            className="text-[11px] text-codex-accent hover:underline cursor-pointer disabled:opacity-50 font-medium"
          >
            {t('ops.engine.downloadAllModels')}
          </button>
        </div>

        <div className="space-y-2">
          {tinyModels.map((m) => (
            <div
              key={m.key}
              className="p-3 rounded-lg border border-border bg-surface/20 flex items-center justify-between text-xs"
            >
              <div>
                <div className="flex items-center gap-2 font-mono font-medium text-slate-800 dark:text-zinc-200">
                  <span>{m.key}</span>
                  {m.isDefault && (
                    <span className="px-1.5 py-0.2 rounded text-[10px] bg-blue-500/10 text-blue-500 border border-blue-500/20">
                      {t('ops.engine.defaultBadge')}
                    </span>
                  )}
                </div>
                <p className="text-[11px] text-slate-500 dark:text-zinc-400 mt-0.5">
                  {m.description}
                </p>
              </div>

              <button
                type="button"
                onClick={() => runTask(`dl-${m.key}`, ['tiny-models', 'download', m.key])}
                disabled={Boolean(activeTaskId)}
                className="px-2.5 py-1 rounded bg-panel border border-border hover:bg-surface-highlight text-[11px] font-medium transition-colors cursor-pointer disabled:opacity-50 shrink-0 ml-2"
              >
                {t('ops.engine.downloadModel')}
              </button>
            </div>
          ))}
        </div>
      </div>

      {/* 5. Cleanse Runner (Phase 15) */}
      <div className="space-y-4 pt-4 border-t border-border">
        <div className="flex items-center justify-between">
          <div>
            <h3 className="text-xs font-semibold text-slate-900 dark:text-zinc-100 flex items-center gap-2">
              <Wrench className="w-4 h-4 text-codex-accent" />
              <span>{t('ops.engine.cleanseTitle')}</span>
              {cleanseStatus === 'running' && (
                <span className="px-1.5 py-0.2 rounded text-[10px] bg-amber-500/10 text-amber-500 border border-amber-500/20 font-normal">
                  {t('ops.engine.running')}
                </span>
              )}
            </h3>
            <p className="text-[11px] text-slate-500 dark:text-zinc-400 mt-0.5">
              {t('ops.engine.cleanseDesc')}
            </p>
          </div>
        </div>

        {/* Warning when engine is streaming */}
        {isEngineRunning && (
          <div className="p-3 rounded-xl bg-amber-500/10 border border-amber-500/20 flex items-start gap-2.5 text-xs text-amber-800 dark:text-amber-300">
            <AlertTriangle className="w-4 h-4 text-amber-500 shrink-0 mt-0.5" />
            <div className="leading-relaxed">
              {t('ops.engine.cleanseStreamingWarning')}
            </div>
          </div>
        )}

        {/* Workspace edit warning & commit shortcut */}
        <div className="p-3 rounded-xl bg-surface/40 border border-border flex flex-col sm:flex-row sm:items-center justify-between gap-3 text-xs text-slate-600 dark:text-zinc-300">
          <div className="flex items-start gap-2.5">
            <AlertTriangle className="w-4 h-4 text-slate-400 shrink-0 mt-0.5" />
            <span className="leading-relaxed">
              {t('ops.engine.cleanseWorkspaceWarning')}
            </span>
          </div>
          {onOpenCommitModal && (
            <button
              type="button"
              onClick={onOpenCommitModal}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium bg-panel hover:bg-surface-highlight text-slate-700 dark:text-zinc-200 border border-border transition-colors cursor-pointer shrink-0 self-start sm:self-auto"
            >
              <GitCommit className="w-3.5 h-3.5 text-codex-accent" />
              <span>{t('ops.engine.cleanseCommitFirst')}</span>
            </button>
          )}
        </div>

        {/* Cleanse parameters configuration */}
        <div className="p-4 rounded-xl border border-border bg-surface/20 space-y-4 text-xs">
          <div className="space-y-1.5">
            <label className="block text-xs font-medium text-slate-700 dark:text-zinc-300">
              {t('ops.engine.cleanseRequest')}
            </label>
            <input
              type="text"
              value={cleanseRequest}
              onChange={(e) => setCleanseRequest(e.target.value)}
              disabled={isCleanseRunning}
              placeholder={t('ops.engine.cleanseRequestPlaceholder')}
              className="w-full px-3 py-1.5 text-xs rounded-lg bg-surface border border-border text-slate-900 dark:text-zinc-100 placeholder-slate-400 focus:outline-none focus:border-codex-accent disabled:opacity-50"
            />
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="space-y-1.5">
              <label className="block text-xs font-medium text-slate-700 dark:text-zinc-300">
                {t('ops.engine.cleanseAgents')}
              </label>
              <input
                type="number"
                min={1}
                max={16}
                value={cleanseAgents}
                onChange={(e) => setCleanseAgents(Math.max(1, Math.min(16, parseInt(e.target.value, 10) || 1)))}
                disabled={isCleanseRunning}
                className="w-full px-3 py-1.5 text-xs rounded-lg bg-surface border border-border text-slate-900 dark:text-zinc-100 focus:outline-none focus:border-codex-accent disabled:opacity-50"
              />
            </div>

            <div className="space-y-1.5">
              <label className="block text-xs font-medium text-slate-700 dark:text-zinc-300">
                {t('ops.engine.cleanseModel')}
              </label>
              <input
                type="text"
                value={cleanseModel}
                onChange={(e) => setCleanseModel(e.target.value)}
                disabled={isCleanseRunning}
                placeholder={t('ops.engine.cleanseModelPlaceholder')}
                className="w-full px-3 py-1.5 text-xs rounded-lg bg-surface border border-border text-slate-900 dark:text-zinc-100 placeholder-slate-400 focus:outline-none focus:border-codex-accent disabled:opacity-50"
              />
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-6 pt-1">
            <label className="flex items-center gap-2 cursor-pointer select-none">
              <input
                type="checkbox"
                checked={cleanseAll || !cleanseRequest.trim()}
                onChange={(e) => setCleanseAll(e.target.checked)}
                disabled={isCleanseRunning || !cleanseRequest.trim()}
                className="rounded border-border text-codex-accent focus:ring-0 cursor-pointer"
              />
              <span className={`text-xs ${!cleanseRequest.trim() ? 'text-slate-400 dark:text-zinc-500' : 'text-slate-700 dark:text-zinc-300'}`}>
                {t('ops.engine.cleanseAllToggle')} {!cleanseRequest.trim() && ` ${t('ops.engine.cleanseAllRequired')}`}
              </span>
            </label>

            <label className="flex items-center gap-2 cursor-pointer select-none">
              <input
                type="checkbox"
                checked={cleanseTests}
                onChange={(e) => setCleanseTests(e.target.checked)}
                disabled={isCleanseRunning}
                className="rounded border-border text-codex-accent focus:ring-0 cursor-pointer"
              />
              <span className="text-xs text-slate-700 dark:text-zinc-300">
                {t('ops.engine.cleanseTestsToggle')}
              </span>
            </label>
          </div>

          <div className="flex items-center justify-between pt-2 border-t border-border">
            <div className="text-[11px] font-mono text-slate-500 dark:text-zinc-400">
              omp cleanse {cleanseRequest.trim() ? `"${cleanseRequest.trim()}" ` : ''}{(!cleanseRequest.trim() || cleanseAll) ? '--all ' : ''}-n {cleanseAgents}{cleanseModel.trim() ? ` -m ${cleanseModel.trim()}` : ''}{cleanseTests ? ' -t' : ''}
            </div>

            <div className="flex items-center gap-2">
              {isCleanseRunning ? (
                <button
                  type="button"
                  onClick={handleCancelCleanse}
                  className="flex items-center gap-1.5 px-4 py-1.5 rounded-lg text-xs font-medium bg-rose-600 hover:bg-rose-700 text-white shadow-sm transition-colors cursor-pointer"
                >
                  <Square className="w-3.5 h-3.5 fill-current" />
                  <span>{t('ops.engine.cleanseCancel')}</span>
                </button>
              ) : (
                <button
                  type="button"
                  onClick={handleRunCleanse}
                  disabled={Boolean(activeTaskId)}
                  className="flex items-center gap-1.5 px-4 py-1.5 rounded-lg text-xs font-medium bg-codex-accent hover:bg-codex-accent/90 text-white shadow-sm transition-colors cursor-pointer disabled:opacity-50"
                >
                  <Play className="w-3.5 h-3.5 fill-current" />
                  <span>{t('ops.engine.cleanseRun')}</span>
                </button>
              )}
            </div>
          </div>
        </div>

        {/* Cleanse Log Console */}
        {cleanseLogs.length > 0 && (
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <h4 className="text-xs font-semibold text-slate-900 dark:text-zinc-100 flex items-center gap-2">
                <Terminal className="w-4 h-4 text-emerald-500" />
                <span>Cleanse Log</span>
                {cleanseStatus === 'running' && (
                  <span className="px-1.5 py-0.2 rounded text-[10px] bg-amber-500/10 text-amber-500 border border-amber-500/20 font-normal">
                    {t('ops.engine.running')}
                  </span>
                )}
                {cleanseStatus === 'done' && (
                  <span className="px-1.5 py-0.2 rounded text-[10px] bg-emerald-500/10 text-emerald-500 border border-emerald-500/20 font-normal">
                    {t('ops.engine.completed')}
                  </span>
                )}
                {cleanseStatus === 'error' && (
                  <span className="px-1.5 py-0.2 rounded text-[10px] bg-rose-500/10 text-rose-500 border border-rose-500/20 font-normal">
                    {t('ops.engine.failed')}
                  </span>
                )}
              </h4>
              <button
                type="button"
                onClick={() => setCleanseLogs([])}
                className="flex items-center gap-1 text-[11px] text-slate-400 hover:text-slate-600 dark:text-zinc-400 dark:hover:text-zinc-200 transition-colors cursor-pointer"
              >
                <Trash2 className="w-3 h-3" />
                <span>{t('ops.engine.cleanseClearLog')}</span>
              </button>
            </div>

            <div className="p-3 rounded-xl bg-[#0d0e14] border border-border font-mono text-[11.5px] text-zinc-300 max-h-56 overflow-y-auto space-y-1 select-text">
              {cleanseLogs.map((line, idx) => (
                <div key={idx} className="whitespace-pre-wrap break-all leading-relaxed">
                  {line}
                </div>
              ))}
              <div ref={cleanseLogsEndRef} />
            </div>
          </div>
        )}
      </div>

      {/* 5. Live Output Log Stream */}
      {logs.length > 0 && (
        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <h3 className="text-xs font-semibold text-slate-900 dark:text-zinc-100 flex items-center gap-2">
              <Terminal className="w-4 h-4 text-emerald-500" />
              <span>{t('ops.engine.logsTitle')}</span>
              {taskStatus === 'running' && (
                <span className="px-1.5 py-0.2 rounded text-[10px] bg-amber-500/10 text-amber-500 border border-amber-500/20 font-normal">
                  {t('ops.engine.running')}
                </span>
              )}
              {taskStatus === 'done' && (
                <span className="px-1.5 py-0.2 rounded text-[10px] bg-emerald-500/10 text-emerald-500 border border-emerald-500/20 font-normal">
                  {t('ops.engine.completed')}
                </span>
              )}
              {taskStatus === 'error' && (
                <span className="px-1.5 py-0.2 rounded text-[10px] bg-rose-500/10 text-rose-500 border border-rose-500/20 font-normal">
                  {t('ops.engine.failed')}
                </span>
              )}
            </h3>
            {activeTaskId && (
              <button
                type="button"
                onClick={cancelCurrentTask}
                className="flex items-center gap-1 text-[11px] text-rose-500 hover:text-rose-600 transition-colors cursor-pointer"
              >
                <Square className="w-3 h-3 fill-rose-500" />
                <span>{t('ops.engine.cancelTask')}</span>
              </button>
            )}
          </div>

          <div className="p-3 rounded-xl bg-[#0d0e14] border border-border font-mono text-[11.5px] text-zinc-300 max-h-48 overflow-y-auto space-y-1 select-text">
            {logs.map((line, idx) => (
              <div key={idx} className="whitespace-pre-wrap break-all leading-relaxed">
                {line}
              </div>
            ))}
            <div ref={logsEndRef} />
          </div>

          {needRestart && (
            <div className="p-3 rounded-xl bg-amber-500/10 border border-amber-500/20 flex items-center justify-between gap-3 text-xs text-amber-800 dark:text-amber-400">
              <span>
                {t('ops.engine.restartNeeded')}
              </span>
              {onRestartEngine && (
                <button
                  type="button"
                  onClick={() => {
                    onRestartEngine();
                    setNeedRestart(false);
                  }}
                  className="px-3 py-1 rounded-lg bg-amber-600 hover:bg-amber-700 text-white font-medium shadow-sm transition-colors cursor-pointer shrink-0"
                >
                  {t('ops.engine.restartNow')}
                </button>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
});
