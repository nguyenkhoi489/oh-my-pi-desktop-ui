import React, { useState, useCallback, useMemo } from 'react';
import {
  Sliders,
  RotateCw,
  Plus,
  Trash2,
  FolderSearch,
  FileCode,
  FolderPlus,
  Clock,
  FileText,
  Sparkles,
  Terminal,
  AlertTriangle,
} from 'lucide-react';
import type { OmpLaunchOptions } from '../../../types';
import { useI18n } from '../../../i18n/I18nProvider';

const SERVICE_TIER_OPTIONS = [
  { id: '', label: '' },
  { id: 'standard', label: 'standard' },
  { id: 'scale', label: 'scale' },
  { id: 'priority', label: 'priority' },
];

interface LaunchOptionsSectionProps {
  launchOptions?: OmpLaunchOptions;
  onChange: (options: OmpLaunchOptions) => void;
  onRestartEngine?: () => Promise<void>;
}

export const LaunchOptionsSection: React.FC<LaunchOptionsSectionProps> = ({
  launchOptions,
  onChange,
  onRestartEngine,
}) => {
  const { t } = useI18n();

  // Local input states for adding items to arrays
  const [newAddDir, setNewAddDir] = useState('');
  const [newConfigOverlay, setNewConfigOverlay] = useState('');
  const [newExtension, setNewExtension] = useState('');
  const [newHook, setNewHook] = useState('');
  const [newTool, setNewTool] = useState('');
  const [newSkill, setNewSkill] = useState('');
  const [newModel, setNewModel] = useState('');
  const [isRestarting, setIsRestarting] = useState(false);
  const [isDirty, setIsDirty] = useState(false);

  // Safe accessor
  const currentOptions: OmpLaunchOptions = useMemo(
    () => launchOptions || {},
    [launchOptions]
  );

  const updateOptions = useCallback(
    (updater: (prev: OmpLaunchOptions) => OmpLaunchOptions) => {
      const next = updater(currentOptions);
      onChange(next);
      setIsDirty(true);
    },
    [currentOptions, onChange]
  );

  // Restart engine handler
  const handleRestart = useCallback(async () => {
    if (!onRestartEngine) return;
    setIsRestarting(true);
    try {
      await onRestartEngine();
      setIsDirty(false);
    } finally {
      setIsRestarting(false);
    }
  }, [onRestartEngine]);

  // Reset launch options to empty
  const handleReset = useCallback(() => {
    onChange({
      addDirs: [],
      configOverlays: [],
      extensions: [],
      hooks: [],
    });
    setIsDirty(true);
  }, [onChange]);

  // File / folder browse helpers
  const handleBrowseFolderForAddDir = useCallback(async () => {
    if (!window.electronAPI?.selectFolder) return;
    const selected = await window.electronAPI.selectFolder();
    if (selected) {
      updateOptions((prev) => ({
        ...prev,
        addDirs: [...(prev.addDirs || []), selected],
      }));
    }
  }, [updateOptions]);

  const handleBrowseFileForConfig = useCallback(async () => {
    if (!window.electronAPI?.selectFile) return;
    const selected = await window.electronAPI.selectFile({
      title: t('settings.launchOptions.selectConfigTitle'),
      filters: [{ name: 'Config files', extensions: ['yml', 'yaml', 'json', 'toml'] }],
    });
    if (selected) {
      updateOptions((prev) => ({
        ...prev,
        configOverlays: [...(prev.configOverlays || []), selected],
      }));
    }
  }, [updateOptions]);

  const handleBrowseFileForExtension = useCallback(async () => {
    if (!window.electronAPI?.selectFile) return;
    const selected = await window.electronAPI.selectFile({
      title: t('settings.launchOptions.selectExtensionTitle'),
      filters: [{ name: 'Extension scripts', extensions: ['js', 'ts', 'mjs', 'cjs'] }],
    });
    if (selected) {
      updateOptions((prev) => ({
        ...prev,
        extensions: [...(prev.extensions || []), selected],
      }));
    }
  }, [updateOptions]);

  const handleBrowseFileForHook = useCallback(async () => {
    if (!window.electronAPI?.selectFile) return;
    const selected = await window.electronAPI.selectFile({
      title: t('settings.launchOptions.selectHookTitle'),
      filters: [{ name: 'Hook scripts', extensions: ['sh', 'js', 'ts', 'py', 'bash'] }],
    });
    if (selected) {
      updateOptions((prev) => ({
        ...prev,
        hooks: [...(prev.hooks || []), selected],
      }));
    }
  }, [updateOptions]);

  // Add list item helpers
  const addAddDir = useCallback(() => {
    if (!newAddDir.trim()) return;
    updateOptions((prev) => ({
      ...prev,
      addDirs: [...(prev.addDirs || []), newAddDir.trim()],
    }));
    setNewAddDir('');
  }, [newAddDir, updateOptions]);

  const removeAddDir = useCallback(
    (index: number) => {
      updateOptions((prev) => ({
        ...prev,
        addDirs: (prev.addDirs || []).filter((_, i) => i !== index),
      }));
    },
    [updateOptions]
  );

  const addConfigOverlay = useCallback(() => {
    if (!newConfigOverlay.trim()) return;
    updateOptions((prev) => ({
      ...prev,
      configOverlays: [...(prev.configOverlays || []), newConfigOverlay.trim()],
    }));
    setNewConfigOverlay('');
  }, [newConfigOverlay, updateOptions]);

  const removeConfigOverlay = useCallback(
    (index: number) => {
      updateOptions((prev) => ({
        ...prev,
        configOverlays: (prev.configOverlays || []).filter((_, i) => i !== index),
      }));
    },
    [updateOptions]
  );

  const addExtension = useCallback(() => {
    if (!newExtension.trim()) return;
    updateOptions((prev) => ({
      ...prev,
      extensions: [...(prev.extensions || []), newExtension.trim()],
    }));
    setNewExtension('');
  }, [newExtension, updateOptions]);

  const removeExtension = useCallback(
    (index: number) => {
      updateOptions((prev) => ({
        ...prev,
        extensions: (prev.extensions || []).filter((_, i) => i !== index),
      }));
    },
    [updateOptions]
  );

  const addHook = useCallback(() => {
    if (!newHook.trim()) return;
    updateOptions((prev) => ({
      ...prev,
      hooks: [...(prev.hooks || []), newHook.trim()],
    }));
    setNewHook('');
  }, [newHook, updateOptions]);

  const removeHook = useCallback(
    (index: number) => {
      updateOptions((prev) => ({
        ...prev,
        hooks: (prev.hooks || []).filter((_, i) => i !== index),
      }));
    },
    [updateOptions]
  );

  const addTool = useCallback(() => {
    if (!newTool.trim()) return;
    updateOptions((prev) => ({
      ...prev,
      tools: [...(prev.tools || []), newTool.trim()],
    }));
    setNewTool('');
  }, [newTool, updateOptions]);

  const removeTool = useCallback(
    (index: number) => {
      updateOptions((prev) => ({
        ...prev,
        tools: (prev.tools || []).filter((_, i) => i !== index),
      }));
    },
    [updateOptions]
  );

  const addSkill = useCallback(() => {
    if (!newSkill.trim()) return;
    updateOptions((prev) => ({
      ...prev,
      skills: [...(prev.skills || []), newSkill.trim()],
    }));
    setNewSkill('');
  }, [newSkill, updateOptions]);

  const removeSkill = useCallback(
    (index: number) => {
      updateOptions((prev) => ({
        ...prev,
        skills: (prev.skills || []).filter((_, i) => i !== index),
      }));
    },
    [updateOptions]
  );

  const addModel = useCallback(() => {
    if (!newModel.trim()) return;
    updateOptions((prev) => ({
      ...prev,
      models: [...(prev.models || []), newModel.trim()],
    }));
    setNewModel('');
  }, [newModel, updateOptions]);

  const removeModel = useCallback(
    (index: number) => {
      updateOptions((prev) => ({
        ...prev,
        models: (prev.models || []).filter((_, i) => i !== index),
      }));
    },
    [updateOptions]
  );

  return (
    <div className="space-y-4">
      {/* Header & Restart Banner */}
      <div className="flex items-center justify-between">
        <label className="text-xs font-semibold text-slate-900 dark:text-zinc-100 flex items-center gap-1.5">
          <Sliders className="w-3.5 h-3.5 text-codex-accent" />
          {t('settings.launchOptions.title')}
        </label>
        <button
          type="button"
          onClick={handleReset}
          className="text-[11px] text-slate-500 hover:text-rose-500 dark:text-zinc-400 dark:hover:text-rose-400 transition-colors cursor-pointer"
        >
          {t('settings.launchOptions.resetBtn')}
        </button>
      </div>

      <p className="text-[11px] text-slate-500 dark:text-zinc-400 leading-relaxed -mt-2">
        {t('settings.launchOptions.desc')}
      </p>

      {/* Restart Notice Banner when dirty or running */}
      {isDirty && (
        <div className="p-3 bg-amber-500/10 border border-amber-500/30 rounded-xl flex items-center justify-between gap-3">
          <div className="flex items-center gap-2 text-xs text-amber-700 dark:text-amber-300">
            <AlertTriangle className="w-4 h-4 shrink-0 text-amber-500" />
            <span>{t('settings.launchOptions.restartBanner')}</span>
          </div>
          {onRestartEngine && (
            <button
              type="button"
              onClick={handleRestart}
              disabled={isRestarting}
              className="px-3 py-1.5 bg-amber-600 hover:bg-amber-700 text-white rounded-lg text-xs font-medium transition-colors flex items-center gap-1.5 shrink-0 cursor-pointer disabled:opacity-50"
            >
              <RotateCw className={`w-3.5 h-3.5 ${isRestarting ? 'animate-spin' : ''}`} />
              <span>
                {isRestarting
                  ? t('settings.launchOptions.restarting')
                  : t('settings.launchOptions.restartBtn')}
              </span>
            </button>
          )}
        </div>
      )}

      {/* SECTION 1: Directories & Config Overlays */}
      <div className="p-3.5 bg-surface rounded-xl border border-border space-y-4">
        {/* Additional Directories (--add-dir) */}
        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <label className="text-xs font-medium text-slate-800 dark:text-zinc-200 flex items-center gap-1.5">
              <FolderPlus className="w-3.5 h-3.5 text-blue-500" />
              {t('settings.launchOptions.addDirs.title')}
            </label>
            <span className="text-[10px] font-mono text-slate-400 dark:text-zinc-500">
              {t('settings.launchOptions.itemsCount', { count: (currentOptions.addDirs || []).length })}
            </span>
          </div>
          <p className="text-[11px] text-slate-500 dark:text-zinc-400">
            {t('settings.launchOptions.addDirs.desc')}
          </p>

          {/* List chips */}
          {(currentOptions.addDirs || []).length > 0 && (
            <div className="flex flex-wrap gap-1.5 pt-1">
              {currentOptions.addDirs!.map((dir, idx) => (
                <div
                  key={`${dir}-${idx}`}
                  className="flex items-center gap-1.5 px-2.5 py-1 bg-surface-highlight border border-border rounded-lg text-xs font-mono text-slate-800 dark:text-zinc-200 max-w-full"
                >
                  <span className="truncate max-w-[360px]">{dir}</span>
                  <button
                    type="button"
                    onClick={() => removeAddDir(idx)}
                    className="text-slate-400 hover:text-rose-500 transition-colors p-0.5 cursor-pointer shrink-0"
                    title={t('settings.launchOptions.removeTitle')}
                  >
                    <Trash2 className="w-3 h-3" />
                  </button>
                </div>
              ))}
            </div>
          )}

          {/* Input & Browse */}
          <div className="flex gap-2 pt-1">
            <input
              type="text"
              value={newAddDir}
              onChange={(e) => setNewAddDir(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && addAddDir()}
              placeholder={t('settings.launchOptions.addDirs.placeholder')}
              className="flex-1 px-3 py-1.5 bg-surface-highlight border border-border rounded-lg text-xs font-mono text-slate-900 dark:text-zinc-100 placeholder-slate-400 outline-none focus:border-codex-accent"
            />
            <button
              type="button"
              onClick={handleBrowseFolderForAddDir}
              className="px-2.5 py-1.5 bg-surface hover:bg-surface-highlight border border-border rounded-lg text-xs font-medium text-slate-700 dark:text-zinc-300 transition-colors flex items-center gap-1.5 cursor-pointer shrink-0"
            >
              <FolderSearch className="w-3.5 h-3.5" />
              <span>{t('settings.launchOptions.browseFolder')}</span>
            </button>
            <button
              type="button"
              onClick={addAddDir}
              disabled={!newAddDir.trim()}
              className="px-3 py-1.5 bg-codex-accent text-white rounded-lg text-xs font-medium hover:bg-codex-accent/90 transition-colors cursor-pointer disabled:opacity-50 shrink-0 flex items-center gap-1"
            >
              <Plus className="w-3.5 h-3.5" />
              <span>{t('settings.launchOptions.add')}</span>
            </button>
          </div>
        </div>

        {/* Config Overlays (--config) */}
        <div className="space-y-2 pt-3 border-t border-border">
          <div className="flex items-center justify-between">
            <label className="text-xs font-medium text-slate-800 dark:text-zinc-200 flex items-center gap-1.5">
              <FileCode className="w-3.5 h-3.5 text-purple-500" />
              {t('settings.launchOptions.configOverlays.title')}
            </label>
            <span className="text-[10px] font-mono text-slate-400 dark:text-zinc-500">
              {t('settings.launchOptions.itemsCount', { count: (currentOptions.configOverlays || []).length })}
            </span>
          </div>
          <p className="text-[11px] text-slate-500 dark:text-zinc-400">
            {t('settings.launchOptions.configOverlays.desc')}
          </p>

          {/* List chips */}
          {(currentOptions.configOverlays || []).length > 0 && (
            <div className="flex flex-wrap gap-1.5 pt-1">
              {currentOptions.configOverlays!.map((cfg, idx) => (
                <div
                  key={`${cfg}-${idx}`}
                  className="flex items-center gap-1.5 px-2.5 py-1 bg-surface-highlight border border-border rounded-lg text-xs font-mono text-slate-800 dark:text-zinc-200 max-w-full"
                >
                  <span className="truncate max-w-[360px]">{cfg}</span>
                  <button
                    type="button"
                    onClick={() => removeConfigOverlay(idx)}
                    className="text-slate-400 hover:text-rose-500 transition-colors p-0.5 cursor-pointer shrink-0"
                    title={t('settings.launchOptions.removeTitle')}
                  >
                    <Trash2 className="w-3 h-3" />
                  </button>
                </div>
              ))}
            </div>
          )}

          {/* Input & Browse */}
          <div className="flex gap-2 pt-1">
            <input
              type="text"
              value={newConfigOverlay}
              onChange={(e) => setNewConfigOverlay(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && addConfigOverlay()}
              placeholder={t('settings.launchOptions.configOverlays.placeholder')}
              className="flex-1 px-3 py-1.5 bg-surface-highlight border border-border rounded-lg text-xs font-mono text-slate-900 dark:text-zinc-100 placeholder-slate-400 outline-none focus:border-codex-accent"
            />
            <button
              type="button"
              onClick={handleBrowseFileForConfig}
              className="px-2.5 py-1.5 bg-surface hover:bg-surface-highlight border border-border rounded-lg text-xs font-medium text-slate-700 dark:text-zinc-300 transition-colors flex items-center gap-1.5 cursor-pointer shrink-0"
            >
              <FolderSearch className="w-3.5 h-3.5" />
              <span>{t('settings.launchOptions.browseFile')}</span>
            </button>
            <button
              type="button"
              onClick={addConfigOverlay}
              disabled={!newConfigOverlay.trim()}
              className="px-3 py-1.5 bg-codex-accent text-white rounded-lg text-xs font-medium hover:bg-codex-accent/90 transition-colors cursor-pointer disabled:opacity-50 shrink-0 flex items-center gap-1"
            >
              <Plus className="w-3.5 h-3.5" />
              <span>{t('settings.launchOptions.add')}</span>
            </button>
          </div>
        </div>
      </div>

      {/* SECTION 2: Tools, Skills & Rules */}
      <div className="p-3.5 bg-surface rounded-xl border border-border space-y-3.5">
        <div className="text-xs font-semibold text-slate-900 dark:text-zinc-100 flex items-center gap-1.5">
          <Terminal className="w-3.5 h-3.5 text-codex-accent" />
          <span>{t('settings.launchOptions.toolsAndSkillsTitle')}</span>
        </div>

        {/* Toggle Grid */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
          {/* noTools Toggle */}
          <label className="flex items-center justify-between p-2.5 bg-surface-highlight border border-border rounded-lg cursor-pointer hover:border-border-hover transition-colors">
            <span className="text-xs text-slate-800 dark:text-zinc-200">
              {t('settings.launchOptions.noTools')}
            </span>
            <input
              type="checkbox"
              checked={!!currentOptions.noTools}
              onChange={(e) =>
                updateOptions((prev) => ({ ...prev, noTools: e.target.checked || undefined }))
              }
              className="rounded border-border text-codex-accent focus:ring-codex-accent cursor-pointer"
            />
          </label>

          {/* noSkills Toggle */}
          <label className="flex items-center justify-between p-2.5 bg-surface-highlight border border-border rounded-lg cursor-pointer hover:border-border-hover transition-colors">
            <span className="text-xs text-slate-800 dark:text-zinc-200">
              {t('settings.launchOptions.noSkills')}
            </span>
            <input
              type="checkbox"
              checked={!!currentOptions.noSkills}
              onChange={(e) =>
                updateOptions((prev) => ({ ...prev, noSkills: e.target.checked || undefined }))
              }
              className="rounded border-border text-codex-accent focus:ring-codex-accent cursor-pointer"
            />
          </label>

          {/* noRules Toggle */}
          <label className="flex items-center justify-between p-2.5 bg-surface-highlight border border-border rounded-lg cursor-pointer hover:border-border-hover transition-colors">
            <span className="text-xs text-slate-800 dark:text-zinc-200">
              {t('settings.launchOptions.noRules')}
            </span>
            <input
              type="checkbox"
              checked={!!currentOptions.noRules}
              onChange={(e) =>
                updateOptions((prev) => ({ ...prev, noRules: e.target.checked || undefined }))
              }
              className="rounded border-border text-codex-accent focus:ring-codex-accent cursor-pointer"
            />
          </label>

          {/* noLsp Toggle */}
          <label className="flex items-center justify-between p-2.5 bg-surface-highlight border border-border rounded-lg cursor-pointer hover:border-border-hover transition-colors">
            <span className="text-xs text-slate-800 dark:text-zinc-200">
              {t('settings.launchOptions.noLsp')}
            </span>
            <input
              type="checkbox"
              checked={!!currentOptions.noLsp}
              onChange={(e) =>
                updateOptions((prev) => ({ ...prev, noLsp: e.target.checked || undefined }))
              }
              className="rounded border-border text-codex-accent focus:ring-codex-accent cursor-pointer"
            />
          </label>

          {/* noPty Toggle */}
          <label className="flex items-center justify-between p-2.5 bg-surface-highlight border border-border rounded-lg cursor-pointer hover:border-border-hover transition-colors">
            <span className="text-xs text-slate-800 dark:text-zinc-200">
              {t('settings.launchOptions.noPty')}
            </span>
            <input
              type="checkbox"
              checked={!!currentOptions.noPty}
              onChange={(e) =>
                updateOptions((prev) => ({ ...prev, noPty: e.target.checked || undefined }))
              }
              className="rounded border-border text-codex-accent focus:ring-codex-accent cursor-pointer"
            />
          </label>

          {/* advisor Toggle */}
          <label className="flex items-center justify-between p-2.5 bg-surface-highlight border border-border rounded-lg cursor-pointer hover:border-border-hover transition-colors">
            <span className="text-xs text-slate-800 dark:text-zinc-200">
              {t('settings.launchOptions.advisor')}
            </span>
            <input
              type="checkbox"
              checked={!!currentOptions.advisor}
              onChange={(e) =>
                updateOptions((prev) => ({ ...prev, advisor: e.target.checked || undefined }))
              }
              className="rounded border-border text-codex-accent focus:ring-codex-accent cursor-pointer"
            />
          </label>
        </div>

        {/* Specific Tools Filter (--tools) when noTools is false */}
        {!currentOptions.noTools && (
          <div className="space-y-1.5 pt-2 border-t border-border">
            <label className="text-[11px] font-medium text-slate-700 dark:text-zinc-300">
              {t('settings.launchOptions.tools.title')}
            </label>
            {(currentOptions.tools || []).length > 0 && (
              <div className="flex flex-wrap gap-1.5 pb-1">
                {currentOptions.tools!.map((tool, idx) => (
                  <div
                    key={`${tool}-${idx}`}
                    className="flex items-center gap-1 px-2 py-0.5 bg-surface-highlight border border-border rounded-md text-[11px] font-mono text-slate-800 dark:text-zinc-200"
                  >
                    <span>{tool}</span>
                    <button
                      type="button"
                      onClick={() => removeTool(idx)}
                      className="text-slate-400 hover:text-rose-500 cursor-pointer"
                    >
                      <Trash2 className="w-2.5 h-2.5" />
                    </button>
                  </div>
                ))}
              </div>
            )}
            <div className="flex gap-2">
              <input
                type="text"
                value={newTool}
                onChange={(e) => setNewTool(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && addTool()}
                placeholder={t('settings.launchOptions.tools.placeholder')}
                className="flex-1 px-3 py-1.5 bg-surface-highlight border border-border rounded-lg text-xs font-mono text-slate-900 dark:text-zinc-100 placeholder-slate-400 outline-none focus:border-codex-accent"
              />
              <button
                type="button"
                onClick={addTool}
                disabled={!newTool.trim()}
                className="px-3 py-1.5 bg-surface hover:bg-surface-highlight border border-border rounded-lg text-xs font-medium text-slate-700 dark:text-zinc-300 transition-colors cursor-pointer disabled:opacity-50"
              >
                <Plus className="w-3.5 h-3.5" />
              </button>
            </div>
          </div>
        )}

        {/* Specific Skills Filter (--skills) when noSkills is false */}
        {!currentOptions.noSkills && (
          <div className="space-y-1.5 pt-2 border-t border-border">
            <label className="text-[11px] font-medium text-slate-700 dark:text-zinc-300">
              {t('settings.launchOptions.skills.title')}
            </label>
            {(currentOptions.skills || []).length > 0 && (
              <div className="flex flex-wrap gap-1.5 pb-1">
                {currentOptions.skills!.map((skill, idx) => (
                  <div
                    key={`${skill}-${idx}`}
                    className="flex items-center gap-1 px-2 py-0.5 bg-surface-highlight border border-border rounded-md text-[11px] font-mono text-slate-800 dark:text-zinc-200"
                  >
                    <span>{skill}</span>
                    <button
                      type="button"
                      onClick={() => removeSkill(idx)}
                      className="text-slate-400 hover:text-rose-500 cursor-pointer"
                    >
                      <Trash2 className="w-2.5 h-2.5" />
                    </button>
                  </div>
                ))}
              </div>
            )}
            <div className="flex gap-2">
              <input
                type="text"
                value={newSkill}
                onChange={(e) => setNewSkill(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && addSkill()}
                placeholder={t('settings.launchOptions.skills.placeholder')}
                className="flex-1 px-3 py-1.5 bg-surface-highlight border border-border rounded-lg text-xs font-mono text-slate-900 dark:text-zinc-100 placeholder-slate-400 outline-none focus:border-codex-accent"
              />
              <button
                type="button"
                onClick={addSkill}
                disabled={!newSkill.trim()}
                className="px-3 py-1.5 bg-surface hover:bg-surface-highlight border border-border rounded-lg text-xs font-medium text-slate-700 dark:text-zinc-300 transition-colors cursor-pointer disabled:opacity-50"
              >
                <Plus className="w-3.5 h-3.5" />
              </button>
            </div>
          </div>
        )}
      </div>

      {/* SECTION 3: Extensions & Hooks */}
      <div className="p-3.5 bg-surface rounded-xl border border-border space-y-3.5">
        <div className="flex items-center justify-between">
          <div className="text-xs font-semibold text-slate-900 dark:text-zinc-100 flex items-center gap-1.5">
            <Sparkles className="w-3.5 h-3.5 text-codex-accent" />
            <span>Extensions & Hooks (-e / --hook)</span>
          </div>
          {/* noExtensions Toggle */}
          <label className="flex items-center gap-2 cursor-pointer">
            <span className="text-[11px] text-slate-600 dark:text-zinc-400">
              {t('settings.launchOptions.noExtensions')}
            </span>
            <input
              type="checkbox"
              checked={!!currentOptions.noExtensions}
              onChange={(e) =>
                updateOptions((prev) => ({
                  ...prev,
                  noExtensions: e.target.checked || undefined,
                }))
              }
              className="rounded border-border text-codex-accent focus:ring-codex-accent cursor-pointer"
            />
          </label>
        </div>

        {!currentOptions.noExtensions && (
          <div className="space-y-3">
            {/* Extensions (-e) */}
            <div className="space-y-1.5">
              <label className="text-[11px] font-medium text-slate-700 dark:text-zinc-300">
                {t('settings.launchOptions.extensions.title')}
              </label>
              {(currentOptions.extensions || []).length > 0 && (
                <div className="flex flex-wrap gap-1.5 pb-1">
                  {currentOptions.extensions!.map((ext, idx) => (
                    <div
                      key={`${ext}-${idx}`}
                      className="flex items-center gap-1.5 px-2.5 py-1 bg-surface-highlight border border-border rounded-lg text-xs font-mono text-slate-800 dark:text-zinc-200 max-w-full"
                    >
                      <span className="truncate max-w-[320px]">{ext}</span>
                      <button
                        type="button"
                        onClick={() => removeExtension(idx)}
                        className="text-slate-400 hover:text-rose-500 cursor-pointer"
                      >
                        <Trash2 className="w-3 h-3" />
                      </button>
                    </div>
                  ))}
                </div>
              )}
              <div className="flex gap-2">
                <input
                  type="text"
                  value={newExtension}
                  onChange={(e) => setNewExtension(e.target.value)}
                  onKeyDown={(e) => e.key === 'Enter' && addExtension()}
                  placeholder={t('settings.launchOptions.addExtensionPlaceholder')}
                  className="flex-1 px-3 py-1.5 bg-surface-highlight border border-border rounded-lg text-xs font-mono text-slate-900 dark:text-zinc-100 placeholder-slate-400 outline-none focus:border-codex-accent"
                />
                <button
                  type="button"
                  onClick={handleBrowseFileForExtension}
                  className="px-2.5 py-1.5 bg-surface hover:bg-surface-highlight border border-border rounded-lg text-xs font-medium text-slate-700 dark:text-zinc-300 transition-colors flex items-center gap-1.5 cursor-pointer shrink-0"
                >
                  <FolderSearch className="w-3.5 h-3.5" />
                  <span>{t('settings.launchOptions.browseFile')}</span>
                </button>
                <button
                  type="button"
                  onClick={addExtension}
                  disabled={!newExtension.trim()}
                  className="px-3 py-1.5 bg-codex-accent text-white rounded-lg text-xs font-medium hover:bg-codex-accent/90 transition-colors cursor-pointer disabled:opacity-50 shrink-0"
                >
                  <Plus className="w-3.5 h-3.5" />
                </button>
              </div>
            </div>

            {/* Hooks (--hook) */}
            <div className="space-y-1.5 pt-2 border-t border-border">
              <label className="text-[11px] font-medium text-slate-700 dark:text-zinc-300">
                {t('settings.launchOptions.hooks.title')}
              </label>
              {(currentOptions.hooks || []).length > 0 && (
                <div className="flex flex-wrap gap-1.5 pb-1">
                  {currentOptions.hooks!.map((hook, idx) => (
                    <div
                      key={`${hook}-${idx}`}
                      className="flex items-center gap-1.5 px-2.5 py-1 bg-surface-highlight border border-border rounded-lg text-xs font-mono text-slate-800 dark:text-zinc-200 max-w-full"
                    >
                      <span className="truncate max-w-[320px]">{hook}</span>
                      <button
                        type="button"
                        onClick={() => removeHook(idx)}
                        className="text-slate-400 hover:text-rose-500 cursor-pointer"
                      >
                        <Trash2 className="w-3 h-3" />
                      </button>
                    </div>
                  ))}
                </div>
              )}
              <div className="flex gap-2">
                <input
                  type="text"
                  value={newHook}
                  onChange={(e) => setNewHook(e.target.value)}
                  onKeyDown={(e) => e.key === 'Enter' && addHook()}
                  placeholder={t('settings.launchOptions.addHookPlaceholder')}
                  className="flex-1 px-3 py-1.5 bg-surface-highlight border border-border rounded-lg text-xs font-mono text-slate-900 dark:text-zinc-100 placeholder-slate-400 outline-none focus:border-codex-accent"
                />
                <button
                  type="button"
                  onClick={handleBrowseFileForHook}
                  className="px-2.5 py-1.5 bg-surface hover:bg-surface-highlight border border-border rounded-lg text-xs font-medium text-slate-700 dark:text-zinc-300 transition-colors flex items-center gap-1.5 cursor-pointer shrink-0"
                >
                  <FolderSearch className="w-3.5 h-3.5" />
                  <span>{t('settings.launchOptions.browseFile')}</span>
                </button>
                <button
                  type="button"
                  onClick={addHook}
                  disabled={!newHook.trim()}
                  className="px-3 py-1.5 bg-codex-accent text-white rounded-lg text-xs font-medium hover:bg-codex-accent/90 transition-colors cursor-pointer disabled:opacity-50 shrink-0"
                >
                  <Plus className="w-3.5 h-3.5" />
                </button>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* SECTION 4: Execution & Behavior */}
      <div className="p-3.5 bg-surface rounded-xl border border-border space-y-3.5">
        <div className="text-xs font-semibold text-slate-900 dark:text-zinc-100 flex items-center gap-1.5">
          <Clock className="w-3.5 h-3.5 text-codex-accent" />
          <span>{t('settings.launchOptions.runtimeBehaviorTitle')}</span>
        </div>

        {/* Toggles */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
          <label className="flex items-center justify-between p-2.5 bg-surface-highlight border border-border rounded-lg cursor-pointer hover:border-border-hover transition-colors">
            <span className="text-xs text-slate-800 dark:text-zinc-200">
              {t('settings.launchOptions.hideThinking')}
            </span>
            <input
              type="checkbox"
              checked={!!currentOptions.hideThinking}
              onChange={(e) =>
                updateOptions((prev) => ({
                  ...prev,
                  hideThinking: e.target.checked || undefined,
                }))
              }
              className="rounded border-border text-codex-accent focus:ring-codex-accent cursor-pointer"
            />
          </label>

          <label className="flex items-center justify-between p-2.5 bg-surface-highlight border border-border rounded-lg cursor-pointer hover:border-border-hover transition-colors">
            <span className="text-xs text-slate-800 dark:text-zinc-200">
              {t('settings.launchOptions.noTitle')}
            </span>
            <input
              type="checkbox"
              checked={!!currentOptions.noTitle}
              onChange={(e) =>
                updateOptions((prev) => ({ ...prev, noTitle: e.target.checked || undefined }))
              }
              className="rounded border-border text-codex-accent focus:ring-codex-accent cursor-pointer"
            />
          </label>

          <label className="flex items-center justify-between p-2.5 bg-surface-highlight border border-border rounded-lg cursor-pointer hover:border-border-hover transition-colors">
            <span className="text-xs text-slate-800 dark:text-zinc-200">
              {t('settings.launchOptions.prewalk')}
            </span>
            <input
              type="checkbox"
              checked={!!currentOptions.prewalk}
              onChange={(e) =>
                updateOptions((prev) => ({ ...prev, prewalk: e.target.checked || undefined }))
              }
              className="rounded border-border text-codex-accent focus:ring-codex-accent cursor-pointer"
            />
          </label>

          <label className="flex items-center justify-between p-2.5 bg-surface-highlight border border-border rounded-lg cursor-pointer hover:border-border-hover transition-colors">
            <span className="text-xs text-slate-800 dark:text-zinc-200">
              {t('settings.launchOptions.planYolo')}
            </span>
            <input
              type="checkbox"
              checked={!!currentOptions.planYolo}
              onChange={(e) =>
                updateOptions((prev) => ({ ...prev, planYolo: e.target.checked || undefined }))
              }
              className="rounded border-border text-codex-accent focus:ring-codex-accent cursor-pointer"
            />
          </label>
        </div>

        {/* Text / Select fields */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-2">
          {/* prewalkInto */}
          <div className="space-y-1">
            <label className="text-[11px] font-medium text-slate-700 dark:text-zinc-300">
              {t('settings.launchOptions.prewalkInto')}
            </label>
            <input
              type="text"
              value={currentOptions.prewalkInto || ''}
              onChange={(e) =>
                updateOptions((prev) => ({
                  ...prev,
                  prewalkInto: e.target.value.trim() || undefined,
                }))
              }
              placeholder={t('settings.launchOptions.prewalkIntoPlaceholder')}
              className="w-full px-3 py-1.5 bg-surface-highlight border border-border rounded-lg text-xs font-mono text-slate-900 dark:text-zinc-100 placeholder-slate-400 outline-none focus:border-codex-accent"
            />
          </div>

          {/* planYoloInto */}
          <div className="space-y-1">
            <label className="text-[11px] font-medium text-slate-700 dark:text-zinc-300">
              {t('settings.launchOptions.planYoloInto')}
            </label>
            <input
              type="text"
              value={currentOptions.planYoloInto || ''}
              onChange={(e) =>
                updateOptions((prev) => ({
                  ...prev,
                  planYoloInto: e.target.value.trim() || undefined,
                }))
              }
              placeholder={t('settings.launchOptions.planYoloIntoPlaceholder')}
              className="w-full px-3 py-1.5 bg-surface-highlight border border-border rounded-lg text-xs font-mono text-slate-900 dark:text-zinc-100 placeholder-slate-400 outline-none focus:border-codex-accent"
            />
          </div>

          {/* maxTime */}
          <div className="space-y-1">
            <label className="text-[11px] font-medium text-slate-700 dark:text-zinc-300">
              {t('settings.launchOptions.maxTime')}
            </label>
            <input
              type="text"
              value={currentOptions.maxTime || ''}
              onChange={(e) =>
                updateOptions((prev) => ({
                  ...prev,
                  maxTime: e.target.value.trim() || undefined,
                }))
              }
              placeholder={t('settings.launchOptions.maxTime.placeholder')}
              className="w-full px-3 py-1.5 bg-surface-highlight border border-border rounded-lg text-xs font-mono text-slate-900 dark:text-zinc-100 placeholder-slate-400 outline-none focus:border-codex-accent"
            />
          </div>

          {/* serviceTier */}
          <div className="space-y-1">
            <label className="text-[11px] font-medium text-slate-700 dark:text-zinc-300">
              {t('settings.launchOptions.serviceTier')}
            </label>
            <select
              value={currentOptions.serviceTier || ''}
              onChange={(e) =>
                updateOptions((prev) => ({
                  ...prev,
                  serviceTier: e.target.value || undefined,
                }))
              }
              className="w-full px-3 py-1.5 bg-surface-highlight border border-border rounded-lg text-xs text-slate-900 dark:text-zinc-100 outline-none focus:border-codex-accent cursor-pointer"
            >
              {SERVICE_TIER_OPTIONS.map((opt) => (
                <option key={opt.id} value={opt.id}>
                  {opt.id === '' ? t('settings.launchOptions.defaultTier') : opt.label}
                </option>
              ))}
            </select>
          </div>
        </div>

        {/* Extra Models (--models) */}
        <div className="space-y-1.5 pt-2 border-t border-border">
          <label className="text-[11px] font-medium text-slate-700 dark:text-zinc-300">
            {t('settings.launchOptions.models')}
          </label>
          {(currentOptions.models || []).length > 0 && (
            <div className="flex flex-wrap gap-1.5 pb-1">
              {currentOptions.models!.map((model, idx) => (
                <div
                  key={`${model}-${idx}`}
                  className="flex items-center gap-1 px-2 py-0.5 bg-surface-highlight border border-border rounded-md text-[11px] font-mono text-slate-800 dark:text-zinc-200"
                >
                  <span>{model}</span>
                  <button
                    type="button"
                    onClick={() => removeModel(idx)}
                    className="text-slate-400 hover:text-rose-500 cursor-pointer"
                  >
                    <Trash2 className="w-2.5 h-2.5" />
                  </button>
                </div>
              ))}
            </div>
          )}
          <div className="flex gap-2">
            <input
              type="text"
              value={newModel}
              onChange={(e) => setNewModel(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && addModel()}
              placeholder={t('settings.launchOptions.models.placeholder')}
              className="flex-1 px-3 py-1.5 bg-surface-highlight border border-border rounded-lg text-xs font-mono text-slate-900 dark:text-zinc-100 placeholder-slate-400 outline-none focus:border-codex-accent"
            />
            <button
              type="button"
              onClick={addModel}
              disabled={!newModel.trim()}
              className="px-3 py-1.5 bg-surface hover:bg-surface-highlight border border-border rounded-lg text-xs font-medium text-slate-700 dark:text-zinc-300 transition-colors cursor-pointer disabled:opacity-50"
            >
              <Plus className="w-3.5 h-3.5" />
            </button>
          </div>
        </div>
      </div>

      {/* SECTION 5: System Prompts */}
      <div className="p-3.5 bg-surface rounded-xl border border-border space-y-3.5">
        <div className="text-xs font-semibold text-slate-900 dark:text-zinc-100 flex items-center gap-1.5">
          <FileText className="w-3.5 h-3.5 text-codex-accent" />
          <span>System Prompts (--system-prompt / --append-system-prompt)</span>
        </div>

        {/* Primary System Prompt */}
        <div className="space-y-1.5">
          <label className="text-[11px] font-medium text-slate-700 dark:text-zinc-300">
            {t('settings.launchOptions.systemPrompt')}
          </label>
          <textarea
            rows={2}
            value={currentOptions.systemPrompt || ''}
            onChange={(e) =>
              updateOptions((prev) => ({
                ...prev,
                systemPrompt: e.target.value || undefined,
              }))
            }
            placeholder={t('settings.launchOptions.systemPrompt.placeholder')}
            className="w-full px-3 py-2 bg-surface-highlight border border-border rounded-lg text-xs font-mono text-slate-900 dark:text-zinc-100 placeholder-slate-400 outline-none focus:border-codex-accent resize-y"
          />
        </div>

        {/* Append System Prompt */}
        <div className="space-y-1.5 pt-2 border-t border-border">
          <label className="text-[11px] font-medium text-slate-700 dark:text-zinc-300">
            {t('settings.launchOptions.appendSystemPrompt')}
          </label>
          <textarea
            rows={2}
            value={currentOptions.appendSystemPrompt || ''}
            onChange={(e) =>
              updateOptions((prev) => ({
                ...prev,
                appendSystemPrompt: e.target.value || undefined,
              }))
            }
            placeholder={t('settings.launchOptions.appendSystemPrompt.placeholder')}
            className="w-full px-3 py-2 bg-surface-highlight border border-border rounded-lg text-xs font-mono text-slate-900 dark:text-zinc-100 placeholder-slate-400 outline-none focus:border-codex-accent resize-y"
          />
        </div>
      </div>
    </div>
  );
};
