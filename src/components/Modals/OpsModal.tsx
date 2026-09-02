import React, { useState, useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';
import {
  X,
  Cpu,
  RefreshCw,
  Download,
  Terminal,
  CheckCircle2,
  Play,
  Sparkles,
  Layers,
  Puzzle,
  Bot,
  Square,
  Activity,
  Trash2,
  RotateCw,
  FileText,
  AlertTriangle,
  FolderGit2,
  Plus,
  Link,
  Package,
} from 'lucide-react';
import type {
  EngineUpdateCheckResult,
  EngineComponentStatus,
  TinyModelItem,
  MaintenanceEvent,
  OmpPsScope,
  OmpWorktreeInfo,
  OmpPluginInfo,
  OmpAgentItem,
} from '../../types';

interface OpsModalProps {
  isOpen: boolean;
  onClose: () => void;
  onRestartEngine?: () => void;
}

type OpsTab = 'engine' | 'processes' | 'worktrees' | 'extensions' | 'agents';

export const OpsModal: React.FC<OpsModalProps> = ({
  isOpen,
  onClose,
  onRestartEngine,
}) => {
  const [activeTab, setActiveTab] = useState<OpsTab>('engine');

  // Engine Maintenance State
  const [updateInfo, setUpdateInfo] = useState<EngineUpdateCheckResult | null>(null);
  const [isCheckingUpdate, setIsCheckingUpdate] = useState(false);
  const [components, setComponents] = useState<EngineComponentStatus[]>([]);
  const [tinyModels, setTinyModels] = useState<TinyModelItem[]>([]);

  // Processes State (Phase 13)
  const [psScopes, setPsScopes] = useState<OmpPsScope[]>([]);
  const [isLoadingPs, setIsLoadingPs] = useState(false);
  const [psError, setPsError] = useState<string | null>(null);
  const [viewingLogsDaemon, setViewingLogsDaemon] = useState<string | null>(null);
  const [daemonLogsText, setDaemonLogsText] = useState<string | null>(null);
  const [isLoadingLogs, setIsLoadingLogs] = useState(false);
  const [daemonActionBusy, setDaemonActionBusy] = useState<string | null>(null);

  // Worktrees State (Phase 13)
  const [worktrees, setWorktrees] = useState<OmpWorktreeInfo[]>([]);
  const [isLoadingWorktrees, setIsLoadingWorktrees] = useState(false);
  const [worktreeError, setWorktreeError] = useState<string | null>(null);
  const [isClearingWorktrees, setIsClearingWorktrees] = useState(false);
  const [showClearConfirm, setShowClearConfirm] = useState(false);
  const [clearAllFlag, setClearAllFlag] = useState(false);

  // Plugins State (Phase 14)
  const [plugins, setPlugins] = useState<OmpPluginInfo[]>([]);
  const [isLoadingPlugins, setIsLoadingPlugins] = useState(false);
  const [pluginError, setPluginError] = useState<string | null>(null);
  const [installTarget, setInstallTarget] = useState('');
  const [installScope, setInstallScope] = useState<'user' | 'project'>('user');
  const [installForce, setInstallForce] = useState(false);
  const [isInstallingPlugin, setIsInstallingPlugin] = useState(false);
  const [linkPath, setLinkPath] = useState('');
  const [isLinkingPlugin, setIsLinkingPlugin] = useState(false);

  // Agents State (Phase 15)
  const [agents, setAgents] = useState<OmpAgentItem[]>([]);
  const [isLoadingAgents, setIsLoadingAgents] = useState(false);
  const [agentsError, setAgentsError] = useState<string | null>(null);
  const [unpackScope, setUnpackScope] = useState<'user' | 'project'>('user');
  const [unpackForce, setUnpackForce] = useState(false);
  const [isUnpackingAgents, setIsUnpackingAgents] = useState(false);
  const [unpackSuccessMsg, setUnpackSuccessMsg] = useState<string | null>(null);

  // Active Task and Log stream
  const [activeTaskId, setActiveTaskId] = useState<string | null>(null);
  const [taskStatus, setTaskStatus] = useState<'idle' | 'running' | 'done' | 'error'>('idle');
  const [logs, setLogs] = useState<string[]>([]);
  const [needRestart, setNeedRestart] = useState(false);
  const logsEndRef = useRef<HTMLDivElement>(null);

  const fetchStatus = async () => {
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
  };

  const fetchProcesses = async () => {
    if (!window.electronAPI?.listProcesses) return;
    setIsLoadingPs(true);
    setPsError(null);
    try {
      const res = await window.electronAPI.listProcesses({ all: true });
      if (res.success && res.scopes) {
        setPsScopes(res.scopes);
      } else {
        setPsError(res.error || 'Không thể tải danh sách processes');
      }
    } catch (err: any) {
      setPsError(err?.message || 'Lỗi khi tải danh sách processes');
    } finally {
      setIsLoadingPs(false);
    }
  };

  const fetchWorktrees = async () => {
    if (!window.electronAPI?.listWorktrees) return;
    setIsLoadingWorktrees(true);
    setWorktreeError(null);
    try {
      const res = await window.electronAPI.listWorktrees();
      if (res.success && res.worktrees) {
        setWorktrees(res.worktrees);
      } else {
        setWorktreeError(res.error || 'Không thể tải danh sách worktrees');
      }
    } catch (err: any) {
      setWorktreeError(err?.message || 'Lỗi khi tải danh sách worktrees');
    } finally {
      setIsLoadingWorktrees(false);
    }
  };

  const fetchPlugins = async () => {
    if (!window.electronAPI?.listPlugins) return;
    setIsLoadingPlugins(true);
    setPluginError(null);
    try {
      const res = await window.electronAPI.listPlugins();
      if (res.success && res.plugins) {
        setPlugins(res.plugins);
      } else {
        setPluginError(res.error || 'Không thể tải danh sách plugins');
      }
    } catch (err: any) {
      setPluginError(err?.message || 'Lỗi khi tải danh sách plugins');
    } finally {
      setIsLoadingPlugins(false);
    }
  };

  const fetchAgents = async () => {
    if (!window.electronAPI?.listAgents) return;
    setIsLoadingAgents(true);
    setAgentsError(null);
    try {
      const res = await window.electronAPI.listAgents();
      if (res.success && res.agents) {
        setAgents(res.agents);
      } else {
        setAgentsError(res.error || 'Không thể tải danh sách agents');
      }
    } catch (err: any) {
      setAgentsError(err?.message || 'Lỗi khi tải danh sách agents');
    } finally {
      setIsLoadingAgents(false);
    }
  };

  useEffect(() => {
    if (isOpen) {
      if (activeTab === 'engine') {
        fetchStatus();
        handleCheckUpdate();
      } else if (activeTab === 'processes') {
        fetchProcesses();
      } else if (activeTab === 'worktrees') {
        fetchWorktrees();
      } else if (activeTab === 'extensions') {
        fetchPlugins();
      } else if (activeTab === 'agents') {
        fetchAgents();
      }
    }
  }, [isOpen, activeTab]);

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
          }
        }
      }
    });

    return () => {
      unsubscribe();
    };
  }, []);

  useEffect(() => {
    logsEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [logs]);

  const handleCheckUpdate = async () => {
    if (!window.electronAPI?.checkEngineUpdate) return;
    setIsCheckingUpdate(true);
    try {
      const res = await window.electronAPI.checkEngineUpdate();
      setUpdateInfo(res);
    } catch (err: any) {
      setUpdateInfo({
        success: false,
        currentVersion: 'unknown',
        hasUpdate: false,
        error: err?.message || 'Lỗi kiểm tra cập nhật',
      });
    } finally {
      setIsCheckingUpdate(false);
    }
  };

  const runTask = async (taskId: string, args: string[]) => {
    if (!window.electronAPI?.runMaintenanceTask || activeTaskId) return;
    setActiveTaskId(taskId);
    setTaskStatus('running');
    setLogs([`> omp ${args.join(' ')}`]);
    setNeedRestart(false);

    try {
      const res = await window.electronAPI.runMaintenanceTask(taskId, args);
      if (!res.success) {
        setTaskStatus('error');
        setLogs((prev) => [...prev, `[Lỗi] ${res.error || 'Không thể bắt đầu tác vụ'}`]);
        setActiveTaskId(null);
      } else if (args.includes('update')) {
        setNeedRestart(true);
      }
    } catch (err: any) {
      setTaskStatus('error');
      setLogs((prev) => [...prev, `[Lỗi ngoại lệ] ${err?.message || String(err)}`]);
      setActiveTaskId(null);
    }
  };

  const cancelCurrentTask = async () => {
    if (!window.electronAPI?.cancelMaintenanceTask) return;
    await window.electronAPI.cancelMaintenanceTask().catch(() => {});
    setActiveTaskId(null);
    setTaskStatus('idle');
    setLogs((prev) => [...prev, '[Tác vụ đã bị huỷ bởi người dùng]']);
  };

  // Process Controls (Phase 13)
  const handleControlDaemon = async (action: 'stop' | 'kill' | 'restart', name: string, global?: string) => {
    if (!window.electronAPI?.controlProcess) return;
    setDaemonActionBusy(name);
    try {
      const res = await window.electronAPI.controlProcess(action, name, { global });
      if (res.success) {
        await fetchProcesses();
      } else {
        alert(`Lỗi khi ${action} process ${name}: ${res.error}`);
      }
    } catch (err: any) {
      alert(`Lỗi: ${err?.message || String(err)}`);
    } finally {
      setDaemonActionBusy(null);
    }
  };

  const handleViewDaemonLogs = async (name: string, global?: string) => {
    if (!window.electronAPI?.getProcessLogs) return;
    setViewingLogsDaemon(name);
    setIsLoadingLogs(true);
    setDaemonLogsText(null);
    try {
      const res = await window.electronAPI.getProcessLogs(name, { lines: 200, global });
      if (res.success && res.logs) {
        setDaemonLogsText(res.logs);
      } else {
        setDaemonLogsText(res.error ? `Lỗi: ${res.error}` : 'Không có logs');
      }
    } catch (err: any) {
      setDaemonLogsText(`Lỗi: ${err?.message || String(err)}`);
    } finally {
      setIsLoadingLogs(false);
    }
  };

  // Worktree Clear (Phase 13)
  const handleClearWorktrees = async () => {
    if (!window.electronAPI?.clearWorktrees) return;
    setIsClearingWorktrees(true);
    try {
      const res = await window.electronAPI.clearWorktrees({ all: clearAllFlag });
      if (res.success) {
        setShowClearConfirm(false);
        await fetchWorktrees();
      } else {
        alert(`Lỗi khi dọn dẹp worktrees: ${res.error}`);
      }
    } catch (err: any) {
      alert(`Lỗi: ${err?.message || String(err)}`);
    } finally {
      setIsClearingWorktrees(false);
    }
  };

  // Plugin Actions (Phase 14)
  const handleInstallPlugin = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    const target = installTarget.trim();
    if (!target || !window.electronAPI?.installPlugin || isInstallingPlugin) return;

    setIsInstallingPlugin(true);
    setPluginError(null);
    try {
      const res = await window.electronAPI.installPlugin(target, {
        scope: installScope,
        force: installForce,
      });
      if (res.success) {
        setInstallTarget('');
        setNeedRestart(true);
        await fetchPlugins();
      } else {
        setPluginError(res.error || 'Lỗi khi cài đặt plugin');
      }
    } catch (err: any) {
      setPluginError(err?.message || 'Lỗi khi cài đặt plugin');
    } finally {
      setIsInstallingPlugin(false);
    }
  };

  const handleUninstallPlugin = async (pluginName: string, scope?: string) => {
    if (!window.electronAPI?.uninstallPlugin) return;
    if (!confirm(`Bạn có chắc muốn gỡ plugin ${pluginName}?`)) return;

    try {
      const res = await window.electronAPI.uninstallPlugin(pluginName, {
        scope: scope === 'project' ? 'project' : 'user',
      });
      if (res.success) {
        setNeedRestart(true);
        await fetchPlugins();
      } else {
        alert(`Lỗi: ${res.error}`);
      }
    } catch (err: any) {
      alert(`Lỗi: ${err?.message || String(err)}`);
    }
  };

  const handleLinkPlugin = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    const p = linkPath.trim();
    if (!p || !window.electronAPI?.linkPlugin || isLinkingPlugin) return;

    setIsLinkingPlugin(true);
    setPluginError(null);
    try {
      const res = await window.electronAPI.linkPlugin(p);
      if (res.success) {
        setLinkPath('');
        setNeedRestart(true);
        await fetchPlugins();
      } else {
        setPluginError(res.error || 'Lỗi khi liên kết plugin');
      }
    } catch (err: any) {
      setPluginError(err?.message || 'Lỗi khi liên kết plugin');
    } finally {
      setIsLinkingPlugin(false);
    }
  };

  // Agents Actions (Phase 15)
  const handleUnpackAgents = async () => {
    if (!window.electronAPI?.unpackAgents || isUnpackingAgents) return;
    setIsUnpackingAgents(true);
    setAgentsError(null);
    setUnpackSuccessMsg(null);

    try {
      const res = await window.electronAPI.unpackAgents({
        scope: unpackScope,
        force: unpackForce,
      });
      if (res.success) {
        setUnpackSuccessMsg(`Đã giải nén agents thành công ra thư mục ${unpackScope === 'project' ? './.omp/agents' : '~/.omp/agent/agents'}`);
        await fetchAgents();
      } else {
        setAgentsError(res.error || 'Lỗi khi giải nén agents');
      }
    } catch (err: any) {
      setAgentsError(err?.message || 'Lỗi khi giải nén agents');
    } finally {
      setIsUnpackingAgents(false);
    }
  };

  if (!isOpen) return null;

  return createPortal(
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-xs animate-fade-in">
      <div className="relative w-full max-w-3xl bg-panel border border-border rounded-2xl shadow-2xl overflow-hidden flex flex-col max-h-[85vh] animate-scale-in">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-border bg-surface/50 shrink-0">
          <div className="flex items-center gap-3">
            <div className="p-2 rounded-xl bg-codex-accent/10 text-codex-accent">
              <Cpu className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-sm font-semibold text-slate-900 dark:text-zinc-100">
                Trung tâm vận hành (Ops Center)
              </h2>
              <p className="text-xs text-slate-500 dark:text-zinc-400">
                Quản lý vòng đời engine, tiến trình nền, worktrees, plugins và subagents
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 rounded-lg text-slate-400 hover:text-slate-700 dark:text-zinc-400 dark:hover:text-zinc-100 hover:bg-surface-highlight transition-colors cursor-pointer"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Tab Navigation */}
        <div className="flex items-center px-4 sm:px-6 border-b border-border bg-surface/20 shrink-0 gap-1 overflow-x-auto">
          <button
            onClick={() => setActiveTab('engine')}
            className={`flex items-center gap-1.5 py-2.5 px-2.5 sm:px-3 text-xs font-medium border-b-2 transition-colors cursor-pointer shrink-0 ${
              activeTab === 'engine'
                ? 'border-codex-accent text-codex-accent font-semibold'
                : 'border-transparent text-slate-500 dark:text-zinc-400 hover:text-slate-800 dark:hover:text-zinc-200'
            }`}
          >
            <Cpu className="w-3.5 h-3.5" />
            <span>Engine & Cập nhật</span>
          </button>

          <button
            onClick={() => setActiveTab('processes')}
            className={`flex items-center gap-1.5 py-2.5 px-2.5 sm:px-3 text-xs font-medium border-b-2 transition-colors cursor-pointer shrink-0 ${
              activeTab === 'processes'
                ? 'border-codex-accent text-codex-accent font-semibold'
                : 'border-transparent text-slate-500 dark:text-zinc-400 hover:text-slate-800 dark:hover:text-zinc-200'
            }`}
          >
            <Activity className="w-3.5 h-3.5" />
            <span>Tiến trình nền (ps)</span>
          </button>

          <button
            onClick={() => setActiveTab('worktrees')}
            className={`flex items-center gap-1.5 py-2.5 px-2.5 sm:px-3 text-xs font-medium border-b-2 transition-colors cursor-pointer shrink-0 ${
              activeTab === 'worktrees'
                ? 'border-codex-accent text-codex-accent font-semibold'
                : 'border-transparent text-slate-500 dark:text-zinc-400 hover:text-slate-800 dark:hover:text-zinc-200'
            }`}
          >
            <FolderGit2 className="w-3.5 h-3.5" />
            <span>Git Worktrees</span>
          </button>

          <button
            onClick={() => setActiveTab('extensions')}
            className={`flex items-center gap-1.5 py-2.5 px-2.5 sm:px-3 text-xs font-medium border-b-2 transition-colors cursor-pointer shrink-0 ${
              activeTab === 'extensions'
                ? 'border-codex-accent text-codex-accent font-semibold'
                : 'border-transparent text-slate-500 dark:text-zinc-400 hover:text-slate-800 dark:hover:text-zinc-200'
            }`}
          >
            <Puzzle className="w-3.5 h-3.5" />
            <span>Plugins & Tools</span>
          </button>

          <button
            onClick={() => setActiveTab('agents')}
            className={`flex items-center gap-1.5 py-2.5 px-2.5 sm:px-3 text-xs font-medium border-b-2 transition-colors cursor-pointer shrink-0 ${
              activeTab === 'agents'
                ? 'border-codex-accent text-codex-accent font-semibold'
                : 'border-transparent text-slate-500 dark:text-zinc-400 hover:text-slate-800 dark:hover:text-zinc-200'
            }`}
          >
            <Bot className="w-3.5 h-3.5" />
            <span>Agents Manager</span>
          </button>
        </div>

        {/* Tab Content */}
        <div className="flex-1 overflow-y-auto p-6 space-y-6">
          {/* TAB 1: ENGINE */}
          {activeTab === 'engine' && (
            <>
              {/* Version & Update Card */}
              <div className="p-4 rounded-xl border border-border bg-surface/30 space-y-3">
                <div className="flex items-center justify-between">
                  <div>
                    <h3 className="text-xs font-semibold text-slate-900 dark:text-zinc-100 flex items-center gap-2">
                      <span>Phiên bản OMP Engine</span>
                      {updateInfo?.currentVersion && (
                        <span className="px-2 py-0.5 rounded-full text-[11px] font-mono font-medium bg-codex-accent/10 text-codex-accent border border-codex-accent/20">
                          v{updateInfo.currentVersion}
                        </span>
                      )}
                    </h3>
                    <p className="text-[11px] text-slate-500 dark:text-zinc-400 mt-0.5">
                      Động cơ AI cốt lõi điều khiển toàn bộ suy luận và công cụ của OMP.
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
                      <span>{isCheckingUpdate ? 'Đang kiểm tra...' : 'Kiểm tra cập nhật'}</span>
                    </button>

                    {updateInfo?.hasUpdate && (
                      <button
                        type="button"
                        onClick={() => runTask('engine-update', ['update', '--force'])}
                        disabled={Boolean(activeTaskId)}
                        className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium bg-emerald-600 hover:bg-emerald-700 text-white shadow-sm transition-colors cursor-pointer disabled:opacity-50"
                      >
                        <Download className="w-3.5 h-3.5" />
                        <span>Cài bản v{updateInfo.latestVersion || 'mới'}</span>
                      </button>
                    )}
                  </div>
                </div>

                {updateInfo?.hasUpdate && (
                  <div className="p-3 rounded-lg bg-emerald-500/10 border border-emerald-500/20 text-emerald-700 dark:text-emerald-400 text-xs flex items-center gap-2">
                    <Sparkles className="w-4 h-4 shrink-0" />
                    <span>
                      Đã có phiên bản mới: <strong>v{updateInfo.latestVersion}</strong>. Bấm nút "Cài bản mới" để cập nhật tự động.
                    </span>
                  </div>
                )}
              </div>

              {/* Optional Components */}
              <div className="space-y-3">
                <h3 className="text-xs font-semibold text-slate-900 dark:text-zinc-100 flex items-center gap-2">
                  <Layers className="w-4 h-4 text-codex-accent" />
                  <span>Các thành phần mở rộng hệ thống</span>
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
                              <span>Đã sẵn sàng</span>
                            </span>
                          ) : (
                            <span className="text-[11px] text-slate-400 dark:text-zinc-500">
                              Chưa cài đặt
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
                          <span>{comp.isInstalled ? 'Cài lại' : 'Cài đặt'}</span>
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              {/* Tiny Local Models */}
              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <h3 className="text-xs font-semibold text-slate-900 dark:text-zinc-100 flex items-center gap-2">
                    <Cpu className="w-4 h-4 text-codex-accent" />
                    <span>Tiny Local Models (Tiêu đề & Bộ nhớ cục bộ)</span>
                  </h3>
                  <button
                    type="button"
                    onClick={() => runTask('download-tiny-models', ['tiny-models', 'download', 'all'])}
                    disabled={Boolean(activeTaskId)}
                    className="text-[11px] text-codex-accent hover:underline cursor-pointer disabled:opacity-50 font-medium"
                  >
                    Tải tất cả models
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
                              mặc định
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
                        Tải model
                      </button>
                    </div>
                  ))}
                </div>
              </div>

              {/* Live Output Log Stream */}
              {logs.length > 0 && (
                <div className="space-y-2">
                  <div className="flex items-center justify-between">
                    <h3 className="text-xs font-semibold text-slate-900 dark:text-zinc-100 flex items-center gap-2">
                      <Terminal className="w-4 h-4 text-emerald-500" />
                      <span>Log thực thi</span>
                      {taskStatus === 'running' && (
                        <span className="px-1.5 py-0.2 rounded text-[10px] bg-amber-500/10 text-amber-500 border border-amber-500/20 font-normal">
                          Đang chạy...
                        </span>
                      )}
                      {taskStatus === 'done' && (
                        <span className="px-1.5 py-0.2 rounded text-[10px] bg-emerald-500/10 text-emerald-500 border border-emerald-500/20 font-normal">
                          Hoàn tất
                        </span>
                      )}
                      {taskStatus === 'error' && (
                        <span className="px-1.5 py-0.2 rounded text-[10px] bg-rose-500/10 text-rose-500 border border-rose-500/20 font-normal">
                          Lỗi
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
                        <span>Huỷ tác vụ</span>
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
                        Cấu hình đã thay đổi. Vui lòng khởi động lại engine để nạp đầy đủ phiên bản và extension mới.
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
                          Khởi động lại ngay
                        </button>
                      )}
                    </div>
                  )}
                </div>
              )}
            </>
          )}

          {/* TAB 2: PROCESSES (Phase 13) */}
          {activeTab === 'processes' && (
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <div>
                  <h3 className="text-xs font-semibold text-slate-900 dark:text-zinc-100 flex items-center gap-2">
                    <Activity className="w-4 h-4 text-emerald-500" />
                    <span>Background Daemons (`omp ps`)</span>
                  </h3>
                  <p className="text-[11px] text-slate-500 dark:text-zinc-400">
                    Danh sách các tiến trình nền được quản lý bởi daemon OMP (server web, watcher, relay).
                  </p>
                </div>

                <button
                  type="button"
                  onClick={fetchProcesses}
                  disabled={isLoadingPs}
                  className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium bg-surface hover:bg-surface-highlight text-slate-700 dark:text-zinc-300 border border-border transition-colors cursor-pointer disabled:opacity-50"
                >
                  <RefreshCw className={`w-3.5 h-3.5 ${isLoadingPs ? 'animate-spin' : ''}`} />
                  <span>Làm mới</span>
                </button>
              </div>

              {psError && (
                <div className="p-3 rounded-lg bg-rose-500/10 border border-rose-500/20 text-rose-600 dark:text-rose-400 text-xs">
                  {psError}
                </div>
              )}

              {psScopes.length === 0 && !isLoadingPs ? (
                <div className="p-8 text-center text-slate-400 dark:text-zinc-500 border border-dashed border-border rounded-xl">
                  Không có daemon process nào đang chạy.
                </div>
              ) : (
                psScopes.map((scope, sIdx) => (
                  <div key={sIdx} className="space-y-2">
                    <div className="text-[11px] font-semibold text-slate-600 dark:text-zinc-400 flex items-center gap-1.5">
                      <span className="uppercase px-1.5 py-0.5 rounded bg-surface border border-border text-[10px]">
                        {scope.kind}
                      </span>
                      <span>{scope.projectDir || scope.service || scope.runtimeDir}</span>
                      {scope.brokerPid && (
                        <span className="text-zinc-500 font-mono text-[10px]">pid: {scope.brokerPid}</span>
                      )}
                    </div>

                    {scope.daemons.length === 0 ? (
                      <div className="p-3 rounded-lg bg-surface/20 border border-border text-[11px] text-zinc-500 italic">
                        Không có tiến trình trong scope này
                      </div>
                    ) : (
                      <div className="space-y-2">
                        {scope.daemons.map((d) => {
                          const isRunning = d.state === 'running';
                          return (
                            <div
                              key={d.name}
                              className="p-3 rounded-xl border border-border bg-surface/30 flex flex-col md:flex-row md:items-center justify-between gap-3 text-xs"
                            >
                              <div className="space-y-1 min-w-0">
                                <div className="flex items-center gap-2">
                                  <span className="font-mono font-bold text-slate-800 dark:text-zinc-200">
                                    {d.name}
                                  </span>
                                  <span
                                    className={`px-1.5 py-0.5 rounded text-[10px] font-medium ${
                                      isRunning
                                        ? 'bg-emerald-500/10 text-emerald-500 border border-emerald-500/20'
                                        : 'bg-zinc-500/10 text-zinc-400 border border-zinc-500/20'
                                    }`}
                                  >
                                    {d.state}
                                  </span>
                                  {d.exitCode !== undefined && (
                                    <span className="text-[10px] text-zinc-500 font-mono">
                                      exit: {d.exitCode}
                                    </span>
                                  )}
                                </div>
                                {d.command && (
                                  <p className="text-[11px] font-mono text-slate-500 dark:text-zinc-400 truncate">
                                    $ {d.command}
                                  </p>
                                )}
                              </div>

                              {/* Action buttons */}
                              <div className="flex items-center gap-1.5 shrink-0">
                                <button
                                  type="button"
                                  onClick={() => handleViewDaemonLogs(d.name, scope.service)}
                                  className="p-1.5 rounded bg-panel border border-border hover:bg-surface-highlight text-zinc-400 hover:text-zinc-100 transition-colors cursor-pointer"
                                  title="Xem logs"
                                >
                                  <FileText className="w-3.5 h-3.5" />
                                </button>
                                {isRunning && (
                                  <button
                                    type="button"
                                    onClick={() => handleControlDaemon('stop', d.name, scope.service)}
                                    disabled={daemonActionBusy === d.name}
                                    className="px-2 py-1 rounded bg-amber-500/10 border border-amber-500/20 text-amber-500 hover:bg-amber-500/20 text-xs font-medium transition-colors cursor-pointer"
                                  >
                                    Dừng
                                  </button>
                                )}
                                <button
                                  type="button"
                                  onClick={() => handleControlDaemon('restart', d.name, scope.service)}
                                  disabled={daemonActionBusy === d.name}
                                  className="p-1.5 rounded bg-panel border border-border hover:bg-surface-highlight text-zinc-400 hover:text-zinc-100 transition-colors cursor-pointer"
                                  title="Khởi động lại"
                                >
                                  <RotateCw className="w-3.5 h-3.5" />
                                </button>
                                <button
                                  type="button"
                                  onClick={() => {
                                    if (confirm(`Bạn có chắc muốn ép dừng (kill) process ${d.name}?`)) {
                                      handleControlDaemon('kill', d.name, scope.service);
                                    }
                                  }}
                                  disabled={daemonActionBusy === d.name}
                                  className="p-1.5 rounded bg-rose-500/10 border border-rose-500/20 text-rose-500 hover:bg-rose-500/20 transition-colors cursor-pointer"
                                  title="Ép dừng (Kill)"
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

              {/* Daemon Logs Modal Viewer */}
              {viewingLogsDaemon && (
                <div className="p-4 rounded-xl bg-[#0c0d12] border border-border space-y-2">
                  <div className="flex items-center justify-between text-xs">
                    <span className="font-mono text-emerald-400 font-semibold">
                      Logs: {viewingLogsDaemon}
                    </span>
                    <button
                      onClick={() => setViewingLogsDaemon(null)}
                      className="text-zinc-400 hover:text-zinc-100 cursor-pointer"
                    >
                      <X className="w-4 h-4" />
                    </button>
                  </div>
                  {isLoadingLogs ? (
                    <p className="text-zinc-500 text-xs py-4">Đang tải logs...</p>
                  ) : (
                    <pre className="font-mono text-[11px] text-zinc-300 max-h-60 overflow-y-auto whitespace-pre-wrap leading-relaxed">
                      {daemonLogsText || '(Không có log)'}
                    </pre>
                  )}
                </div>
              )}
            </div>
          )}

          {/* TAB 3: WORKTREES (Phase 13) */}
          {activeTab === 'worktrees' && (
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <div>
                  <h3 className="text-xs font-semibold text-slate-900 dark:text-zinc-100 flex items-center gap-2">
                    <FolderGit2 className="w-4 h-4 text-blue-500" />
                    <span>Agent Git Worktrees (`~/.omp/wt`)</span>
                  </h3>
                  <p className="text-[11px] text-slate-500 dark:text-zinc-400">
                    Quản lý các bản sao git worktree cô lập do các subagent tạo ra trong quá trình làm việc.
                  </p>
                </div>

                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={fetchWorktrees}
                    disabled={isLoadingWorktrees}
                    className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium bg-surface hover:bg-surface-highlight text-slate-700 dark:text-zinc-300 border border-border transition-colors cursor-pointer disabled:opacity-50"
                  >
                    <RefreshCw className={`w-3.5 h-3.5 ${isLoadingWorktrees ? 'animate-spin' : ''}`} />
                    <span>Làm mới</span>
                  </button>

                  <button
                    type="button"
                    onClick={() => setShowClearConfirm(true)}
                    disabled={isClearingWorktrees}
                    className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium bg-rose-600 hover:bg-rose-700 text-white shadow-sm transition-colors cursor-pointer disabled:opacity-50"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                    <span>Dọn dẹp worktrees</span>
                  </button>
                </div>
              </div>

              {worktreeError && (
                <div className="p-3 rounded-lg bg-rose-500/10 border border-rose-500/20 text-rose-600 dark:text-rose-400 text-xs">
                  {worktreeError}
                </div>
              )}

              {/* Confirm Dialog */}
              {showClearConfirm && (
                <div className="p-4 rounded-xl bg-rose-500/10 border border-rose-500/20 space-y-3 text-xs">
                  <div className="flex items-center gap-2 text-rose-600 dark:text-rose-400 font-semibold">
                    <AlertTriangle className="w-4 h-4" />
                    <span>Xác nhận dọn dẹp các git worktree rác?</span>
                  </div>
                  <p className="text-slate-600 dark:text-zinc-300 text-[11px] leading-relaxed">
                    Hành động này sẽ giải phóng dung lượng ổ cứng bằng cách xoá các thư mục worktree cũ trong <code className="font-mono bg-surface px-1 py-0.5 rounded">~/.omp/wt</code>.
                  </p>

                  <label className="flex items-center gap-2 cursor-pointer select-none">
                    <input
                      type="checkbox"
                      checked={clearAllFlag}
                      onChange={(e) => setClearAllFlag(e.target.checked)}
                      className="rounded border-border text-rose-600 focus:ring-rose-500"
                    />
                    <span className="text-[11px] text-slate-700 dark:text-zinc-300">
                      Xoá tất cả (bao gồm cả live PR-checkout worktrees) --all
                    </span>
                  </label>

                  <div className="flex items-center justify-end gap-2 pt-1">
                    <button
                      type="button"
                      onClick={() => setShowClearConfirm(false)}
                      className="px-3 py-1 rounded bg-surface hover:bg-surface-highlight text-zinc-300 cursor-pointer"
                    >
                      Huỷ
                    </button>
                    <button
                      type="button"
                      onClick={handleClearWorktrees}
                      disabled={isClearingWorktrees}
                      className="px-3 py-1 rounded bg-rose-600 hover:bg-rose-700 text-white font-semibold cursor-pointer disabled:opacity-50"
                    >
                      {isClearingWorktrees ? 'Đang dọn...' : 'Xác nhận dọn dẹp'}
                    </button>
                  </div>
                </div>
              )}

              {worktrees.length === 0 && !isLoadingWorktrees ? (
                <div className="p-8 text-center text-slate-400 dark:text-zinc-500 border border-dashed border-border rounded-xl">
                  Không có git worktree nào đang tồn tại.
                </div>
              ) : (
                <div className="space-y-2">
                  {worktrees.map((wt, idx) => (
                    <div
                      key={idx}
                      className="p-3 rounded-xl border border-border bg-surface/30 flex items-center justify-between text-xs"
                    >
                      <div className="space-y-0.5 min-w-0">
                        <div className="flex items-center gap-2">
                          <span className="font-mono font-medium text-slate-800 dark:text-zinc-200 truncate">
                            {wt.path}
                          </span>
                          {wt.branch && (
                            <span className="px-1.5 py-0.2 rounded bg-blue-500/10 text-blue-500 border border-blue-500/20 text-[10px] font-mono">
                              {wt.branch}
                            </span>
                          )}
                          {wt.isDirty && (
                            <span className="px-1.5 py-0.2 rounded bg-amber-500/10 text-amber-500 border border-amber-500/20 text-[10px]">
                              dirty
                            </span>
                          )}
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* TAB 4: EXTENSIONS (Phase 14) */}
          {activeTab === 'extensions' && (
            <div className="space-y-5">
              <div className="flex items-center justify-between">
                <div>
                  <h3 className="text-xs font-semibold text-slate-900 dark:text-zinc-100 flex items-center gap-2">
                    <Puzzle className="w-4 h-4 text-purple-500" />
                    <span>Plugins & Extensions (`omp plugin`)</span>
                  </h3>
                  <p className="text-[11px] text-slate-500 dark:text-zinc-400">
                    Cài đặt và quản lý các plugin mở rộng, MCP servers và custom tools.
                  </p>
                </div>

                <button
                  type="button"
                  onClick={fetchPlugins}
                  disabled={isLoadingPlugins}
                  className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium bg-surface hover:bg-surface-highlight text-slate-700 dark:text-zinc-300 border border-border transition-colors cursor-pointer disabled:opacity-50"
                >
                  <RefreshCw className={`w-3.5 h-3.5 ${isLoadingPlugins ? 'animate-spin' : ''}`} />
                  <span>Làm mới</span>
                </button>
              </div>

              {pluginError && (
                <div className="p-3 rounded-lg bg-rose-500/10 border border-rose-500/20 text-rose-600 dark:text-rose-400 text-xs">
                  {pluginError}
                </div>
              )}

              {/* Install form */}
              <div className="p-4 rounded-xl border border-border bg-surface/30 space-y-3">
                <h4 className="text-xs font-semibold text-slate-800 dark:text-zinc-200 flex items-center gap-1.5">
                  <Package className="w-3.5 h-3.5 text-blue-500" />
                  <span>Cài đặt plugin từ npm / registry</span>
                </h4>
                <form onSubmit={handleInstallPlugin} className="space-y-2.5">
                  <div className="flex flex-col sm:flex-row gap-2">
                    <input
                      type="text"
                      value={installTarget}
                      onChange={(e) => setInstallTarget(e.target.value)}
                      placeholder="Nhập tên package (ví dụ: @omp/plugin-github, omp-mcp-server)..."
                      disabled={isInstallingPlugin}
                      className="flex-1 px-3 py-1.5 rounded-lg bg-surface border border-border text-xs text-slate-900 dark:text-zinc-100 font-mono outline-none"
                    />
                    <select
                      value={installScope}
                      onChange={(e) => setInstallScope(e.target.value as any)}
                      className="px-2.5 py-1.5 rounded-lg bg-surface border border-border text-xs text-slate-700 dark:text-zinc-300 outline-none"
                    >
                      <option value="user">User scope (~/.omp)</option>
                      <option value="project">Project scope (./.omp)</option>
                    </select>
                    <button
                      type="submit"
                      disabled={!installTarget.trim() || isInstallingPlugin}
                      className="flex items-center justify-center gap-1 px-4 py-1.5 rounded-lg bg-blue-600 hover:bg-blue-700 text-white font-medium text-xs shadow-sm transition-colors cursor-pointer disabled:opacity-50 shrink-0"
                    >
                      <Plus className="w-3.5 h-3.5" />
                      <span>{isInstallingPlugin ? 'Đang cài...' : 'Cài đặt'}</span>
                    </button>
                  </div>

                  <label className="flex items-center gap-2 cursor-pointer select-none">
                    <input
                      type="checkbox"
                      checked={installForce}
                      onChange={(e) => setInstallForce(e.target.checked)}
                      className="rounded border-border text-blue-600 focus:ring-blue-500"
                    />
                    <span className="text-[11px] text-slate-500 dark:text-zinc-400">
                      Ép cài đặt lại nếu đã tồn tại (--force)
                    </span>
                  </label>
                </form>
              </div>

              {/* Local Link form */}
              <div className="p-4 rounded-xl border border-border bg-surface/30 space-y-3">
                <h4 className="text-xs font-semibold text-slate-800 dark:text-zinc-200 flex items-center gap-1.5">
                  <Link className="w-3.5 h-3.5 text-emerald-500" />
                  <span>Liên kết plugin phát triển cục bộ (`omp plugin link`)</span>
                </h4>
                <form onSubmit={handleLinkPlugin} className="flex gap-2">
                  <input
                    type="text"
                    value={linkPath}
                    onChange={(e) => setLinkPath(e.target.value)}
                    placeholder="Đường dẫn thư mục plugin local (ví dụ: ./packages/my-plugin)..."
                    disabled={isLinkingPlugin}
                    className="flex-1 px-3 py-1.5 rounded-lg bg-surface border border-border text-xs text-slate-900 dark:text-zinc-100 font-mono outline-none"
                  />
                  <button
                    type="submit"
                    disabled={!linkPath.trim() || isLinkingPlugin}
                    className="flex items-center gap-1 px-4 py-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white font-medium text-xs shadow-sm transition-colors cursor-pointer disabled:opacity-50 shrink-0"
                  >
                    <Link className="w-3.5 h-3.5" />
                    <span>{isLinkingPlugin ? 'Đang link...' : 'Liên kết'}</span>
                  </button>
                </form>
              </div>

              {/* Installed Plugins list */}
              <div className="space-y-2">
                <h4 className="text-xs font-semibold text-slate-800 dark:text-zinc-200">
                  Plugins đã cài đặt ({plugins.length})
                </h4>

                {plugins.length === 0 && !isLoadingPlugins ? (
                  <div className="p-6 text-center text-slate-400 dark:text-zinc-500 border border-dashed border-border rounded-xl text-xs">
                    Chưa có plugin nào được cài đặt.
                  </div>
                ) : (
                  plugins.map((p) => (
                    <div
                      key={p.name}
                      className="p-3 rounded-xl border border-border bg-surface/30 flex items-center justify-between text-xs"
                    >
                      <div className="space-y-0.5">
                        <div className="flex items-center gap-2">
                          <span className="font-mono font-semibold text-slate-800 dark:text-zinc-200">
                            {p.name}
                          </span>
                          {p.version && (
                            <span className="px-1.5 py-0.2 rounded bg-surface border border-border text-[10px] font-mono text-zinc-400">
                              v{p.version}
                            </span>
                          )}
                          {p.source && (
                            <span className="px-1.5 py-0.2 rounded bg-purple-500/10 text-purple-500 border border-purple-500/20 text-[10px]">
                              {p.source}
                            </span>
                          )}
                        </div>
                        {p.description && (
                          <p className="text-[11px] text-slate-500 dark:text-zinc-400">
                            {p.description}
                          </p>
                        )}
                      </div>

                      <button
                        type="button"
                        onClick={() => handleUninstallPlugin(p.name, p.scope)}
                        className="px-2.5 py-1 rounded bg-rose-500/10 border border-rose-500/20 text-rose-500 hover:bg-rose-500/20 text-xs transition-colors cursor-pointer"
                      >
                        Gỡ cài đặt
                      </button>
                    </div>
                  ))
                )}
              </div>
            </div>
          )}

          {/* TAB 5: AGENTS (Phase 15) */}
          {activeTab === 'agents' && (
            <div className="space-y-5">
              <div className="flex items-center justify-between">
                <div>
                  <h3 className="text-xs font-semibold text-slate-900 dark:text-zinc-100 flex items-center gap-2">
                    <Bot className="w-4 h-4 text-amber-500" />
                    <span>Bundled & Custom Agents (`omp agents`)</span>
                  </h3>
                  <p className="text-[11px] text-slate-500 dark:text-zinc-400">
                    Khám phá và giải nén các agent chuyên biệt được tích hợp sẵn trong OMP.
                  </p>
                </div>

                <button
                  type="button"
                  onClick={fetchAgents}
                  disabled={isLoadingAgents}
                  className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium bg-surface hover:bg-surface-highlight text-slate-700 dark:text-zinc-300 border border-border transition-colors cursor-pointer disabled:opacity-50"
                >
                  <RefreshCw className={`w-3.5 h-3.5 ${isLoadingAgents ? 'animate-spin' : ''}`} />
                  <span>Làm mới</span>
                </button>
              </div>

              {agentsError && (
                <div className="p-3 rounded-lg bg-rose-500/10 border border-rose-500/20 text-rose-600 dark:text-rose-400 text-xs">
                  {agentsError}
                </div>
              )}

              {unpackSuccessMsg && (
                <div className="p-3 rounded-lg bg-emerald-500/10 border border-emerald-500/20 text-emerald-600 dark:text-emerald-400 text-xs">
                  {unpackSuccessMsg}
                </div>
              )}

              {/* Unpack actions */}
              <div className="p-4 rounded-xl border border-border bg-surface/30 space-y-3">
                <h4 className="text-xs font-semibold text-slate-800 dark:text-zinc-200 flex items-center gap-1.5">
                  <Download className="w-3.5 h-3.5 text-amber-500" />
                  <span>Giải nén Bundled Agents (`omp agents unpack`)</span>
                </h4>
                <p className="text-[11px] text-slate-500 dark:text-zinc-400 leading-relaxed">
                  Xuất các prompt và cấu hình agent mặc định ra file markdown/yaml để tuỳ biến sâu cho cá nhân hoặc dự án.
                </p>

                <div className="flex flex-wrap items-center gap-3 pt-1">
                  <select
                    value={unpackScope}
                    onChange={(e) => setUnpackScope(e.target.value as any)}
                    className="px-3 py-1.5 rounded-lg bg-surface border border-border text-xs text-slate-700 dark:text-zinc-300 outline-none"
                  >
                    <option value="user">User config (~/.omp/agent/agents)</option>
                    <option value="project">Project config (./.omp/agents)</option>
                  </select>

                  <label className="flex items-center gap-2 cursor-pointer select-none text-xs text-slate-600 dark:text-zinc-400">
                    <input
                      type="checkbox"
                      checked={unpackForce}
                      onChange={(e) => setUnpackForce(e.target.checked)}
                      className="rounded border-border text-amber-600 focus:ring-amber-500"
                    />
                    <span>Ghi đè file nếu đã tồn tại (--force)</span>
                  </label>

                  <button
                    type="button"
                    onClick={handleUnpackAgents}
                    disabled={isUnpackingAgents}
                    className="flex items-center gap-1.5 px-4 py-1.5 rounded-lg bg-amber-600 hover:bg-amber-700 text-white font-medium text-xs shadow-sm transition-colors cursor-pointer disabled:opacity-50 ml-auto"
                  >
                    <Download className="w-3.5 h-3.5" />
                    <span>{isUnpackingAgents ? 'Đang giải nén...' : 'Giải nén Agents'}</span>
                  </button>
                </div>
              </div>

              {/* Agents catalog */}
              <div className="space-y-2">
                <h4 className="text-xs font-semibold text-slate-800 dark:text-zinc-200">
                  Danh mục Agents ({agents.length})
                </h4>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-2.5">
                  {agents.map((a) => (
                    <div
                      key={`${a.scope}-${a.id}`}
                      className="p-3 rounded-xl border border-border bg-surface/30 space-y-1 text-xs"
                    >
                      <div className="flex items-center justify-between">
                        <span className="font-mono font-semibold text-slate-800 dark:text-zinc-200">
                          {a.name}
                        </span>
                        <span
                          className={`px-1.5 py-0.2 rounded text-[10px] font-medium ${
                            a.scope === 'bundled'
                              ? 'bg-amber-500/10 text-amber-500 border border-amber-500/20'
                              : a.scope === 'project'
                              ? 'bg-blue-500/10 text-blue-500 border border-blue-500/20'
                              : 'bg-purple-500/10 text-purple-500 border border-purple-500/20'
                          }`}
                        >
                          {a.scope}
                        </span>
                      </div>
                      {a.description && (
                        <p className="text-[11px] text-slate-500 dark:text-zinc-400">
                          {a.description}
                        </p>
                      )}
                      {a.path && (
                        <p className="text-[10px] font-mono text-zinc-500 truncate pt-0.5">
                          {a.path}
                        </p>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="flex items-center justify-between px-6 py-3 border-t border-border bg-surface/30 shrink-0">
          <span className="text-[11px] text-slate-400 dark:text-zinc-500">
            OMP Engine Operations Controller
          </span>
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-1.5 rounded-xl text-xs font-medium text-slate-600 dark:text-zinc-400 hover:text-slate-900 dark:hover:text-zinc-100 hover:bg-surface-highlight transition-colors cursor-pointer"
          >
            Đóng
          </button>
        </div>
      </div>
    </div>,
    document.body
  );
};
