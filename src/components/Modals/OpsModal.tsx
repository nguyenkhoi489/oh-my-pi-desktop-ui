import React, { useState, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { EngineTab } from './ops/EngineTab.tsx';
import { ExtensionsTab } from './ops/ExtensionsTab.tsx';
import { ProcessesTab } from './ops/ProcessesTab.tsx';
import { StorageTab } from './ops/StorageTab.tsx';
import { SshTab } from './ops/SshTab.tsx';
import { GrievancesTab } from './ops/GrievancesTab.tsx';
import { useI18n } from '../../i18n/I18nProvider.tsx';
import {
  X,
  Cpu,
  Puzzle,
  Bot,
  Activity,
  Trash2,
  AlertTriangle,
  FolderGit2,
  RefreshCw,
  Download,
  Database,
  Server,
  Wrench,
} from 'lucide-react';
import type {
  OmpWorktreeInfo,
  OmpAgentItem,
  OmpAgentStatus,
  SshHostsListResponse,
  SshHostAddInput,
  SshHostMutationResponse,
  GrievancesListOptions,
  GrievancesListResponse,
  GrievancesCleanOptions,
  GrievancesCleanResponse,
  GrievancesPushResponse,
} from '../../types';

interface OpsModalProps {
  isOpen: boolean;
  onClose: () => void;
  onRestartEngine?: () => void;
  status?: OmpAgentStatus;
  onOpenCommitModal?: () => void;
  listSshHosts?: () => Promise<SshHostsListResponse>;
  addSshHost?: (input: SshHostAddInput) => Promise<SshHostMutationResponse>;
  removeSshHost?: (name: string, scope: 'project' | 'user') => Promise<SshHostMutationResponse>;
  listGrievances?: (options?: GrievancesListOptions) => Promise<GrievancesListResponse>;
  cleanGrievances?: (options: GrievancesCleanOptions) => Promise<GrievancesCleanResponse>;
  pushGrievances?: (options?: { profile?: string | null }) => Promise<GrievancesPushResponse>;
  initialTab?: OpsTab;
}

type OpsTab = 'engine' | 'processes' | 'worktrees' | 'extensions' | 'agents' | 'storage' | 'ssh' | 'grievances';

export const OpsModal: React.FC<OpsModalProps> = ({
  isOpen,
  onClose,
  onRestartEngine,
  status,
  onOpenCommitModal,
  listSshHosts,
  addSshHost,
  removeSshHost,
  listGrievances,
  cleanGrievances,
  pushGrievances,
  initialTab,
}) => {
  const [activeTab, setActiveTab] = useState<OpsTab>('engine');
  const { t } = useI18n();

  useEffect(() => {
    if (isOpen && initialTab) {
      setActiveTab(initialTab);
    }
  }, [isOpen, initialTab]);

  // Tab-specific state
  // Worktrees State (Phase 13)
  const [worktrees, setWorktrees] = useState<OmpWorktreeInfo[]>([]);
  const [isLoadingWorktrees, setIsLoadingWorktrees] = useState(false);
  const [worktreeError, setWorktreeError] = useState<string | null>(null);
  const [isClearingWorktrees, setIsClearingWorktrees] = useState(false);
  const [showClearConfirm, setShowClearConfirm] = useState(false);
  const [clearAllFlag, setClearAllFlag] = useState(false);

  // Plugins Tab handled by ExtensionsTab component
  // Agents State (Phase 15)
  const [agents, setAgents] = useState<OmpAgentItem[]>([]);
  const [isLoadingAgents, setIsLoadingAgents] = useState(false);
  const [agentsError, setAgentsError] = useState<string | null>(null);
  const [unpackScope, setUnpackScope] = useState<'user' | 'project'>('user');
  const [unpackForce, setUnpackForce] = useState(false);
  const [isUnpackingAgents, setIsUnpackingAgents] = useState(false);
  const [unpackSuccessMsg, setUnpackSuccessMsg] = useState<string | null>(null);


  const fetchWorktrees = async () => {
    if (!window.electronAPI?.listWorktrees) return;
    setIsLoadingWorktrees(true);
    setWorktreeError(null);
    try {
      const res = await window.electronAPI.listWorktrees();
      if (res.success && res.worktrees) {
        setWorktrees(res.worktrees);
      } else {
        setWorktreeError(res.error || t('ops.worktrees.fetchError'));
      }
    } catch (err: any) {
      setWorktreeError(err?.message || t('ops.worktrees.fetchErrorDetail'));
    } finally {
      setIsLoadingWorktrees(false);
    }
  };

  // Plugins fetch handled by ExtensionsTab

  const fetchAgents = async () => {
    if (!window.electronAPI?.listAgents) return;
    setIsLoadingAgents(true);
    setAgentsError(null);
    try {
      const res = await window.electronAPI.listAgents();
      if (res.success && res.agents) {
        setAgents(res.agents);
      } else {
        setAgentsError(res.error || t('ops.agents.fetchError'));
      }
    } catch (err: any) {
      setAgentsError(err?.message || t('ops.agents.fetchErrorDetail'));
    } finally {
      setIsLoadingAgents(false);
    }
  };

  useEffect(() => {
    if (isOpen) {
      if (activeTab === 'worktrees') {
        fetchWorktrees();
      } else if (activeTab === 'agents') {
        fetchAgents();
      }
    }
  }, [isOpen, activeTab]);


  // Process Controls (Phase 13)
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
        alert(t('ops.worktrees.clearError', { error: res.error || '' }));
      }
    } catch (err: any) {
      alert(t('ops.worktrees.clearError', { error: err?.message || String(err) }));
    } finally {
      setIsClearingWorktrees(false);
    }
  };

  // Plugin actions handled by ExtensionsTab
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
        setUnpackSuccessMsg(t('ops.agents.unpackSuccess', { path: unpackScope === 'project' ? './.omp/agents' : '~/.omp/agent/agents' }));
        await fetchAgents();
      } else {
        setAgentsError(res.error || t('ops.agents.unpackError'));
      }
    } catch (err: any) {
      setAgentsError(err?.message || t('ops.agents.unpackError'));
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
                {t('ops.modal.title')}
              </h2>
              <p className="text-xs text-slate-500 dark:text-zinc-400">
                {t('ops.modal.desc')}
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
            <span>{t('ops.tab.engine')}</span>
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
            <span>{t('ops.tab.processes')}</span>
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
            <span>{t('ops.tab.worktrees')}</span>
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

          <button
            onClick={() => setActiveTab('storage')}
            className={`flex items-center gap-1.5 py-2.5 px-2.5 sm:px-3 text-xs font-medium border-b-2 transition-colors cursor-pointer shrink-0 ${
              activeTab === 'storage'
                ? 'border-codex-accent text-codex-accent font-semibold'
                : 'border-transparent text-slate-500 dark:text-zinc-400 hover:text-slate-800 dark:hover:text-zinc-200'
            }`}
          >
            <Database className="w-3.5 h-3.5" />
            <span>{t('ops.tab.storage')}</span>
          </button>

          <button
            onClick={() => setActiveTab('ssh')}
            className={`flex items-center gap-1.5 py-2.5 px-2.5 sm:px-3 text-xs font-medium border-b-2 transition-colors cursor-pointer shrink-0 ${
              activeTab === 'ssh'
                ? 'border-codex-accent text-codex-accent font-semibold'
                : 'border-transparent text-slate-500 dark:text-zinc-400 hover:text-slate-800 dark:hover:text-zinc-200'
            }`}
          >
            <Server className="w-3.5 h-3.5" />
            <span>{t('ops.tab.ssh')}</span>
          </button>

          <button
            onClick={() => setActiveTab('grievances')}
            className={`flex items-center gap-1.5 py-2.5 px-2.5 sm:px-3 text-xs font-medium border-b-2 transition-colors cursor-pointer shrink-0 ${
              activeTab === 'grievances'
                ? 'border-codex-accent text-codex-accent font-semibold'
                : 'border-transparent text-slate-500 dark:text-zinc-400 hover:text-slate-800 dark:hover:text-zinc-200'
            }`}
          >
            <Wrench className="w-3.5 h-3.5" />
            <span>{t('ops.tab.grievances')}</span>
          </button>
        </div>

        {/* Tab Content */}
        <div className="flex-1 overflow-y-auto p-6 space-y-6">
          {/* TAB 1: ENGINE */}
          {activeTab === 'engine' && (
            <EngineTab
              onRestartEngine={onRestartEngine}
              isEngineRunning={status === 'streaming'}
              onOpenCommitModal={onOpenCommitModal}
            />
          )}

          {/* TAB 2: PROCESSES (Phase 13) */}
          {/* TAB 2: PROCESSES (Phase 6 & 13 Expansion) */}
          {activeTab === 'processes' && <ProcessesTab />}

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
                    {t('ops.worktrees.desc')}
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
                    <span>{t('ops.worktrees.refresh')}</span>
                  </button>

                  <button
                    type="button"
                    onClick={() => setShowClearConfirm(true)}
                    disabled={isClearingWorktrees}
                    className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium bg-rose-600 hover:bg-rose-700 text-white shadow-sm transition-colors cursor-pointer disabled:opacity-50"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                    <span>{t('ops.worktrees.clearBtn')}</span>
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
                    <span>{t('ops.worktrees.confirmTitle')}</span>
                  </div>
                  <p className="text-slate-600 dark:text-zinc-300 text-[11px] leading-relaxed">
                    {t('ops.worktrees.confirmDesc')}
                  </p>

                  <label className="flex items-center gap-2 cursor-pointer select-none">
                    <input
                      type="checkbox"
                      checked={clearAllFlag}
                      onChange={(e) => setClearAllFlag(e.target.checked)}
                      className="rounded border-border text-rose-600 focus:ring-rose-500"
                    />
                    <span className="text-[11px] text-slate-700 dark:text-zinc-300">
                      {t('ops.worktrees.clearAllCheckbox')}
                    </span>
                  </label>

                  <div className="flex items-center justify-end gap-2 pt-1">
                    <button
                      type="button"
                      onClick={() => setShowClearConfirm(false)}
                      className="px-3 py-1 rounded bg-surface hover:bg-surface-highlight text-zinc-300 cursor-pointer"
                    >
                      {t('ops.worktrees.cancel')}
                    </button>
                    <button
                      type="button"
                      onClick={handleClearWorktrees}
                      disabled={isClearingWorktrees}
                      className="px-3 py-1 rounded bg-rose-600 hover:bg-rose-700 text-white font-semibold cursor-pointer disabled:opacity-50"
                    >
                      {isClearingWorktrees ? t('ops.worktrees.clearing') : t('ops.worktrees.confirm')}
                    </button>
                  </div>
                </div>
              )}

              {worktrees.length === 0 && !isLoadingWorktrees ? (
                <div className="p-8 text-center text-slate-400 dark:text-zinc-500 border border-dashed border-border rounded-xl">
                  {t('ops.worktrees.empty')}
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
          {/* TAB 4: EXTENSIONS (Phase 14 & Expansion) */}
          {activeTab === 'extensions' && (
            <ExtensionsTab onRestartEngine={onRestartEngine} />
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
                    {t('ops.agents.desc')}
                  </p>
                </div>

                <button
                  type="button"
                  onClick={fetchAgents}
                  disabled={isLoadingAgents}
                  className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium bg-surface hover:bg-surface-highlight text-slate-700 dark:text-zinc-300 border border-border transition-colors cursor-pointer disabled:opacity-50"
                >
                  <RefreshCw className={`w-3.5 h-3.5 ${isLoadingAgents ? 'animate-spin' : ''}`} />
                  <span>{t('ops.worktrees.refresh')}</span>
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
                  <span>{t('ops.agents.unpackSectionTitle')}</span>
                </h4>
                <p className="text-[11px] text-slate-500 dark:text-zinc-400 leading-relaxed">
                  {t('ops.agents.unpackSectionDesc')}
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
                    <span>{t('ops.agents.forceOverwrite')}</span>
                  </label>

                  <button
                    type="button"
                    onClick={handleUnpackAgents}
                    disabled={isUnpackingAgents}
                    className="flex items-center gap-1.5 px-4 py-1.5 rounded-lg bg-amber-600 hover:bg-amber-700 text-white font-medium text-xs shadow-sm transition-colors cursor-pointer disabled:opacity-50 ml-auto"
                  >
                    <Download className="w-3.5 h-3.5" />
                    <span>{isUnpackingAgents ? t('ops.agents.unpacking') : t('ops.agents.unpackBtn')}</span>
                  </button>
                </div>
              </div>

              {/* Agents catalog */}
              <div className="space-y-2">
                <h4 className="text-xs font-semibold text-slate-800 dark:text-zinc-200">
                  {t('ops.agents.catalogTitle', { count: agents.length })}
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

          {/* TAB 6: STORAGE GC (Phase 10) */}
          {activeTab === 'storage' && (
            <StorageTab isStreaming={status ? status !== 'idle' : false} />
          )}

          {/* TAB 7: SSH HOSTS (Phase 12) */}
          {activeTab === 'ssh' && (
            <SshTab
              listSshHosts={listSshHosts}
              addSshHost={addSshHost}
              removeSshHost={removeSshHost}
            />
          )}

          {/* TAB 8: GRIEVANCES (Phase 13) */}
          {activeTab === 'grievances' && (
            <GrievancesTab
              listGrievances={listGrievances}
              cleanGrievances={cleanGrievances}
              pushGrievances={pushGrievances}
            />
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
            {t('ops.modal.close')}
          </button>
        </div>
      </div>
    </div>,
    document.body
  );
};
