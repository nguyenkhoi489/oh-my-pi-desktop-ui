import React, { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import {
  Search,
  X,
  RotateCw,
  RotateCcw,
  Check,
  AlertTriangle,
  ChevronDown,
  ChevronRight,
  Shield,
  Star,
  FileCode,
  Sliders,
  Folder,
} from 'lucide-react';
import {
  EngineConfigEntry,
  FetchEngineConfigOptions,
  SetEngineConfigOptions,
  ResetEngineConfigOptions,
  EngineConfigPathOptions,
  EngineConfigListResult,
  EngineConfigMutationResult,
  EngineConfigPathResult,
} from '../../../types';
import {
  PINNED_CONFIG_KEYS,
  SESSION_OVERRIDE_KEYS,
  MAX_RENDER_CONFIG_ROWS,
  filterEntries,
  groupByPrefix,
  coerceInput,
  formatConfigValue,
} from '../../../utils/engineConfig';
import { useI18n } from '../../../i18n/I18nProvider';

export interface EngineConfigEditorProps {
  getEngineConfig?: (options?: FetchEngineConfigOptions) => Promise<EngineConfigListResult>;
  setEngineConfigValue?: (
    key: string,
    value: string,
    options?: SetEngineConfigOptions,
  ) => Promise<EngineConfigMutationResult>;
  resetEngineConfigValue?: (
    key: string,
    options?: ResetEngineConfigOptions,
  ) => Promise<EngineConfigMutationResult>;
  getEngineConfigPath?: (options?: EngineConfigPathOptions) => Promise<EngineConfigPathResult>;
  currentProfile?: string;
}

export const EngineConfigEditor: React.FC<EngineConfigEditorProps> = ({
  getEngineConfig,
  setEngineConfigValue,
  resetEngineConfigValue,
  getEngineConfigPath,
  currentProfile,
}) => {
  const { t } = useI18n();

  const [entries, setEntries] = useState<EngineConfigEntry[]>([]);
  const [loading, setLoading] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);
  const [configPath, setConfigPath] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState<string>('');

  // Quản lý các nhóm đang mở (nhóm ghim mở sẵn theo mặc định)
  const [openGroups, setOpenGroups] = useState<Set<string>>(new Set(['__pinned__']));
  // Quản lý các key đang mở rộng mô tả chi tiết
  const [expandedDescriptions, setExpandedDescriptions] = useState<Set<string>>(new Set());

  // Quản lý giá trị nhập liệu bản nháp cho từng key
  const [draftValues, setDraftValues] = useState<Record<string, string>>({});
  const [dirtyKeys, setDirtyKeys] = useState<Set<string>>(new Set());
  const [savingKeys, setSavingKeys] = useState<Set<string>>(new Set());
  const [savedKeys, setSavedKeys] = useState<Set<string>>(new Set());
  const [keyErrors, setKeyErrors] = useState<Record<string, string>>({});

  const savedTimersRef = useRef<Record<string, NodeJS.Timeout>>({});
  const requestIdRef = useRef<number>(0);
  // Dọn dẹp timer khi unmount
  useEffect(() => {
    return () => {
      Object.values(savedTimersRef.current).forEach((timer) => clearTimeout(timer));
    };
  }, []);

  // Nạp danh sách cấu hình từ engine
  const loadConfig = useCallback(
    async (forceRefresh = false) => {
      if (!getEngineConfig) return;
      const currentRequestId = ++requestIdRef.current;
      setLoading(true);
      setError(null);
      try {
        const result = await getEngineConfig({
          profile: currentProfile,
          forceRefresh,
        });
        if (currentRequestId !== requestIdRef.current) return;
        if (result.success && result.entries) {
          setEntries(result.entries);
          // Đồng bộ giá trị nháp ban đầu
          const initialDrafts: Record<string, string> = {};
          result.entries.forEach((e) => {
            initialDrafts[e.key] = formatConfigValue(e.value);
          });
          setDraftValues(initialDrafts);
          setDirtyKeys(new Set());
          setKeyErrors({});
        } else {
          setError(result.error || t('common.error.generic'));
        }
      } catch (err: unknown) {
        if (currentRequestId !== requestIdRef.current) return;
        const msg = err instanceof Error ? err.message : String(err);
        setError(msg || t('common.error.generic'));
      } finally {
        if (currentRequestId === requestIdRef.current) {
          setLoading(false);
        }
      }
    },
    [getEngineConfig, currentProfile, t],
  );

  // Nạp đường dẫn file cấu hình engine
  useEffect(() => {
    if (!getEngineConfigPath) return;
    getEngineConfigPath({ profile: currentProfile })
      .then((res) => {
        if (res.success && res.path) {
          setConfigPath(res.path);
        }
      })
      .catch(() => {});
  }, [getEngineConfigPath, currentProfile]);

  // Nạp cấu hình lần đầu hoặc khi profile thay đổi
  useEffect(() => {
    loadConfig(false);
  }, [loadConfig]);

  // Lọc danh sách theo từ khóa tìm kiếm
  const filteredEntries = useMemo(() => {
    return filterEntries(entries, searchQuery);
  }, [entries, searchQuery]);

  // Tách nhóm cấu hình ghim và các nhóm prefix
  const { pinnedEntries, prefixGroups } = useMemo(() => {
    const pinnedSet = new Set<string>(PINNED_CONFIG_KEYS);
    const pinned: EngineConfigEntry[] = [];
    const nonPinned: EngineConfigEntry[] = [];

    // Tìm các key ghim theo thứ tự danh sách ghim
    const entryMap = new Map<string, EngineConfigEntry>();
    filteredEntries.forEach((e) => entryMap.set(e.key, e));

    if (!searchQuery.trim()) {
      PINNED_CONFIG_KEYS.forEach((pinnedKey) => {
        const found = entryMap.get(pinnedKey);
        if (found) {
          pinned.push(found);
        }
      });
      filteredEntries.forEach((e) => {
        if (!pinnedSet.has(e.key)) {
          nonPinned.push(e);
        }
      });
    } else {
      // Khi tìm kiếm, hiển thị mọi match trong pinned và prefix groups
      filteredEntries.forEach((e) => {
        if (pinnedSet.has(e.key)) {
          pinned.push(e);
        }
        nonPinned.push(e);
      });
    }

    const groups = groupByPrefix(nonPinned);
    return { pinnedEntries: pinned, prefixGroups: groups };
  }, [filteredEntries, searchQuery]);

  // Khi người dùng gõ từ khóa tìm kiếm, tự động mở tất cả nhóm có kết quả
  useEffect(() => {
    if (searchQuery.trim()) {
      const allGroupKeys = new Set<string>(Object.keys(prefixGroups));
      if (pinnedEntries.length > 0) {
        allGroupKeys.add('__pinned__');
      }
      setOpenGroups(allGroupKeys);
    }
  }, [searchQuery, prefixGroups, pinnedEntries.length]);

  // Đóng mở một nhóm
  const toggleGroup = useCallback((groupKey: string) => {
    setOpenGroups((prev) => {
      const next = new Set(prev);
      if (next.has(groupKey)) {
        next.delete(groupKey);
      } else {
        next.add(groupKey);
      }
      return next;
    });
  }, []);

  // Đóng mở mô tả chi tiết của một key
  const toggleDescription = useCallback((key: string) => {
    setExpandedDescriptions((prev) => {
      const next = new Set(prev);
      if (next.has(key)) {
        next.delete(key);
      } else {
        next.add(key);
      }
      return next;
    });
  }, []);

  // Đánh dấu thành công và bật checkmark ngắn
  const markKeySaved = useCallback((key: string) => {
    setSavedKeys((prev) => new Set(prev).add(key));
    if (savedTimersRef.current[key]) {
      clearTimeout(savedTimersRef.current[key]);
    }
    savedTimersRef.current[key] = setTimeout(() => {
      setSavedKeys((prev) => {
        const next = new Set(prev);
        next.delete(key);
        return next;
      });
      delete savedTimersRef.current[key];
    }, 2000);
  }, []);

  // Thực hiện lưu giá trị cấu hình xuống engine
  const handleSaveKey = useCallback(
    async (entry: EngineConfigEntry, rawValueOverride?: unknown) => {
      if (!setEngineConfigValue) return;
      const key = entry.key;
      const rawValue = rawValueOverride !== undefined ? rawValueOverride : (draftValues[key] ?? formatConfigValue(entry.value));

      // Kiểm tra tính hợp lệ của giá trị
      const coerced = coerceInput(entry.type, rawValue);
      if (coerced.error) {
        setKeyErrors((prev) => ({ ...prev, [key]: t(coerced.error!) }));
        return;
      }

      setSavingKeys((prev) => new Set(prev).add(key));
      setKeyErrors((prev) => {
        const next = { ...prev };
        delete next[key];
        return next;
      });

      // Cập nhật optimistic giá trị trên UI
      setEntries((prev) =>
        prev.map((e) => (e.key === key ? { ...e, value: coerced.value } : e)),
      );

      try {
        const res = await setEngineConfigValue(key, coerced.stringified, {
          profile: currentProfile,
        });

        if (res.success) {
          setDirtyKeys((prev) => {
            const next = new Set(prev);
            next.delete(key);
            return next;
          });
          setDraftValues((prev) => ({
            ...prev,
            [key]: formatConfigValue(coerced.value),
          }));
          markKeySaved(key);
        } else {
          // Revert và báo lỗi nguyên văn từ engine
          setEntries((prev) =>
            prev.map((e) => (e.key === key ? { ...e, value: entry.value } : e)),
          );
          setKeyErrors((prev) => ({
            ...prev,
            [key]: res.error || t('common.error.generic'),
          }));
        }
      } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : String(err);
        setEntries((prev) =>
          prev.map((e) => (e.key === key ? { ...e, value: entry.value } : e)),
        );
        setKeyErrors((prev) => ({ ...prev, [key]: msg || t('common.error.generic') }));
        setSavingKeys((prev) => {
          const next = new Set(prev);
          next.delete(key);
          return next;
        });
      }
    },
    [setEngineConfigValue, draftValues, currentProfile, markKeySaved, t],
  );

  // Khôi phục giá trị cấu hình về mặc định của engine
  const handleResetKey = useCallback(
    async (entry: EngineConfigEntry) => {
      if (!resetEngineConfigValue) return;
      const key = entry.key;

      setSavingKeys((prev) => new Set(prev).add(key));
      setKeyErrors((prev) => {
        const next = { ...prev };
        delete next[key];
        return next;
      });

      try {
        const res = await resetEngineConfigValue(key, { profile: currentProfile });
        if (res.success) {
          if (getEngineConfig) {
            const fresh = await getEngineConfig({ profile: currentProfile, forceRefresh: true });
            if (fresh.success && fresh.entries) {
              setEntries(fresh.entries);
              const freshEntry = fresh.entries.find((e) => e.key === key);
              const formattedFresh = formatConfigValue(freshEntry?.value);
              setDraftValues((prev) => ({ ...prev, [key]: formattedFresh }));
              setDirtyKeys((prev) => {
                const next = new Set(prev);
                next.delete(key);
                return next;
              });
            }
          }
          markKeySaved(key);
        } else {
          setKeyErrors((prev) => ({
            ...prev,
            [key]: res.error || t('common.error.generic'),
          }));
        }
      } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : String(err);
        setKeyErrors((prev) => ({ ...prev, [key]: msg || t('common.error.generic') }));
        setSavingKeys((prev) => {
          const next = new Set(prev);
          next.delete(key);
          return next;
        });
      }
    },
    [resetEngineConfigValue, currentProfile, loadConfig, markKeySaved],
  );

  // Thay đổi draft value của một key
  const handleDraftChange = useCallback((key: string, value: string) => {
    setDraftValues((prev) => ({ ...prev, [key]: value }));
    setDirtyKeys((prev) => new Set(prev).add(key));
    setKeyErrors((prev) => {
      const next = { ...prev };
      delete next[key];
      return next;
    });
  }, []);

  // Tính toán số dòng render và áp dụng giới hạn MAX_RENDER_CONFIG_ROWS (Rule 4)
  let renderedCount = 0;
  let isCapReached = false;

  // Render một hàng cấu hình
  const renderConfigRow = (entry: EngineConfigEntry) => {
    if (renderedCount >= MAX_RENDER_CONFIG_ROWS) {
      isCapReached = true;
      return null;
    }
    renderedCount++;

    const key = entry.key;
    const type = (entry.type || 'string').toLowerCase();
    const isBoolean = type === 'boolean';
    const isEnum = type === 'enum' || (entry.enumOptions && entry.enumOptions.length > 0);
    const isArrayOrRecord = type === 'array' || type === 'record';
    const isNumber = type === 'number';

    const isDirty = dirtyKeys.has(key);
    const isSaving = savingKeys.has(key);
    const isSaved = savedKeys.has(key);
    const keyError = keyErrors[key];
    const overrideInfo = SESSION_OVERRIDE_KEYS[key];
    const isExpanded = expandedDescriptions.has(key);

    const currentValue = entry.value;
    const draftValue = draftValues[key] ?? formatConfigValue(currentValue);

    return (
      <div
        key={key}
        className="p-3.5 rounded-xl border border-border bg-surface/40 hover:bg-surface/70 transition-all space-y-2.5"
      >
        {/* Header hàng: Tên key + Type badge + Override badge + Action buttons */}
        <div className="flex items-start justify-between gap-3">
          <div className="flex-1 min-w-0">
            <div className="flex flex-wrap items-center gap-1.5">
              <span className="font-mono text-xs font-semibold text-slate-900 dark:text-zinc-100 select-all">
                {key}
              </span>
              <span className="px-1.5 py-0.2 text-[10px] font-mono rounded bg-surface-highlight border border-border text-slate-500 dark:text-zinc-400">
                {type}
              </span>
              {overrideInfo && (
                <span
                  className="flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-medium bg-amber-500/10 text-amber-600 dark:text-amber-400 border border-amber-500/20"
                  title={t(overrideInfo.descriptionKey) || overrideInfo.defaultDesc}
                >
                  <Shield className="w-3 h-3 shrink-0" />
                  {t('engineConfig.override.badge')}
                </span>
              )}
            </div>

            {/* Mô tả của key */}
            {entry.description && (
              <div className="mt-1">
                <p
                  onClick={() => toggleDescription(key)}
                  className={`text-xs text-slate-500 dark:text-zinc-400 leading-relaxed cursor-pointer hover:text-slate-700 dark:hover:text-zinc-300 ${
                    !isExpanded ? 'line-clamp-2' : ''
                  }`}
                  title={entry.description}
                >
                  {entry.description}
                </p>
              </div>
            )}
          </div>

          {/* Action buttons góc phải: Status indicator & Reset button */}
          <div className="flex items-center gap-1.5 shrink-0 pt-0.5">
            {isSaved && (
              <span className="flex items-center gap-1 text-[11px] text-emerald-600 dark:text-emerald-400 font-medium">
                <Check className="w-3.5 h-3.5" />
                {t('engineConfig.saved')}
              </span>
            )}
            {isSaving && (
              <span className="flex items-center gap-1 text-[11px] text-codex-accent font-medium">
                <RotateCw className="w-3.5 h-3.5 animate-spin" />
                {t('engineConfig.saving')}
              </span>
            )}
            <button
              onClick={() => handleResetKey(entry)}
              disabled={isSaving}
              className="p-1.5 rounded-lg border border-border hover:bg-surface-highlight text-slate-500 dark:text-zinc-400 hover:text-slate-800 dark:hover:text-zinc-200 transition-colors disabled:opacity-40 cursor-pointer"
              title={t('engineConfig.reset.tooltip')}
            >
              <RotateCcw className="w-3.5 h-3.5" />
            </button>
          </div>
        </div>

        {/* Khu vực nhập liệu tùy theo kiểu dữ liệu */}
        <div className="pt-1">
          {isBoolean ? (
            <div className="flex items-center justify-between">
              <span className="text-xs font-mono text-slate-600 dark:text-zinc-300">
                {String(currentValue)}
              </span>
              <button
                type="button"
                disabled={isSaving}
                onClick={() => handleSaveKey(entry, !currentValue)}
                className={`relative inline-flex h-5 w-9 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none ${
                  currentValue ? 'bg-codex-accent' : 'bg-slate-300 dark:bg-zinc-700'
                } ${isSaving ? 'opacity-50 cursor-not-allowed' : ''}`}
              >
                <span
                  className={`pointer-events-none inline-block h-4 w-4 transform rounded-full bg-white shadow ring-0 transition duration-200 ease-in-out ${
                    currentValue ? 'translate-x-4' : 'translate-x-0'
                  }`}
                />
              </button>
            </div>
          ) : isEnum && entry.enumOptions && entry.enumOptions.length > 0 ? (
            <div className="flex items-center gap-2">
              <select
                value={String(currentValue ?? '')}
                disabled={isSaving}
                onChange={(e) => handleSaveKey(entry, e.target.value)}
                className="flex-1 bg-surface border border-border rounded-lg px-3 py-1.5 text-xs text-slate-900 dark:text-zinc-100 font-mono focus:outline-none focus:ring-1 focus:ring-codex-accent disabled:opacity-50 cursor-pointer"
              >
                {entry.enumOptions.map((opt) => (
                  <option key={opt} value={opt}>
                    {opt}
                  </option>
                ))}
              </select>
            </div>
          ) : isArrayOrRecord ? (
            <div className="space-y-2">
              <textarea
                rows={Math.min(6, Math.max(3, draftValue.split('\n').length))}
                value={draftValue}
                disabled={isSaving}
                onChange={(e) => handleDraftChange(key, e.target.value)}
                onBlur={() => {
                  if (isDirty) {
                    handleSaveKey(entry);
                  }
                }}
                className={`w-full bg-surface border rounded-lg p-2.5 text-xs font-mono text-slate-900 dark:text-zinc-100 focus:outline-none focus:ring-1 focus:ring-codex-accent ${
                  keyError ? 'border-rose-500 focus:ring-rose-500' : 'border-border'
                }`}
              />
              {isDirty && (
                <div className="flex justify-end">
                  <button
                    onClick={() => handleSaveKey(entry)}
                    disabled={isSaving}
                    className="px-3 py-1 bg-codex-accent text-white rounded-lg text-xs font-medium hover:bg-codex-accent/90 transition-colors flex items-center gap-1.5 cursor-pointer disabled:opacity-50"
                  >
                    {t('common.save')}
                  </button>
                </div>
              )}
            </div>
          ) : (
            <div className="flex items-center gap-2">
              <input
                type={isNumber ? 'number' : 'text'}
                value={draftValue}
                disabled={isSaving}
                onChange={(e) => handleDraftChange(key, e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    handleSaveKey(entry);
                  }
                }}
                onBlur={() => {
                  if (isDirty) {
                    handleSaveKey(entry);
                  }
                }}
                className={`flex-1 bg-surface border rounded-lg px-3 py-1.5 text-xs font-mono text-slate-900 dark:text-zinc-100 focus:outline-none focus:ring-1 focus:ring-codex-accent ${
                  keyError ? 'border-rose-500 focus:ring-rose-500' : 'border-border'
                }`}
              />
              {isDirty && (
                <button
                  onClick={() => handleSaveKey(entry)}
                  disabled={isSaving}
                  className="px-3 py-1.5 bg-codex-accent text-white rounded-lg text-xs font-medium hover:bg-codex-accent/90 transition-colors shrink-0 cursor-pointer disabled:opacity-50"
                >
                  {t('common.save')}
                </button>
              )}
            </div>
          )}
        </div>

        {/* Hiển thị thông báo lỗi nếu có */}
        {keyError && (
          <div className="flex items-center gap-1.5 text-rose-600 dark:text-rose-400 text-xs pt-0.5">
            <AlertTriangle className="w-3.5 h-3.5 shrink-0" />
            <span className="break-all">{keyError}</span>
          </div>
        )}
      </div>
    );
  };

  const totalMatchingCount = filteredEntries.length;
  const prefixGroupKeys = Object.keys(prefixGroups).sort();

  return (
    <div className="space-y-5">
      {/* Header tab: Title, Desc, Config Path, Search, Refresh */}
      <div className="space-y-3">
        <div className="flex items-start justify-between gap-4">
          <div>
            <h3 className="text-sm font-semibold text-slate-900 dark:text-zinc-100 flex items-center gap-2">
              <Sliders className="w-4 h-4 text-codex-accent" />
              {t('engineConfig.title')}
            </h3>
            <p className="text-xs text-slate-500 dark:text-zinc-400 mt-0.5">
              {t('engineConfig.desc', { count: entries.length })}
            </p>
          </div>
          <button
            onClick={() => loadConfig(true)}
            disabled={loading}
            className="px-3 py-1.5 bg-surface hover:bg-surface-highlight border border-border rounded-lg text-xs font-medium text-slate-700 dark:text-zinc-300 transition-colors flex items-center gap-1.5 cursor-pointer disabled:opacity-50 shrink-0"
            title={t('engineConfig.refresh')}
          >
            <RotateCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} />
            {t('engineConfig.refresh')}
          </button>
        </div>

        {/* Đường dẫn file config nếu có */}
        {configPath && (
          <div className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-surface-highlight/50 border border-border text-xs text-slate-500 dark:text-zinc-400">
            <FileCode className="w-3.5 h-3.5 shrink-0 text-slate-400 dark:text-zinc-500" />
            <span className="shrink-0">{t('engineConfig.path')}</span>
            <span className="font-mono text-slate-800 dark:text-zinc-200 truncate select-all">
              {configPath}
            </span>
          </div>
        )}

        {/* Thanh tìm kiếm */}
        <div className="relative">
          <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 dark:text-zinc-500" />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder={t('engineConfig.search.placeholder')}
            className="w-full bg-surface border border-border rounded-xl pl-9 pr-8 py-2 text-xs text-slate-900 dark:text-zinc-100 focus:outline-none focus:ring-1 focus:ring-codex-accent"
          />
          {searchQuery && (
            <button
              onClick={() => setSearchQuery('')}
              className="absolute right-2.5 top-1/2 -translate-y-1/2 p-1 text-slate-400 hover:text-slate-600 dark:hover:text-zinc-300 cursor-pointer"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          )}
        </div>
      </div>

      {/* Thông báo lỗi tải cấu hình */}
      {error && (
        <div className="p-3.5 rounded-xl border border-rose-500/20 bg-rose-500/10 text-rose-600 dark:text-rose-400 text-xs flex items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            <AlertTriangle className="w-4 h-4 shrink-0" />
            <span>{error}</span>
          </div>
          <button
            onClick={() => loadConfig(true)}
            className="px-2.5 py-1 bg-rose-600 text-white rounded-lg text-xs font-medium hover:bg-rose-700 transition-colors cursor-pointer shrink-0"
          >
            {t('common.retry')}
          </button>
        </div>
      )}

      {/* Danh sách cấu hình */}
      {loading && entries.length === 0 ? (
        <div className="py-12 text-center text-xs text-slate-400 dark:text-zinc-500 space-y-2">
          <RotateCw className="w-5 h-5 animate-spin mx-auto text-codex-accent" />
          <p>{t('common.loading')}</p>
        </div>
      ) : totalMatchingCount === 0 ? (
        <div className="py-12 text-center text-xs text-slate-400 dark:text-zinc-500">
          {searchQuery.trim()
            ? t('engineConfig.empty.search', { query: searchQuery })
            : t('engineConfig.empty.total')}
        </div>
      ) : (
        <div className="space-y-4">
          {/* Nhóm ghim: Thường dùng */}
          {pinnedEntries.length > 0 && (
            <div className="border border-border/80 rounded-2xl overflow-hidden bg-surface/20">
              <button
                onClick={() => toggleGroup('__pinned__')}
                className="w-full flex items-center justify-between p-3 bg-surface/60 hover:bg-surface-highlight/50 transition-colors cursor-pointer text-left"
              >
                <div className="flex items-center gap-2">
                  <Star className="w-4 h-4 text-amber-500 fill-amber-500/20" />
                  <span className="text-xs font-semibold text-slate-900 dark:text-zinc-100">
                    {t('engineConfig.group.pinned')}
                  </span>
                  <span className="px-1.5 py-0.2 text-[10px] font-medium rounded-full bg-codex-accent/10 text-codex-accent border border-codex-accent/20">
                    {pinnedEntries.length}
                  </span>
                </div>
                {openGroups.has('__pinned__') ? (
                  <ChevronDown className="w-4 h-4 text-slate-400" />
                ) : (
                  <ChevronRight className="w-4 h-4 text-slate-400" />
                )}
              </button>

              {openGroups.has('__pinned__') && (
                <div className="p-3 space-y-2.5 border-t border-border/60">
                  {pinnedEntries.map(renderConfigRow)}
                </div>
              )}
            </div>
          )}

          {/* Các nhóm prefix */}
          {prefixGroupKeys.map((prefix) => {
            const groupEntries = prefixGroups[prefix];
            if (!groupEntries || groupEntries.length === 0) return null;
            const isOpen = openGroups.has(prefix);

            return (
              <div
                key={prefix}
                className="border border-border/80 rounded-2xl overflow-hidden bg-surface/20"
              >
                <button
                  onClick={() => toggleGroup(prefix)}
                  className="w-full flex items-center justify-between p-3 bg-surface/60 hover:bg-surface-highlight/50 transition-colors cursor-pointer text-left"
                >
                  <div className="flex items-center gap-2">
                    <Folder className="w-4 h-4 text-slate-500 dark:text-zinc-400" />
                    <span className="text-xs font-semibold text-slate-900 dark:text-zinc-100 font-mono">
                      {prefix}
                    </span>
                    <span className="px-1.5 py-0.2 text-[10px] font-medium rounded-full bg-surface-highlight border border-border text-slate-500 dark:text-zinc-400">
                      {groupEntries.length}
                    </span>
                  </div>
                  {isOpen ? (
                    <ChevronDown className="w-4 h-4 text-slate-400" />
                  ) : (
                    <ChevronRight className="w-4 h-4 text-slate-400" />
                  )}
                </button>

                {isOpen && (
                  <div className="p-3 space-y-2.5 border-t border-border/60">
                    {groupEntries.map(renderConfigRow)}
                  </div>
                )}
              </div>
            );
          })}

          {/* Cảnh báo giới hạn dòng render nếu có */}
          {isCapReached && (
            <div className="p-3 rounded-xl bg-amber-500/10 border border-amber-500/20 text-amber-600 dark:text-amber-400 text-xs flex items-center gap-2">
              <AlertTriangle className="w-4 h-4 shrink-0" />
              <span>
                {t('engineConfig.cap.warning', {
                  shown: MAX_RENDER_CONFIG_ROWS,
                  total: totalMatchingCount,
                })}
              </span>
            </div>
          )}
        </div>
      )}
    </div>
  );
};
