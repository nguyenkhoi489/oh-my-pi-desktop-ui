import React, { useState, useEffect, useCallback, useMemo } from 'react';
import {
  X,
  Plus,
  Trash2,
  Check,
  AlertTriangle,
  Play,
  Loader2,
  Eye,
  EyeOff,
  Folder,
  Server,
  Layers,
  Wrench,
  Globe,
  Database,
  Brain,
  Compass,
  Search,
} from 'lucide-react';
import type {
  McpServerConfig,
  McpTransportType,
  McpTestResult,
} from '../../../types';
import {
  MCP_PRESETS,
  McpPreset,
  envToRows,
  rowsToEnv,
  argsToText,
  textToArgs,
  validateServerName,
  buildConfigFromPreset,
  EnvRow,
} from '../../../utils/mcpPresets';
import { useI18n } from '../../../i18n/I18nProvider';

interface McpServerModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSave: (name: string, config: McpServerConfig) => Promise<void>;
  onTest: (config: McpServerConfig) => Promise<McpTestResult>;
  initialName?: string;
  initialConfig?: McpServerConfig;
  isEdit?: boolean;
  existingNames?: string[];
  onSelectFolder?: () => Promise<string | null>;
}

export const McpServerModal: React.FC<McpServerModalProps> = React.memo(({
  isOpen,
  onClose,
  onSave,
  onTest,
  initialName = '',
  initialConfig,
  isEdit = false,
  existingNames = [],
  onSelectFolder,
}) => {
  const { t } = useI18n();

  const [activeTab, setActiveTab] = useState<'presets' | 'custom'>(isEdit ? 'custom' : 'presets');
  const [serverName, setServerName] = useState(initialName);
  const [transport, setTransport] = useState<McpTransportType>(initialConfig?.type || (initialConfig?.url ? 'http' : 'stdio'));
  const [command, setCommand] = useState(initialConfig?.command || 'npx');
  const [argsText, setArgsText] = useState(argsToText(initialConfig?.args));
  const [envRows, setEnvRows] = useState<EnvRow[]>(envToRows(initialConfig?.env));
  const [showSecrets, setShowSecrets] = useState<Record<string, boolean>>({});
  const [url, setUrl] = useState(initialConfig?.url || '');
  const [headersText, setHeadersText] = useState(
    initialConfig?.headers
      ? Object.entries(initialConfig.headers).map(([k, v]) => `${k}: ${v}`).join('\n')
      : ''
  );

  // Presets tab state
  const [selectedPreset, setSelectedPreset] = useState<McpPreset | null>(null);
  const [presetFieldValues, setPresetFieldValues] = useState<Record<string, string>>({});
  const [presetSearchQuery, setPresetSearchQuery] = useState('');

  // Test and save state
  const [isTesting, setIsTesting] = useState(false);
  const [testResult, setTestResult] = useState<McpTestResult | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  // Sync state when opening modal
  useEffect(() => {
    if (isOpen) {
      setServerName(initialName);
      setTransport(initialConfig?.type || (initialConfig?.url ? 'http' : 'stdio'));
      setCommand(initialConfig?.command || 'npx');
      setArgsText(argsToText(initialConfig?.args));
      setEnvRows(envToRows(initialConfig?.env));
      setUrl(initialConfig?.url || '');
      setHeadersText(
        initialConfig?.headers
          ? Object.entries(initialConfig.headers).map(([k, v]) => `${k}: ${v}`).join('\n')
          : ''
      );
      setActiveTab(isEdit ? 'custom' : 'presets');
      setSelectedPreset(null);
      setPresetFieldValues({});
      setTestResult(null);
      setErrorMessage(null);
      setIsTesting(false);
      setIsSaving(false);
    }
  }, [isOpen, initialName, initialConfig, isEdit]);

  // Handle Preset Selection
  const handleSelectPreset = useCallback((preset: McpPreset) => {
    setSelectedPreset(preset);
    setServerName(preset.id);
    const initialValues: Record<string, string> = {};
    for (const f of preset.fields) {
      initialValues[f.key] = '';
    }
    setPresetFieldValues(initialValues);
    setTestResult(null);
    setErrorMessage(null);
  }, []);

  const handleBrowseFolderForField = useCallback(async (fieldKey: string) => {
    if (onSelectFolder) {
      const selected = await onSelectFolder();
      if (selected) {
        setPresetFieldValues((prev) => ({ ...prev, [fieldKey]: selected }));
      }
    }
  }, [onSelectFolder]);

  // Assemble current config object from form
  const assembleCurrentConfig = useCallback((): McpServerConfig => {
    if (activeTab === 'presets' && selectedPreset) {
      return buildConfigFromPreset(selectedPreset, presetFieldValues);
    }

    if (transport === 'http' || transport === 'sse') {
      const headers: Record<string, string> = {};
      for (const line of headersText.split('\n')) {
        const idx = line.indexOf(':');
        if (idx > 0) {
          const k = line.slice(0, idx).trim();
          const v = line.slice(idx + 1).trim();
          if (k && v) headers[k] = v;
        }
      }

      return {
        type: transport,
        url: url.trim(),
        headers: Object.keys(headers).length > 0 ? headers : undefined,
        disabled: false,
      };
    }

    const env = rowsToEnv(envRows);
    const parsedArgs = textToArgs(argsText);

    return {
      type: 'stdio',
      command: command.trim(),
      args: parsedArgs.length > 0 ? parsedArgs : undefined,
      env: Object.keys(env).length > 0 ? env : undefined,
      disabled: false,
    };
  }, [activeTab, selectedPreset, presetFieldValues, transport, url, headersText, envRows, argsText, command]);

  // Handle Test Connection
  const handleRunTest = useCallback(async () => {
    setErrorMessage(null);
    setTestResult(null);
    setIsTesting(true);

    try {
      const config = assembleCurrentConfig();
      const res = await onTest(config);
      setTestResult(res);
    } catch (err: unknown) {
      setTestResult({
        success: false,
        latencyMs: 0,
        error: err instanceof Error ? err.message : String(err),
      });
    } finally {
      setIsTesting(false);
    }
  }, [assembleCurrentConfig, onTest]);

  // Handle Save
  const handleSave = useCallback(async () => {
    setErrorMessage(null);
    const trimmedName = serverName.trim();

    const nameValidation = validateServerName(trimmedName);
    if (!nameValidation.valid) {
      setErrorMessage(nameValidation.error || t('electron.mcp.nameRequired'));
      return;
    }

    if (!isEdit && existingNames.includes(trimmedName)) {
      setErrorMessage(t('settings.mcp.duplicateName'));
      return;
    }

    const config = assembleCurrentConfig();

    if (config.type === 'stdio' && !config.command) {
      setErrorMessage(t('electron.mcp.commandRequired'));
      return;
    }

    if ((config.type === 'http' || config.type === 'sse') && !config.url) {
      setErrorMessage(t('electron.mcp.urlRequired'));
      return;
    }

    setIsSaving(true);
    try {
      await onSave(trimmedName, config);
      onClose();
    } catch (err: unknown) {
      setErrorMessage(err instanceof Error ? err.message : String(err));
    } finally {
      setIsSaving(false);
    }
  }, [serverName, isEdit, existingNames, assembleCurrentConfig, onSave, onClose, t]);

  const filteredPresets = useMemo(() => {
    const q = presetSearchQuery.trim().toLowerCase();
    if (!q) return MCP_PRESETS;
    return MCP_PRESETS.filter(
      (p) =>
        p.name.toLowerCase().includes(q) ||
        p.description.toLowerCase().includes(q) ||
        p.id.toLowerCase().includes(q)
    );
  }, [presetSearchQuery]);

  const renderPresetIcon = (iconName: string) => {
    switch (iconName) {
      case 'Folder':
        return <Folder className="w-5 h-5 text-amber-500" />;
      case 'Brain':
        return <Brain className="w-5 h-5 text-purple-500" />;
      case 'Globe':
        return <Globe className="w-5 h-5 text-sky-500" />;
      case 'Database':
        return <Database className="w-5 h-5 text-emerald-500" />;
      case 'Compass':
        return <Compass className="w-5 h-5 text-orange-500" />;
      default:
        return <Server className="w-5 h-5 text-codex-accent" />;
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm animate-fade-in">
      <div
        className="relative w-full max-w-3xl max-h-[90vh] flex flex-col bg-white dark:bg-zinc-900 border border-slate-200 dark:border-zinc-800 rounded-xl shadow-2xl overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-200 dark:border-zinc-800">
          <div className="flex items-center gap-2.5">
            <div className="p-2 rounded-lg bg-codex-accent/10 text-codex-accent">
              <Server className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-base font-semibold text-slate-900 dark:text-zinc-100">
                {isEdit
                  ? t('settings.mcp.modalEditTitle', { name: initialName })
                  : t('settings.mcp.modalAddTitle')}
              </h2>
              <p className="text-xs text-slate-500 dark:text-zinc-400">
                {t('settings.mcp.desc')}
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 rounded-lg text-slate-400 hover:text-slate-600 dark:hover:text-zinc-200 hover:bg-slate-100 dark:hover:bg-zinc-800 transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Tab Switcher (if not editing) */}
        {!isEdit && (
          <div className="flex border-b border-slate-200 dark:border-zinc-800 px-6 bg-slate-50/50 dark:bg-zinc-900/50">
            <button
              onClick={() => {
                setActiveTab('presets');
                setTestResult(null);
                setErrorMessage(null);
              }}
              className={`flex items-center gap-2 py-3 px-4 text-xs font-medium border-b-2 transition-colors cursor-pointer ${
                activeTab === 'presets'
                  ? 'border-codex-accent text-codex-accent'
                  : 'border-transparent text-slate-500 dark:text-zinc-400 hover:text-slate-900 dark:hover:text-zinc-200'
              }`}
            >
              <Layers className="w-4 h-4" />
              {t('settings.mcp.tabPresets')}
            </button>
            <button
              onClick={() => {
                setActiveTab('custom');
                setTestResult(null);
                setErrorMessage(null);
              }}
              className={`flex items-center gap-2 py-3 px-4 text-xs font-medium border-b-2 transition-colors cursor-pointer ${
                activeTab === 'custom'
                  ? 'border-codex-accent text-codex-accent'
                  : 'border-transparent text-slate-500 dark:text-zinc-400 hover:text-slate-900 dark:hover:text-zinc-200'
              }`}
            >
              <Wrench className="w-4 h-4" />
              {t('settings.mcp.tabCustom')}
            </button>
          </div>
        )}

        {/* Modal Body */}
        <div className="flex-1 overflow-y-auto p-6 space-y-6">
          {errorMessage && (
            <div className="p-3 rounded-lg bg-red-50 dark:bg-red-950/40 border border-red-200 dark:border-red-900/60 flex items-start gap-2.5 text-xs text-red-600 dark:text-red-400">
              <AlertTriangle className="w-4 h-4 mt-0.5 shrink-0" />
              <div className="flex-1 font-medium">{errorMessage}</div>
            </div>
          )}

          {/* TAB 1: Presets Catalog */}
          {activeTab === 'presets' && (
            <div className="space-y-6">
              {!selectedPreset ? (
                <>
                  <div className="relative">
                    <Search className="absolute left-3 top-2.5 w-4 h-4 text-slate-400 dark:text-zinc-500" />
                    <input
                      type="text"
                      value={presetSearchQuery}
                      onChange={(e) => setPresetSearchQuery(e.target.value)}
                      placeholder={t('settings.mcp.presetSearchPlaceholder')}
                      className="w-full pl-9 pr-4 py-2 text-xs bg-slate-50 dark:bg-zinc-800/80 border border-slate-200 dark:border-zinc-700 rounded-lg text-slate-900 dark:text-zinc-100 placeholder-slate-400 focus:outline-none focus:ring-1 focus:ring-codex-accent"
                    />
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-2 gap-3.5">
                    {filteredPresets.map((preset) => (
                      <button
                        key={preset.id}
                        type="button"
                        onClick={() => handleSelectPreset(preset)}
                        className="flex items-start gap-3.5 p-4 rounded-xl border border-slate-200 dark:border-zinc-800 bg-white dark:bg-zinc-800/40 hover:border-codex-accent/60 dark:hover:border-codex-accent/60 hover:bg-slate-50 dark:hover:bg-zinc-800/80 transition-all text-left group cursor-pointer"
                      >
                        <div className="p-2.5 rounded-lg bg-slate-100 dark:bg-zinc-800 shrink-0 group-hover:scale-105 transition-transform">
                          {renderPresetIcon(preset.icon)}
                        </div>
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2">
                            <span className="text-xs font-semibold text-slate-900 dark:text-zinc-100 group-hover:text-codex-accent transition-colors">
                              {preset.name}
                            </span>
                            <span className="text-[10px] px-1.5 py-0.5 rounded bg-slate-100 dark:bg-zinc-800 text-slate-500 dark:text-zinc-400 font-mono">
                              {preset.defaultTransport}
                            </span>
                          </div>
                          <p className="text-[11px] text-slate-500 dark:text-zinc-400 mt-1 line-clamp-2 leading-relaxed">
                            {preset.description}
                          </p>
                        </div>
                      </button>
                    ))}
                  </div>
                </>
              ) : (
                <div className="space-y-4">
                  {/* Selected Preset Banner */}
                  <div className="flex items-center justify-between p-3.5 rounded-xl bg-slate-50 dark:bg-zinc-800/50 border border-slate-200 dark:border-zinc-800">
                    <div className="flex items-center gap-3">
                      <div className="p-2 rounded-lg bg-white dark:bg-zinc-800 border border-slate-200 dark:border-zinc-700">
                        {renderPresetIcon(selectedPreset.icon)}
                      </div>
                      <div>
                        <div className="text-xs font-semibold text-slate-900 dark:text-zinc-100">
                          {selectedPreset.name}
                        </div>
                        <div className="text-[11px] text-slate-500 dark:text-zinc-400">
                          {selectedPreset.description}
                        </div>
                      </div>
                    </div>
                    <button
                      type="button"
                      onClick={() => setSelectedPreset(null)}
                      className="text-xs text-codex-accent hover:underline font-medium"
                    >
                      {t('settings.mcp.tabPresets')}
                    </button>
                  </div>

                  {/* Server Name input */}
                  <div>
                    <label className="block text-xs font-semibold text-slate-900 dark:text-zinc-100 mb-1.5">
                      {t('settings.mcp.serverNameLabel')}
                    </label>
                    <input
                      type="text"
                      value={serverName}
                      onChange={(e) => setServerName(e.target.value)}
                      placeholder={t('settings.mcp.serverNamePlaceholder')}
                      className="w-full px-3 py-2 text-xs bg-slate-50 dark:bg-zinc-800/80 border border-slate-200 dark:border-zinc-700 rounded-lg text-slate-900 dark:text-zinc-100 focus:outline-none focus:ring-1 focus:ring-codex-accent font-mono"
                    />
                  </div>

                  {/* Dynamic Preset Fields */}
                  {selectedPreset.fields.map((field) => (
                    <div key={field.key}>
                      <div className="flex items-center justify-between mb-1.5">
                        <label className="text-xs font-semibold text-slate-900 dark:text-zinc-100">
                          {field.label} {field.required && <span className="text-red-500">*</span>}
                        </label>
                        {field.description && (
                          <span className="text-[10px] text-slate-400 dark:text-zinc-500">
                            {field.description}
                          </span>
                        )}
                      </div>

                      {field.type === 'folder' ? (
                        <div className="flex items-center gap-2">
                          <input
                            type="text"
                            value={presetFieldValues[field.key] || ''}
                            onChange={(e) =>
                              setPresetFieldValues((prev) => ({ ...prev, [field.key]: e.target.value }))
                            }
                            placeholder={field.placeholder}
                            className="flex-1 px-3 py-2 text-xs bg-slate-50 dark:bg-zinc-800/80 border border-slate-200 dark:border-zinc-700 rounded-lg text-slate-900 dark:text-zinc-100 focus:outline-none focus:ring-1 focus:ring-codex-accent font-mono"
                          />
                          {onSelectFolder && (
                            <button
                              type="button"
                              onClick={() => handleBrowseFolderForField(field.key)}
                              className="px-3 py-2 text-xs font-medium bg-slate-100 dark:bg-zinc-800 hover:bg-slate-200 dark:hover:bg-zinc-700 text-slate-700 dark:text-zinc-200 border border-slate-200 dark:border-zinc-700 rounded-lg transition-colors flex items-center gap-1.5 shrink-0"
                            >
                              <Folder className="w-3.5 h-3.5" />
                              {t('settings.mcp.browseFolder')}
                            </button>
                          )}
                        </div>
                      ) : (
                        <div className="relative">
                          <input
                            type={field.type === 'password' && !showSecrets[field.key] ? 'password' : 'text'}
                            value={presetFieldValues[field.key] || ''}
                            onChange={(e) =>
                              setPresetFieldValues((prev) => ({ ...prev, [field.key]: e.target.value }))
                            }
                            placeholder={field.placeholder}
                            className="w-full px-3 py-2 pr-9 text-xs bg-slate-50 dark:bg-zinc-800/80 border border-slate-200 dark:border-zinc-700 rounded-lg text-slate-900 dark:text-zinc-100 focus:outline-none focus:ring-1 focus:ring-codex-accent font-mono"
                          />
                          {field.type === 'password' && (
                            <button
                              type="button"
                              onClick={() =>
                                setShowSecrets((prev) => ({ ...prev, [field.key]: !prev[field.key] }))
                              }
                              className="absolute right-2.5 top-2.5 text-slate-400 hover:text-slate-600 dark:hover:text-zinc-200"
                            >
                              {showSecrets[field.key] ? (
                                <EyeOff className="w-3.5 h-3.5" />
                              ) : (
                                <Eye className="w-3.5 h-3.5" />
                              )}
                            </button>
                          )}
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* TAB 2: Custom Configuration */}
          {activeTab === 'custom' && (
            <div className="space-y-4">
              {/* Server Name */}
              <div>
                <label className="block text-xs font-semibold text-slate-900 dark:text-zinc-100 mb-1.5">
                  {t('settings.mcp.serverNameLabel')}
                </label>
                <input
                  type="text"
                  value={serverName}
                  disabled={isEdit}
                  onChange={(e) => setServerName(e.target.value)}
                  placeholder={t('settings.mcp.serverNamePlaceholder')}
                  className="w-full px-3 py-2 text-xs bg-slate-50 dark:bg-zinc-800/80 border border-slate-200 dark:border-zinc-700 rounded-lg text-slate-900 dark:text-zinc-100 focus:outline-none focus:ring-1 focus:ring-codex-accent font-mono disabled:opacity-60"
                />
              </div>

              {/* Transport Radio */}
              <div>
                <label className="block text-xs font-semibold text-slate-900 dark:text-zinc-100 mb-1.5">
                  {t('settings.mcp.transportLabel')}
                </label>
                <div className="flex gap-2">
                  {(['stdio', 'sse', 'http'] as McpTransportType[]).map((tr) => (
                    <button
                      key={tr}
                      type="button"
                      onClick={() => setTransport(tr)}
                      className={`px-3.5 py-1.5 text-xs font-medium rounded-lg border transition-all ${
                        transport === tr
                          ? 'bg-codex-accent/10 border-codex-accent text-codex-accent'
                          : 'border-slate-200 dark:border-zinc-800 text-slate-600 dark:text-zinc-400 hover:bg-slate-50 dark:hover:bg-zinc-800'
                      }`}
                    >
                      {tr}
                    </button>
                  ))}
                </div>
              </div>

              {/* Transport: STDIO */}
              {transport === 'stdio' && (
                <>
                  <div>
                    <label className="block text-xs font-semibold text-slate-900 dark:text-zinc-100 mb-1.5">
                      {t('settings.mcp.commandLabel')}
                    </label>
                    <input
                      type="text"
                      value={command}
                      onChange={(e) => setCommand(e.target.value)}
                      placeholder={t('settings.mcp.commandPlaceholder')}
                      className="w-full px-3 py-2 text-xs bg-slate-50 dark:bg-zinc-800/80 border border-slate-200 dark:border-zinc-700 rounded-lg text-slate-900 dark:text-zinc-100 focus:outline-none focus:ring-1 focus:ring-codex-accent font-mono"
                    />
                  </div>

                  <div>
                    <label className="block text-xs font-semibold text-slate-900 dark:text-zinc-100 mb-1.5">
                      {t('settings.mcp.argsLabel')}
                    </label>
                    <textarea
                      rows={3}
                      value={argsText}
                      onChange={(e) => setArgsText(e.target.value)}
                      placeholder={t('settings.mcp.argsPlaceholder')}
                      className="w-full px-3 py-2 text-xs bg-slate-50 dark:bg-zinc-800/80 border border-slate-200 dark:border-zinc-700 rounded-lg text-slate-900 dark:text-zinc-100 focus:outline-none focus:ring-1 focus:ring-codex-accent font-mono leading-relaxed"
                    />
                  </div>

                  {/* Environment Variables Table */}
                  <div>
                    <div className="flex items-center justify-between mb-1.5">
                      <label className="text-xs font-semibold text-slate-900 dark:text-zinc-100">
                        {t('settings.mcp.envLabel')}
                      </label>
                      <button
                        type="button"
                        onClick={() =>
                          setEnvRows((prev) => [
                            ...prev,
                            { id: `env-${Date.now()}-${Math.random()}`, key: '', value: '' },
                          ])
                        }
                        className="text-[11px] text-codex-accent hover:underline font-medium flex items-center gap-1"
                      >
                        <Plus className="w-3.5 h-3.5" />
                        {t('settings.mcp.addEnvRow')}
                      </button>
                    </div>

                    {envRows.length > 0 && (
                      <div className="space-y-2 border border-slate-200 dark:border-zinc-800 rounded-lg p-3 bg-slate-50/50 dark:bg-zinc-900/50">
                        {envRows.map((row, idx) => (
                          <div key={row.id} className="flex items-center gap-2">
                            <input
                              type="text"
                              value={row.key}
                              onChange={(e) => {
                                const newRows = [...envRows];
                                newRows[idx].key = e.target.value;
                                setEnvRows(newRows);
                              }}
                              placeholder={t('settings.mcp.envKeyPlaceholder')}
                              className="w-1/3 px-2.5 py-1.5 text-xs bg-white dark:bg-zinc-800 border border-slate-200 dark:border-zinc-700 rounded text-slate-900 dark:text-zinc-100 font-mono focus:outline-none focus:ring-1 focus:ring-codex-accent"
                            />
                            <div className="relative flex-1">
                              <input
                                type={showSecrets[row.id] ? 'text' : 'password'}
                                value={row.value}
                                onChange={(e) => {
                                  const newRows = [...envRows];
                                  newRows[idx].value = e.target.value;
                                  setEnvRows(newRows);
                                }}
                                placeholder={t('settings.mcp.envValuePlaceholder')}
                                className="w-full px-2.5 py-1.5 pr-8 text-xs bg-white dark:bg-zinc-800 border border-slate-200 dark:border-zinc-700 rounded text-slate-900 dark:text-zinc-100 font-mono focus:outline-none focus:ring-1 focus:ring-codex-accent"
                              />
                              <button
                                type="button"
                                onClick={() =>
                                  setShowSecrets((prev) => ({ ...prev, [row.id]: !prev[row.id] }))
                                }
                                className="absolute right-2 top-2 text-slate-400 hover:text-slate-600 dark:hover:text-zinc-200"
                              >
                                {showSecrets[row.id] ? (
                                  <EyeOff className="w-3.5 h-3.5" />
                                ) : (
                                  <Eye className="w-3.5 h-3.5" />
                                )}
                              </button>
                            </div>
                            <button
                              type="button"
                              onClick={() => setEnvRows(envRows.filter((_, i) => i !== idx))}
                              className="p-1.5 text-slate-400 hover:text-red-500 transition-colors"
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                            </button>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                </>
              )}

              {/* Transport: HTTP / SSE */}
              {(transport === 'http' || transport === 'sse') && (
                <>
                  <div>
                    <label className="block text-xs font-semibold text-slate-900 dark:text-zinc-100 mb-1.5">
                      {t('settings.mcp.urlLabel')}
                    </label>
                    <input
                      type="text"
                      value={url}
                      onChange={(e) => setUrl(e.target.value)}
                      placeholder={t('settings.mcp.urlPlaceholder')}
                      className="w-full px-3 py-2 text-xs bg-slate-50 dark:bg-zinc-800/80 border border-slate-200 dark:border-zinc-700 rounded-lg text-slate-900 dark:text-zinc-100 focus:outline-none focus:ring-1 focus:ring-codex-accent font-mono"
                    />
                  </div>

                  <div>
                    <label className="block text-xs font-semibold text-slate-900 dark:text-zinc-100 mb-1.5">
                      {t('settings.mcp.headersLabel')}
                    </label>
                    <textarea
                      rows={3}
                      value={headersText}
                      onChange={(e) => setHeadersText(e.target.value)}
                      placeholder={t('settings.mcp.headersPlaceholder')}
                      className="w-full px-3 py-2 text-xs bg-slate-50 dark:bg-zinc-800/80 border border-slate-200 dark:border-zinc-700 rounded-lg text-slate-900 dark:text-zinc-100 focus:outline-none focus:ring-1 focus:ring-codex-accent font-mono leading-relaxed"
                    />
                  </div>
                </>
              )}
            </div>
          )}

          {/* Test Connection Console */}
          {(activeTab === 'custom' || selectedPreset) && (
            <div className="pt-2 border-t border-slate-200 dark:border-zinc-800 space-y-3">
              <div className="flex items-center justify-between">
                <button
                  type="button"
                  disabled={isTesting || isSaving}
                  onClick={handleRunTest}
                  className="px-3.5 py-1.5 text-xs font-medium bg-slate-100 dark:bg-zinc-800 hover:bg-slate-200 dark:hover:bg-zinc-700 text-slate-700 dark:text-zinc-200 border border-slate-200 dark:border-zinc-700 rounded-lg transition-colors flex items-center gap-2 cursor-pointer disabled:opacity-50"
                >
                  {isTesting ? (
                    <>
                      <Loader2 className="w-3.5 h-3.5 animate-spin text-codex-accent" />
                      {t('settings.mcp.testing')}
                    </>
                  ) : (
                    <>
                      <Play className="w-3.5 h-3.5 text-emerald-500" />
                      {t('settings.mcp.testBtn')}
                    </>
                  )}
                </button>

                {testResult && (
                  <span
                    className={`text-xs font-medium flex items-center gap-1.5 ${
                      testResult.success
                        ? 'text-emerald-600 dark:text-emerald-400'
                        : 'text-red-600 dark:text-red-400'
                    }`}
                  >
                    {testResult.success ? (
                      <>
                        <Check className="w-4 h-4" />
                        {t('settings.mcp.testSuccess', {
                          count: testResult.tools?.length || 0,
                          latency: testResult.latencyMs,
                        })}
                      </>
                    ) : (
                      <>
                        <AlertTriangle className="w-4 h-4" />
                        {t('settings.mcp.testFailed', {
                          error: testResult.error || '',
                        })}
                      </>
                    )}
                  </span>
                )}
              </div>

              {testResult?.success && testResult.tools && testResult.tools.length > 0 && (
                <div className="p-3 bg-emerald-50/50 dark:bg-emerald-950/20 border border-emerald-200 dark:border-emerald-900/40 rounded-lg">
                  <div className="text-[11px] font-semibold text-emerald-800 dark:text-emerald-300 mb-2">
                    {testResult.tools.length} Tools Discovered:
                  </div>
                  <div className="flex flex-wrap gap-1.5 max-h-32 overflow-y-auto">
                    {testResult.tools.map((tl) => (
                      <span
                        key={tl.name}
                        title={tl.description}
                        className="px-2 py-0.5 text-[10px] font-mono rounded bg-white dark:bg-zinc-800 text-slate-700 dark:text-zinc-300 border border-emerald-200 dark:border-emerald-900/60"
                      >
                        {tl.name}
                      </span>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="flex items-center justify-end gap-2.5 px-6 py-4 border-t border-slate-200 dark:border-zinc-800 bg-slate-50/50 dark:bg-zinc-900/50">
          <button
            type="button"
            disabled={isSaving}
            onClick={onClose}
            className="px-4 py-2 text-xs font-medium text-slate-700 dark:text-zinc-300 hover:bg-slate-200 dark:hover:bg-zinc-800 rounded-lg transition-colors cursor-pointer disabled:opacity-50"
          >
            {t('settings.mcp.cancel')}
          </button>
          <button
            type="button"
            disabled={isSaving || (activeTab === 'presets' && !selectedPreset)}
            onClick={handleSave}
            className="px-4 py-2 text-xs font-medium bg-codex-accent hover:bg-codex-accent-hover text-white rounded-lg transition-colors flex items-center gap-1.5 cursor-pointer disabled:opacity-50"
          >
            {isSaving && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
            {isSaving ? t('settings.mcp.saving') : t('settings.mcp.saveBtn')}
          </button>
        </div>
      </div>
    </div>
  );
});
