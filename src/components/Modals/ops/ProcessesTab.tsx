import React, { useState, useEffect, useRef, useCallback } from 'react';
import {
  Activity,
  RefreshCw,
  FileText,
  RotateCw,
  Trash2,
  X,
  Info,
  Play,
  Square,
  Search,
  Clock,
  Terminal,
  ArrowDown,
  Radio,
  FolderOpen,
  ExternalLink,
  Copy,
  Check,
  AlertCircle,
  Download,
} from 'lucide-react';
import type { OmpPsScope, OmpDaemonDetail, BrowserRelayStatus } from '../../../types/index.ts';
import { useI18n } from '../../../i18n/I18nProvider.tsx';

const MAX_LOG_BUFFER_LINES = 2000;

export const ProcessesTab: React.FC = React.memo(() => {
  const { t } = useI18n();

  // Processes list by scope
  const [psScopes, setPsScopes] = useState<OmpPsScope[]>([]);
  const [isLoadingPs, setIsLoadingPs] = useState<boolean>(false);
  const [psError, setPsError] = useState<string | null>(null);
  const [daemonActionBusy, setDaemonActionBusy] = useState<string | null>(null);

  // Browser Relay State (Phase 16)
  const [relayStatus, setRelayStatus] = useState<BrowserRelayStatus | null>(null);
  const [, setIsLoadingRelay] = useState<boolean>(false);
  const [isInstallingRelay, setIsInstallingRelay] = useState<boolean>(false);
  const [installInstructions, setInstallInstructions] = useState<string | null>(null);
  const [extensionDir, setExtensionDir] = useState<string | null>(null);
  const [showInstallGuide, setShowInstallGuide] = useState<boolean>(false);
  const [relayPort, setRelayPort] = useState<string>('');
  const [relayToken, setRelayToken] = useState<string>('');
  const [relayActionBusy, setRelayActionBusy] = useState<boolean>(false);
  const [relayError, setRelayError] = useState<string | null>(null);
  const [copiedDir, setCopiedDir] = useState<boolean>(false);

  // Drawer / Modal Info
  const [infoDaemonName, setInfoDaemonName] = useState<string | null>(null);
  const [infoDaemonDetail, setInfoDaemonDetail] = useState<OmpDaemonDetail | null>(null);
  const [isLoadingInfo, setIsLoadingInfo] = useState<boolean>(false);
  const [infoError, setInfoError] = useState<string | null>(null);

  // Logs Viewer
  const [viewingLogsDaemon, setViewingLogsDaemon] = useState<string | null>(null);
  const [viewingLogsService, setViewingLogsService] = useState<string | undefined>(undefined);
  const [daemonLogsLines, setDaemonLogsLines] = useState<string[]>([]);
  const [isLoadingLogs, setIsLoadingLogs] = useState<boolean>(false);
  const [isFollowing, setIsFollowing] = useState<boolean>(true);
  const [logLinesCount, setLogLinesCount] = useState<number>(100);
  const [headFlag, setHeadFlag] = useState<boolean>(false);
  const [grepFilter, setGrepFilter] = useState<string>('');
  const [autoScroll, setAutoScroll] = useState<boolean>(true);

  const logsEndRef = useRef<HTMLDivElement | null>(null);
  const logContainerRef = useRef<HTMLDivElement | null>(null);

  // Fetch browser relay status
  const fetchRelayStatus = useCallback(async () => {
    if (!window.electronAPI?.getBrowserRelayStatus) return;
    setIsLoadingRelay(true);
    try {
      const res = await window.electronAPI.getBrowserRelayStatus();
      setRelayStatus(res);
      if (res.port && !relayPort) {
        setRelayPort(String(res.port));
      }
    } catch {
      // ignore
    } finally {
      setIsLoadingRelay(false);
    }
  }, [relayPort]);

  // Fetch processes list
  const fetchProcesses = useCallback(async () => {
    fetchRelayStatus();
    if (!window.electronAPI?.listProcesses) return;
    setIsLoadingPs(true);
    setPsError(null);
    try {
      const res = await window.electronAPI.listProcesses({ all: true });
      if (res.success && res.scopes) {
        setPsScopes(res.scopes);
      } else {
        setPsError(res.error || t('ops.processes.error.fetchFailed'));
      }
    } catch (err: any) {
      setPsError(err?.message || t('ops.processes.error.fetchFailed'));
    } finally {
      setIsLoadingPs(false);
    }
  }, []);

  useEffect(() => {
    fetchProcesses();
  }, [fetchProcesses]);

  // Monitor stream output during extension installation
  useEffect(() => {
    if (window.electronAPI?.onBrowserRelayOutput) {
      const unsub = window.electronAPI.onBrowserRelayOutput((ev) => {
        if (ev.type === 'stdout' || ev.type === 'stderr') {
          setInstallInstructions((prev) => (prev ? (ev.text ? `${prev}\n${ev.text}` : prev) : (ev.text || null)));
        }
      });
      return unsub;
    }
  }, []);
  // Install extension
  const handleInstallRelay = async () => {
    if (!window.electronAPI?.installBrowserRelay || isInstallingRelay) return;
    setIsInstallingRelay(true);
    setRelayError(null);
    setShowInstallGuide(true);
    setInstallInstructions(t('ops.processes.relay.installing'));
    try {
      const res = await window.electronAPI.installBrowserRelay();
      if (res.success) {
        setInstallInstructions(res.instructions || res.output || '');
        setExtensionDir(res.extensionDir || '~/.omp/browser-relay/extension');
      } else {
        setRelayError(res.error || t('ops.processes.relay.installFailed'));
      }
    } catch (err: any) {
      setRelayError(err?.message || t('ops.processes.relay.installFailed'));
    } finally {
      setIsInstallingRelay(false);
      await fetchRelayStatus();
      await fetchProcesses();
    }
  };

  // Start relay server
  const handleStartRelay = async () => {
    if (!window.electronAPI?.startBrowserRelay || relayActionBusy) return;
    setRelayActionBusy(true);
    setRelayError(null);
    try {
      const portNum = relayPort.trim() ? parseInt(relayPort.trim(), 10) : undefined;
      const res = await window.electronAPI.startBrowserRelay({
        port: Number.isFinite(portNum) ? portNum : undefined,
        token: relayToken.trim() || undefined,
      });
      if (!res.success) {
        setRelayError(res.error || t('ops.processes.relay.startFailed'));
      }
    } catch (err: any) {
      setRelayError(err?.message || t('ops.processes.relay.startFailed'));
      setRelayActionBusy(false);
      await fetchRelayStatus();
      await fetchProcesses();
    }
  };

  // Stop relay server
  const handleStopRelay = async () => {
    if (!window.electronAPI?.stopBrowserRelay || relayActionBusy) return;
    setRelayActionBusy(true);
    setRelayError(null);
    try {
      const res = await window.electronAPI.stopBrowserRelay();
      if (!res.success) {
        setRelayError(res.error || t('ops.processes.relay.stopFailed'));
      }
    } catch (err: any) {
      setRelayError(err?.message || t('ops.processes.relay.stopFailed'));
    } finally {
      setRelayActionBusy(false);
      await fetchRelayStatus();
      await fetchProcesses();
    }
  };

  // Open extension folder
  const handleOpenExtensionFolder = async () => {
    const dir = extensionDir || '~/.omp/browser-relay/extension';
    if (window.electronAPI?.revealInFinder) {
      await window.electronAPI.revealInFinder(dir);
    }
  };
  // Open chrome://extensions
  const handleOpenChromeExtensions = async () => {
    try {
      await navigator.clipboard.writeText('chrome://extensions');
      setCopiedDir(true);
      setTimeout(() => setCopiedDir(false), 2000);
    } catch {}
    if (window.electronAPI?.openExternal) {
      const res = await window.electronAPI.openExternal('chrome://extensions');
      if (res && !res.success && res.error) {
        setRelayError(res.error);
      }
    }
  };

  // Copy extension path
  const handleCopyDir = async () => {
    const dir = extensionDir || '~/.omp/browser-relay/extension';
    try {
      await navigator.clipboard.writeText(dir);
      setCopiedDir(true);
      setTimeout(() => setCopiedDir(false), 2000);
    } catch {}
  };


  // Control daemon (stop / restart / kill)
  const handleControlDaemon = async (
    action: 'stop' | 'kill' | 'restart',
    name: string,
    globalService?: string
  ) => {
    if (!window.electronAPI?.controlProcess) return;
    setDaemonActionBusy(name);
    try {
      const res = await window.electronAPI.controlProcess(action, name, { global: globalService });
      if (res.success) {
        await fetchProcesses();
      } else {
        alert(res.error || t('ops.processes.error.actionFailed', { action, name }));
      }
    } catch (err: any) {
      alert(t('ops.processes.error.actionFailed', { action: 'command', name: err?.message || '' }));
    } finally {
      setDaemonActionBusy(null);
    }
  };

  // View daemon detail info
  const handleOpenInfo = async (name: string, globalService?: string) => {
    setInfoDaemonName(name);
    setInfoDaemonDetail(null);
    setInfoError(null);
    setIsLoadingInfo(true);

    if (!window.electronAPI?.getProcessInfo) {
      setIsLoadingInfo(false);
      return;
    }

    try {
      const res = await window.electronAPI.getProcessInfo(name, { global: globalService });
      if (res.success && res.daemon) {
        setInfoDaemonDetail(res.daemon);
      } else {
        setInfoError(res.error || t('ops.processes.error.infoFailed'));
      }
    } catch (err: any) {
      setInfoError(err?.message || t('ops.processes.error.infoFailed'));
    } finally {
      setIsLoadingInfo(false);
    }
  };

  // Close log viewer
  const handleCloseLogs = useCallback(async () => {
    if (window.electronAPI?.stopProcessLogFollow) {
      await window.electronAPI.stopProcessLogFollow().catch(() => {});
    }
    setViewingLogsDaemon(null);
    setViewingLogsService(undefined);
    setDaemonLogsLines([]);
  }, []);

  // Start fetching / streaming logs
  const startLogs = useCallback(
    async (
      daemonName: string,
      service?: string,
      follow: boolean = true,
      lines: number = 100,
      head: boolean = false,
      grep: string = ''
    ) => {
      setViewingLogsDaemon(daemonName);
      setViewingLogsService(service);
      setIsLoadingLogs(true);
      setDaemonLogsLines([]);

      if (follow) {
        if (!window.electronAPI?.startProcessLogFollow) {
          setIsLoadingLogs(false);
          return;
        }
        try {
          const res = await window.electronAPI.startProcessLogFollow(daemonName, {
            lines,
            head,
            grep: grep.trim() || undefined,
            global: service,
          });
          if (!res.success) {
            setDaemonLogsLines([`[Follow logs error: ${res.error || 'Cannot start stream'}]`]);
          }
        } catch (err: any) {
          setDaemonLogsLines([`[IPC startProcessLogFollow error: ${err?.message}]`]);
        } finally {
          setIsLoadingLogs(false);
        }
      } else {
        if (!window.electronAPI?.getProcessLogs) {
          setIsLoadingLogs(false);
          return;
        }
        try {
          const res = await window.electronAPI.getProcessLogs(daemonName, {
            lines,
            head,
            grep: grep.trim() || undefined,
            global: service,
          });
          if (res.success && res.logs !== undefined) {
            const rawLines = res.logs ? res.logs.split('\n') : [];
            setDaemonLogsLines(rawLines.slice(-MAX_LOG_BUFFER_LINES));
          } else {
            setDaemonLogsLines([`[Fetch logs error: ${res.error || 'No logs'}]`]);
          }
        } catch (err: any) {
          setDaemonLogsLines([`[IPC getProcessLogs error: ${err?.message}]`]);
        } finally {
          setIsLoadingLogs(false);
        }
      }
    },
    []
  );

  // Subscribe to realtime log lines
  useEffect(() => {
    if (!window.electronAPI?.onPsLogLine) return;

    const unsubscribe = window.electronAPI.onPsLogLine((data: { name: string; line: string }) => {
      if (!viewingLogsDaemon || data.name !== viewingLogsDaemon) return;
      setDaemonLogsLines((prev) => {
        const updated = [...prev, data.line];
        if (updated.length > MAX_LOG_BUFFER_LINES) {
          return updated.slice(updated.length - MAX_LOG_BUFFER_LINES);
        }
        return updated;
      });
    });

    return () => {
      unsubscribe();
    };
  }, [viewingLogsDaemon]);

  // Cleanup follow khi unmount
  useEffect(() => {
    return () => {
      if (window.electronAPI?.stopProcessLogFollow) {
        window.electronAPI.stopProcessLogFollow().catch(() => {});
      }
    };
  }, []);

  // Auto-scroll to bottom of logs
  useEffect(() => {
    if (autoScroll && logsEndRef.current) {
      logsEndRef.current.scrollIntoView({ behavior: 'smooth' });
    }
  }, [daemonLogsLines, autoScroll]);

  // Toggle follow mode
  const handleToggleFollow = async () => {
    if (!viewingLogsDaemon) return;
    const nextFollow = !isFollowing;
    setIsFollowing(nextFollow);
    if (!nextFollow) {
      if (window.electronAPI?.stopProcessLogFollow) {
        await window.electronAPI.stopProcessLogFollow().catch(() => {});
      }
    }
    await startLogs(
      viewingLogsDaemon,
      viewingLogsService,
      nextFollow,
      logLinesCount,
      headFlag,
      grepFilter
    );
  };

  // Apply log filters
  const handleApplyLogFilters = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    if (!viewingLogsDaemon) return;
    await startLogs(
      viewingLogsDaemon,
      viewingLogsService,
      isFollowing,
      logLinesCount,
      headFlag,
      grepFilter
    );
  };

  const formatDate = (ts?: number) => {
    if (!ts) return '-';
    try {
      return new Date(ts).toLocaleString();
    } catch {
      return String(ts);
    }
  };

  return (
    <div className="space-y-4">
      {/* Header bar */}
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-xs font-semibold text-slate-900 dark:text-zinc-100 flex items-center gap-2">
            <Activity className="w-4 h-4 text-emerald-500" />
            <span>{t('ops.processes.title')}</span>
          </h3>
          <p className="text-[11px] text-slate-500 dark:text-zinc-400">
            {t('ops.processes.desc')}
          </p>
        </div>

        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={fetchProcesses}
            disabled={isLoadingPs}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium bg-surface hover:bg-surface-highlight text-slate-700 dark:text-zinc-300 border border-border transition-colors cursor-pointer disabled:opacity-50"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${isLoadingPs ? 'animate-spin' : ''}`} />
            <span>{t('ops.processes.refresh')}</span>
          </button>
        </div>
      </div>

      {psError && (
        <div className="p-3 rounded-lg bg-rose-500/10 border border-rose-500/20 text-rose-600 dark:text-rose-400 text-xs">
          {psError}
        </div>
      )}
      {/* Browser Relay Service Card */}
      <div className="p-4 rounded-xl border border-border bg-surface/40 space-y-3">
        <div className="flex items-start justify-between gap-3">
          <div className="flex items-center gap-2.5">
            <div className="p-2 rounded-lg bg-emerald-500/10 text-emerald-600 dark:text-emerald-400">
              <Radio className="w-4 h-4" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h4 className="text-xs font-semibold text-slate-900 dark:text-zinc-100">
                  {t('ops.processes.relay.title')}
                </h4>
                <span
                  className={`inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full text-[10px] font-medium ${
                    relayStatus?.running
                      ? 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border border-emerald-500/20'
                      : 'bg-zinc-500/10 text-zinc-600 dark:text-zinc-400 border border-border'
                  }`}
                >
                  <span
                    className={`w-1.5 h-1.5 rounded-full ${
                      relayStatus?.running ? 'bg-emerald-500 animate-pulse' : 'bg-zinc-400'
                    }`}
                  />
                  <span>
                    {relayStatus?.running
                      ? t('ops.processes.relay.status.running')
                      : t('ops.processes.relay.status.stopped')}
                  </span>
                </span>
                {relayStatus?.running && relayStatus.source && (
                  <span className="text-[10px] text-slate-500 dark:text-zinc-400">
                    ({relayStatus.source === 'app'
                      ? t('ops.processes.relay.status.app')
                      : t('ops.processes.relay.status.daemon')})
                  </span>
                )}
              </div>
              <p className="text-[11px] text-slate-500 dark:text-zinc-400 mt-0.5">
                {t('ops.processes.relay.desc')}
              </p>
            </div>
          </div>

          {relayStatus?.running && (
            <div className="text-right shrink-0">
              <span className="text-[11px] font-mono text-emerald-600 dark:text-emerald-400 font-medium">
                {relayStatus.url || `http://127.0.0.1:${relayStatus.port || 9224}`}
              </span>
              {relayStatus.pid && (
                <div className="text-[10px] text-zinc-500">PID: {relayStatus.pid}</div>
              )}
            </div>
          )}
        </div>

        {relayError && (
          <div className="p-2.5 rounded-lg bg-rose-500/10 border border-rose-500/20 text-rose-600 dark:text-rose-400 text-xs flex items-center gap-2">
            <AlertCircle className="w-3.5 h-3.5 shrink-0" />
            <span>{relayError}</span>
          </div>
        )}

        {/* Action toolbar */}
        <div className="flex flex-wrap items-center justify-between gap-2 pt-1 border-t border-border/50">
          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={handleInstallRelay}
              disabled={isInstallingRelay}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium bg-emerald-600 hover:bg-emerald-500 text-white transition-colors cursor-pointer disabled:opacity-50"
            >
              <Download className={`w-3.5 h-3.5 ${isInstallingRelay ? 'animate-bounce' : ''}`} />
              <span>
                {isInstallingRelay
                  ? t('ops.processes.relay.installing')
                  : t('ops.processes.relay.installBtn')}
              </span>
            </button>

            <button
              type="button"
              onClick={handleOpenExtensionFolder}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium bg-surface hover:bg-surface-highlight text-slate-700 dark:text-zinc-300 border border-border transition-colors cursor-pointer"
            >
              <FolderOpen className="w-3.5 h-3.5" />
              <span>{t('ops.processes.relay.openFolder')}</span>
            </button>

            <button
              type="button"
              onClick={handleOpenChromeExtensions}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium bg-surface hover:bg-surface-highlight text-slate-700 dark:text-zinc-300 border border-border transition-colors cursor-pointer"
            >
              <ExternalLink className="w-3.5 h-3.5" />
              <span>{t('ops.processes.relay.chromeExtLink')}</span>
            </button>
          </div>

          <div className="flex items-center gap-2">
            <div className="flex items-center gap-1.5">
              <input
                type="text"
                value={relayPort}
                onChange={(e) => setRelayPort(e.target.value)}
                placeholder={t('ops.processes.relay.portPlaceholder')}
                disabled={relayStatus?.running || relayActionBusy}
                className="w-24 px-2 py-1 text-xs rounded-lg border border-border bg-surface text-slate-800 dark:text-zinc-200 placeholder:text-zinc-500 focus:outline-none focus:ring-1 focus:ring-emerald-500 font-mono disabled:opacity-50"
              />
              <input
                type="text"
                value={relayToken}
                onChange={(e) => setRelayToken(e.target.value)}
                placeholder={t('ops.processes.relay.tokenPlaceholder')}
                disabled={relayStatus?.running || relayActionBusy}
                className="w-28 px-2 py-1 text-xs rounded-lg border border-border bg-surface text-slate-800 dark:text-zinc-200 placeholder:text-zinc-500 focus:outline-none focus:ring-1 focus:ring-emerald-500 font-mono disabled:opacity-50"
              />
            </div>

            {relayStatus?.running ? (
              <button
                type="button"
                onClick={handleStopRelay}
                disabled={relayActionBusy}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium bg-rose-600 hover:bg-rose-500 text-white transition-colors cursor-pointer disabled:opacity-50"
              >
                <Square className="w-3.5 h-3.5" />
                <span>{t('ops.processes.relay.stopBtn')}</span>
              </button>
            ) : (
              <button
                type="button"
                onClick={handleStartRelay}
                disabled={relayActionBusy}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium bg-surface hover:bg-surface-highlight text-slate-800 dark:text-zinc-200 border border-border transition-colors cursor-pointer disabled:opacity-50"
              >
                <Play className="w-3.5 h-3.5 text-emerald-500" />
                <span>{t('ops.processes.relay.startBtn')}</span>
              </button>
            )}
          </div>
        </div>

        {/* Installation guide & path info */}
        {showInstallGuide && installInstructions && (
          <div className="p-3 rounded-lg bg-surface/80 border border-border/80 space-y-2 text-xs">
            <div className="flex items-center justify-between">
              <span className="font-semibold text-slate-800 dark:text-zinc-200">
                {t('ops.processes.relay.instructionsTitle')}
              </span>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={handleCopyDir}
                  className="flex items-center gap-1 text-[11px] text-emerald-600 dark:text-emerald-400 hover:underline cursor-pointer"
                >
                  {copiedDir ? <Check className="w-3 h-3" /> : <Copy className="w-3 h-3" />}
                  <span>
                    {copiedDir
                      ? t('ops.processes.relay.copied')
                      : t('ops.processes.relay.copyDir')}
                  </span>
                </button>
                <button
                  type="button"
                  onClick={() => setShowInstallGuide(false)}
                  className="p-1 text-slate-400 hover:text-slate-600 dark:hover:text-zinc-200 cursor-pointer"
                >
                  <X className="w-3.5 h-3.5" />
                </button>
              </div>
            </div>
            <pre className="p-2.5 rounded bg-zinc-950 text-zinc-200 font-mono text-[11px] whitespace-pre-wrap overflow-x-auto">
              {installInstructions}
            </pre>
          </div>
        )}

        <div className="text-[10px] text-slate-400 dark:text-zinc-500">
          {t('ops.processes.relay.note')}
        </div>
      </div>

      {/* Scopes & Daemons List */}
      {psScopes.length === 0 && !isLoadingPs ? (
        <div className="p-8 text-center text-slate-400 dark:text-zinc-500 border border-dashed border-border rounded-xl">
          {t('ops.processes.empty')}
        </div>
      ) : (
        psScopes.map((scope, sIdx) => (
          <div key={sIdx} className="space-y-2">
            <div className="flex items-center justify-between text-xs font-medium text-slate-500 dark:text-zinc-400 px-1">
              <span className="flex items-center gap-1.5 font-mono">
                {scope.kind === 'global' ? (
                  <span className="text-amber-500 font-semibold">
                    [{t('ops.processes.scope.global')}: {scope.service || 'system'}]
                  </span>
                ) : (
                  <span className="text-blue-500 font-semibold">
                    [{t('ops.processes.scope.project')}: {scope.projectDir || 'current'}]
                  </span>
                )}
              </span>
              {scope.brokerPid && (
                <span className="text-[10px] text-zinc-500">broker pid: {scope.brokerPid}</span>
              )}
            </div>

            {scope.daemons.length === 0 ? (
              <div className="p-4 text-center text-slate-400 dark:text-zinc-500 bg-surface/20 border border-border rounded-xl text-xs">
                {t('ops.processes.empty')}
              </div>
            ) : (
              <div className="grid grid-cols-1 gap-2">
                {scope.daemons.map((d) => {
                  const isRunning = d.state === 'running';
                  return (
                    <div
                      key={d.name}
                      className="p-3 rounded-xl border border-border bg-surface/30 flex items-center justify-between text-xs transition-colors hover:bg-surface/50"
                    >
                      <div className="flex items-center gap-3 overflow-hidden">
                        <span
                          className={`w-2 h-2 rounded-full shrink-0 ${
                            isRunning ? 'bg-emerald-500 animate-pulse' : 'bg-zinc-500'
                          }`}
                        />
                        <div className="space-y-0.5 min-w-0">
                          <div className="flex items-center gap-2">
                            <span className="font-mono font-semibold text-slate-800 dark:text-zinc-200 truncate">
                              {d.name}
                            </span>
                            <span
                              className={`px-1.5 py-0.2 rounded text-[10px] font-mono uppercase ${
                                isRunning
                                  ? 'bg-emerald-500/10 text-emerald-500 border border-emerald-500/20'
                                  : 'bg-zinc-500/10 text-zinc-400 border border-zinc-500/20'
                              }`}
                            >
                              {d.state}
                            </span>
                          </div>
                          <div className="text-[10px] text-slate-400 dark:text-zinc-500 font-mono truncate">
                            {d.command ? `cmd: ${d.command}` : d.id ? `id: ${d.id}` : ''}
                          </div>
                        </div>
                      </div>

                      {/* Action buttons */}
                      <div className="flex items-center gap-1.5 shrink-0">
                        {/* Info button */}
                        <button
                          type="button"
                          onClick={() => handleOpenInfo(d.name, scope.service)}
                          className="p-1.5 rounded bg-panel border border-border hover:bg-surface-highlight text-zinc-400 hover:text-zinc-100 transition-colors cursor-pointer"
                          title={t('ops.processes.actions.info')}
                        >
                          <Info className="w-3.5 h-3.5" />
                        </button>

                        {/* Logs button */}
                        <button
                          type="button"
                          onClick={() =>
                            startLogs(
                              d.name,
                              scope.service,
                              isFollowing,
                              logLinesCount,
                              headFlag,
                              grepFilter
                            )
                          }
                          className="p-1.5 rounded bg-panel border border-border hover:bg-surface-highlight text-zinc-400 hover:text-zinc-100 transition-colors cursor-pointer"
                          title={t('ops.processes.actions.logs')}
                        >
                          <FileText className="w-3.5 h-3.5" />
                        </button>

                        {/* Stop button */}
                        {isRunning && (
                          <button
                            type="button"
                            onClick={() => handleControlDaemon('stop', d.name, scope.service)}
                            disabled={daemonActionBusy === d.name}
                            className="px-2 py-1 rounded bg-amber-500/10 border border-amber-500/20 text-amber-500 hover:bg-amber-500/20 text-xs font-medium transition-colors cursor-pointer"
                            title={t('ops.processes.actions.stop')}
                          >
                            {t('ops.processes.actions.stop')}
                          </button>
                        )}

                        {/* Restart button */}
                        <button
                          type="button"
                          onClick={() => handleControlDaemon('restart', d.name, scope.service)}
                          disabled={daemonActionBusy === d.name}
                          className="p-1.5 rounded bg-panel border border-border hover:bg-surface-highlight text-zinc-400 hover:text-zinc-100 transition-colors cursor-pointer"
                          title={t('ops.processes.actions.restart')}
                        >
                          <RotateCw className="w-3.5 h-3.5" />
                        </button>

                        {/* Kill button */}
                        <button
                          type="button"
                          onClick={() => {
                            if (
                              confirm(
                                t('ops.processes.actions.killConfirm', {
                                  name: d.name,
                                })
                              )
                            ) {
                              handleControlDaemon('kill', d.name, scope.service);
                            }
                          }}
                          disabled={daemonActionBusy === d.name}
                          className="p-1.5 rounded bg-rose-500/10 border border-rose-500/20 text-rose-500 hover:bg-rose-500/20 transition-colors cursor-pointer"
                          title={t('ops.processes.actions.kill')}
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        ))
      )}

      {/* DRAWER / MODAL: DAEMON INFO */}
      {infoDaemonName && (
        <div className="p-4 rounded-xl bg-surface/50 border border-border space-y-4">
          <div className="flex items-center justify-between text-xs pb-2 border-b border-border">
            <span className="font-semibold text-slate-800 dark:text-zinc-200 flex items-center gap-2">
              <Info className="w-4 h-4 text-blue-500" />
              {t('ops.processes.info.title', { name: infoDaemonName })}
            </span>
            <button
              onClick={() => setInfoDaemonName(null)}
              className="text-zinc-400 hover:text-zinc-100 cursor-pointer p-1"
              title={t('ops.processes.info.close')}
            >
              <X className="w-4 h-4" />
            </button>
          </div>

          {isLoadingInfo ? (
            <p className="text-zinc-500 text-xs py-4 text-center">
              {t('ops.processes.info.loading')}
            </p>
          ) : infoError ? (
            <div className="p-3 rounded-lg bg-rose-500/10 border border-rose-500/20 text-rose-500 text-xs">
              {infoError}
            </div>
          ) : infoDaemonDetail ? (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-xs">
              {/* Section 1: Spec */}
              <div className="space-y-2 bg-panel/50 p-3 rounded-lg border border-border">
                <h4 className="font-semibold text-slate-700 dark:text-zinc-300 flex items-center gap-1.5">
                  <Terminal className="w-3.5 h-3.5 text-emerald-500" />
                  {t('ops.processes.info.specTitle')}
                </h4>
                <div className="space-y-1.5 text-[11px] font-mono">
                  <div>
                    <span className="text-zinc-500 block">{t('ops.processes.info.app')}:</span>
                    <span className="text-zinc-300 break-all">
                      {infoDaemonDetail.spec?.application || infoDaemonDetail.command || '-'}
                    </span>
                  </div>
                  {infoDaemonDetail.spec?.args && (
                    <div>
                      <span className="text-zinc-500 block">{t('ops.processes.info.args')}:</span>
                      <span className="text-zinc-300 break-all">
                        {infoDaemonDetail.spec.args.join(' ')}
                      </span>
                    </div>
                  )}
                  <div>
                    <span className="text-zinc-500 block">{t('ops.processes.info.cwd')}:</span>
                    <span className="text-zinc-300 break-all">
                      {infoDaemonDetail.spec?.cwd || infoDaemonDetail.cwd || '-'}
                    </span>
                  </div>
                  <div className="flex gap-4">
                    <div>
                      <span className="text-zinc-500">{t('ops.processes.info.pty')}: </span>
                      <span className="text-zinc-300">
                        {infoDaemonDetail.spec?.pty ? 'true' : 'false'}
                      </span>
                    </div>
                    <div>
                      <span className="text-zinc-500">{t('ops.processes.info.restartPolicy')}: </span>
                      <span className="text-zinc-300">
                        {infoDaemonDetail.spec?.restart || 'no'}
                      </span>
                    </div>
                  </div>
                  {infoDaemonDetail.spec?.ready && (
                    <div>
                      <span className="text-zinc-500 block">{t('ops.processes.info.readyMatch')}:</span>
                      <span className="text-emerald-400 break-all">
                        {infoDaemonDetail.spec.ready.log || `port ${infoDaemonDetail.spec.ready.port}`} (timeout: {infoDaemonDetail.spec.ready.timeoutMs || 15000}ms)
                      </span>
                    </div>
                  )}
                  <div className="flex gap-4">
                    <div>
                      <span className="text-zinc-500">{t('ops.processes.info.persist')}: </span>
                      <span className="text-zinc-300">
                        {infoDaemonDetail.spec?.persist ?? infoDaemonDetail.persist ? 'true' : 'false'}
                      </span>
                    </div>
                    <div>
                      <span className="text-zinc-500">{t('ops.processes.info.detached')}: </span>
                      <span className="text-zinc-300">
                        {infoDaemonDetail.spec?.detached ?? infoDaemonDetail.detached ? 'true' : 'false'}
                      </span>
                    </div>
                  </div>
                </div>
              </div>

              {/* Section 2: Runtime Status */}
              <div className="space-y-2 bg-panel/50 p-3 rounded-lg border border-border">
                <h4 className="font-semibold text-slate-700 dark:text-zinc-300 flex items-center gap-1.5">
                  <Clock className="w-3.5 h-3.5 text-blue-500" />
                  {t('ops.processes.info.statusTitle')}
                </h4>
                <div className="space-y-1.5 text-[11px] font-mono">
                  <div className="flex items-center justify-between">
                    <span className="text-zinc-500">{t('ops.processes.info.state')}:</span>
                    <span
                      className={`px-1.5 py-0.5 rounded text-[10px] uppercase font-semibold ${
                        infoDaemonDetail.state === 'running'
                          ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20'
                          : 'bg-zinc-500/10 text-zinc-400 border border-zinc-500/20'
                      }`}
                    >
                      {infoDaemonDetail.state}
                    </span>
                  </div>
                  <div>
                    <span className="text-zinc-500 block">{t('ops.processes.info.id')}:</span>
                    <span className="text-zinc-300 break-all">{infoDaemonDetail.id || '-'}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-zinc-500">{t('ops.processes.info.created')}:</span>
                    <span className="text-zinc-300">{formatDate(infoDaemonDetail.createdAt)}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-zinc-500">{t('ops.processes.info.started')}:</span>
                    <span className="text-zinc-300">{formatDate(infoDaemonDetail.startedAt)}</span>
                  </div>
                  {infoDaemonDetail.readyAt && (
                    <div className="flex justify-between">
                      <span className="text-zinc-500">{t('ops.processes.info.ready')}:</span>
                      <span className="text-emerald-400">{formatDate(infoDaemonDetail.readyAt)}</span>
                    </div>
                  )}
                  {infoDaemonDetail.exitedAt && (
                    <div className="flex justify-between">
                      <span className="text-zinc-500">{t('ops.processes.info.exited')}:</span>
                      <span className="text-rose-400">
                        {formatDate(infoDaemonDetail.exitedAt)} (code: {infoDaemonDetail.exitCode ?? 0})
                      </span>
                    </div>
                  )}
                  <div className="flex justify-between">
                    <span className="text-zinc-500">{t('ops.processes.info.restartCount')}:</span>
                    <span className="text-zinc-300">{infoDaemonDetail.restartCount ?? 0}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-zinc-500">{t('ops.processes.info.outputBytes')}:</span>
                    <span className="text-zinc-300">{infoDaemonDetail.outputBytes ?? 0} bytes</span>
                  </div>
                </div>
              </div>
            </div>
          ) : null}
        </div>
      )}

      {/* LOGS VIEWER WITH CONTROLS & STREAMING */}
      {viewingLogsDaemon && (
        <div className="p-4 rounded-xl bg-[#0c0d12] border border-border space-y-3">
          {/* Logs Header */}
          <div className="flex items-center justify-between text-xs">
            <div className="flex items-center gap-2">
              <span className="font-mono text-emerald-400 font-semibold">
                {t('ops.processes.logs.title', { name: viewingLogsDaemon })}
              </span>
              {viewingLogsService && (
                <span className="text-[10px] font-mono px-1.5 py-0.5 rounded bg-amber-500/10 text-amber-500 border border-amber-500/20">
                  {viewingLogsService}
                </span>
              )}
              {isFollowing ? (
                <span className="flex items-center gap-1 text-[10px] text-emerald-400 bg-emerald-500/10 px-2 py-0.5 rounded-full border border-emerald-500/20">
                  <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-ping" />
                  {t('ops.processes.logs.streaming')}
                </span>
              ) : (
                <span className="text-[10px] text-zinc-400 bg-zinc-500/10 px-2 py-0.5 rounded-full border border-zinc-500/20">
                  {t('ops.processes.logs.paused')}
                </span>
              )}
            </div>
            <button
              onClick={handleCloseLogs}
              className="text-zinc-400 hover:text-zinc-100 cursor-pointer p-1"
            >
              <X className="w-4 h-4" />
            </button>
          </div>

          {/* Logs Controls Toolbar */}
          <form
            onSubmit={handleApplyLogFilters}
            className="flex flex-wrap items-center gap-2 pt-1 border-t border-zinc-800 text-[11px]"
          >
            {/* Follow Toggle Button */}
            <button
              type="button"
              onClick={handleToggleFollow}
              className={`flex items-center gap-1.5 px-2.5 py-1 rounded border text-xs font-medium transition-colors cursor-pointer ${
                isFollowing
                  ? 'bg-emerald-500/20 border-emerald-500/40 text-emerald-300 hover:bg-emerald-500/30'
                  : 'bg-zinc-800 border-zinc-700 text-zinc-300 hover:bg-zinc-700'
              }`}
            >
              {isFollowing ? <Square className="w-3 h-3" /> : <Play className="w-3 h-3" />}
              <span>{t('ops.processes.logs.followToggle')}</span>
            </button>

            {/* Lines count selector */}
            <div className="flex items-center gap-1 bg-zinc-900 border border-zinc-800 rounded px-2 py-0.5 text-zinc-300">
              <span className="text-zinc-500">{t('ops.processes.logs.lines')}:</span>
              <select
                value={logLinesCount}
                onChange={(e) => setLogLinesCount(Number(e.target.value))}
                className="bg-transparent text-zinc-200 outline-none cursor-pointer"
              >
                <option value={100} className="bg-zinc-900 text-zinc-200">
                  100
                </option>
                <option value={500} className="bg-zinc-900 text-zinc-200">
                  500
                </option>
                <option value={1000} className="bg-zinc-900 text-zinc-200">
                  1000
                </option>
              </select>
            </div>

            {/* Head Toggle */}
            <label className="flex items-center gap-1.5 px-2 py-1 rounded bg-zinc-900 border border-zinc-800 text-zinc-300 cursor-pointer select-none">
              <input
                type="checkbox"
                checked={headFlag}
                onChange={(e) => setHeadFlag(e.target.checked)}
                className="rounded border-zinc-700 bg-zinc-800 text-emerald-500 focus:ring-0"
              />
              <span>{t('ops.processes.logs.headToggle')}</span>
            </label>

            {/* Grep Filter Input */}
            <div className="flex-1 min-w-[140px] flex items-center gap-1 bg-zinc-900 border border-zinc-800 rounded px-2 py-0.5">
              <Search className="w-3 h-3 text-zinc-500 shrink-0" />
              <input
                type="text"
                value={grepFilter}
                onChange={(e) => setGrepFilter(e.target.value)}
                placeholder={t('ops.processes.logs.grepPlaceholder')}
                className="w-full bg-transparent text-zinc-200 placeholder:text-zinc-600 outline-none text-[11px]"
              />
            </div>

            {/* Apply button */}
            <button
              type="submit"
              className="px-2.5 py-1 rounded bg-blue-600 hover:bg-blue-700 text-white font-medium transition-colors cursor-pointer"
            >
              {t('ops.processes.logs.apply')}
            </button>

            {/* Clear Screen */}
            <button
              type="button"
              onClick={() => setDaemonLogsLines([])}
              className="px-2 py-1 rounded bg-zinc-800 hover:bg-zinc-700 text-zinc-400 hover:text-zinc-200 transition-colors cursor-pointer"
              title={t('ops.processes.logs.clear')}
            >
              {t('ops.processes.logs.clear')}
            </button>

            {/* Auto-scroll toggle */}
            <button
              type="button"
              onClick={() => setAutoScroll(!autoScroll)}
              className={`p-1 rounded border transition-colors cursor-pointer ${
                autoScroll
                  ? 'bg-emerald-500/20 border-emerald-500/30 text-emerald-400'
                  : 'bg-zinc-800 border-zinc-700 text-zinc-500'
              }`}
              title={t('ops.processes.autoScrollTitle')}
            >
              <ArrowDown className="w-3 h-3" />
            </button>
          </form>

          {/* Logs Output Box */}
          <div
            ref={logContainerRef}
            className="font-mono text-[11px] text-zinc-300 max-h-72 overflow-y-auto whitespace-pre-wrap leading-relaxed bg-black/40 p-3 rounded-lg border border-zinc-800/80"
          >
            {isLoadingLogs ? (
              <p className="text-zinc-500 text-xs py-4 text-center">
                {t('ops.processes.logs.loading')}
              </p>
            ) : daemonLogsLines.length === 0 ? (
              <p className="text-zinc-600 text-center py-4">{t('ops.processes.logs.empty')}</p>
            ) : (
              daemonLogsLines.map((line, idx) => (
                <div key={idx} className="hover:bg-zinc-800/40 px-1 rounded select-text">
                  {line}
                </div>
              ))
            )}
            <div ref={logsEndRef} />
          </div>
        </div>
      )}
    </div>
  );
});
