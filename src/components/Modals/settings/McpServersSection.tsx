import React, { useState, useEffect, useCallback, useMemo } from 'react';
import {
  Server,
  Plus,
  RotateCw,
  Copy,
  Check,
  AlertTriangle,
  Play,
  Loader2,
  Trash2,
  Edit3,
  Layers,
} from 'lucide-react';
import type {
  McpScope,
  McpServerConfig,
  McpTestResult,
  McpConfigReadResult,
} from '../../../types';
import { McpServerModal } from './McpServerModal';
import { useI18n } from '../../../i18n/I18nProvider';

export interface McpServersSectionProps {
  projectPath?: string;
  onConfigChanged?: () => void;
  onSelectFolder?: () => Promise<string | null>;
}

export const McpServersSection: React.FC<McpServersSectionProps> = React.memo(({
  projectPath,
  onConfigChanged,
  onSelectFolder,
}) => {
  const { t } = useI18n();

  const [scope, setScope] = useState<McpScope>('user');
  const [isLoading, setIsLoading] = useState(false);
  const [configData, setConfigData] = useState<McpConfigReadResult | null>(null);
  const [copiedPath, setCopiedPath] = useState(false);
  const [copiedCmd, setCopiedCmd] = useState(false);

  // Modal State
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [modalEditName, setModalEditName] = useState<string | undefined>();
  const [modalEditConfig, setModalEditConfig] = useState<McpServerConfig | undefined>();

  // Delete Confirm State
  const [serverToDelete, setServerToDelete] = useState<string | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);

  // Row Test Statuses
  const [rowTesting, setRowTesting] = useState<Record<string, boolean>>({});
  const [rowTestResults, setRowTestResults] = useState<Record<string, McpTestResult>>({});

  // Fetch servers for current scope
  const loadServers = useCallback(async () => {
    if (!window.electronAPI?.listMcpServers) return;
    setIsLoading(true);
    try {
      const res = await window.electronAPI.listMcpServers(scope, projectPath);
      setConfigData(res);
    } catch (err: unknown) {
      setConfigData({
        success: false,
        scope,
        filePath: '',
        servers: {},
        isWritable: false,
        error: err instanceof Error ? err.message : String(err),
      });
    } finally {
      setIsLoading(false);
    }
  }, [scope, projectPath]);

  useEffect(() => {
    loadServers();
  }, [loadServers]);

  // Copy config path to clipboard
  const handleCopyPath = useCallback(() => {
    if (configData?.filePath) {
      navigator.clipboard.writeText(configData.filePath);
      setCopiedPath(true);
      setTimeout(() => setCopiedPath(false), 2000);
    }
  }, [configData?.filePath]);

  // Copy permission fix command to clipboard
  const fixPermissionCmd = useMemo(() => {
    if (!configData?.filePath) return '';
    return `sudo chown $(whoami) "${configData.filePath}" && chmod u+w "${configData.filePath}"`;
  }, [configData?.filePath]);

  const handleCopyCmd = useCallback((cmd: string) => {
    navigator.clipboard.writeText(cmd);
    setCopiedCmd(true);
    setTimeout(() => setCopiedCmd(false), 2000);
  }, []);

  // Save server (Add or Edit)
  const handleSaveServer = useCallback(
    async (name: string, config: McpServerConfig) => {
      if (!window.electronAPI?.saveMcpServer) return;
      const res = await window.electronAPI.saveMcpServer(scope, name, config, projectPath);
      if (!res.success) {
        throw new Error(res.error || 'Failed to save MCP server');
      }
      onConfigChanged?.();
      await loadServers();
    },
    [scope, projectPath, onConfigChanged, loadServers]
  );

  // Delete server
  const handleDeleteServer = useCallback(async () => {
    if (!serverToDelete || !window.electronAPI?.deleteMcpServer) return;
    setIsDeleting(true);
    try {
      const res = await window.electronAPI.deleteMcpServer(scope, serverToDelete, projectPath);
      if (res.success) {
        onConfigChanged?.();
        setServerToDelete(null);
        await loadServers();
      }
    } finally {
      setIsDeleting(false);
    }
  }, [serverToDelete, scope, projectPath, onConfigChanged, loadServers]);

  // Toggle server enabled/disabled
  const handleToggleServer = useCallback(
    async (name: string, currentDisabled?: boolean) => {
      if (!window.electronAPI?.toggleMcpServer) return;
      const targetEnabled = Boolean(currentDisabled);
      await window.electronAPI.toggleMcpServer(scope, name, targetEnabled, projectPath);
      onConfigChanged?.();
      await loadServers();
    },
    [scope, projectPath, onConfigChanged, loadServers]
  );

  // Test row connection
  const handleTestRow = useCallback(
    async (name: string, config: McpServerConfig) => {
      if (!window.electronAPI?.testMcpConnection) return;
      setRowTesting((prev) => ({ ...prev, [name]: true }));
      try {
        const res = await window.electronAPI.testMcpConnection(config);
        setRowTestResults((prev) => ({ ...prev, [name]: res }));
      } catch (err: unknown) {
        setRowTestResults((prev) => ({
          ...prev,
          [name]: {
            success: false,
            latencyMs: 0,
            error: err instanceof Error ? err.message : String(err),
          },
        }));
      } finally {
        setRowTesting((prev) => ({ ...prev, [name]: false }));
      }
    },
    []
  );

  // Test function passed into modal
  const handleTestInModal = useCallback(async (config: McpServerConfig) => {
    if (!window.electronAPI?.testMcpConnection) {
      return { success: false, latencyMs: 0, error: 'Bridge unavailable' };
    }
    return window.electronAPI.testMcpConnection(config);
  }, []);

  const serversList = useMemo(() => {
    if (!configData?.servers) return [];
    return Object.entries(configData.servers).map(([name, cfg]) => ({
      name,
      config: cfg,
    }));
  }, [configData?.servers]);

  const existingServerNames = useMemo(() => {
    return Object.keys(configData?.servers || {});
  }, [configData?.servers]);

  return (
    <div className="space-y-6">
      {/* Top Scope Selector & Actions */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        {/* Scope Tabs */}
        <div className="flex p-1 rounded-xl bg-slate-100 dark:bg-zinc-800/80 border border-slate-200 dark:border-zinc-800 w-fit">
          <button
            type="button"
            onClick={() => setScope('user')}
            className={`px-3.5 py-1.5 text-xs font-semibold rounded-lg transition-all cursor-pointer ${
              scope === 'user'
                ? 'bg-white dark:bg-zinc-700 text-slate-900 dark:text-zinc-100 shadow-sm'
                : 'text-slate-600 dark:text-zinc-400 hover:text-slate-900 dark:hover:text-zinc-200'
            }`}
          >
            {t('settings.mcp.scopeUser')}
          </button>
          <button
            type="button"
            onClick={() => setScope('project')}
            className={`px-3.5 py-1.5 text-xs font-semibold rounded-lg transition-all cursor-pointer ${
              scope === 'project'
                ? 'bg-white dark:bg-zinc-700 text-slate-900 dark:text-zinc-100 shadow-sm'
                : 'text-slate-600 dark:text-zinc-400 hover:text-slate-900 dark:hover:text-zinc-200'
            }`}
          >
            {t('settings.mcp.scopeProject')}
          </button>
        </div>

        {/* Header Action Buttons */}
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={loadServers}
            disabled={isLoading}
            className="p-2 rounded-lg text-slate-600 dark:text-zinc-400 hover:text-slate-900 dark:hover:text-zinc-100 hover:bg-slate-100 dark:hover:bg-zinc-800 border border-slate-200 dark:border-zinc-800 transition-colors cursor-pointer disabled:opacity-50"
            title={t('settings.mcp.refreshBtn')}
          >
            <RotateCw className={`w-4 h-4 ${isLoading ? 'animate-spin' : ''}`} />
          </button>
          <button
            type="button"
            onClick={() => {
              setModalEditName(undefined);
              setModalEditConfig(undefined);
              setIsModalOpen(true);
            }}
            className="px-3.5 py-2 text-xs font-medium bg-codex-accent hover:bg-codex-accent-hover text-white rounded-lg transition-colors flex items-center gap-1.5 shadow-sm cursor-pointer"
          >
            <Plus className="w-4 h-4" />
            {t('settings.mcp.addBtn')}
          </button>
        </div>
      </div>

      {/* Path bar & Read-only banner */}
      {configData?.filePath && (
        <div className="space-y-2">
          <div className="p-3 rounded-xl bg-slate-50 dark:bg-zinc-800/40 border border-slate-200 dark:border-zinc-800 flex flex-wrap items-center justify-between gap-2 text-xs">
            <div className="flex items-center gap-2 text-slate-500 dark:text-zinc-400 truncate max-w-xl">
              <span className="font-semibold text-slate-700 dark:text-zinc-300 shrink-0">
                {t('settings.mcp.configPath')}
              </span>
              <span className="font-mono truncate" title={configData.filePath}>
                {configData.filePath}
              </span>
            </div>
            <div className="flex items-center gap-2">
              {!configData.isWritable && (
                <span className="px-2 py-0.5 text-[11px] rounded bg-amber-100 dark:bg-amber-950/40 text-amber-700 dark:text-amber-400 border border-amber-300 dark:border-amber-800">
                  {t('settings.mcp.readOnlyWarning')}
                </span>
              )}
              <button
                type="button"
                onClick={handleCopyPath}
                className="p-1 rounded text-slate-500 hover:text-slate-700 dark:hover:text-zinc-200 hover:bg-slate-200 dark:hover:bg-zinc-700 transition-colors cursor-pointer"
                title={t('settings.mcp.copyPath')}
              >
                {copiedPath ? <Check className="w-3.5 h-3.5 text-emerald-500" /> : <Copy className="w-3.5 h-3.5" />}
              </button>
            </div>
          </div>

          {!configData.isWritable && fixPermissionCmd && (
            <div className="p-2.5 px-3 rounded-xl bg-amber-50 dark:bg-amber-950/20 border border-amber-200 dark:border-amber-800/60 flex flex-wrap items-center justify-between gap-2 text-xs text-amber-800 dark:text-amber-300">
              <div className="flex items-center gap-2 min-w-0 flex-1">
                <span className="font-medium shrink-0">{t('settings.mcp.permissionFixHint')}:</span>
                <code
                  onClick={() => handleCopyCmd(fixPermissionCmd)}
                  className="font-mono text-[11px] bg-amber-100/80 dark:bg-amber-900/50 px-2 py-0.5 rounded text-amber-900 dark:text-amber-200 truncate select-all cursor-pointer border border-amber-300/50 dark:border-amber-700/50 hover:bg-amber-200/70 dark:hover:bg-amber-800/50 transition-colors"
                  title={t('settings.mcp.copyCommand')}
                >
                  {fixPermissionCmd}
                </code>
              </div>
              <button
                type="button"
                onClick={() => handleCopyCmd(fixPermissionCmd)}
                className="px-2.5 py-1 rounded-lg bg-amber-200/70 hover:bg-amber-200 dark:bg-amber-900/60 dark:hover:bg-amber-800 text-amber-900 dark:text-amber-200 font-medium text-[11px] flex items-center gap-1.5 transition-colors shrink-0 cursor-pointer shadow-xs"
                title={t('settings.mcp.copyCommand')}
              >
                {copiedCmd ? (
                  <>
                    <Check className="w-3.5 h-3.5 text-emerald-600 dark:text-emerald-400" />
                    <span className="text-emerald-700 dark:text-emerald-400">{t('settings.mcp.copiedCommand')}</span>
                  </>
                ) : (
                  <>
                    <Copy className="w-3.5 h-3.5" />
                    <span>{t('settings.mcp.copyCommand')}</span>
                  </>
                )}
              </button>
            </div>
          )}
        </div>
      )}

      {/* Error state */}
      {configData && !configData.success && configData.error && (
        <div className="p-3.5 rounded-xl bg-red-50 dark:bg-red-950/40 border border-red-200 dark:border-red-900/60 flex items-start gap-2.5 text-xs text-red-600 dark:text-red-400">
          <AlertTriangle className="w-4 h-4 mt-0.5 shrink-0" />
          <div className="flex-1 font-medium">{configData.error}</div>
        </div>
      )}

      {/* Empty State */}
      {serversList.length === 0 && !isLoading && (
        <div className="py-12 px-4 rounded-xl border border-dashed border-slate-200 dark:border-zinc-800 flex flex-col items-center justify-center text-center bg-slate-50/50 dark:bg-zinc-900/30">
          <div className="p-3 rounded-full bg-slate-100 dark:bg-zinc-800 text-slate-400 dark:text-zinc-500 mb-3">
            <Server className="w-6 h-6" />
          </div>
          <h3 className="text-sm font-semibold text-slate-900 dark:text-zinc-100 mb-1">
            {t('settings.mcp.emptyTitle')}
          </h3>
          <p className="text-xs text-slate-500 dark:text-zinc-400 max-w-sm mb-4 leading-relaxed">
            {t('settings.mcp.emptyDesc')}
          </p>
          <button
            type="button"
            onClick={() => {
              setModalEditName(undefined);
              setModalEditConfig(undefined);
              setIsModalOpen(true);
            }}
            className="px-4 py-2 text-xs font-medium bg-codex-accent hover:bg-codex-accent-hover text-white rounded-lg transition-colors flex items-center gap-2 shadow-sm cursor-pointer"
          >
            <Layers className="w-4 h-4" />
            {t('settings.mcp.addFromPreset')}
          </button>
        </div>
      )}

      {/* Server List */}
      {serversList.length > 0 && (
        <div className="space-y-3">
          {serversList.map(({ name, config }) => {
            const isTesting = Boolean(rowTesting[name]);
            const testRes = rowTestResults[name];
            const isDisabled = Boolean(config.disabled);

            return (
              <div
                key={name}
                className={`p-4 rounded-xl border transition-all ${
                  isDisabled
                    ? 'border-slate-200/60 dark:border-zinc-800/60 bg-slate-50/40 dark:bg-zinc-900/30 opacity-70'
                    : 'border-slate-200 dark:border-zinc-800 bg-white dark:bg-zinc-800/30 hover:border-slate-300 dark:hover:border-zinc-700'
                }`}
              >
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                  {/* Left Column: Name & Details */}
                  <div className="flex items-start gap-3">
                    <div
                      className={`p-2 rounded-lg mt-0.5 shrink-0 ${
                        isDisabled
                          ? 'bg-slate-100 dark:bg-zinc-800 text-slate-400'
                          : 'bg-codex-accent/10 text-codex-accent'
                      }`}
                    >
                      <Server className="w-4 h-4" />
                    </div>
                    <div className="space-y-1">
                      <div className="flex items-center gap-2">
                        <span className="text-xs font-bold font-mono text-slate-900 dark:text-zinc-100">
                          {name}
                        </span>
                        <span className="text-[10px] uppercase font-mono px-1.5 py-0.5 rounded bg-slate-100 dark:bg-zinc-800 text-slate-600 dark:text-zinc-400 border border-slate-200 dark:border-zinc-700">
                          {config.type || (config.url ? 'http' : 'stdio')}
                        </span>
                        {isDisabled && (
                          <span className="text-[10px] font-semibold px-1.5 py-0.5 rounded bg-amber-50 dark:bg-amber-950/40 text-amber-600 dark:text-amber-400 border border-amber-200 dark:border-amber-900/50">
                            {t('settings.mcp.statusDisabled')}
                          </span>
                        )}
                      </div>

                      {/* Command / URL preview */}
                      <div className="text-[11px] font-mono text-slate-500 dark:text-zinc-400 line-clamp-1">
                        {config.url ? (
                          <span>{config.url}</span>
                        ) : (
                          <span>
                            {config.command} {config.args?.join(' ')}
                          </span>
                        )}
                      </div>
                    </div>
                  </div>

                  {/* Right Column: Controls & Actions */}
                  <div className="flex items-center gap-2 self-end sm:self-center">
                    {/* Toggle Switch */}
                    <button
                      type="button"
                      onClick={() => handleToggleServer(name, config.disabled)}
                      className={`px-2.5 py-1 text-[11px] font-medium rounded border transition-colors cursor-pointer ${
                        isDisabled
                          ? 'bg-slate-100 dark:bg-zinc-800 text-slate-600 dark:text-zinc-400 border-slate-200 dark:border-zinc-700 hover:bg-slate-200'
                          : 'bg-emerald-50 dark:bg-emerald-950/30 text-emerald-600 dark:text-emerald-400 border-emerald-200 dark:border-emerald-900/50 hover:bg-emerald-100'
                      }`}
                      title={isDisabled ? t('settings.mcp.statusDisabled') : t('settings.mcp.statusEnabled')}
                    >
                      {isDisabled ? t('settings.mcp.statusDisabled') : t('settings.mcp.statusEnabled')}
                    </button>

                    {/* Test Button */}
                    <button
                      type="button"
                      disabled={isTesting}
                      onClick={() => handleTestRow(name, config)}
                      className="p-1.5 rounded-lg text-slate-600 dark:text-zinc-400 hover:text-emerald-600 dark:hover:text-emerald-400 hover:bg-slate-100 dark:hover:bg-zinc-700 border border-slate-200 dark:border-zinc-700 transition-colors cursor-pointer disabled:opacity-50"
                      title={t('settings.mcp.testBtn')}
                    >
                      {isTesting ? (
                        <Loader2 className="w-3.5 h-3.5 animate-spin text-codex-accent" />
                      ) : (
                        <Play className="w-3.5 h-3.5" />
                      )}
                    </button>

                    {/* Edit Button */}
                    <button
                      type="button"
                      onClick={() => {
                        setModalEditName(name);
                        setModalEditConfig(config);
                        setIsModalOpen(true);
                      }}
                      className="p-1.5 rounded-lg text-slate-600 dark:text-zinc-400 hover:text-slate-900 dark:hover:text-zinc-100 hover:bg-slate-100 dark:hover:bg-zinc-700 border border-slate-200 dark:border-zinc-700 transition-colors cursor-pointer"
                      title={t('settings.mcp.editBtn')}
                    >
                      <Edit3 className="w-3.5 h-3.5" />
                    </button>

                    {/* Delete Button */}
                    <button
                      type="button"
                      onClick={() => setServerToDelete(name)}
                      className="p-1.5 rounded-lg text-slate-600 dark:text-zinc-400 hover:text-red-600 dark:hover:text-red-400 hover:bg-red-50 dark:hover:bg-red-950/30 border border-slate-200 dark:border-zinc-700 transition-colors cursor-pointer"
                      title={t('settings.mcp.deleteBtn')}
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </div>

                {/* Inline Test Results Banner */}
                {testRes && (
                  <div className="mt-3 pt-3 border-t border-slate-100 dark:border-zinc-800/80 flex flex-wrap items-center justify-between gap-2 text-xs">
                    <span
                      className={`font-medium flex items-center gap-1.5 ${
                        testRes.success
                          ? 'text-emerald-600 dark:text-emerald-400'
                          : 'text-red-600 dark:text-red-400'
                      }`}
                    >
                      {testRes.success ? (
                        <>
                          <Check className="w-3.5 h-3.5" />
                          {t('settings.mcp.testSuccess', {
                            count: testRes.tools?.length || 0,
                            latency: testRes.latencyMs,
                          })}
                        </>
                      ) : (
                        <>
                          <AlertTriangle className="w-3.5 h-3.5" />
                          {t('settings.mcp.testFailed', {
                            error: testRes.error || '',
                          })}
                        </>
                      )}
                    </span>

                    {testRes.tools && testRes.tools.length > 0 && (
                      <div className="flex flex-wrap gap-1">
                        {testRes.tools.slice(0, 5).map((tl) => (
                          <span
                            key={tl.name}
                            title={tl.description}
                            className="px-1.5 py-0.2 text-[10px] font-mono rounded bg-slate-100 dark:bg-zinc-800 text-slate-700 dark:text-zinc-300"
                          >
                            {tl.name}
                          </span>
                        ))}
                        {testRes.tools.length > 5 && (
                          <span className="text-[10px] text-slate-400 self-center">
                            +{testRes.tools.length - 5}
                          </span>
                        )}
                      </div>
                    )}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      {/* Delete Confirmation Dialog */}
      {serverToDelete && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm animate-fade-in">
          <div className="bg-white dark:bg-zinc-900 border border-slate-200 dark:border-zinc-800 rounded-xl p-6 max-w-md w-full shadow-2xl space-y-4">
            <h3 className="text-sm font-semibold text-slate-900 dark:text-zinc-100">
              {t('settings.mcp.deleteBtn')}
            </h3>
            <p className="text-xs text-slate-600 dark:text-zinc-400 leading-relaxed">
              {t('settings.mcp.confirmDelete', { name: serverToDelete })}
            </p>
            <div className="flex items-center justify-end gap-2.5 pt-2">
              <button
                type="button"
                disabled={isDeleting}
                onClick={() => setServerToDelete(null)}
                className="px-3.5 py-1.5 text-xs font-medium text-slate-700 dark:text-zinc-300 hover:bg-slate-100 dark:hover:bg-zinc-800 rounded-lg transition-colors cursor-pointer"
              >
                {t('settings.mcp.cancel')}
              </button>
              <button
                type="button"
                disabled={isDeleting}
                onClick={handleDeleteServer}
                className="px-3.5 py-1.5 text-xs font-medium bg-red-600 hover:bg-red-700 text-white rounded-lg transition-colors flex items-center gap-1.5 cursor-pointer disabled:opacity-50"
              >
                {isDeleting && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
                {t('settings.mcp.deleteBtn')}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Add / Edit Modal */}
      <McpServerModal
        isOpen={isModalOpen}
        onClose={() => setIsModalOpen(false)}
        onSave={handleSaveServer}
        onTest={handleTestInModal}
        initialName={modalEditName}
        initialConfig={modalEditConfig}
        isEdit={Boolean(modalEditName)}
        existingNames={existingServerNames}
        onSelectFolder={onSelectFolder}
      />
    </div>
  );
});
