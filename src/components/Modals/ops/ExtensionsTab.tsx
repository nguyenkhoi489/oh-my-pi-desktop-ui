import React, { useState, useEffect, useCallback, useMemo } from 'react';
import {
  Puzzle,
  RefreshCw,
  Package,
  Link,
  Plus,
  Trash2,
  Wrench,
  CheckCircle2,
  AlertTriangle,
  XCircle,
  ToggleLeft,
  ToggleRight,
  Sliders,
  Download,
  Search,
  ArrowUpCircle,
  Store,
  Eye,
  X,
  ShieldAlert,
} from 'lucide-react';
import type {
  OmpPluginInfo,
  OmpPluginDoctorItem,
  OmpPluginFeatureItem,
  OmpMarketplaceItem,
  OmpDiscoverPluginItem,
} from '../../../types/index.ts';
import { useI18n } from '../../../i18n/I18nProvider.tsx';

export interface ExtensionsTabProps {
  onRestartEngine?: () => void;
  setNeedRestart?: (need: boolean) => void;
}
export const ExtensionsTab: React.FC<ExtensionsTabProps> = React.memo(({ setNeedRestart }) => {
  const { t } = useI18n();
  // Local mode state (--local)
  const [localOnly, setLocalOnly] = useState<boolean>(false);

  // Installed plugins list
  const [plugins, setPlugins] = useState<OmpPluginInfo[]>([]);
  const [isLoadingPlugins, setIsLoadingPlugins] = useState<boolean>(false);
  const [pluginError, setPluginError] = useState<string | null>(null);

  // Install plugin
  const [installTarget, setInstallTarget] = useState<string>('');
  const [installScope, setInstallScope] = useState<'user' | 'project'>('user');
  const [installForce, setInstallForce] = useState<boolean>(false);
  const [installDryRun, setInstallDryRun] = useState<boolean>(false);
  const [isInstallingPlugin, setIsInstallingPlugin] = useState<boolean>(false);

  // Link local plugin
  const [linkPath, setLinkPath] = useState<string>('');
  const [isLinkingPlugin, setIsLinkingPlugin] = useState<boolean>(false);

  // Doctor panel
  const [doctorItems, setDoctorItems] = useState<OmpPluginDoctorItem[]>([]);
  const [isRunningDoctor, setIsRunningDoctor] = useState<boolean>(false);
  const [isFixingDoctor, setIsFixingDoctor] = useState<boolean>(false);
  const [doctorRan, setDoctorRan] = useState<boolean>(false);

  // Marketplace & Discover
  const [marketplaces, setMarketplaces] = useState<OmpMarketplaceItem[]>([]);
  const [isLoadingMarketplaces, setIsLoadingMarketplaces] = useState<boolean>(false);
  const [marketplaceSource, setMarketplaceSource] = useState<string>('');
  const [isAddingMarketplace, setIsAddingMarketplace] = useState<boolean>(false);

  const [discoverPlugins, setDiscoverPlugins] = useState<OmpDiscoverPluginItem[]>([]);
  const [isLoadingDiscover, setIsLoadingDiscover] = useState<boolean>(false);
  const [discoverFilter, setDiscoverFilter] = useState<string>('');

  // Features modal / panel
  const [activeFeaturesPlugin, setActiveFeaturesPlugin] = useState<string | null>(null);
  const [pluginFeatures, setPluginFeatures] = useState<OmpPluginFeatureItem[]>([]);
  const [isLoadingFeatures, setIsLoadingFeatures] = useState<boolean>(false);

  // Config modal
  const [activeConfigPlugin, setActiveConfigPlugin] = useState<string | null>(null);
  const [configKey, setConfigKey] = useState<string>('');
  const [configValue, setConfigValue] = useState<string>('');
  const [isSavingConfig, setIsSavingConfig] = useState<boolean>(false);

  // Dry-run preview modal
  const [previewModal, setPreviewModal] = useState<{ title: string; content: string } | null>(null);

  // Upgrading plugin name
  const [upgradingPlugin, setUpgradingPlugin] = useState<string | null>(null);

  // 1. Fetch plugins list
  const fetchPlugins = useCallback(async () => {
    if (!window.electronAPI?.listPlugins) return;
    setIsLoadingPlugins(true);
    setPluginError(null);
    try {
      const res = await window.electronAPI.listPlugins({ local: localOnly });
      if (res.success && res.plugins) {
        setPlugins(res.plugins);
      } else {
        setPluginError(res.error || t('ops.extensions.error.fetchPlugins'));
      }
    } catch (err: unknown) {
      setPluginError(err instanceof Error ? err.message : String(err));
    } finally {
      setIsLoadingPlugins(false);
    }
  }, [localOnly]);

  // 2. Fetch Doctor
  const handleRunDoctor = useCallback(async (fix = false) => {
    if (!window.electronAPI?.pluginDoctor) return;
    if (fix) {
      setIsFixingDoctor(true);
    } else {
      setIsRunningDoctor(true);
    }
    setPluginError(null);
    try {
      const res = await window.electronAPI.pluginDoctor({ fix, local: localOnly });
      if (res.success) {
        setDoctorItems(res.items || []);
        setDoctorRan(true);
        if (fix && setNeedRestart) {
          setNeedRestart(true);
        }
      } else {
        setPluginError(res.error || t('ops.extensions.error.doctor'));
      }
    } catch (err: unknown) {
      setPluginError(err instanceof Error ? err.message : String(err));
    } finally {
      setIsRunningDoctor(false);
      setIsFixingDoctor(false);
    }
  }, [localOnly, setNeedRestart]);

  // 3. Fetch Marketplaces & Discover
  const fetchMarketplaces = useCallback(async () => {
    if (!window.electronAPI?.pluginMarketplace) return;
    setIsLoadingMarketplaces(true);
    try {
      const res = await window.electronAPI.pluginMarketplace('list', undefined, { local: localOnly });
      if (res.success && res.marketplaces) {
        setMarketplaces(res.marketplaces);
      }
    } catch {
      // Ignored
    } finally {
      setIsLoadingMarketplaces(false);
    }
  }, [localOnly]);

  const fetchDiscover = useCallback(async () => {
    if (!window.electronAPI?.pluginDiscover) return;
    setIsLoadingDiscover(true);
    try {
      const res = await window.electronAPI.pluginDiscover({ local: localOnly });
      if (res.success && res.plugins) {
        setDiscoverPlugins(res.plugins);
      }
    } catch {
      // Ignored
    } finally {
      setIsLoadingDiscover(false);
    }
  }, [localOnly]);

  useEffect(() => {
    fetchPlugins();
    fetchMarketplaces();
    fetchDiscover();
  }, [fetchPlugins, fetchMarketplaces, fetchDiscover]);

  // Install plugin handler
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
        dryRun: installDryRun,
        local: localOnly,
      });
      if (res.success) {
        if (installDryRun) {
          setPreviewModal({
            title: `${t('ops.extensions.install.title')} (${t('ops.extensions.install.dryRun')})`,
            content: res.message || t('ops.extensions.noPreview'),
          });
        } else {
          setInstallTarget('');
          if (setNeedRestart) setNeedRestart(true);
          await fetchPlugins();
        }
      } else {
        setPluginError(res.error || t('ops.extensions.error.install'));
      }
    } catch (err: unknown) {
      setPluginError(err instanceof Error ? err.message : String(err));
    } finally {
      setIsInstallingPlugin(false);
    }
  };

  // Uninstall plugin handler
  const handleUninstallPlugin = async (pluginName: string, scope?: string, dryRun = false) => {
    if (!window.electronAPI?.uninstallPlugin) return;
    if (!dryRun && !confirm(t('ops.extensions.confirmUninstall', { name: pluginName }))) return;

    try {
      const res = await window.electronAPI.uninstallPlugin(pluginName, {
        scope: scope === 'project' ? 'project' : 'user',
        dryRun,
        local: localOnly,
      });
      if (res.success) {
        if (dryRun) {
          setPreviewModal({
            title: `${t('ops.extensions.actions.uninstall')} (${t('ops.extensions.actions.preview')})`,
            content: res.message || t('ops.extensions.uninstallDryRun', { name: pluginName }),
          });
        } else {
          if (setNeedRestart) setNeedRestart(true);
          await fetchPlugins();
        }
      } else {
        alert(t('ops.extensions.error.toggle', { error: res.error || '' }));
      }
    } catch (err: unknown) {
      alert(t('ops.extensions.error.toggle', { error: err instanceof Error ? err.message : String(err) }));
    }
  };

  // Link local plugin handler
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
        if (setNeedRestart) setNeedRestart(true);
        await fetchPlugins();
      } else {
        setPluginError(res.error || t('ops.extensions.error.link'));
      }
    } catch (err: unknown) {
      setPluginError(err instanceof Error ? err.message : String(err));
    } finally {
      setIsLinkingPlugin(false);
    }
  };

  // Handler toggle enable/disable plugin
  const handleTogglePlugin = async (pluginName: string, currentlyEnabled: boolean) => {
    if (!window.electronAPI?.pluginToggle) return;
    const nextState = !currentlyEnabled;
    try {
      const res = await window.electronAPI.pluginToggle(pluginName, nextState, { local: localOnly });
      if (res.success) {
        if (setNeedRestart) setNeedRestart(true);
        await fetchPlugins();
      } else {
        alert(t('ops.extensions.error.toggle', { error: res.error || '' }));
      }
    } catch (err: unknown) {
      alert(t('ops.extensions.error.toggle', { error: err instanceof Error ? err.message : String(err) }));
    }
  };

  // Handler upgrade plugin
  const handleUpgradePlugin = async (pluginName?: string, dryRun = false) => {
    if (!window.electronAPI?.pluginUpgrade) return;
    setUpgradingPlugin(pluginName || '__all__');
    try {
      const res = await window.electronAPI.pluginUpgrade({
        name: pluginName,
        dryRun,
        local: localOnly,
      });
      if (res.success) {
        if (dryRun) {
          setPreviewModal({
            title: `${t('ops.extensions.actions.upgrade')} (${t('ops.extensions.actions.preview')})`,
            content: res.message || res.rawOutput || t('ops.extensions.allUpToDate'),
          });
        } else {
          if (setNeedRestart) setNeedRestart(true);
          await fetchPlugins();
        }
      } else {
        alert(t('ops.extensions.error.upgrade', { error: res.error || '' }));
      }
    } catch (err: unknown) {
      alert(t('ops.extensions.error.toggle', { error: err instanceof Error ? err.message : String(err) }));
    } finally {
      setUpgradingPlugin(null);
    }
  };

  // Open features modal handler
  const handleOpenFeatures = async (pluginName: string) => {
    if (!window.electronAPI?.pluginFeatures) return;
    setActiveFeaturesPlugin(pluginName);
    setIsLoadingFeatures(true);
    try {
      const res = await window.electronAPI.pluginFeatures(pluginName, { local: localOnly });
      if (res.success && res.features) {
        setPluginFeatures(res.features);
      } else {
        setPluginFeatures([]);
      }
    } catch {
      setPluginFeatures([]);
    } finally {
      setIsLoadingFeatures(false);
    }
  };

  // Handler toggle feature
  const handleToggleFeature = async (featureName: string, currentlyEnabled: boolean) => {
    if (!activeFeaturesPlugin || !window.electronAPI?.pluginToggleFeature) return;
    const nextState = !currentlyEnabled;
    try {
      const res = await window.electronAPI.pluginToggleFeature(
        activeFeaturesPlugin,
        featureName,
        nextState,
        { local: localOnly }
      );
      if (res.success) {
        setPluginFeatures((prev) =>
          prev.map((f) => (f.name === featureName ? { ...f, enabled: nextState } : f))
        );
        if (setNeedRestart) setNeedRestart(true);
      } else {
        alert(t('ops.extensions.error.toggle', { error: res.error || '' }));
      }
    } catch (err: unknown) {
      alert(t('ops.extensions.error.toggle', { error: err instanceof Error ? err.message : String(err) }));
    }
  };

  // Save config key=value handler
  const handleSaveConfig = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    if (!activeConfigPlugin || !configKey.trim() || !window.electronAPI?.pluginSetConfig) return;

    setIsSavingConfig(true);
    try {
      const res = await window.electronAPI.pluginSetConfig(
        activeConfigPlugin,
        [{ key: configKey.trim(), value: configValue }],
        { local: localOnly }
      );
      if (res.success) {
        setConfigKey('');
        setConfigValue('');
        setActiveConfigPlugin(null);
        if (setNeedRestart) setNeedRestart(true);
        await fetchPlugins();
      } else {
        alert(t('ops.extensions.error.saveConfig', { error: res.error || '' }));
      }
    } catch (err: unknown) {
      alert(t('ops.extensions.error.toggle', { error: err instanceof Error ? err.message : String(err) }));
    } finally {
      setIsSavingConfig(false);
    }
  };

  // Add marketplace source handler
  const handleAddMarketplace = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    const source = marketplaceSource.trim();
    if (!source || !window.electronAPI?.pluginMarketplace || isAddingMarketplace) return;

    setIsAddingMarketplace(true);
    try {
      const res = await window.electronAPI.pluginMarketplace('add', source, { local: localOnly });
      if (res.success) {
        setMarketplaceSource('');
        await fetchMarketplaces();
        await fetchDiscover();
      } else {
        alert(t('ops.extensions.error.addMarketplace', { error: res.error || '' }));
      }
    } catch (err: unknown) {
      alert(t('ops.extensions.error.toggle', { error: err instanceof Error ? err.message : String(err) }));
    } finally {
      setIsAddingMarketplace(false);
    }
  };

  // Remove marketplace handler
  const handleRemoveMarketplace = async (sourceName: string) => {
    if (!window.electronAPI?.pluginMarketplace) return;
    if (!confirm(t('ops.extensions.confirmRemoveMarketplace', { name: sourceName }))) return;

    try {
      const res = await window.electronAPI.pluginMarketplace('remove', sourceName, { local: localOnly });
      if (res.success) {
        await fetchMarketplaces();
        await fetchDiscover();
      } else {
        alert(t('ops.extensions.error.toggle', { error: res.error || '' }));
      }
    } catch (err: unknown) {
      alert(t('ops.extensions.error.toggle', { error: err instanceof Error ? err.message : String(err) }));
    }
  };

  // Filter Discover plugins
  const filteredDiscover = useMemo(() => {
    const q = discoverFilter.trim().toLowerCase();
    if (!q) return discoverPlugins;
    return discoverPlugins.filter(
      (p) =>
        p.name.toLowerCase().includes(q) ||
        (p.description && p.description.toLowerCase().includes(q))
    );
  }, [discoverPlugins, discoverFilter]);

  return (
    <div className="space-y-6">
      {/* Header & Controls */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-2 border-b border-border">
        <div>
          <h3 className="text-sm font-semibold text-slate-900 dark:text-zinc-100 flex items-center gap-2">
            <Puzzle className="w-4 h-4 text-purple-500" />
            <span>{t('ops.extensions.title')}</span>
          </h3>
          <p className="text-[11px] text-slate-500 dark:text-zinc-400">
            {t('ops.extensions.desc')}
          </p>
        </div>

        <div className="flex items-center gap-2 flex-wrap">
          {/* Toggle Local */}
          <label className="flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-surface border border-border text-xs text-slate-700 dark:text-zinc-300 cursor-pointer select-none">
            <input
              type="checkbox"
              checked={localOnly}
              onChange={(e) => setLocalOnly(e.target.checked)}
              className="rounded border-border text-purple-600 focus:ring-purple-500"
            />
            <span className="text-[11px] font-mono">--local</span>
          </label>

          {/* Upgrade All button */}
          <button
            type="button"
            onClick={() => handleUpgradePlugin(undefined, false)}
            disabled={upgradingPlugin !== null}
            className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs font-medium bg-surface hover:bg-surface-highlight text-slate-700 dark:text-zinc-300 border border-border transition-colors cursor-pointer disabled:opacity-50"
          >
            <ArrowUpCircle className={`w-3.5 h-3.5 ${upgradingPlugin === '__all__' ? 'animate-spin' : ''}`} />
            <span>{t('ops.extensions.actions.upgradeAll')}</span>
          </button>

          {/* Refresh button */}
          <button
            type="button"
            onClick={() => {
              fetchPlugins();
              fetchMarketplaces();
              fetchDiscover();
            }}
            disabled={isLoadingPlugins}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium bg-surface hover:bg-surface-highlight text-slate-700 dark:text-zinc-300 border border-border transition-colors cursor-pointer disabled:opacity-50"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${isLoadingPlugins ? 'animate-spin' : ''}`} />
            <span>{t('ops.extensions.refresh')}</span>
          </button>
        </div>
      </div>

      {pluginError && (
        <div className="p-3 rounded-lg bg-rose-500/10 border border-rose-500/20 text-rose-600 dark:text-rose-400 text-xs flex items-center gap-2">
          <ShieldAlert className="w-4 h-4 shrink-0" />
          <span>{pluginError}</span>
        </div>
      )}

      {/* 1. DOCTOR PANEL */}
      <div className="p-4 rounded-xl border border-border bg-surface/30 space-y-3">
        <div className="flex items-center justify-between">
          <h4 className="text-xs font-semibold text-slate-800 dark:text-zinc-200 flex items-center gap-1.5">
            <Wrench className="w-3.5 h-3.5 text-amber-500" />
            <span>{t('ops.extensions.doctor.title')}</span>
          </h4>

          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => handleRunDoctor(false)}
              disabled={isRunningDoctor || isFixingDoctor}
              className="flex items-center gap-1 px-2.5 py-1 rounded-lg bg-surface hover:bg-surface-highlight border border-border text-xs text-slate-700 dark:text-zinc-300 transition-colors cursor-pointer disabled:opacity-50"
            >
              <RefreshCw className={`w-3 h-3 ${isRunningDoctor ? 'animate-spin' : ''}`} />
              <span>{isRunningDoctor ? t('ops.extensions.doctor.running') : t('ops.extensions.doctor.run')}</span>
            </button>
            <button
              type="button"
              onClick={() => handleRunDoctor(true)}
              disabled={isRunningDoctor || isFixingDoctor}
              className="flex items-center gap-1 px-2.5 py-1 rounded-lg bg-amber-600 hover:bg-amber-700 text-white text-xs font-medium shadow-sm transition-colors cursor-pointer disabled:opacity-50"
            >
              <Wrench className="w-3 h-3" />
              <span>{isFixingDoctor ? t('ops.extensions.doctor.fixing') : t('ops.extensions.doctor.fix')}</span>
            </button>
          </div>
        </div>

        {doctorRan && doctorItems.length > 0 && (
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-2 pt-1">
            {doctorItems.map((item, idx) => {
              const isOk = item.status === 'ok' || item.status === 'success';
              const isWarn = item.status === 'warning' || item.status === 'warn';
              return (
                <div
                  key={idx}
                  className="p-2.5 rounded-lg border border-border bg-surface/50 space-y-1 text-xs"
                >
                  <div className="flex items-center justify-between">
                    <span className="font-mono font-medium text-slate-800 dark:text-zinc-200 truncate">
                      {item.name}
                    </span>
                    {isOk && <CheckCircle2 className="w-3.5 h-3.5 text-emerald-500 shrink-0" />}
                    {isWarn && <AlertTriangle className="w-3.5 h-3.5 text-amber-500 shrink-0" />}
                    {!isOk && !isWarn && <XCircle className="w-3.5 h-3.5 text-rose-500 shrink-0" />}
                  </div>
                  <p className="text-[11px] text-slate-500 dark:text-zinc-400">
                    {item.message || item.status}
                  </p>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* 2. INSTALL & LINK FORMS */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {/* Install from registry */}
        <div className="p-4 rounded-xl border border-border bg-surface/30 space-y-3">
          <h4 className="text-xs font-semibold text-slate-800 dark:text-zinc-200 flex items-center gap-1.5">
            <Package className="w-3.5 h-3.5 text-blue-500" />
            <span>{t('ops.extensions.install.title')}</span>
          </h4>
          <form onSubmit={handleInstallPlugin} className="space-y-2.5">
            <div className="flex flex-col sm:flex-row gap-2">
              <input
                type="text"
                value={installTarget}
                onChange={(e) => setInstallTarget(e.target.value)}
                placeholder={t('ops.extensions.install.placeholder')}
                disabled={isInstallingPlugin}
                className="flex-1 px-3 py-1.5 rounded-lg bg-surface border border-border text-xs text-slate-900 dark:text-zinc-100 font-mono outline-none"
              />
              <select
                value={installScope}
                onChange={(e) => setInstallScope(e.target.value as 'user' | 'project')}
                className="px-2 py-1.5 rounded-lg bg-surface border border-border text-xs text-slate-700 dark:text-zinc-300 outline-none"
              >
                <option value="user">User (~/.omp)</option>
                <option value="project">Project (./.omp)</option>
              </select>
              <button
                type="submit"
                disabled={!installTarget.trim() || isInstallingPlugin}
                className="flex items-center justify-center gap-1 px-3.5 py-1.5 rounded-lg bg-blue-600 hover:bg-blue-700 text-white font-medium text-xs shadow-sm transition-colors cursor-pointer disabled:opacity-50 shrink-0"
              >
                <Plus className="w-3.5 h-3.5" />
                <span>{isInstallingPlugin ? '...' : t('ops.extensions.install.btn')}</span>
              </button>
            </div>

            <div className="flex items-center gap-4 flex-wrap">
              <label className="flex items-center gap-1.5 cursor-pointer select-none">
                <input
                  type="checkbox"
                  checked={installForce}
                  onChange={(e) => setInstallForce(e.target.checked)}
                  className="rounded border-border text-blue-600 focus:ring-blue-500"
                />
                <span className="text-[11px] text-slate-500 dark:text-zinc-400">
                  {t('ops.extensions.install.force')}
                </span>
              </label>
              <label className="flex items-center gap-1.5 cursor-pointer select-none">
                <input
                  type="checkbox"
                  checked={installDryRun}
                  onChange={(e) => setInstallDryRun(e.target.checked)}
                  className="rounded border-border text-blue-600 focus:ring-blue-500"
                />
                <span className="text-[11px] text-slate-500 dark:text-zinc-400">
                  {t('ops.extensions.install.dryRun')}
                </span>
              </label>
            </div>
          </form>
        </div>

        {/* Local Link form */}
        <div className="p-4 rounded-xl border border-border bg-surface/30 space-y-3">
          <h4 className="text-xs font-semibold text-slate-800 dark:text-zinc-200 flex items-center gap-1.5">
            <Link className="w-3.5 h-3.5 text-emerald-500" />
            <span>{t('ops.extensions.link.title')}</span>
          </h4>
          <form onSubmit={handleLinkPlugin} className="flex gap-2">
            <input
              type="text"
              value={linkPath}
              onChange={(e) => setLinkPath(e.target.value)}
              placeholder={t('ops.extensions.link.placeholder')}
              disabled={isLinkingPlugin}
              className="flex-1 px-3 py-1.5 rounded-lg bg-surface border border-border text-xs text-slate-900 dark:text-zinc-100 font-mono outline-none"
            />
            <button
              type="submit"
              disabled={!linkPath.trim() || isLinkingPlugin}
              className="flex items-center gap-1 px-4 py-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white font-medium text-xs shadow-sm transition-colors cursor-pointer disabled:opacity-50 shrink-0"
            >
              <Link className="w-3.5 h-3.5" />
              <span>{isLinkingPlugin ? '...' : t('ops.extensions.link.btn')}</span>
            </button>
          </form>
        </div>
      </div>

      {/* 3. INSTALLED PLUGINS LIST */}
      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <h4 className="text-xs font-semibold text-slate-800 dark:text-zinc-200">
            {t('ops.extensions.installed.title')} ({plugins.length})
          </h4>
        </div>

        {plugins.length === 0 && !isLoadingPlugins ? (
          <div className="p-6 text-center text-slate-400 dark:text-zinc-500 border border-dashed border-border rounded-xl text-xs">
            {t('ops.extensions.installed.empty')}
          </div>
        ) : (
          <div className="grid grid-cols-1 gap-2.5">
            {plugins.map((p) => {
              const isEnabled = p.enabled !== false;
              return (
                <div
                  key={p.name}
                  className="p-3 rounded-xl border border-border bg-surface/30 flex flex-col sm:flex-row sm:items-center justify-between gap-3 text-xs"
                >
                  <div className="space-y-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
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
                      {p.scope && (
                        <span className="px-1.5 py-0.2 rounded bg-blue-500/10 text-blue-500 border border-blue-500/20 text-[10px]">
                          {p.scope}
                        </span>
                      )}
                      <span
                        className={`px-1.5 py-0.2 rounded text-[10px] ${
                          isEnabled
                            ? 'bg-emerald-500/10 text-emerald-500 border border-emerald-500/20'
                            : 'bg-zinc-500/10 text-zinc-400 border border-zinc-500/20'
                        }`}
                      >
                        {isEnabled ? t('ops.extensions.actions.enable') : t('ops.extensions.actions.disable')}
                      </span>
                    </div>

                    {p.description && (
                      <p className="text-[11px] text-slate-500 dark:text-zinc-400 line-clamp-2">
                        {p.description}
                      </p>
                    )}
                  </div>

                  {/* Plugin Actions */}
                  <div className="flex items-center gap-1.5 shrink-0 flex-wrap">
                    {/* Enable/Disable toggle */}
                    <button
                      type="button"
                      onClick={() => handleTogglePlugin(p.name, isEnabled)}
                      title={isEnabled ? t('ops.extensions.actions.disable') : t('ops.extensions.actions.enable')}
                      className={`p-1.5 rounded-lg border transition-colors cursor-pointer ${
                        isEnabled
                          ? 'bg-emerald-500/10 text-emerald-500 border-emerald-500/20 hover:bg-emerald-500/20'
                          : 'bg-zinc-500/10 text-zinc-400 border-zinc-500/20 hover:bg-zinc-500/20'
                      }`}
                    >
                      {isEnabled ? <ToggleRight className="w-4 h-4" /> : <ToggleLeft className="w-4 h-4" />}
                    </button>

                    {/* Features modal */}
                    <button
                      type="button"
                      onClick={() => handleOpenFeatures(p.name)}
                      title={t('ops.extensions.actions.features')}
                      className="p-1.5 rounded-lg bg-surface hover:bg-surface-highlight border border-border text-slate-700 dark:text-zinc-300 transition-colors cursor-pointer"
                    >
                      <Sliders className="w-3.5 h-3.5" />
                    </button>

                    {/* Config modal */}
                    <button
                      type="button"
                      onClick={() => {
                        setActiveConfigPlugin(p.name);
                        setConfigKey('');
                        setConfigValue('');
                      }}
                      title={t('ops.extensions.actions.config')}
                      className="p-1.5 rounded-lg bg-surface hover:bg-surface-highlight border border-border text-slate-700 dark:text-zinc-300 transition-colors cursor-pointer"
                    >
                      <Wrench className="w-3.5 h-3.5" />
                    </button>

                    {/* Upgrade button */}
                    <button
                      type="button"
                      onClick={() => handleUpgradePlugin(p.name, false)}
                      disabled={upgradingPlugin === p.name}
                      title={t('ops.extensions.actions.upgrade')}
                      className="p-1.5 rounded-lg bg-surface hover:bg-surface-highlight border border-border text-slate-700 dark:text-zinc-300 transition-colors cursor-pointer disabled:opacity-50"
                    >
                      <ArrowUpCircle className={`w-3.5 h-3.5 ${upgradingPlugin === p.name ? 'animate-spin' : ''}`} />
                    </button>

                    {/* Dry run uninstall */}
                    <button
                      type="button"
                      onClick={() => handleUninstallPlugin(p.name, p.scope, true)}
                      title={t('ops.extensions.actions.preview')}
                      className="p-1.5 rounded-lg bg-surface hover:bg-surface-highlight border border-border text-slate-700 dark:text-zinc-300 transition-colors cursor-pointer"
                    >
                      <Eye className="w-3.5 h-3.5" />
                    </button>

                    {/* Uninstall */}
                    <button
                      type="button"
                      onClick={() => handleUninstallPlugin(p.name, p.scope, false)}
                      title={t('ops.extensions.actions.uninstall')}
                      className="p-1.5 rounded-lg bg-rose-500/10 border border-rose-500/20 text-rose-500 hover:bg-rose-500/20 transition-colors cursor-pointer"
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

      {/* 4. MARKETPLACE & DISCOVER SECTION */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 pt-2 border-t border-border">
        {/* Marketplace sources */}
        <div className="p-4 rounded-xl border border-border bg-surface/30 space-y-3">
          <div className="flex items-center justify-between">
            <h4 className="text-xs font-semibold text-slate-800 dark:text-zinc-200 flex items-center gap-1.5">
              <Store className="w-3.5 h-3.5 text-purple-500" />
              <span>{t('ops.extensions.marketplace.title')}</span>
            </h4>
            <button
              type="button"
              onClick={fetchMarketplaces}
              disabled={isLoadingMarketplaces}
              className="p-1 rounded text-slate-400 hover:text-slate-200"
            >
              <RefreshCw className={`w-3 h-3 ${isLoadingMarketplaces ? 'animate-spin' : ''}`} />
            </button>
          </div>

          <form onSubmit={handleAddMarketplace} className="flex gap-2">
            <input
              type="text"
              value={marketplaceSource}
              onChange={(e) => setMarketplaceSource(e.target.value)}
              placeholder={t('ops.extensions.marketplace.placeholder')}
              disabled={isAddingMarketplace}
              className="flex-1 px-3 py-1.5 rounded-lg bg-surface border border-border text-xs text-slate-900 dark:text-zinc-100 font-mono outline-none"
            />
            <button
              type="submit"
              disabled={!marketplaceSource.trim() || isAddingMarketplace}
              className="px-3 py-1.5 rounded-lg bg-purple-600 hover:bg-purple-700 text-white font-medium text-xs shadow-sm transition-colors cursor-pointer disabled:opacity-50 shrink-0"
            >
              <Plus className="w-3.5 h-3.5" />
            </button>
          </form>

          <div className="space-y-1.5 max-h-48 overflow-y-auto">
            {marketplaces.length === 0 && !isLoadingMarketplaces ? (
              <p className="text-[11px] text-slate-400 dark:text-zinc-500 italic py-2">
                {t('ops.extensions.marketplace.empty')}
              </p>
            ) : (
              marketplaces.map((m) => (
                <div
                  key={m.name}
                  className="p-2 rounded-lg border border-border bg-surface/40 flex items-center justify-between text-xs"
                >
                  <div className="truncate pr-2">
                    <span className="font-semibold text-slate-800 dark:text-zinc-200">{m.name}</span>
                    <span className="text-[10px] text-zinc-400 ml-2 truncate font-mono">{m.source}</span>
                  </div>
                  <button
                    type="button"
                    onClick={() => handleRemoveMarketplace(m.name)}
                    className="p-1 text-rose-500 hover:bg-rose-500/10 rounded cursor-pointer"
                  >
                    <Trash2 className="w-3 h-3" />
                  </button>
                </div>
              ))
            )}
          </div>
        </div>

        {/* Discover Plugins */}
        <div className="p-4 rounded-xl border border-border bg-surface/30 space-y-3">
          <div className="flex items-center justify-between gap-2">
            <h4 className="text-xs font-semibold text-slate-800 dark:text-zinc-200 flex items-center gap-1.5">
              <Download className="w-3.5 h-3.5 text-emerald-500" />
              <span>{t('ops.extensions.discover.title')}</span>
            </h4>
            <div className="flex items-center gap-1.5">
              <div className="relative">
                <Search className="w-3 h-3 absolute left-2 top-2 text-zinc-400" />
                <input
                  type="text"
                  value={discoverFilter}
                  onChange={(e) => setDiscoverFilter(e.target.value)}
                  placeholder={t('ops.extensions.filterPlaceholder')}
                  className="pl-6 pr-2 py-1 rounded bg-surface border border-border text-[11px] text-slate-800 dark:text-zinc-200 outline-none w-28 sm:w-36"
                />
              </div>
              <button
                type="button"
                onClick={fetchDiscover}
                disabled={isLoadingDiscover}
                className="p-1 rounded text-slate-400 hover:text-slate-200"
              >
                <RefreshCw className={`w-3 h-3 ${isLoadingDiscover ? 'animate-spin' : ''}`} />
              </button>
            </div>
          </div>

          <div className="space-y-2 max-h-52 overflow-y-auto">
            {filteredDiscover.length === 0 && !isLoadingDiscover ? (
              <p className="text-[11px] text-slate-400 dark:text-zinc-500 italic py-2">
                {t('ops.extensions.discover.empty')}
              </p>
            ) : (
              filteredDiscover.map((p) => (
                <div
                  key={p.name}
                  className="p-2.5 rounded-lg border border-border bg-surface/40 flex items-center justify-between text-xs gap-2"
                >
                  <div className="space-y-0.5 min-w-0">
                    <div className="flex items-center gap-1.5">
                      <span className="font-mono font-medium text-slate-800 dark:text-zinc-200">
                        {p.name}
                      </span>
                      {p.version && (
                        <span className="text-[10px] text-zinc-400 font-mono">
                          @{p.version}
                        </span>
                      )}
                    </div>
                    {p.description && (
                      <p className="text-[10px] text-slate-500 dark:text-zinc-400 truncate">
                        {p.description}
                      </p>
                    )}
                  </div>

                  <button
                    type="button"
                    onClick={() => {
                      setInstallTarget(p.name);
                    }}
                    className="flex items-center gap-1 px-2.5 py-1 rounded bg-emerald-600 hover:bg-emerald-700 text-white font-medium text-[11px] shadow-sm transition-colors cursor-pointer shrink-0"
                  >
                    <Download className="w-3 h-3" />
                    <span>{t('ops.extensions.discover.install')}</span>
                  </button>
                </div>
              ))
            )}
          </div>
        </div>
      </div>

      {/* 5. MODAL: FEATURES */}
      {activeFeaturesPlugin && (
        <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-surface border border-border rounded-2xl p-5 max-w-md w-full shadow-2xl space-y-4">
            <div className="flex items-center justify-between">
              <h4 className="text-xs font-semibold text-slate-800 dark:text-zinc-200 flex items-center gap-1.5">
                <Sliders className="w-4 h-4 text-purple-500" />
                <span>Features: {activeFeaturesPlugin}</span>
              </h4>
              <button
                type="button"
                onClick={() => setActiveFeaturesPlugin(null)}
                className="p-1 rounded text-slate-400 hover:text-slate-200"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {isLoadingFeatures ? (
              <div className="p-4 text-center text-xs text-zinc-400">{t('ops.extensions.loadingFeatures')}</div>
            ) : pluginFeatures.length === 0 ? (
              <div className="p-4 text-center text-xs text-zinc-400">
                {t('ops.extensions.noFeatures')}
              </div>
            ) : (
              <div className="space-y-2 max-h-60 overflow-y-auto">
                {pluginFeatures.map((f) => {
                  const isEnabled = f.enabled !== false;
                  return (
                    <div
                      key={f.name}
                      className="p-2.5 rounded-lg border border-border bg-surface/50 flex items-center justify-between text-xs"
                    >
                      <div className="space-y-0.5">
                        <span className="font-mono font-medium text-slate-800 dark:text-zinc-200">
                          {f.name}
                        </span>
                        {f.description && (
                          <p className="text-[10px] text-zinc-400">{f.description}</p>
                        )}
                      </div>
                      <button
                        type="button"
                        onClick={() => handleToggleFeature(f.name, isEnabled)}
                        className={`p-1.5 rounded-lg border cursor-pointer ${
                          isEnabled
                            ? 'bg-emerald-500/10 text-emerald-500 border-emerald-500/20'
                            : 'bg-zinc-500/10 text-zinc-400 border-zinc-500/20'
                        }`}
                      >
                        {isEnabled ? <ToggleRight className="w-4 h-4" /> : <ToggleLeft className="w-4 h-4" />}
                      </button>
                    </div>
                  );
                })}
              </div>
            )}

            <div className="flex justify-end pt-2">
              <button
                type="button"
                onClick={() => setActiveFeaturesPlugin(null)}
                className="px-4 py-1.5 rounded-lg bg-surface hover:bg-surface-highlight border border-border text-xs text-slate-700 dark:text-zinc-300"
              >
                {t('ops.extensions.close')}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* 6. MODAL: CONFIG KEY=VALUE */}
      {activeConfigPlugin && (
        <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-surface border border-border rounded-2xl p-5 max-w-md w-full shadow-2xl space-y-4">
            <div className="flex items-center justify-between">
              <h4 className="text-xs font-semibold text-slate-800 dark:text-zinc-200 flex items-center gap-1.5">
                <Wrench className="w-4 h-4 text-blue-500" />
                <span>Config: {activeConfigPlugin}</span>
              </h4>
              <button
                type="button"
                onClick={() => setActiveConfigPlugin(null)}
                className="p-1 rounded text-slate-400 hover:text-slate-200"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <form onSubmit={handleSaveConfig} className="space-y-3">
              <div>
                <label className="text-[11px] text-slate-500 dark:text-zinc-400 block mb-1">Key</label>
                <input
                  type="text"
                  value={configKey}
                  onChange={(e) => setConfigKey(e.target.value)}
                  placeholder="e.g. apiKey, defaultModel..."
                  className="w-full px-3 py-1.5 rounded-lg bg-surface border border-border text-xs font-mono outline-none"
                  required
                />
              </div>
              <div>
                <label className="text-[11px] text-slate-500 dark:text-zinc-400 block mb-1">Value</label>
                <input
                  type="text"
                  value={configValue}
                  onChange={(e) => setConfigValue(e.target.value)}
                  placeholder={t('ops.extensions.configValuePlaceholder')}
                  className="w-full px-3 py-1.5 rounded-lg bg-surface border border-border text-xs font-mono outline-none"
                />
              </div>

              <div className="flex justify-end gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setActiveConfigPlugin(null)}
                  className="px-3 py-1.5 rounded-lg bg-surface hover:bg-surface-highlight border border-border text-xs"
                >
                  {t('ops.extensions.cancel')}
                </button>
                <button
                  type="submit"
                  disabled={!configKey.trim() || isSavingConfig}
                  className="px-4 py-1.5 rounded-lg bg-blue-600 hover:bg-blue-700 text-white font-medium text-xs shadow-sm disabled:opacity-50"
                >
                  {isSavingConfig ? t('ops.extensions.savingConfig') : t('ops.extensions.saveConfig')}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* 7. MODAL: DRY-RUN PREVIEW */}
      {previewModal && (
        <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-surface border border-border rounded-2xl p-5 max-w-lg w-full shadow-2xl space-y-3">
            <div className="flex items-center justify-between">
              <h4 className="text-xs font-semibold text-slate-800 dark:text-zinc-200 flex items-center gap-1.5">
                <Eye className="w-4 h-4 text-emerald-500" />
                <span>{previewModal.title}</span>
              </h4>
              <button
                type="button"
                onClick={() => setPreviewModal(null)}
                className="p-1 rounded text-slate-400 hover:text-slate-200"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="p-3 rounded-lg bg-slate-950 border border-border text-slate-200 font-mono text-[11px] whitespace-pre-wrap max-h-60 overflow-y-auto">
              {previewModal.content}
            </div>

            <div className="flex justify-end pt-1">
              <button
                type="button"
                onClick={() => setPreviewModal(null)}
                className="px-4 py-1.5 rounded-lg bg-surface hover:bg-surface-highlight border border-border text-xs text-slate-700 dark:text-zinc-300 cursor-pointer"
              >
                {t('ops.extensions.previewModal.close')}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
});
