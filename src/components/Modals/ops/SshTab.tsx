import React, { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import {
  Server,
  Plus,
  RefreshCw,
  Search,
  Trash2,
  Copy,
  Check,
  Key,
  FolderGit2,
  User,
  AlertCircle,
  X,
  FileCode,
} from 'lucide-react';
import { useI18n } from '../../../i18n/I18nProvider.tsx';
import type {
  SshHostConfig,
  SshHostAddInput,
  SshHostsListData,
  SshHostsListResponse,
  SshHostMutationResponse,
} from '../../../types/index.ts';

interface SshTabProps {
  listSshHosts?: () => Promise<SshHostsListResponse>;
  addSshHost?: (input: SshHostAddInput) => Promise<SshHostMutationResponse>;
  removeSshHost?: (name: string, scope: 'project' | 'user') => Promise<SshHostMutationResponse>;
}

interface SshHostDisplayItem {
  name: string;
  scope: 'project' | 'user';
  config: SshHostConfig;
}

export const SshTab: React.FC<SshTabProps> = React.memo(({
  listSshHosts: listSshHostsProp,
  addSshHost: addSshHostProp,
  removeSshHost: removeSshHostProp,
}) => {
  const { t } = useI18n();

  const listSshHostsRunner = listSshHostsProp || window.electronAPI?.listSshHosts;
  const addSshHostRunner = addSshHostProp || window.electronAPI?.addSshHost;
  const removeSshHostRunner = removeSshHostProp || window.electronAPI?.removeSshHost;

  // SSH hosts list data state
  const [hostsData, setHostsData] = useState<SshHostsListData>({ project: {}, user: {} });
  const [isLoading, setIsLoading] = useState<boolean>(false);
  const [fetchError, setFetchError] = useState<string | null>(null);
  const [feedbackMessage, setFeedbackMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  // Scope filter and search query
  const [activeScopeTab, setActiveScopeTab] = useState<'all' | 'project' | 'user'>('all');
  const [searchQuery, setSearchQuery] = useState<string>('');

  // SSH command copied state
  const [copiedHostKey, setCopiedHostKey] = useState<string | null>(null);
  const copyTimeoutRef = useRef<NodeJS.Timeout | null>(null);

  // Add Host modal state
  const [showAddModal, setShowAddModal] = useState<boolean>(false);
  const [addName, setAddName] = useState<string>('');
  const [addHost, setAddHost] = useState<string>('');
  const [addUser, setAddUser] = useState<string>('');
  const [addPort, setAddPort] = useState<string>('22');
  const [addKey, setAddKey] = useState<string>('');
  const [addDesc, setAddDesc] = useState<string>('');
  const [addCompat, setAddCompat] = useState<boolean>(false);
  const [addScope, setAddScope] = useState<'project' | 'user'>('project');
  const [isAdding, setIsAdding] = useState<boolean>(false);
  const [addError, setAddError] = useState<string | null>(null);

  // Confirm Delete Host modal state
  const [deleteTarget, setDeleteTarget] = useState<{ name: string; scope: 'project' | 'user' } | null>(null);
  const [isDeleting, setIsDeleting] = useState<boolean>(false);

  // Guard ref to prevent duplicate fetch on mount
  const hasFetchedRef = useRef(false);

  // Fetch SSH hosts list from backend
  const loadHosts = useCallback(async () => {
    if (!listSshHostsRunner) {
      setFetchError(t('ops.ssh.error.unavailable'));
      return;
    }
    setIsLoading(true);
    setFetchError(null);
    try {
      const res = await listSshHostsRunner();
      if (res.success && res.data) {
        setHostsData(res.data);
      } else {
        setFetchError(res.error || t('ops.ssh.listFailed'));
      }
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      setFetchError(msg);
    } finally {
      setIsLoading(false);
    }
  }, [listSshHostsRunner, t]);

  useEffect(() => {
    if (!hasFetchedRef.current) {
      hasFetchedRef.current = true;
      loadHosts();
    }
  }, [loadHosts]);

  // Dismiss feedback message after 5 seconds
  useEffect(() => {
    if (feedbackMessage) {
      const timer = setTimeout(() => setFeedbackMessage(null), 5000);
      return () => clearTimeout(timer);
    }
  }, [feedbackMessage]);

  // Cleanup copy timer
  useEffect(() => {
    return () => {
      if (copyTimeoutRef.current) {
        clearTimeout(copyTimeoutRef.current);
      }
    };
  }, []);

  // Aggregate hosts into a flat array
  const allHostItems = useMemo<SshHostDisplayItem[]>(() => {
    const items: SshHostDisplayItem[] = [];
    if (hostsData.project) {
      for (const [name, config] of Object.entries(hostsData.project)) {
        items.push({ name, scope: 'project', config });
      }
    }
    if (hostsData.user) {
      for (const [name, config] of Object.entries(hostsData.user)) {
        items.push({ name, scope: 'user', config });
      }
    }
    return items;
  }, [hostsData]);

  // Filter by scope tab and search query
  const filteredHostItems = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    return allHostItems.filter((item) => {
      if (activeScopeTab !== 'all' && item.scope !== activeScopeTab) {
        return false;
      }
      if (!q) return true;
      const matchName = item.name.toLowerCase().includes(q);
      const matchHost = item.config.host?.toLowerCase().includes(q);
      const matchUser = item.config.username?.toLowerCase().includes(q);
      const matchDesc = item.config.description?.toLowerCase().includes(q);
      const matchKey = item.config.keyPath?.toLowerCase().includes(q);
      return matchName || matchHost || matchUser || matchDesc || matchKey;
    });
  }, [allHostItems, activeScopeTab, searchQuery]);

  const projectCount = useMemo(() => Object.keys(hostsData.project || {}).length, [hostsData.project]);
  const userCount = useMemo(() => Object.keys(hostsData.user || {}).length, [hostsData.user]);

  // Copy SSH command handler
  const handleCopyCommand = useCallback((item: SshHostDisplayItem) => {
    const { name, config } = item;
    const parts = ['ssh'];
    if (config.port && config.port !== 22) {
      parts.push(`-p ${config.port}`);
    }
    if (config.keyPath) {
      parts.push(`-i "${config.keyPath}"`);
    }
    const target = config.username ? `${config.username}@${config.host}` : config.host;
    parts.push(target);
    const command = parts.join(' ');

    navigator.clipboard.writeText(command);
    setCopiedHostKey(`${item.scope}:${name}`);

    if (copyTimeoutRef.current) {
      clearTimeout(copyTimeoutRef.current);
    }
    copyTimeoutRef.current = setTimeout(() => {
      setCopiedHostKey(null);
    }, 2000);
  }, []);

  // Browse key file dialog handler
  const handleBrowseKeyFile = useCallback(async () => {
    if (!window.electronAPI?.selectFile) return;
    try {
      const selected = await window.electronAPI.selectFile({
        title: t('ops.ssh.addModal.key'),
        filters: [
          { name: t('ops.ssh.filter.allFiles'), extensions: ['*'] },
          { name: t('ops.ssh.filter.keyFiles'), extensions: ['pem', 'key', 'pub', 'id_rsa', 'id_ed25519'] },
        ],
      });
      if (selected) {
        setAddKey(selected);
      }
    } catch {
      // Ignore file picker cancellation
    }
  }, [t]);

  // Reset add host form
  const resetAddForm = useCallback(() => {
    setAddName('');
    setAddHost('');
    setAddUser('');
    setAddPort('22');
    setAddKey('');
    setAddDesc('');
    setAddCompat(false);
    setAddScope('project');
    setAddError(null);
  }, []);

  // Submit add host form handler
  const handleAddSubmit = useCallback(async (e: React.FormEvent) => {
    e.preventDefault();
    if (!addSshHostRunner) {
      setAddError(t('ops.ssh.error.unavailable'));
      return;
    }

    const trimmedName = addName.trim();
    if (!trimmedName || !/^[\w.-]+$/.test(trimmedName)) {
      setAddError(t('ops.ssh.addModal.nameHint'));
      return;
    }

    const trimmedHost = addHost.trim();
    if (!trimmedHost) {
      setAddError(t('ops.ssh.field.host'));
      return;
    }

    let parsedPort: number | undefined = undefined;
    if (addPort.trim()) {
      parsedPort = parseInt(addPort, 10);
      if (Number.isNaN(parsedPort) || parsedPort < 1 || parsedPort > 65535) {
        setAddError(t('ops.ssh.field.port'));
        return;
      }
    }

    setIsAdding(true);
    setAddError(null);

    const input: SshHostAddInput = {
      name: trimmedName,
      host: trimmedHost,
      user: addUser.trim() || undefined,
      port: parsedPort,
      key: addKey.trim() || undefined,
      desc: addDesc.trim() || undefined,
      compat: addCompat || undefined,
      scope: addScope,
    };

    try {
      const res = await addSshHostRunner(input);
      if (res.success) {
        setShowAddModal(false);
        resetAddForm();
        setFeedbackMessage({
          type: 'success',
          text: t('ops.ssh.success.added', { name: trimmedName }),
        });
        await loadHosts();
      } else {
        setAddError(res.error || t('ops.ssh.addFailed'));
      }
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      setAddError(msg);
    } finally {
      setIsAdding(false);
    }
  }, [addSshHostRunner, addName, addHost, addUser, addPort, addKey, addDesc, addCompat, addScope, resetAddForm, loadHosts, t]);

  // Confirm delete host handler
  const handleConfirmDelete = useCallback(async () => {
    if (!deleteTarget || !removeSshHostRunner) return;
    setIsDeleting(true);
    try {
      const res = await removeSshHostRunner(deleteTarget.name, deleteTarget.scope);
      if (res.success) {
        setFeedbackMessage({
          type: 'success',
          text: t('ops.ssh.success.removed', { name: deleteTarget.name }),
        });
        setDeleteTarget(null);
        await loadHosts();
      } else {
        setFeedbackMessage({
          type: 'error',
          text: res.error || t('ops.ssh.removeFailed'),
        });
      }
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      setFeedbackMessage({
        type: 'error',
        text: msg,
      });
    } finally {
      setIsDeleting(false);
    }
  }, [deleteTarget, removeSshHostRunner, loadHosts, t]);

  return (
    <div className="space-y-6 animate-fade-in">
      {/* Header & Controls */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-4 border-b border-border">
        <div>
          <h3 className="text-base font-semibold text-slate-900 dark:text-zinc-100 flex items-center gap-2">
            <Server className="w-5 h-5 text-indigo-600 dark:text-indigo-400" />
            <span>{t('ops.ssh.title')}</span>
          </h3>
          <p className="text-xs text-slate-500 dark:text-zinc-400 mt-1 max-w-xl leading-relaxed">
            {t('ops.ssh.desc')}
          </p>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          <button
            type="button"
            onClick={loadHosts}
            disabled={isLoading}
            className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-lg bg-surface hover:bg-surface-highlight border border-border text-slate-700 dark:text-zinc-300 transition-colors disabled:opacity-50 cursor-pointer"
            title={t('ops.ssh.btn.refresh')}
          >
            <RefreshCw className={`w-3.5 h-3.5 ${isLoading ? 'animate-spin text-indigo-600 dark:text-indigo-400' : ''}`} />
            <span>{t('ops.ssh.btn.refresh')}</span>
          </button>
          <button
            type="button"
            onClick={() => {
              resetAddForm();
              setShowAddModal(true);
            }}
            className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-lg bg-indigo-600 hover:bg-indigo-500 text-white shadow-xs transition-colors cursor-pointer"
          >
            <Plus className="w-3.5 h-3.5" />
            <span>{t('ops.ssh.btn.add')}</span>
          </button>
        </div>
      </div>

      {/* Feedback Notification Banner */}
      {feedbackMessage && (
        <div
          className={`flex items-center justify-between gap-2 p-3 rounded-xl text-xs border animate-slide-down ${
            feedbackMessage.type === 'success'
              ? 'bg-emerald-500/10 border-emerald-500/20 text-emerald-600 dark:text-emerald-400'
              : 'bg-rose-500/10 border-rose-500/20 text-rose-600 dark:text-rose-400'
          }`}
        >
          <div className="flex items-center gap-2">
            {feedbackMessage.type === 'success' ? (
              <Check className="w-4 h-4 shrink-0" />
            ) : (
              <AlertCircle className="w-4 h-4 shrink-0" />
            )}
            <span>{feedbackMessage.text}</span>
          </div>
          <button
            type="button"
            onClick={() => setFeedbackMessage(null)}
            className="p-1 rounded-md hover:bg-surface-highlight text-slate-400 hover:text-slate-700 dark:text-zinc-400 dark:hover:text-zinc-200 transition-colors cursor-pointer"
          >
            <X className="w-3.5 h-3.5" />
          </button>
        </div>
      )}

      {/* Fetch Error Banner */}
      {fetchError && (
        <div className="flex items-center gap-2.5 p-3.5 rounded-xl bg-rose-500/10 border border-rose-500/20 text-rose-600 dark:text-rose-400 text-xs">
          <AlertCircle className="w-4 h-4 shrink-0" />
          <span className="flex-1">{fetchError}</span>
          <button
            type="button"
            onClick={loadHosts}
            className="underline hover:text-rose-700 dark:hover:text-rose-300 font-medium cursor-pointer"
          >
            {t('ops.ssh.btn.refresh')}
          </button>
        </div>
      )}

      {/* Filter Tabs & Search Bar */}
      <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3">
        {/* Scope Tabs */}
        <div className="flex items-center p-1 bg-surface/50 border border-border rounded-xl">
          <button
            type="button"
            onClick={() => setActiveScopeTab('all')}
            className={`px-3 py-1 text-xs font-medium rounded-lg transition-colors cursor-pointer ${
              activeScopeTab === 'all'
                ? 'bg-indigo-600 text-white shadow-xs'
                : 'text-slate-600 dark:text-zinc-400 hover:text-slate-900 dark:hover:text-zinc-200 hover:bg-surface-highlight'
            }`}
          >
            {t('ops.ssh.scope.all', { count: allHostItems.length })}
          </button>
          <button
            type="button"
            onClick={() => setActiveScopeTab('project')}
            className={`flex items-center gap-1.5 px-3 py-1 text-xs font-medium rounded-lg transition-colors cursor-pointer ${
              activeScopeTab === 'project'
                ? 'bg-indigo-600 text-white shadow-xs'
                : 'text-slate-600 dark:text-zinc-400 hover:text-slate-900 dark:hover:text-zinc-200 hover:bg-surface-highlight'
            }`}
          >
            <FolderGit2 className="w-3.5 h-3.5" />
            <span>{t('ops.ssh.scope.projectCount', { count: projectCount })}</span>
          </button>
          <button
            type="button"
            onClick={() => setActiveScopeTab('user')}
            className={`flex items-center gap-1.5 px-3 py-1 text-xs font-medium rounded-lg transition-colors cursor-pointer ${
              activeScopeTab === 'user'
                ? 'bg-indigo-600 text-white shadow-xs'
                : 'text-slate-600 dark:text-zinc-400 hover:text-slate-900 dark:hover:text-zinc-200 hover:bg-surface-highlight'
            }`}
          >
            <User className="w-3.5 h-3.5" />
            <span>{t('ops.ssh.scope.userCount', { count: userCount })}</span>
          </button>
        </div>

        {/* Search Input */}
        <div className="relative min-w-[220px]">
          <Search className="w-3.5 h-3.5 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 dark:text-zinc-500 pointer-events-none" />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder={t('ops.ssh.searchPlaceholder')}
            className="w-full pl-8 pr-8 py-1.5 text-xs bg-surface border border-border rounded-xl text-slate-900 dark:text-zinc-100 placeholder:text-slate-400 dark:placeholder:text-zinc-500 focus:outline-hidden focus:border-indigo-500 transition-colors"
          />
          {searchQuery && (
            <button
              type="button"
              onClick={() => setSearchQuery('')}
              className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-700 dark:hover:text-zinc-200 cursor-pointer"
            >
              <X className="w-3 h-3" />
            </button>
          )}
        </div>
      </div>

      {/* SSH Hosts List */}
      {filteredHostItems.length === 0 ? (
        <div className="flex flex-col items-center justify-center p-12 text-center bg-surface/30 border border-border/60 rounded-2xl">
          <div className="p-3 bg-indigo-500/10 rounded-2xl text-indigo-600 dark:text-indigo-400 mb-3">
            <Server className="w-8 h-8" />
          </div>
          <h4 className="text-sm font-semibold text-slate-800 dark:text-zinc-200 mb-1">
            {searchQuery ? t('ops.ssh.empty.filtered') : t('ops.ssh.empty.title')}
          </h4>
          <p className="text-xs text-slate-500 dark:text-zinc-400 max-w-sm mb-4">
            {searchQuery ? '' : t('ops.ssh.empty.desc')}
          </p>
          {!searchQuery && (
            <button
              type="button"
              onClick={() => {
                resetAddForm();
                setShowAddModal(true);
              }}
              className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-lg bg-indigo-600 hover:bg-indigo-500 text-white transition-colors cursor-pointer"
            >
              <Plus className="w-3.5 h-3.5" />
              <span>{t('ops.ssh.btn.add')}</span>
            </button>
          )}
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3.5">
          {filteredHostItems.map((item) => {
            const hostKey = `${item.scope}:${item.name}`;
            const isCopied = copiedHostKey === hostKey;
            const isProjectScope = item.scope === 'project';

            return (
              <div
                key={hostKey}
                className="group flex flex-col justify-between p-4 bg-surface/40 hover:bg-surface/70 border border-border rounded-2xl hover:shadow-xs transition-all"
              >
                <div>
                  {/* Top Bar: Name & Scope Badge */}
                  <div className="flex items-start justify-between gap-2 mb-2">
                    <div className="flex items-center gap-2 min-w-0">
                      <span className="font-semibold text-sm text-slate-900 dark:text-zinc-100 truncate">
                        {item.name}
                      </span>
                      <span
                        className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-medium shrink-0 border ${
                          isProjectScope
                            ? 'bg-indigo-500/10 border-indigo-500/20 text-indigo-600 dark:text-indigo-400'
                            : 'bg-emerald-500/10 border-emerald-500/20 text-emerald-600 dark:text-emerald-400'
                        }`}
                      >
                        {isProjectScope ? (
                          <FolderGit2 className="w-2.5 h-2.5" />
                        ) : (
                          <User className="w-2.5 h-2.5" />
                        )}
                        <span>{isProjectScope ? t('ops.ssh.badge.project') : t('ops.ssh.badge.user')}</span>
                      </span>
                      {item.config.compat && (
                        <span className="px-1.5 py-0.5 rounded-md text-[10px] font-medium bg-amber-500/10 border border-amber-500/20 text-amber-600 dark:text-amber-400 shrink-0">
                          {t('ops.ssh.badge.compat')}
                        </span>
                      )}
                    </div>
                    {/* Action buttons */}
                    <div className="flex items-center gap-1 opacity-80 group-hover:opacity-100 transition-opacity">
                      <button
                        type="button"
                        onClick={() => handleCopyCommand(item)}
                        className="p-1.5 rounded-lg hover:bg-surface-highlight text-slate-400 hover:text-slate-700 dark:text-zinc-400 dark:hover:text-zinc-200 transition-colors cursor-pointer"
                        title={t('ops.ssh.btn.copy')}
                      >
                        {isCopied ? (
                          <Check className="w-3.5 h-3.5 text-emerald-600 dark:text-emerald-400" />
                        ) : (
                          <Copy className="w-3.5 h-3.5" />
                        )}
                      </button>
                      <button
                        type="button"
                        onClick={() => setDeleteTarget({ name: item.name, scope: item.scope })}
                        className="p-1.5 rounded-lg hover:bg-rose-500/10 text-slate-400 hover:text-rose-600 dark:text-zinc-400 dark:hover:text-rose-400 transition-colors cursor-pointer"
                        title={t('ops.ssh.delete.confirmTitle')}
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </div>

                  {/* Destination Info */}
                  <div className="space-y-1.5 text-xs text-slate-500 dark:text-zinc-400">
                    <div className="flex items-center gap-1.5 font-mono text-[11px]">
                      <span className="text-indigo-600 dark:text-indigo-400">
                        {item.config.username ? `${item.config.username}@` : ''}
                      </span>
                      <span className="text-slate-800 dark:text-zinc-200">{item.config.host}</span>
                      {item.config.port && item.config.port !== 22 && (
                        <span className="text-slate-400 dark:text-zinc-500">:{item.config.port}</span>
                      )}
                    </div>

                    {/* Key path */}
                    {item.config.keyPath && (
                      <div className="flex items-center gap-1.5 text-[11px] text-slate-500 dark:text-zinc-400 truncate">
                        <Key className="w-3 h-3 text-amber-500 dark:text-amber-400 shrink-0" />
                        <span className="truncate font-mono" title={item.config.keyPath}>
                          {item.config.keyPath}
                        </span>
                      </div>
                    )}

                    {/* Description */}
                    {item.config.description && (
                      <p className="text-xs text-slate-500 dark:text-zinc-400 line-clamp-2 italic pt-0.5">
                        {item.config.description}
                      </p>
                    )}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Add SSH Host Modal */}
      {showAddModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-xs animate-fade-in">
          <div className="relative w-full max-w-lg bg-panel border border-border rounded-2xl shadow-2xl p-6 space-y-4 animate-scale-in">
            {/* Header */}
            <div className="flex items-center justify-between pb-3 border-b border-border">
              <div className="flex items-center gap-2">
                <div className="p-2 rounded-xl bg-indigo-500/10 text-indigo-600 dark:text-indigo-400">
                  <Server className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="text-sm font-semibold text-slate-900 dark:text-zinc-100">
                    {t('ops.ssh.addModal.title')}
                  </h3>
                  <p className="text-xs text-slate-500 dark:text-zinc-400 mt-0.5">
                    {t('ops.ssh.addModal.desc')}
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setShowAddModal(false)}
                className="p-1.5 rounded-lg text-slate-400 hover:text-slate-700 dark:text-zinc-400 dark:hover:text-zinc-200 hover:bg-surface-highlight transition-colors cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {/* Form Error */}
            {addError && (
              <div className="flex items-center gap-2 p-3 rounded-xl bg-rose-500/10 border border-rose-500/20 text-rose-600 dark:text-rose-400 text-xs">
                <AlertCircle className="w-4 h-4 shrink-0" />
                <span>{addError}</span>
              </div>
            )}

            {/* Form Body */}
            <form onSubmit={handleAddSubmit} className="space-y-3.5">
              {/* Scope Selection */}
              <div>
                <label className="block text-xs font-medium text-slate-700 dark:text-zinc-300 mb-1.5">
                  {t('ops.ssh.addModal.scope')}
                </label>
                <div className="grid grid-cols-2 gap-2">
                  <label
                    className={`flex items-center gap-2 p-2.5 rounded-xl border cursor-pointer transition-colors ${
                      addScope === 'project'
                        ? 'bg-indigo-500/10 border-indigo-500/40 text-indigo-700 dark:text-indigo-300'
                        : 'bg-surface hover:bg-surface-highlight border-border text-slate-600 dark:text-zinc-400 hover:text-slate-900 dark:hover:text-zinc-200'
                    }`}
                  >
                    <input
                      type="radio"
                      name="sshScope"
                      checked={addScope === 'project'}
                      onChange={() => setAddScope('project')}
                      className="sr-only"
                    />
                    <FolderGit2 className="w-4 h-4 shrink-0 text-indigo-600 dark:text-indigo-400" />
                    <span className="text-xs font-medium">{t('ops.ssh.addModal.scopeProject')}</span>
                  </label>

                  <label
                    className={`flex items-center gap-2 p-2.5 rounded-xl border cursor-pointer transition-colors ${
                      addScope === 'user'
                        ? 'bg-emerald-500/10 border-emerald-500/40 text-emerald-700 dark:text-emerald-300'
                        : 'bg-surface hover:bg-surface-highlight border-border text-slate-600 dark:text-zinc-400 hover:text-slate-900 dark:hover:text-zinc-200'
                    }`}
                  >
                    <input
                      type="radio"
                      name="sshScope"
                      checked={addScope === 'user'}
                      onChange={() => setAddScope('user')}
                      className="sr-only"
                    />
                    <User className="w-4 h-4 shrink-0 text-emerald-600 dark:text-emerald-400" />
                    <span className="text-xs font-medium">{t('ops.ssh.addModal.scopeUser')}</span>
                  </label>
                </div>
              </div>

              {/* Host Name & Host Address */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-medium text-slate-700 dark:text-zinc-300 mb-1">
                    {t('ops.ssh.addModal.name')} <span className="text-rose-500">*</span>
                  </label>
                  <input
                    type="text"
                    required
                    value={addName}
                    onChange={(e) => setAddName(e.target.value)}
                    placeholder={t('ops.ssh.addModal.namePlaceholder')}
                    className="w-full px-3 py-1.5 text-xs bg-surface border border-border rounded-xl text-slate-900 dark:text-zinc-100 placeholder:text-slate-400 dark:placeholder:text-zinc-500 focus:outline-hidden focus:border-indigo-500 font-mono"
                  />
                  <p className="text-[10px] text-slate-400 dark:text-zinc-500 mt-1">{t('ops.ssh.addModal.nameHint')}</p>
                </div>

                <div>
                  <label className="block text-xs font-medium text-slate-700 dark:text-zinc-300 mb-1">
                    {t('ops.ssh.addModal.host')} <span className="text-rose-500">*</span>
                  </label>
                  <input
                    type="text"
                    required
                    value={addHost}
                    onChange={(e) => setAddHost(e.target.value)}
                    placeholder={t('ops.ssh.addModal.hostPlaceholder')}
                    className="w-full px-3 py-1.5 text-xs bg-surface border border-border rounded-xl text-slate-900 dark:text-zinc-100 placeholder:text-slate-400 dark:placeholder:text-zinc-500 focus:outline-hidden focus:border-indigo-500 font-mono"
                  />
                </div>
              </div>

              {/* Username & Port */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-medium text-slate-700 dark:text-zinc-300 mb-1">
                    {t('ops.ssh.addModal.user')}
                  </label>
                  <input
                    type="text"
                    value={addUser}
                    onChange={(e) => setAddUser(e.target.value)}
                    placeholder={t('ops.ssh.addModal.userPlaceholder')}
                    className="w-full px-3 py-1.5 text-xs bg-surface border border-border rounded-xl text-slate-900 dark:text-zinc-100 placeholder:text-slate-400 dark:placeholder:text-zinc-500 focus:outline-hidden focus:border-indigo-500 font-mono"
                  />
                </div>

                <div>
                  <label className="block text-xs font-medium text-slate-700 dark:text-zinc-300 mb-1">
                    {t('ops.ssh.addModal.port')}
                  </label>
                  <input
                    type="number"
                    min={1}
                    max={65535}
                    value={addPort}
                    onChange={(e) => setAddPort(e.target.value)}
                    placeholder={t('ops.ssh.addModal.portPlaceholder')}
                    className="w-full px-3 py-1.5 text-xs bg-surface border border-border rounded-xl text-slate-900 dark:text-zinc-100 placeholder:text-slate-400 dark:placeholder:text-zinc-500 focus:outline-hidden focus:border-indigo-500 font-mono"
                  />
                </div>
              </div>

              {/* Key Path + Browse File */}
              <div>
                <label className="block text-xs font-medium text-slate-700 dark:text-zinc-300 mb-1">
                  {t('ops.ssh.addModal.key')}
                </label>
                <div className="flex items-center gap-2">
                  <input
                    type="text"
                    value={addKey}
                    onChange={(e) => setAddKey(e.target.value)}
                    placeholder={t('ops.ssh.addModal.keyPlaceholder')}
                    className="flex-1 px-3 py-1.5 text-xs bg-surface border border-border rounded-xl text-slate-900 dark:text-zinc-100 placeholder:text-slate-400 dark:placeholder:text-zinc-500 focus:outline-hidden focus:border-indigo-500 font-mono"
                  />
                  <button
                    type="button"
                    onClick={handleBrowseKeyFile}
                    className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-xl bg-surface hover:bg-surface-highlight border border-border text-slate-700 dark:text-zinc-300 transition-colors shrink-0 cursor-pointer"
                  >
                    <FileCode className="w-3.5 h-3.5" />
                    <span>{t('ops.ssh.addModal.btnBrowse')}</span>
                  </button>
                </div>
              </div>

              {/* Description */}
              <div>
                <label className="block text-xs font-medium text-slate-700 dark:text-zinc-300 mb-1">
                  {t('ops.ssh.addModal.descField')}
                </label>
                <input
                  type="text"
                  value={addDesc}
                  onChange={(e) => setAddDesc(e.target.value)}
                  placeholder={t('ops.ssh.addModal.descPlaceholder')}
                  className="w-full px-3 py-1.5 text-xs bg-surface border border-border rounded-xl text-slate-900 dark:text-zinc-100 placeholder:text-slate-400 dark:placeholder:text-zinc-500 focus:outline-hidden focus:border-indigo-500"
                />
              </div>

              {/* Compatibility Mode */}
              <div className="flex items-start gap-2.5 pt-1">
                <input
                  type="checkbox"
                  id="sshCompatCheckbox"
                  checked={addCompat}
                  onChange={(e) => setAddCompat(e.target.checked)}
                  className="mt-0.5 rounded border-border text-indigo-600 focus:ring-indigo-500 cursor-pointer"
                />
                <label htmlFor="sshCompatCheckbox" className="text-xs cursor-pointer select-none">
                  <span className="font-medium text-slate-800 dark:text-zinc-200 block">
                    {t('ops.ssh.addModal.compat')}
                  </span>
                  <span className="text-[11px] text-slate-500 dark:text-zinc-400 block">
                    {t('ops.ssh.addModal.compatDesc')}
                  </span>
                </label>
              </div>

              {/* Footer Actions */}
              <div className="flex items-center justify-end gap-2 pt-3 border-t border-border">
                <button
                  type="button"
                  onClick={() => setShowAddModal(false)}
                  disabled={isAdding}
                  className="px-3.5 py-1.5 text-xs font-medium rounded-xl bg-surface hover:bg-surface-highlight border border-border text-slate-700 dark:text-zinc-300 transition-colors cursor-pointer"
                >
                  {t('common.cancel')}
                </button>
                <button
                  type="submit"
                  disabled={isAdding}
                  className="flex items-center gap-1.5 px-4 py-1.5 text-xs font-medium rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white shadow-xs transition-colors disabled:opacity-50"
                >
                  {isAdding && <RefreshCw className="w-3.5 h-3.5 animate-spin" />}
                  <span>{isAdding ? t('ops.ssh.addModal.saving') : t('ops.ssh.addModal.btnAdd')}</span>
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Confirm Delete Host Modal */}
      {deleteTarget && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-xs animate-fade-in">
          <div className="relative w-full max-w-md bg-panel border border-border rounded-2xl shadow-2xl p-6 space-y-4 animate-scale-in">
            <div className="flex items-start gap-3">
              <div className="p-2.5 rounded-xl bg-rose-500/10 text-rose-400 shrink-0">
                <Trash2 className="w-5 h-5" />
              </div>
              <div className="flex-1">
                <h3 className="text-sm font-semibold text-slate-900 dark:text-zinc-100">
                  {t('ops.ssh.delete.confirmTitle')}
                </h3>
                <p className="text-xs text-slate-500 dark:text-zinc-400 mt-1 leading-relaxed">
                  {t('ops.ssh.delete.confirmMsg', {
                    name: deleteTarget.name,
                    scope: deleteTarget.scope === 'project' ? t('ops.ssh.badge.project') : t('ops.ssh.badge.user'),
                  })}
                </p>
              </div>
            </div>

            <div className="flex items-center justify-end gap-2 pt-2 border-t border-border">
              <button
                type="button"
                onClick={() => setDeleteTarget(null)}
                disabled={isDeleting}
                className="px-3.5 py-1.5 text-xs font-medium rounded-xl bg-surface hover:bg-surface-highlight border border-border text-slate-700 dark:text-zinc-300 transition-colors cursor-pointer"
              >
                {t('common.cancel')}
              </button>
              <button
                type="button"
                onClick={handleConfirmDelete}
                disabled={isDeleting}
                className="flex items-center gap-1.5 px-3.5 py-1.5 text-xs font-medium rounded-xl bg-rose-600 hover:bg-rose-500 text-white shadow-xs transition-colors disabled:opacity-50"
              >
                {isDeleting && <RefreshCw className="w-3.5 h-3.5 animate-spin" />}
                <span>{isDeleting ? t('ops.ssh.delete.deleting') : t('common.confirm')}</span>
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
});
