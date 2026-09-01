import React, { useState, useEffect, useCallback } from 'react';
import {
  Settings,
  X,
  Moon,
  Sun,
  Cpu,
  Terminal,
  Shield,
  Brain,
  FolderSearch,
  AlertTriangle,
  Check,
  RotateCw,
  Sliders,
  Database,
  Server,
  KeyRound,
  Plus,
  Trash2,
  Edit3,
  Copy,
  Search,
  Boxes,
  Lock,
  Globe,
  LogIn,
  XCircle,
  Eye,
  EyeOff,
} from 'lucide-react';
import {
  ThemeMode,
  OmpInstallStatus,
  OmpModelInfo,
  OmpThinkingLevel,
  OmpApprovalMode,
  AppSettings,
  CustomProviderConfig,
  CustomModelConfig,
  CustomModelThinking,
  CustomThinkingMode,
  CustomProviderDiscoveryType,
  OmpEffortLevel,
  LoginProviderItem,
  AuthLoginEvent,
} from '../../types';

const EFFORT_LEVELS: OmpEffortLevel[] = ['minimal', 'low', 'medium', 'high', 'xhigh', 'max'];

const THINKING_MODE_OPTIONS: { id: CustomThinkingMode; label: string }[] = [
  { id: 'effort', label: 'effort (OpenAI-style)' },
  { id: 'budget', label: 'budget (token budget)' },
  { id: 'google-level', label: 'google-level (Gemini)' },
  { id: 'anthropic-adaptive', label: 'anthropic-adaptive' },
  { id: 'anthropic-budget-effort', label: 'anthropic-budget-effort' },
];

const DISCOVERY_TYPE_OPTIONS: CustomProviderDiscoveryType[] = [
  'ollama',
  'llama.cpp',
  'lm-studio',
  'openai-models-list',
  'proxy',
  'litellm',
];

// Chuyển headers object <-> textarea dạng "Tên: Giá trị" mỗi dòng
const headersToText = (headers?: Record<string, string>): string =>
  headers ? Object.entries(headers).map(([k, v]) => `${k}: ${v}`).join('\n') : '';

const textToHeaders = (text: string): Record<string, string> | undefined => {
  const headers: Record<string, string> = {};
  for (const line of text.split('\n')) {
    const idx = line.indexOf(':');
    if (idx <= 0) continue;
    const key = line.slice(0, idx).trim();
    const value = line.slice(idx + 1).trim();
    if (key && value) headers[key] = value;
  }
  return Object.keys(headers).length > 0 ? headers : undefined;
};

interface SettingsModalProps {
  isOpen: boolean;
  onClose: () => void;
  theme: ThemeMode;
  onThemeChange: (theme: ThemeMode) => void;
  installStatus?: OmpInstallStatus | null;
  onSelectBinaryFile?: () => Promise<string | null>;
  onSetCustomBinaryPath?: (path: string) => Promise<void | OmpInstallStatus>;
  availableModels: OmpModelInfo[];
  thinkingLevel?: OmpThinkingLevel;
  onSelectThinkingLevel?: (level: OmpThinkingLevel) => void;
  onRestartEngine?: () => Promise<void>;
  isEngineRunning?: boolean;
}

const THINKING_LEVELS: { id: OmpThinkingLevel; label: string; desc: string }[] = [
  { id: 'off', label: 'Tắt (Off)', desc: 'Không sử dụng reasoning block' },
  { id: 'minimal', label: 'Tối thiểu (Minimal)', desc: 'Chỉ reasoning rất ngắn' },
  { id: 'low', label: 'Thấp (Low)', desc: 'Reasoning mức cơ bản' },
  { id: 'medium', label: 'Vừa (Medium)', desc: 'Reasoning cân bằng hiệu năng' },
  { id: 'high', label: 'Cao (High)', desc: 'Reasoning sâu, kỹ lưỡng' },
  { id: 'xhigh', label: 'Rất cao (XHigh)', desc: 'Reasoning chuyên sâu cho tác vụ khó' },
  { id: 'max', label: 'Tối đa (Max)', desc: 'Tối đa ngân sách suy nghĩ của model' },
  { id: 'auto', label: 'Tự động (Auto)', desc: 'Model tự điều chỉnh mức độ suy nghĩ' },
];

const APPROVAL_OPTIONS: { id: OmpApprovalMode; label: string; desc: string }[] = [
  { id: 'always-ask', label: 'Luôn hỏi (Always Ask)', desc: 'Hỏi xác nhận trước mọi thao tác đọc/ghi file hoặc chạy lệnh' },
  { id: 'write', label: 'Chỉ hỏi khi ghi (Write)', desc: 'Tự động cấp quyền đọc, chỉ hỏi khi sửa file hoặc chạy lệnh' },
  { id: 'yolo', label: 'Tự động toàn bộ (Yolo)', desc: 'Tự động cấp tất cả quyền thực thi mà không cần hỏi lại' },
];

const MOCK_CUSTOM_PROVIDERS: CustomProviderConfig[] = [
  {
    id: 'nguyenkhoi-lmstudio-local',
    baseUrl: 'http://127.0.0.1:8040/v1',
    api: 'openai-completions',
    apiKey: 'LMSTUDIO_API_KEY',
    authHeader: true,
    compat: { supportsUsageInStreaming: false },
    models: [
      { id: 'gemini-3.7-flash-tiered', name: 'Gemini 3.7 Flash Tiered', contextWindow: 300000, maxTokens: 65536 },
    ],
    hasEnvVar: true,
  },
  {
    id: 'nguyenkhoi-lmstudio-prod',
    baseUrl: 'https://lmstudio.nguyenkhoi.dev/v1',
    api: 'openai-completions',
    apiKey: 'LMSTUDIO_API_KEY_PROD',
    authHeader: true,
    compat: { supportsUsageInStreaming: false },
    models: [
      { id: 'gemini-3.7-flash-tiered', name: 'Gemini 3.7 Flash Tiered', contextWindow: 300000 },
    ],
    hasEnvVar: true,
  },
];

const MOCK_LOGIN_PROVIDERS: LoginProviderItem[] = [
  { id: 'openai-codex', name: 'ChatGPT Plus/Pro (Codex Subscription)' },
  { id: 'anthropic', name: 'Anthropic (Claude Pro/Max)' },
  { id: 'zai', name: 'Z.AI (GLM Coding Plan)' },
  { id: 'kimi-code', name: 'Kimi Code' },
  { id: 'openrouter', name: 'OpenRouter' },
  { id: 'github-copilot', name: 'GitHub Copilot' },
  { id: 'cursor', name: 'Cursor (Claude, GPT, etc.)' },
  { id: 'devin', name: 'Devin' },
  { id: 'google-antigravity', name: 'Antigravity (Gemini 3, Claude, GPT-OSS)' },
  { id: 'google-gemini-cli', name: 'Google Cloud Code Assist (Gemini CLI)' },
  { id: 'xai', name: 'xAI API' },
];

export const SettingsModal: React.FC<SettingsModalProps> = ({
  isOpen,
  onClose,
  theme,
  onThemeChange,
  installStatus,
  onSelectBinaryFile,
  onSetCustomBinaryPath,
  availableModels,
  thinkingLevel,
  onSelectThinkingLevel,
  onRestartEngine,
  isEngineRunning = false,
}) => {
  const [activeTab, setActiveTab] = useState<'general' | 'engine' | 'providers'>('general');
  const [settings, setSettings] = useState<AppSettings>({
    theme: 'light',
    approvalMode: 'always-ask',
    defaultThinkingLevel: 'off',
    autoCompaction: false,
  });
  const [customPathInput, setCustomPathInput] = useState<string>('');
  const [hasEngineChanged, setHasEngineChanged] = useState<boolean>(false);
  const [isRestarting, setIsRestarting] = useState<boolean>(false);
  const [saveStatus, setSaveStatus] = useState<string | null>(null);

  // State cho Tab Providers (Phase 8)
  const [customProviders, setCustomProviders] = useState<CustomProviderConfig[]>([]);
  const [modelsConfigPath, setModelsConfigPath] = useState<string>('~/.omp/agent/models.yml');
  const [isConfigWritable, setIsConfigWritable] = useState<boolean>(true);
  const [configError, setConfigError] = useState<string | null>(null);
  const [loginProviders, setLoginProviders] = useState<LoginProviderItem[]>([]);
  const [loginSearchQuery, setLoginSearchQuery] = useState<string>('');
  const [authLogin, setAuthLogin] = useState<AuthLoginEvent | null>(null);
  const [authCodeInput, setAuthCodeInput] = useState<string>('');
  const [isEditingProvider, setIsEditingProvider] = useState<boolean>(false);
  const [editingProvider, setEditingProvider] = useState<CustomProviderConfig | null>(null);
  const [editingOriginalId, setEditingOriginalId] = useState<string | null>(null);
  const [copiedText, setCopiedText] = useState<string | null>(null);
  const [modelsSaveSuccess, setModelsSaveSuccess] = useState<boolean>(false);
  const [showApiKey, setShowApiKey] = useState<boolean>(false);
  const [headersText, setHeadersText] = useState<string>('');
  const [authedProviders, setAuthedProviders] = useState<string[]>([]);

  const loadSettings = useCallback(async () => {
    try {
      if (window.electronAPI?.getSettings) {
        const loaded = await window.electronAPI.getSettings();
        setSettings(loaded);
        setCustomPathInput(loaded.customBinaryPath || '');
      } else {
        const raw = localStorage.getItem('omp_settings');
        if (raw) {
          const parsed = JSON.parse(raw);
          setSettings(parsed);
          setCustomPathInput(parsed.customBinaryPath || '');
        }
      }
    } catch (err) {
      console.warn('[SettingsModal] Lỗi khi tải cài đặt:', err);
    }
  }, []);

  const loadProvidersData = useCallback(async () => {
    try {
      if (window.electronAPI?.getModelsConfig) {
        const res = await window.electronAPI.getModelsConfig();
        setCustomProviders(res.providers || []);
        if (res.filePath) setModelsConfigPath(res.filePath);
        setIsConfigWritable(res.isWritable !== false);
        setConfigError(res.error || null);
      } else {
        setCustomProviders(MOCK_CUSTOM_PROVIDERS);
        setIsConfigWritable(true);
        setConfigError(null);
      }
    } catch (err: any) {
      console.warn('[SettingsModal] Lỗi khi tải models.yml:', err);
      setCustomProviders(MOCK_CUSTOM_PROVIDERS);
    }

    try {
      if (window.electronAPI?.getLoginProviders) {
        const res = await window.electronAPI.getLoginProviders();
        if (res.success && res.providers) {
          setLoginProviders(res.providers);
        } else {
          setLoginProviders(MOCK_LOGIN_PROVIDERS);
        }
      } else {
        setLoginProviders(MOCK_LOGIN_PROVIDERS);
      }
    } catch (err) {
      console.warn('[SettingsModal] Lỗi khi tải login providers:', err);
      setLoginProviders(MOCK_LOGIN_PROVIDERS);
    }
  }, []);

  // Trạng thái đã-đăng-nhập lấy từ `omp usage --json` (chạy nền, mất vài giây)
  const refreshAuthStatus = useCallback(async () => {
    try {
      if (window.electronAPI?.getAuthStatus) {
        const res = await window.electronAPI.getAuthStatus();
        if (res.success && res.providers) {
          setAuthedProviders(res.providers);
        }
      }
    } catch (err) {
      console.warn('[SettingsModal] Lỗi khi kiểm tra trạng thái đăng nhập:', err);
    }
  }, []);

  useEffect(() => {
    if (isOpen) {
      loadSettings();
      loadProvidersData();
      refreshAuthStatus();
      setHasEngineChanged(false);
      setSaveStatus(null);
      setIsEditingProvider(false);
      setEditingProvider(null);
      setModelsSaveSuccess(false);
      setShowApiKey(false);
    }
  }, [isOpen, loadSettings, loadProvidersData, refreshAuthStatus]);

  // Theo dõi tiến trình đăng nhập OAuth; hủy phiên dở dang khi đóng modal
  useEffect(() => {
    if (!isOpen || !window.electronAPI?.onAuthLoginEvent) return;
    const unsubscribe = window.electronAPI.onAuthLoginEvent((event) => {
      setAuthLogin((prev) =>
        event.status === 'cancelled' && prev?.providerId !== event.providerId ? prev : event
      );
      if (event.status === 'success') {
        refreshAuthStatus();
      }
    });
    return () => {
      unsubscribe();
      window.electronAPI?.cancelAuthLogin?.();
      setAuthLogin(null);
      setAuthCodeInput('');
    };
  }, [isOpen, refreshAuthStatus]);

  useEffect(() => {
    const handleGlobalKeyDown = (e: globalThis.KeyboardEvent) => {
      if (e.key === 'Escape' && isOpen) {
        if (isEditingProvider) {
          setIsEditingProvider(false);
          setEditingProvider(null);
        } else {
          onClose();
        }
      }
    };
    window.addEventListener('keydown', handleGlobalKeyDown);
    return () => window.removeEventListener('keydown', handleGlobalKeyDown);
  }, [isOpen, isEditingProvider, onClose]);

  if (!isOpen) return null;

  const savePartial = async (partial: Partial<AppSettings>) => {
    const next = { ...settings, ...partial };
    setSettings(next);
    try {
      if (window.electronAPI?.setSettings) {
        await window.electronAPI.setSettings(partial);
      } else {
        localStorage.setItem('omp_settings', JSON.stringify(next));
      }
      setSaveStatus('Đã lưu');
      setTimeout(() => setSaveStatus(null), 2000);
    } catch (err) {
      console.error('[SettingsModal] Lỗi khi lưu cài đặt:', err);
    }
  };

  const handleThemeSelect = (newTheme: ThemeMode) => {
    onThemeChange(newTheme);
    savePartial({ theme: newTheme });
  };

  const handleModelSelect = (e: React.ChangeEvent<HTMLSelectElement>) => {
    const value = e.target.value;
    if (!value) {
      savePartial({ defaultProvider: undefined, defaultModel: undefined });
      setHasEngineChanged(true);
      return;
    }
    const [provider, modelId] = value.split(':::');
    savePartial({ defaultProvider: provider, defaultModel: modelId });
    setHasEngineChanged(true);
  };

  const handleThinkingLevelSelect = (level: OmpThinkingLevel) => {
    savePartial({ defaultThinkingLevel: level });
    if (onSelectThinkingLevel) {
      onSelectThinkingLevel(level);
    }
  };

  const handleApprovalModeSelect = (mode: OmpApprovalMode) => {
    savePartial({ approvalMode: mode });
    setHasEngineChanged(true);
  };

  const handleAutoCompactionToggle = () => {
    const nextVal = !settings.autoCompaction;
    savePartial({ autoCompaction: nextVal });
    setHasEngineChanged(true);
  };

  const handleApplyCustomPath = async () => {
    const path = customPathInput.trim();
    await savePartial({ customBinaryPath: path });
    if (onSetCustomBinaryPath) {
      await onSetCustomBinaryPath(path);
    }
    setHasEngineChanged(true);
  };

  const handleBrowseBinary = async () => {
    if (onSelectBinaryFile) {
      const selected = await onSelectBinaryFile();
      if (selected) {
        setCustomPathInput(selected);
        await savePartial({ customBinaryPath: selected });
        if (onSetCustomBinaryPath) {
          await onSetCustomBinaryPath(selected);
        }
        setHasEngineChanged(true);
      }
    }
  };

  const handleRestartEngine = async () => {
    if (onRestartEngine) {
      setIsRestarting(true);
      try {
        await onRestartEngine();
        setHasEngineChanged(false);
        setModelsSaveSuccess(false);
      } finally {
        setIsRestarting(false);
      }
    }
  };

  const handleCopyText = (text: string) => {
    navigator.clipboard.writeText(text);
    setCopiedText(text);
    setTimeout(() => setCopiedText(null), 2000);
  };

  // Phân loại giá trị apiKey theo cách OMP resolve: !lệnh, tên env var, hoặc key literal
  type ApiKeyKind = 'command' | 'env-ok' | 'env-missing' | 'literal';
  const classifyApiKey = (cp: CustomProviderConfig): ApiKeyKind => {
    const value = cp.apiKey || '';
    if (value.startsWith('!')) return 'command';
    if (cp.hasEnvVar) return 'env-ok';
    if (/^[A-Z][A-Z0-9_]*$/.test(value)) return 'env-missing';
    return 'literal';
  };

  const maskSecret = (value: string): string =>
    value.length > 8 ? `${value.slice(0, 4)}••••••••` : '••••••••';

  // OAuth Login Handlers
  const isAuthLoginPending =
    authLogin?.status === 'started' || authLogin?.status === 'awaiting-browser';

  const handleStartAuthLogin = async (lp: LoginProviderItem) => {
    if (!window.electronAPI?.startAuthLogin) {
      handleCopyText(`omp\n/login`);
      return;
    }
    setAuthCodeInput('');
    setAuthLogin({ providerId: lp.id, status: 'started' });
    const res = await window.electronAPI.startAuthLogin(lp.id);
    if (!res.success) {
      setAuthLogin({ providerId: lp.id, status: 'error', message: res.error });
    }
  };

  const handleCancelAuthLogin = async () => {
    await window.electronAPI?.cancelAuthLogin?.();
    setAuthLogin(null);
    setAuthCodeInput('');
  };

  const handleSubmitAuthCode = async () => {
    if (!authCodeInput.trim() || !authLogin) return;
    const res = await window.electronAPI?.sendAuthLoginInput?.(authCodeInput.trim());
    if (res && !res.success) {
      setAuthLogin({ ...authLogin, status: 'error', message: res.error });
    }
    setAuthCodeInput('');
  };

  // Provider CRUD Handlers
  const handleAddNewProvider = () => {
    setEditingOriginalId(null);
    setEditingProvider({
      id: '',
      baseUrl: 'http://127.0.0.1:8040/v1',
      api: 'openai-completions',
      apiKey: '',
      authHeader: true,
      compat: { supportsUsageInStreaming: false },
      models: [{ id: '', name: '', contextWindow: 128000, maxTokens: 4096 }],
    });
    setHeadersText('');
    setShowApiKey(false);
    setIsEditingProvider(true);
  };

  const handleEditProvider = (provider: CustomProviderConfig) => {
    setEditingOriginalId(provider.id);
    setEditingProvider({
      ...provider,
      compat: { ...(provider.compat || { supportsUsageInStreaming: false }) },
      models: provider.models ? provider.models.map((m) => ({ ...m })) : [],
    });
    setHeadersText(headersToText(provider.headers));
    setShowApiKey(false);
    setIsEditingProvider(true);
  };

  const handleDeleteProvider = async (providerId: string) => {
    if (!window.confirm(`Bạn có chắc muốn xóa provider "${providerId}" khỏi models.yml không?`)) {
      return;
    }
    const updated = customProviders.filter((p) => p.id !== providerId);
    setCustomProviders(updated);
    await saveCustomProvidersToFile(updated);
  };

  const handleSaveEditingProvider = async () => {
    if (!editingProvider || !editingProvider.id.trim() || !editingProvider.baseUrl.trim()) {
      alert('Vui lòng nhập Provider ID và Base URL.');
      return;
    }

    const cleanId = editingProvider.id.trim();
    const cleanBaseUrl = editingProvider.baseUrl.trim();
    const cleanApiKey = editingProvider.apiKey?.trim() || undefined;

    const cleanModels: CustomModelConfig[] = (editingProvider.models || [])
      .filter((m) => m && m.id && m.id.trim())
      .map((m) => ({
        ...m,
        id: m.id.trim(),
        name: m.name?.trim() || undefined,
        contextWindow: m.contextWindow ? Number(m.contextWindow) : undefined,
        maxTokens: m.maxTokens ? Number(m.maxTokens) : undefined,
        thinking: m.thinking?.mode && m.thinking.efforts?.length ? m.thinking : undefined,
      }));

    const finalProvider: CustomProviderConfig = {
      ...editingProvider,
      id: cleanId,
      baseUrl: cleanBaseUrl,
      api: editingProvider.api?.trim() || 'openai-completions',
      apiKey: cleanApiKey,
      headers: textToHeaders(headersText),
      models: cleanModels.length > 0 ? cleanModels : undefined,
    };

    let updated: CustomProviderConfig[];
    if (editingOriginalId) {
      updated = customProviders.map((p) => (p.id === editingOriginalId ? finalProvider : p));
    } else {
      updated = [...customProviders.filter((p) => p.id !== cleanId), finalProvider];
    }

    setCustomProviders(updated);
    setIsEditingProvider(false);
    setEditingProvider(null);
    setEditingOriginalId(null);
    await saveCustomProvidersToFile(updated);
  };

  const saveCustomProvidersToFile = async (providers: CustomProviderConfig[]) => {
    try {
      if (window.electronAPI?.saveModelsConfig) {
        const res = await window.electronAPI.saveModelsConfig(providers);
        if (res.success) {
          setModelsSaveSuccess(true);
          setHasEngineChanged(true);
          setConfigError(null);
          loadProvidersData();
        } else {
          setConfigError(res.error || 'Lỗi không xác định khi ghi models.yml');
        }
      } else {
        setModelsSaveSuccess(true);
        setHasEngineChanged(true);
      }
    } catch (err: any) {
      setConfigError(`Lỗi lưu models.yml: ${err?.message || String(err)}`);
    }
  };

  const handleAddModelRow = () => {
    if (!editingProvider) return;
    const currentModels = editingProvider.models || [];
    setEditingProvider({
      ...editingProvider,
      models: [...currentModels, { id: '', name: '', contextWindow: 128000, maxTokens: 4096 }],
    });
  };

  const handleRemoveModelRow = (index: number) => {
    if (!editingProvider) return;
    const currentModels = editingProvider.models || [];
    setEditingProvider({
      ...editingProvider,
      models: currentModels.filter((_, idx) => idx !== index),
    });
  };

  const handleUpdateModelRow = (index: number, field: keyof CustomModelConfig, value: any) => {
    if (!editingProvider) return;
    const currentModels = [...(editingProvider.models || [])];
    currentModels[index] = {
      ...currentModels[index],
      [field]: value,
    };
    setEditingProvider({
      ...editingProvider,
      models: currentModels,
    });
  };

  // Bỏ trống giá -> xóa field; cost rỗng -> undefined để không ghi vào YAML
  const handleUpdateModelCost = (
    index: number,
    key: 'input' | 'output' | 'cacheRead' | 'cacheWrite',
    value: number | undefined
  ) => {
    if (!editingProvider) return;
    const current = editingProvider.models?.[index];
    if (!current) return;
    const cost = { ...(current.cost || {}) };
    if (value === undefined || isNaN(value)) {
      delete cost[key];
    } else {
      cost[key] = value;
    }
    handleUpdateModelRow(index, 'cost', Object.keys(cost).length > 0 ? cost : undefined);
  };

  // defaultLevel phải nằm trong danh sách efforts đã chọn
  const handleUpdateModelThinking = (index: number, patch: Partial<CustomModelThinking> | undefined) => {
    if (!editingProvider) return;
    const current = editingProvider.models?.[index];
    if (!current) return;
    if (patch === undefined) {
      handleUpdateModelRow(index, 'thinking', undefined);
      return;
    }
    const merged: CustomModelThinking = { mode: 'effort', ...(current.thinking || {}), ...patch };
    if (merged.defaultLevel && !(merged.efforts || []).includes(merged.defaultLevel)) {
      merged.defaultLevel = undefined;
    }
    handleUpdateModelRow(index, 'thinking', merged);
  };

  // Group models by provider for Available Models
  const groupedModels = availableModels.reduce<Record<string, OmpModelInfo[]>>((acc, m) => {
    const provider = m.provider || 'khác';
    if (!acc[provider]) acc[provider] = [];
    acc[provider].push(m);
    return acc;
  }, {});

  const currentModelValue =
    settings.defaultProvider && settings.defaultModel
      ? `${settings.defaultProvider}:::${settings.defaultModel}`
      : '';

  const isCurrentModelInCatalog =
    !currentModelValue ||
    availableModels.some(
      (m) => m.provider === settings.defaultProvider && m.id === settings.defaultModel
    );

  const filteredLoginProviders = loginProviders.filter(
    (p) =>
      p.id.toLowerCase().includes(loginSearchQuery.toLowerCase()) ||
      p.name.toLowerCase().includes(loginSearchQuery.toLowerCase())
  );

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm animate-fade-in p-4 select-none">
      <div className="w-full max-w-3xl bg-panel border border-border rounded-2xl shadow-2xl overflow-hidden flex flex-col max-h-[90vh]">
        {/* Modal Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-border bg-surface">
          <div className="flex items-center gap-2.5">
            <div className="p-2 rounded-lg bg-surface-highlight border border-border text-codex-accent">
              <Settings className="w-4 h-4" />
            </div>
            <div>
              <h2 className="text-sm font-semibold text-slate-900 dark:text-zinc-100">Cài đặt</h2>
              <p className="text-xs text-slate-500 dark:text-zinc-400">Tùy chỉnh giao diện, engine và quản lý LLM Providers</p>
            </div>
          </div>
          <div className="flex items-center gap-3">
            {saveStatus && (
              <span className="text-xs text-emerald-600 dark:text-emerald-400 font-medium flex items-center gap-1">
                <Check className="w-3.5 h-3.5" />
                {saveStatus}
              </span>
            )}
            <button
              onClick={onClose}
              className="p-1.5 rounded-lg hover:bg-surface-highlight text-slate-400 hover:text-slate-600 dark:hover:text-zinc-200 transition-colors cursor-pointer"
              title="Đóng (ESC)"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>

        {/* Tab Navigation */}
        <div className="flex border-b border-border bg-surface/50 px-6 gap-2">
          <button
            onClick={() => {
              setActiveTab('general');
              setIsEditingProvider(false);
            }}
            className={`flex items-center gap-2 py-3 px-3 text-xs font-medium border-b-2 transition-colors cursor-pointer ${
              activeTab === 'general'
                ? 'border-codex-accent text-codex-accent'
                : 'border-transparent text-slate-500 dark:text-zinc-400 hover:text-slate-900 dark:hover:text-zinc-200'
            }`}
          >
            <Sliders className="w-3.5 h-3.5" />
            Giao diện
          </button>
          <button
            onClick={() => {
              setActiveTab('engine');
              setIsEditingProvider(false);
            }}
            className={`flex items-center gap-2 py-3 px-3 text-xs font-medium border-b-2 transition-colors cursor-pointer ${
              activeTab === 'engine'
                ? 'border-codex-accent text-codex-accent'
                : 'border-transparent text-slate-500 dark:text-zinc-400 hover:text-slate-900 dark:hover:text-zinc-200'
            }`}
          >
            <Cpu className="w-3.5 h-3.5" />
            Engine & Khởi động
          </button>
          <button
            onClick={() => setActiveTab('providers')}
            className={`flex items-center gap-2 py-3 px-3 text-xs font-medium border-b-2 transition-colors cursor-pointer ${
              activeTab === 'providers'
                ? 'border-codex-accent text-codex-accent'
                : 'border-transparent text-slate-500 dark:text-zinc-400 hover:text-slate-900 dark:hover:text-zinc-200'
            }`}
          >
            <Server className="w-3.5 h-3.5" />
            Providers & Custom LLM
          </button>
        </div>

        {/* Modal Body */}
        <div className="flex-1 overflow-y-auto p-6 space-y-6">
          {/* TAB 1: Giao diện */}
          {activeTab === 'general' && (
            <div className="space-y-6">
              <div>
                <label className="text-xs font-semibold text-slate-900 dark:text-zinc-100 block mb-2">
                  Chủ đề giao diện (Theme)
                </label>
                <div className="grid grid-cols-2 gap-3">
                  <button
                    onClick={() => handleThemeSelect('light')}
                    className={`flex items-center gap-3 p-3.5 rounded-xl border transition-all cursor-pointer text-left ${
                      theme === 'light'
                        ? 'bg-surface-highlight border-codex-accent ring-2 ring-codex-accent/20'
                        : 'bg-surface border-border hover:border-slate-300 dark:hover:border-zinc-700'
                    }`}
                  >
                    <div className="p-2 rounded-lg bg-amber-500/10 text-amber-500 shrink-0">
                      <Sun className="w-5 h-5" />
                    </div>
                    <div>
                      <div className="text-xs font-medium text-slate-900 dark:text-zinc-100">Giao diện Sáng (Light)</div>
                      <div className="text-[11px] text-slate-500 dark:text-zinc-400">Tone trắng thanh lịch, tương phản cao</div>
                    </div>
                  </button>

                  <button
                    onClick={() => handleThemeSelect('dark')}
                    className={`flex items-center gap-3 p-3.5 rounded-xl border transition-all cursor-pointer text-left ${
                      theme === 'dark'
                        ? 'bg-surface-highlight border-codex-accent ring-2 ring-codex-accent/20'
                        : 'bg-surface border-border hover:border-slate-300 dark:hover:border-zinc-700'
                    }`}
                  >
                    <div className="p-2 rounded-lg bg-indigo-500/10 text-indigo-400 shrink-0">
                      <Moon className="w-5 h-5" />
                    </div>
                    <div>
                      <div className="text-xs font-medium text-slate-900 dark:text-zinc-100">Giao diện Tối (Dark)</div>
                      <div className="text-[11px] text-slate-500 dark:text-zinc-400">Tone đen xám dịu mắt, phong cách Codex</div>
                    </div>
                  </button>
                </div>
              </div>
            </div>
          )}

          {/* TAB 2: Engine & Khởi động */}
          {activeTab === 'engine' && (
            <div className="space-y-6">
              {/* Binary Path Section */}
              <div className="space-y-2">
                <label className="text-xs font-semibold text-slate-900 dark:text-zinc-100 flex items-center gap-1.5">
                  <Terminal className="w-3.5 h-3.5 text-codex-accent" />
                  Đường dẫn OMP Binary
                </label>
                <div className="p-3 bg-surface rounded-xl border border-border space-y-2.5">
                  <div className="flex items-center justify-between text-xs">
                    <span className="text-slate-500 dark:text-zinc-400">Đường dẫn tự phát hiện:</span>
                    <span className="font-mono text-[11px] text-slate-700 dark:text-zinc-300 max-w-[320px] truncate">
                      {installStatus?.binaryPath || 'Chưa tìm thấy'}
                    </span>
                  </div>
                  <div>
                    <label className="text-[11px] text-slate-500 dark:text-zinc-400 block mb-1">
                      Đường dẫn tùy chỉnh (Custom override):
                    </label>
                    <div className="flex gap-2">
                      <input
                        type="text"
                        value={customPathInput}
                        onChange={(e) => setCustomPathInput(e.target.value)}
                        placeholder="Ví dụ: /usr/local/bin/omp hoặc ~/.local/bin/omp"
                        className="flex-1 px-3 py-1.5 bg-surface-highlight border border-border rounded-lg text-xs font-mono text-slate-900 dark:text-zinc-100 placeholder-slate-400 focus:outline-none focus:border-codex-accent"
                      />
                      <button
                        onClick={handleBrowseBinary}
                        className="px-3 py-1.5 bg-surface hover:bg-surface-highlight border border-border rounded-lg text-xs font-medium text-slate-700 dark:text-zinc-300 transition-colors flex items-center gap-1.5 cursor-pointer"
                        title="Chọn file từ ổ cứng"
                      >
                        <FolderSearch className="w-3.5 h-3.5" />
                        Chọn file
                      </button>
                      <button
                        onClick={handleApplyCustomPath}
                        className="px-3 py-1.5 bg-codex-accent text-white rounded-lg text-xs font-medium hover:bg-codex-accent/90 transition-colors cursor-pointer"
                      >
                        Áp dụng
                      </button>
                    </div>
                  </div>
                </div>
              </div>

              {/* Default Model & Provider */}
              <div className="space-y-2">
                <label className="text-xs font-semibold text-slate-900 dark:text-zinc-100 flex items-center justify-between">
                  <span className="flex items-center gap-1.5">
                    <Brain className="w-3.5 h-3.5 text-codex-accent" />
                    Model & Provider mặc định khi khởi động
                  </span>
                  {!isCurrentModelInCatalog && (
                    <span className="text-[11px] text-amber-500 flex items-center gap-1 font-normal">
                      <AlertTriangle className="w-3 h-3" />
                      Model không có trong catalog hiện tại
                    </span>
                  )}
                </label>
                <div className="bg-surface rounded-xl border border-border p-3 space-y-2">
                  <select
                    value={currentModelValue}
                    onChange={handleModelSelect}
                    className="w-full px-3 py-2 bg-surface-highlight border border-border rounded-lg text-xs text-slate-900 dark:text-zinc-100 focus:outline-none focus:border-codex-accent cursor-pointer"
                  >
                    <option value="">(Mặc định của Engine / Cấu hình OMP)</option>
                    {Object.entries(groupedModels).map(([provider, models]) => (
                      <optgroup key={provider} label={provider.toUpperCase()}>
                        {models.map((m) => (
                          <option key={`${provider}:::${m.id}`} value={`${provider}:::${m.id}`}>
                            {m.name || m.id} {m.reasoning ? '🧠' : ''}
                          </option>
                        ))}
                      </optgroup>
                    ))}
                    {!isCurrentModelInCatalog && settings.defaultModel && settings.defaultProvider && (
                      <optgroup label="MODEL ĐÃ LƯU TRƯỚC ĐÓ">
                        <option value={currentModelValue}>
                          {settings.defaultModel} ({settings.defaultProvider})
                        </option>
                      </optgroup>
                    )}
                  </select>
                  <p className="text-[11px] text-slate-500 dark:text-zinc-400">
                    {availableModels.length > 0
                      ? `Đã tải ${availableModels.length} models từ catalog thật của Engine.`
                      : 'Chưa kết nối engine hoặc catalog rỗng. Sẽ tự động tải khi engine hoạt động.'}
                  </p>
                </div>
              </div>

              {/* Thinking Level */}
              <div className="space-y-2">
                <label className="text-xs font-semibold text-slate-900 dark:text-zinc-100 flex items-center gap-1.5">
                  <Brain className="w-3.5 h-3.5 text-indigo-400" />
                  Mức độ suy nghĩ mặc định (Thinking Level)
                </label>
                <div className="grid grid-cols-2 gap-2">
                  {THINKING_LEVELS.map((tl) => {
                    const isSelected = (settings.defaultThinkingLevel || thinkingLevel || 'off') === tl.id;
                    return (
                      <button
                        key={tl.id}
                        onClick={() => handleThinkingLevelSelect(tl.id)}
                        className={`p-2.5 rounded-lg border text-left transition-all cursor-pointer ${
                          isSelected
                            ? 'bg-surface-highlight border-codex-accent ring-1 ring-codex-accent/30'
                            : 'bg-surface border-border hover:border-slate-300 dark:hover:border-zinc-700'
                        }`}
                      >
                        <div className="text-xs font-medium text-slate-900 dark:text-zinc-100 flex items-center justify-between">
                          {tl.label}
                          {isSelected && <Check className="w-3.5 h-3.5 text-codex-accent" />}
                        </div>
                        <div className="text-[10.5px] text-slate-500 dark:text-zinc-400 mt-0.5">{tl.desc}</div>
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* Approval Mode */}
              <div className="space-y-2">
                <label className="text-xs font-semibold text-slate-900 dark:text-zinc-100 flex items-center gap-1.5">
                  <Shield className="w-3.5 h-3.5 text-emerald-500" />
                  Chế độ phê duyệt mặc định (Approval Mode)
                </label>
                <div className="space-y-2">
                  {APPROVAL_OPTIONS.map((opt) => {
                    const isSelected = (settings.approvalMode || 'always-ask') === opt.id;
                    return (
                      <button
                        key={opt.id}
                        onClick={() => handleApprovalModeSelect(opt.id)}
                        className={`w-full p-3 rounded-xl border text-left transition-all cursor-pointer flex items-center justify-between ${
                          isSelected
                            ? 'bg-surface-highlight border-codex-accent ring-1 ring-codex-accent/30'
                            : 'bg-surface border-border hover:border-slate-300 dark:hover:border-zinc-700'
                        }`}
                      >
                        <div>
                          <div className="text-xs font-medium text-slate-900 dark:text-zinc-100">{opt.label}</div>
                          <div className="text-[11px] text-slate-500 dark:text-zinc-400">{opt.desc}</div>
                        </div>
                        {isSelected && <Check className="w-4 h-4 text-codex-accent shrink-0 ml-3" />}
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* Auto Compaction */}
              <div className="p-3.5 bg-surface rounded-xl border border-border flex items-center justify-between">
                <div className="flex items-center gap-2.5">
                  <Database className="w-4 h-4 text-codex-accent shrink-0" />
                  <div>
                    <div className="text-xs font-semibold text-slate-900 dark:text-zinc-100">
                      Tự động nén ngữ cảnh (Auto-compaction)
                    </div>
                    <div className="text-[11px] text-slate-500 dark:text-zinc-400">
                      Tự động tóm tắt ngữ cảnh khi dung lượng token vượt quá ngưỡng cho phép
                    </div>
                  </div>
                </div>
                <button
                  onClick={handleAutoCompactionToggle}
                  className={`w-11 h-6 flex items-center rounded-full p-1 transition-colors cursor-pointer ${
                    settings.autoCompaction ? 'bg-codex-accent justify-end' : 'bg-slate-300 dark:bg-zinc-700 justify-start'
                  }`}
                >
                  <div className="w-4 h-4 rounded-full bg-white shadow-xs" />
                </button>
              </div>
            </div>
          )}

          {/* TAB 3: Providers & Custom LLM Management */}
          {activeTab === 'providers' && (
            <div className="space-y-6">
              {/* Thông báo quyền ghi EACCES nếu có */}
              {(!isConfigWritable || configError) && (
                <div className="p-3.5 bg-amber-500/10 border border-amber-500/30 rounded-xl space-y-2">
                  <div className="flex items-start gap-2 text-amber-600 dark:text-amber-400">
                    <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5" />
                    <div className="text-xs space-y-1">
                      <div className="font-semibold">Quyền truy cập models.yml bị hạn chế</div>
                      <p className="text-slate-600 dark:text-zinc-300">
                        {configError || `File ${modelsConfigPath} không thể ghi trực tiếp (thường do quyền root).`}
                      </p>
                    </div>
                  </div>
                  <div className="flex items-center justify-between bg-surface/80 rounded-lg p-2 border border-amber-500/20">
                    <code className="text-[11px] font-mono text-slate-800 dark:text-zinc-200 truncate">
                      sudo chown $USER {modelsConfigPath}
                    </code>
                    <button
                      onClick={() => handleCopyText(`sudo chown $USER ${modelsConfigPath}`)}
                      className="px-2 py-1 bg-surface-highlight hover:bg-surface border border-border rounded text-[11px] font-medium text-slate-700 dark:text-zinc-300 flex items-center gap-1 cursor-pointer shrink-0 ml-2"
                    >
                      {copiedText === `sudo chown $USER ${modelsConfigPath}` ? (
                        <>
                          <Check className="w-3 h-3 text-emerald-500" />
                          <span>Đã sao chép</span>
                        </>
                      ) : (
                        <>
                          <Copy className="w-3 h-3" />
                          <span>Copy lệnh</span>
                        </>
                      )}
                    </button>
                  </div>
                </div>
              )}

              {/* Thông báo đã lưu thành công */}
              {modelsSaveSuccess && (
                <div className="p-3 bg-emerald-500/10 border border-emerald-500/30 rounded-xl flex items-center justify-between">
                  <div className="flex items-center gap-2 text-xs text-emerald-600 dark:text-emerald-400 font-medium">
                    <Check className="w-4 h-4 shrink-0" />
                    <span>Đã lưu cấu hình vào models.yml thành công!</span>
                  </div>
                  {onRestartEngine && (
                    <button
                      onClick={handleRestartEngine}
                      disabled={isRestarting}
                      className="px-2.5 py-1 bg-codex-accent text-white rounded-lg text-xs font-medium hover:bg-codex-accent/90 transition-colors flex items-center gap-1 cursor-pointer disabled:opacity-50"
                    >
                      <RotateCw className={`w-3 h-3 ${isRestarting ? 'animate-spin' : ''}`} />
                      {isRestarting ? 'Đang restart...' : 'Khởi động lại Engine ngay'}
                    </button>
                  )}
                </div>
              )}

              {/* PHẦN 1: Custom LLM Providers (models.yml) */}
              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <div>
                    <h3 className="text-xs font-semibold text-slate-900 dark:text-zinc-100 flex items-center gap-1.5">
                      <Server className="w-3.5 h-3.5 text-codex-accent" />
                      Custom LLM Providers ({modelsConfigPath})
                    </h3>
                    <p className="text-[11px] text-slate-500 dark:text-zinc-400">
                      Cấu hình các provider tự host (LM Studio, Ollama, vLLM, OpenAI-compatible proxy)
                    </p>
                  </div>
                  {!isEditingProvider && (
                    <button
                      onClick={handleAddNewProvider}
                      className="px-3 py-1.5 bg-codex-accent text-white rounded-lg text-xs font-medium hover:bg-codex-accent/90 transition-colors flex items-center gap-1.5 cursor-pointer"
                    >
                      <Plus className="w-3.5 h-3.5" />
                      Thêm Provider
                    </button>
                  )}
                </div>

                {/* Form chỉnh sửa / thêm mới Provider */}
                {isEditingProvider && editingProvider && (
                  <div className="p-4 bg-surface rounded-xl border border-codex-accent/40 space-y-4 shadow-sm animate-fade-in">
                    <div className="flex items-center justify-between border-b border-border pb-2">
                      <span className="text-xs font-semibold text-slate-900 dark:text-zinc-100 flex items-center gap-1.5">
                        <Edit3 className="w-3.5 h-3.5 text-codex-accent" />
                        {editingOriginalId ? `Sửa Provider: ${editingOriginalId}` : 'Thêm Custom Provider Mới'}
                      </span>
                      <button
                        onClick={() => {
                          setIsEditingProvider(false);
                          setEditingProvider(null);
                        }}
                        className="text-slate-400 hover:text-slate-600 dark:hover:text-zinc-200"
                      >
                        <X className="w-4 h-4" />
                      </button>
                    </div>

                    <div className="grid grid-cols-2 gap-3">
                      <div>
                        <label className="text-[11px] font-medium text-slate-600 dark:text-zinc-300 block mb-1">
                          Provider ID (Slug duy nhất)*:
                        </label>
                        <input
                          type="text"
                          value={editingProvider.id}
                          onChange={(e) => setEditingProvider({ ...editingProvider, id: e.target.value })}
                          placeholder="Ví dụ: lmstudio-local hoặc vllm-prod"
                          className="w-full px-3 py-1.5 bg-surface-highlight border border-border rounded-lg text-xs font-mono text-slate-900 dark:text-zinc-100 focus:outline-none focus:border-codex-accent"
                        />
                      </div>

                      <div>
                        <label className="text-[11px] font-medium text-slate-600 dark:text-zinc-300 block mb-1">
                          Base URL*:
                        </label>
                        <input
                          type="text"
                          value={editingProvider.baseUrl}
                          onChange={(e) => setEditingProvider({ ...editingProvider, baseUrl: e.target.value })}
                          placeholder="Ví dụ: http://127.0.0.1:8040/v1"
                          className="w-full px-3 py-1.5 bg-surface-highlight border border-border rounded-lg text-xs font-mono text-slate-900 dark:text-zinc-100 focus:outline-none focus:border-codex-accent"
                        />
                      </div>
                    </div>

                    <div className="grid grid-cols-2 gap-3">
                      <div>
                        <label className="text-[11px] font-medium text-slate-600 dark:text-zinc-300 block mb-1">
                          API Protocol:
                        </label>
                        <input
                          type="text"
                          value={editingProvider.api || 'openai-completions'}
                          onChange={(e) => setEditingProvider({ ...editingProvider, api: e.target.value })}
                          placeholder="openai-completions"
                          className="w-full px-3 py-1.5 bg-surface-highlight border border-border rounded-lg text-xs font-mono text-slate-900 dark:text-zinc-100 focus:outline-none focus:border-codex-accent"
                        />
                      </div>

                      <div>
                        <label className="text-[11px] font-medium text-slate-600 dark:text-zinc-300 block mb-1">
                          API Key:
                        </label>
                        <div className="relative">
                          <input
                            type={showApiKey ? 'text' : 'password'}
                            value={editingProvider.apiKey || ''}
                            onChange={(e) => setEditingProvider({ ...editingProvider, apiKey: e.target.value })}
                            placeholder="Dán API key trực tiếp (hoặc tên env var / !lệnh)"
                            autoComplete="off"
                            className="w-full pl-3 pr-9 py-1.5 bg-surface-highlight border border-border rounded-lg text-xs font-mono text-slate-900 dark:text-zinc-100 focus:outline-none focus:border-codex-accent"
                          />
                          <button
                            type="button"
                            onClick={() => setShowApiKey(!showApiKey)}
                            className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 dark:hover:text-zinc-200 cursor-pointer"
                            title={showApiKey ? 'Ẩn key' : 'Hiện key'}
                          >
                            {showApiKey ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
                          </button>
                        </div>
                        <span className="text-[10px] text-slate-400 dark:text-zinc-500 mt-0.5 block">
                          OMP hỗ trợ cả 3 dạng: key literal (lưu vào models.yml), tên biến môi trường (vd: OPENAI_API_KEY), hoặc lệnh shell (vd: !op read ...).
                        </span>
                      </div>
                    </div>

                    <div className="flex items-center gap-6 pt-1">
                      <label className="flex items-center gap-2 text-xs text-slate-700 dark:text-zinc-300 cursor-pointer">
                        <input
                          type="checkbox"
                          checked={editingProvider.authHeader !== false}
                          onChange={(e) => setEditingProvider({ ...editingProvider, authHeader: e.target.checked })}
                          className="rounded text-codex-accent focus:ring-codex-accent"
                        />
                        <span>Gửi Authorization Header (Bearer token)</span>
                      </label>

                      <label className="flex items-center gap-2 text-xs text-slate-700 dark:text-zinc-300 cursor-pointer">
                        <input
                          type="checkbox"
                          checked={editingProvider.compat?.supportsUsageInStreaming === true}
                          onChange={(e) =>
                            setEditingProvider({
                              ...editingProvider,
                              compat: { ...editingProvider.compat, supportsUsageInStreaming: e.target.checked },
                            })
                          }
                          className="rounded text-codex-accent focus:ring-codex-accent"
                        />
                        <span>Hỗ trợ token usage khi streaming</span>
                      </label>
                    </div>

                    <div className="grid grid-cols-3 gap-3 pt-1">
                      <div>
                        <label className="text-xs font-medium text-slate-700 dark:text-zinc-300 block mb-1">
                          Chế độ xác thực
                        </label>
                        <select
                          value={editingProvider.auth || ''}
                          onChange={(e) =>
                            setEditingProvider({
                              ...editingProvider,
                              auth: e.target.value === '' ? undefined : (e.target.value as 'apiKey' | 'none' | 'oauth'),
                            })
                          }
                          className="w-full px-2.5 py-1.5 bg-surface border border-border rounded-lg text-xs text-slate-900 dark:text-zinc-100 focus:outline-none focus:border-codex-accent cursor-pointer"
                        >
                          <option value="">API Key (mặc định)</option>
                          <option value="none">Không cần xác thực (none)</option>
                          <option value="oauth">OAuth</option>
                        </select>
                      </div>

                      <div>
                        <label className="text-xs font-medium text-slate-700 dark:text-zinc-300 block mb-1">
                          Tự phát hiện model (discovery)
                        </label>
                        <select
                          value={editingProvider.discovery?.type || ''}
                          onChange={(e) =>
                            setEditingProvider({
                              ...editingProvider,
                              discovery: e.target.value === ''
                                ? undefined
                                : { ...editingProvider.discovery, type: e.target.value as CustomProviderDiscoveryType },
                            })
                          }
                          className="w-full px-2.5 py-1.5 bg-surface border border-border rounded-lg text-xs text-slate-900 dark:text-zinc-100 focus:outline-none focus:border-codex-accent cursor-pointer"
                        >
                          <option value="">Tắt</option>
                          {DISCOVERY_TYPE_OPTIONS.map((dt) => (
                            <option key={dt} value={dt}>{dt}</option>
                          ))}
                        </select>
                      </div>

                      <div>
                        <label className="text-xs font-medium text-slate-700 dark:text-zinc-300 block mb-1">
                          Discovery timeout (ms)
                        </label>
                        <input
                          type="number"
                          min="1"
                          disabled={!editingProvider.discovery?.type}
                          value={editingProvider.discovery?.timeoutMs ?? ''}
                          onChange={(e) => {
                            if (!editingProvider.discovery?.type) return;
                            const num = e.target.value === '' ? undefined : Number(e.target.value);
                            setEditingProvider({
                              ...editingProvider,
                              discovery: {
                                ...editingProvider.discovery,
                                timeoutMs: num && num > 0 ? num : undefined,
                              },
                            });
                          }}
                          placeholder="Mặc định OMP"
                          className="w-full px-2.5 py-1.5 bg-surface border border-border rounded-lg text-xs font-mono text-slate-900 dark:text-zinc-100 focus:outline-none focus:border-codex-accent disabled:opacity-40"
                        />
                      </div>
                    </div>

                    <div>
                      <label className="text-xs font-medium text-slate-700 dark:text-zinc-300 block mb-1">
                        HTTP Headers tùy chỉnh
                      </label>
                      <textarea
                        value={headersText}
                        onChange={(e) => setHeadersText(e.target.value)}
                        placeholder={'Mỗi dòng một header, dạng Tên: Giá trị\nX-Api-Version: 2024-01'}
                        rows={2}
                        className="w-full px-2.5 py-1.5 bg-surface border border-border rounded-lg text-xs font-mono text-slate-900 dark:text-zinc-100 focus:outline-none focus:border-codex-accent resize-y"
                      />
                    </div>

                    {/* Danh sách Models của Provider này */}
                    <div className="space-y-2 border-t border-border pt-3">
                      <div className="flex items-center justify-between">
                        <label className="text-xs font-semibold text-slate-900 dark:text-zinc-100">
                          Danh sách Models thuộc Provider này:
                        </label>
                        <button
                          type="button"
                          onClick={handleAddModelRow}
                          className="text-[11px] text-codex-accent hover:underline flex items-center gap-1 cursor-pointer"
                        >
                          <Plus className="w-3 h-3" />
                          Thêm dòng model
                        </button>
                      </div>

                      <div className="space-y-2">
                        {(editingProvider.models || []).map((m, idx) => (
                          <div key={idx} className="bg-surface-highlight/60 p-2 rounded-lg border border-border space-y-2">
                            <div className="flex items-center gap-2">
                              <input
                                type="text"
                                value={m.id}
                                onChange={(e) => handleUpdateModelRow(idx, 'id', e.target.value)}
                                placeholder="Model ID (bắt buộc, vd: gemini-3.7-flash)"
                                className="flex-2 px-2.5 py-1 bg-surface border border-border rounded text-xs font-mono text-slate-900 dark:text-zinc-100 focus:outline-none focus:border-codex-accent"
                              />
                              <input
                                type="text"
                                value={m.name || ''}
                                onChange={(e) => handleUpdateModelRow(idx, 'name', e.target.value)}
                                placeholder="Tên hiển thị (vd: Gemini 3.7)"
                                className="flex-2 px-2.5 py-1 bg-surface border border-border rounded text-xs text-slate-900 dark:text-zinc-100 focus:outline-none focus:border-codex-accent"
                              />
                              <input
                                type="number"
                                value={m.contextWindow || ''}
                                onChange={(e) => handleUpdateModelRow(idx, 'contextWindow', e.target.value ? Number(e.target.value) : undefined)}
                                placeholder="Context (vd: 300000)"
                                className="w-24 px-2 py-1 bg-surface border border-border rounded text-xs font-mono text-slate-900 dark:text-zinc-100 focus:outline-none focus:border-codex-accent"
                              />
                              <input
                                type="number"
                                value={m.maxTokens || ''}
                                onChange={(e) => handleUpdateModelRow(idx, 'maxTokens', e.target.value ? Number(e.target.value) : undefined)}
                                placeholder="Max Tokens"
                                className="w-24 px-2 py-1 bg-surface border border-border rounded text-xs font-mono text-slate-900 dark:text-zinc-100 focus:outline-none focus:border-codex-accent"
                              />
                              <button
                                type="button"
                                onClick={() => handleRemoveModelRow(idx)}
                                className="p-1 text-slate-400 hover:text-red-500 transition-colors cursor-pointer"
                                title="Xóa model này"
                              >
                                <Trash2 className="w-3.5 h-3.5" />
                              </button>
                            </div>

                            <div className="flex items-center gap-4 flex-wrap pl-0.5">
                              <label className="flex items-center gap-1.5 text-[11px] text-slate-600 dark:text-zinc-300 cursor-pointer" title="Model nhận được ảnh đầu vào (vision)">
                                <input
                                  type="checkbox"
                                  checked={m.input?.includes('image') === true}
                                  onChange={(e) =>
                                    handleUpdateModelRow(idx, 'input', e.target.checked ? ['text', 'image'] : undefined)
                                  }
                                  className="rounded text-codex-accent focus:ring-codex-accent"
                                />
                                <span>Image input</span>
                              </label>

                              <label className="flex items-center gap-1.5 text-[11px] text-slate-600 dark:text-zinc-300 cursor-pointer" title="Model có reasoning/thinking block">
                                <input
                                  type="checkbox"
                                  checked={m.reasoning === true}
                                  onChange={(e) =>
                                    handleUpdateModelRow(idx, 'reasoning', e.target.checked ? true : undefined)
                                  }
                                  className="rounded text-codex-accent focus:ring-codex-accent"
                                />
                                <span>Reasoning</span>
                              </label>

                              <label className="flex items-center gap-1.5 text-[11px] text-slate-600 dark:text-zinc-300 cursor-pointer" title="Bỏ chọn nếu model không hỗ trợ tool calling">
                                <input
                                  type="checkbox"
                                  checked={m.supportsTools !== false}
                                  onChange={(e) =>
                                    handleUpdateModelRow(idx, 'supportsTools', e.target.checked ? undefined : false)
                                  }
                                  className="rounded text-codex-accent focus:ring-codex-accent"
                                />
                                <span>Tool calling</span>
                              </label>

                              <div className="flex items-center gap-1.5 ml-auto" title="Giá USD trên 1 triệu token (để trống nếu miễn phí)">
                                <span className="text-[10px] text-slate-400 dark:text-zinc-500">$/1M:</span>
                                {(['input', 'output', 'cacheRead', 'cacheWrite'] as const).map((costKey) => (
                                  <input
                                    key={costKey}
                                    type="number"
                                    step="0.01"
                                    min="0"
                                    value={m.cost?.[costKey] ?? ''}
                                    onChange={(e) =>
                                      handleUpdateModelCost(idx, costKey, e.target.value === '' ? undefined : Number(e.target.value))
                                    }
                                    placeholder={{ input: 'In', output: 'Out', cacheRead: 'C.Read', cacheWrite: 'C.Write' }[costKey]}
                                    className="w-16 px-1.5 py-0.5 bg-surface border border-border rounded text-[10.5px] font-mono text-slate-900 dark:text-zinc-100 focus:outline-none focus:border-codex-accent"
                                  />
                                ))}
                              </div>
                            </div>

                            <div className="flex items-center gap-4 flex-wrap pl-0.5">
                              <div className="flex items-center gap-1.5" title="Hệ số nhân premium usage của OMP (để trống = 1)">
                                <span className="text-[10px] text-slate-400 dark:text-zinc-500">×Premium:</span>
                                <input
                                  type="number"
                                  step="0.1"
                                  min="0"
                                  value={m.premiumMultiplier ?? ''}
                                  onChange={(e) => {
                                    const num = e.target.value === '' ? undefined : Number(e.target.value);
                                    handleUpdateModelRow(idx, 'premiumMultiplier', num !== undefined && num > 0 ? num : undefined);
                                  }}
                                  placeholder="1"
                                  className="w-14 px-1.5 py-0.5 bg-surface border border-border rounded text-[10.5px] font-mono text-slate-900 dark:text-zinc-100 focus:outline-none focus:border-codex-accent"
                                />
                              </div>

                              <label className="flex items-center gap-1.5 text-[11px] text-slate-600 dark:text-zinc-300 cursor-pointer" title="Không gửi max_output_tokens trong request (một số API yêu cầu)">
                                <input
                                  type="checkbox"
                                  checked={m.omitMaxOutputTokens === true}
                                  onChange={(e) =>
                                    handleUpdateModelRow(idx, 'omitMaxOutputTokens', e.target.checked ? true : undefined)
                                  }
                                  className="rounded text-codex-accent focus:ring-codex-accent"
                                />
                                <span>Bỏ max_output_tokens</span>
                              </label>

                              <div className="flex items-center gap-1.5" title="Cấu hình mức thinking/reasoning cho model">
                                <span className="text-[10px] text-slate-400 dark:text-zinc-500">Thinking:</span>
                                <select
                                  value={m.thinking?.mode || ''}
                                  onChange={(e) =>
                                    handleUpdateModelThinking(
                                      idx,
                                      e.target.value === ''
                                        ? undefined
                                        : { mode: e.target.value as CustomThinkingMode }
                                    )
                                  }
                                  className="px-1.5 py-0.5 bg-surface border border-border rounded text-[10.5px] text-slate-900 dark:text-zinc-100 focus:outline-none focus:border-codex-accent cursor-pointer"
                                >
                                  <option value="">Tắt</option>
                                  {THINKING_MODE_OPTIONS.map((tm) => (
                                    <option key={tm.id} value={tm.id}>{tm.label}</option>
                                  ))}
                                </select>
                              </div>
                            </div>

                            {m.thinking?.mode && (
                              <div className="flex items-center gap-3 flex-wrap pl-0.5">
                                <span className="text-[10px] text-slate-400 dark:text-zinc-500">Efforts:</span>
                                {EFFORT_LEVELS.map((lvl) => (
                                  <label key={lvl} className="flex items-center gap-1 text-[10.5px] text-slate-600 dark:text-zinc-300 cursor-pointer">
                                    <input
                                      type="checkbox"
                                      checked={m.thinking?.efforts?.includes(lvl) === true}
                                      onChange={(e) => {
                                        const current = m.thinking?.efforts || [];
                                        const next = e.target.checked
                                          ? EFFORT_LEVELS.filter((l) => l === lvl || current.includes(l))
                                          : current.filter((l) => l !== lvl);
                                        handleUpdateModelThinking(idx, { efforts: next.length > 0 ? next : undefined });
                                      }}
                                      className="rounded text-codex-accent focus:ring-codex-accent"
                                    />
                                    <span>{lvl}</span>
                                  </label>
                                ))}

                                <div className="flex items-center gap-1.5 ml-auto">
                                  <span className="text-[10px] text-slate-400 dark:text-zinc-500">Mặc định:</span>
                                  <select
                                    value={m.thinking?.defaultLevel || ''}
                                    onChange={(e) =>
                                      handleUpdateModelThinking(idx, {
                                        defaultLevel: e.target.value === '' ? undefined : (e.target.value as OmpEffortLevel),
                                      })
                                    }
                                    className="px-1.5 py-0.5 bg-surface border border-border rounded text-[10.5px] text-slate-900 dark:text-zinc-100 focus:outline-none focus:border-codex-accent cursor-pointer"
                                  >
                                    <option value="">—</option>
                                    {(m.thinking?.efforts || []).map((lvl) => (
                                      <option key={lvl} value={lvl}>{lvl}</option>
                                    ))}
                                  </select>
                                </div>

                                {!(m.thinking?.efforts && m.thinking.efforts.length > 0) && (
                                  <span className="text-[10px] text-amber-500">Chọn ít nhất 1 effort, nếu không thinking sẽ không được lưu.</span>
                                )}
                              </div>
                            )}
                          </div>
                        ))}
                        {(!editingProvider.models || editingProvider.models.length === 0) && (
                          <div className="text-[11px] text-slate-400 dark:text-zinc-500 italic py-1">
                            Chưa có model nào. Nhấn "+ Thêm dòng model" ở trên.
                          </div>
                        )}
                      </div>
                    </div>

                    <div className="flex justify-end gap-2 pt-2 border-t border-border">
                      <button
                        type="button"
                        onClick={() => {
                          setIsEditingProvider(false);
                          setEditingProvider(null);
                        }}
                        className="px-3 py-1.5 bg-surface hover:bg-surface-highlight border border-border rounded-lg text-xs font-medium text-slate-700 dark:text-zinc-300 transition-colors cursor-pointer"
                      >
                        Hủy
                      </button>
                      <button
                        type="button"
                        onClick={handleSaveEditingProvider}
                        className="px-4 py-1.5 bg-codex-accent text-white rounded-lg text-xs font-medium hover:bg-codex-accent/90 transition-colors cursor-pointer"
                      >
                        Lưu Provider vào models.yml
                      </button>
                    </div>
                  </div>
                )}

                {/* Danh sách các custom providers đã cấu hình */}
                <div className="space-y-2.5">
                  {customProviders.map((cp) => (
                    <div
                      key={cp.id}
                      className="p-3.5 bg-surface rounded-xl border border-border space-y-2.5 hover:border-slate-300 dark:hover:border-zinc-700 transition-colors"
                    >
                      <div className="flex items-start justify-between">
                        <div className="space-y-1">
                          <div className="flex items-center gap-2">
                            <span className="text-xs font-bold text-slate-900 dark:text-zinc-100 font-mono">
                              {cp.id}
                            </span>
                            <span className="text-[10.5px] px-2 py-0.5 rounded-md bg-surface-highlight border border-border font-mono text-slate-600 dark:text-zinc-300">
                              {cp.api || 'openai-completions'}
                            </span>
                          </div>
                          <div className="text-[11px] font-mono text-slate-500 dark:text-zinc-400 flex items-center gap-1">
                            <Globe className="w-3 h-3 text-slate-400" />
                            <span>{cp.baseUrl}</span>
                          </div>
                        </div>

                        <div className="flex items-center gap-1.5">
                          <button
                            onClick={() => handleEditProvider(cp)}
                            className="p-1.5 rounded-lg hover:bg-surface-highlight text-slate-500 hover:text-slate-900 dark:hover:text-zinc-100 transition-colors cursor-pointer"
                            title="Sửa provider này"
                          >
                            <Edit3 className="w-3.5 h-3.5" />
                          </button>
                          <button
                            onClick={() => handleDeleteProvider(cp.id)}
                            className="p-1.5 rounded-lg hover:bg-surface-highlight text-slate-400 hover:text-red-500 transition-colors cursor-pointer"
                            title="Xóa provider này"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      </div>

                      {/* Trạng thái biến môi trường API Key */}
                      <div className="flex items-center gap-3 text-xs pt-1 border-t border-border/50">
                        {cp.apiKey ? (
                          <div className="flex items-center gap-1.5">
                            <KeyRound className="w-3.5 h-3.5 text-slate-400" />
                            <span className="font-mono text-[11px] text-slate-700 dark:text-zinc-300">
                              {classifyApiKey(cp) === 'literal' ? maskSecret(cp.apiKey) : cp.apiKey}
                            </span>
                            {classifyApiKey(cp) === 'env-ok' && (
                              <span className="px-1.5 py-0.5 rounded text-[10px] font-medium bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border border-emerald-500/20">
                                ✓ Env var đã có trong process.env
                              </span>
                            )}
                            {classifyApiKey(cp) === 'env-missing' && (
                              <span className="px-1.5 py-0.5 rounded text-[10px] font-medium bg-amber-500/10 text-amber-600 dark:text-amber-400 border border-amber-500/20">
                                ⚠ Biến môi trường chưa được đặt
                              </span>
                            )}
                            {classifyApiKey(cp) === 'literal' && (
                              <span className="px-1.5 py-0.5 rounded text-[10px] font-medium bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border border-emerald-500/20">
                                ✓ Key lưu trong models.yml
                              </span>
                            )}
                            {classifyApiKey(cp) === 'command' && (
                              <span className="px-1.5 py-0.5 rounded text-[10px] font-medium bg-sky-500/10 text-sky-600 dark:text-sky-400 border border-sky-500/20">
                                ⚡ Key lấy từ lệnh shell
                              </span>
                            )}
                          </div>
                        ) : (
                          <div className="flex items-center gap-1 text-[11px] text-slate-400 dark:text-zinc-500">
                            <KeyRound className="w-3 h-3" />
                            <span>Không yêu cầu API Key</span>
                          </div>
                        )}

                        <div className="text-[11px] text-slate-500 dark:text-zinc-400 ml-auto">
                          {cp.models?.length || 0} models đã đăng ký
                        </div>
                      </div>

                      {/* Chips danh sách models */}
                      {cp.models && cp.models.length > 0 && (
                        <div className="flex flex-wrap gap-1.5 pt-1">
                          {cp.models.map((m) => (
                            <span
                              key={m.id}
                              className="text-[10.5px] px-2 py-0.5 bg-surface-highlight rounded-md border border-border text-slate-700 dark:text-zinc-300 font-mono"
                            >
                              {m.name || m.id}
                              {m.contextWindow ? ` (${Math.round(m.contextWindow / 1000)}k)` : ''}
                            </span>
                          ))}
                        </div>
                      )}
                    </div>
                  ))}

                  {customProviders.length === 0 && (
                    <div className="p-6 bg-surface rounded-xl border border-dashed border-border text-center space-y-2">
                      <Server className="w-6 h-6 text-slate-400 mx-auto" />
                      <div className="text-xs font-medium text-slate-600 dark:text-zinc-400">
                        Chưa có custom provider nào trong {modelsConfigPath}
                      </div>
                      <button
                        onClick={handleAddNewProvider}
                        className="text-xs text-codex-accent hover:underline font-medium cursor-pointer"
                      >
                        + Thêm provider đầu tiên
                      </button>
                    </div>
                  )}
                </div>
              </div>

              {/* PHẦN 2: Models khả dụng từ Engine RPC (Available Models) */}
              <div className="space-y-3 pt-4 border-t border-border">
                <div>
                  <h3 className="text-xs font-semibold text-slate-900 dark:text-zinc-100 flex items-center gap-1.5">
                    <Boxes className="w-3.5 h-3.5 text-indigo-400" />
                    Models đang khả dụng trong OMP Engine ({availableModels.length} models)
                  </h3>
                  <p className="text-[11px] text-slate-500 dark:text-zinc-400">
                    Danh sách models thực tế nhận diện được từ engine RPC (bao gồm builtin & custom)
                  </p>
                </div>

                <div className="bg-surface rounded-xl border border-border overflow-hidden">
                  {Object.keys(groupedModels).length > 0 ? (
                    <div className="divide-y divide-border">
                      {Object.entries(groupedModels).map(([prov, models]) => (
                        <div key={prov} className="p-3 space-y-2">
                          <div className="text-xs font-semibold text-slate-900 dark:text-zinc-100 flex items-center justify-between">
                            <span className="font-mono text-codex-accent uppercase">{prov}</span>
                            <span className="text-[10.5px] text-slate-400 font-normal">{models.length} models</span>
                          </div>
                          <div className="grid grid-cols-2 gap-2">
                            {models.map((m) => (
                              <div
                                key={m.id}
                                className="p-2 bg-surface-highlight/70 rounded-lg border border-border text-left"
                              >
                                <div className="text-xs font-medium text-slate-800 dark:text-zinc-200 truncate">
                                  {m.name || m.id} {m.reasoning ? '🧠' : ''}
                                </div>
                                <div className="text-[10px] font-mono text-slate-500 dark:text-zinc-400 flex items-center justify-between mt-0.5">
                                  <span className="truncate">{m.id}</span>
                                  {m.contextWindow && <span>{Math.round(m.contextWindow / 1000)}k ctx</span>}
                                </div>
                              </div>
                            ))}
                          </div>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <div className="p-6 text-center text-xs text-slate-500 dark:text-zinc-400">
                      Engine chưa chạy hoặc chưa tải được danh sách models.
                    </div>
                  )}
                </div>
              </div>

              {/* PHẦN 3: Danh sách Dịch vụ Login OAuth (~70 mục) */}
              <div className="space-y-3 pt-4 border-t border-border">
                <div className="flex items-center justify-between">
                  <div>
                    <h3 className="text-xs font-semibold text-slate-900 dark:text-zinc-100 flex items-center gap-1.5">
                      <Lock className="w-3.5 h-3.5 text-emerald-500" />
                      Dịch vụ Đăng nhập & OAuth ({loginProviders.length} dịch vụ)
                    </h3>
                    <p className="text-[11px] text-slate-500 dark:text-zinc-400">
                      Bấm "Đăng nhập" để mở trình duyệt và hoàn tất xác thực OAuth trực tiếp từ ứng dụng.
                    </p>
                  </div>
                </div>

                {/* Hướng dẫn đăng nhập Terminal */}
                <div className="p-3 bg-surface rounded-xl border border-border space-y-2">
                  <div className="flex items-center justify-between text-xs">
                    <span className="text-slate-600 dark:text-zinc-300 font-medium flex items-center gap-1.5">
                      <Terminal className="w-3.5 h-3.5 text-codex-accent" />
                      Cách khác: đăng nhập thủ công qua Terminal
                    </span>
                    <button
                      onClick={() => handleCopyText('omp')}
                      className="px-2.5 py-1 bg-surface-highlight hover:bg-surface border border-border rounded text-xs font-medium text-slate-700 dark:text-zinc-300 flex items-center gap-1 cursor-pointer"
                    >
                      {copiedText === 'omp' ? (
                        <>
                          <Check className="w-3 h-3 text-emerald-500" />
                          <span>Đã copy "omp"</span>
                        </>
                      ) : (
                        <>
                          <Copy className="w-3 h-3" />
                          <span>Copy "omp"</span>
                        </>
                      )}
                    </button>
                  </div>
                  <p className="text-[11px] text-slate-500 dark:text-zinc-400">
                    Gõ <code className="px-1 py-0.5 bg-surface-highlight rounded font-mono text-codex-accent">/login</code> bên trong giao diện dòng lệnh OMP để chọn nhà cung cấp và hoàn tất đăng nhập OAuth.
                  </p>
                </div>

                {/* Trạng thái phiên đăng nhập OAuth */}
                {authLogin && (
                  <div
                    className={`p-3 rounded-xl border space-y-2 ${
                      authLogin.status === 'success'
                        ? 'bg-emerald-500/10 border-emerald-500/30'
                        : authLogin.status === 'error'
                          ? 'bg-red-500/10 border-red-500/30'
                          : 'bg-surface border-border'
                    }`}
                  >
                    <div className="flex items-center justify-between gap-2 text-xs">
                      <span className="flex items-center gap-1.5 font-medium text-slate-700 dark:text-zinc-300">
                        {isAuthLoginPending && (
                          <RotateCw className="w-3.5 h-3.5 animate-spin text-codex-accent" />
                        )}
                        {authLogin.status === 'success' && (
                          <Check className="w-3.5 h-3.5 text-emerald-500" />
                        )}
                        {authLogin.status === 'error' && (
                          <XCircle className="w-3.5 h-3.5 text-red-500" />
                        )}
                        {authLogin.status === 'started' && `Đang khởi tạo đăng nhập "${authLogin.providerId}"...`}
                        {authLogin.status === 'awaiting-browser' && `Đã mở trình duyệt — hoàn tất xác thực "${authLogin.providerId}" rồi quay lại đây.`}
                        {authLogin.status === 'success' && `Đăng nhập "${authLogin.providerId}" thành công!`}
                        {authLogin.status === 'error' && `Đăng nhập "${authLogin.providerId}" thất bại.`}
                        {authLogin.status === 'cancelled' && `Đã hủy đăng nhập "${authLogin.providerId}".`}
                      </span>
                      {isAuthLoginPending ? (
                        <button
                          onClick={handleCancelAuthLogin}
                          className="px-2.5 py-1 rounded-lg text-[11px] font-medium bg-surface-highlight hover:bg-surface border border-border text-slate-600 dark:text-zinc-300 cursor-pointer"
                        >
                          Hủy
                        </button>
                      ) : (
                        <button
                          onClick={() => setAuthLogin(null)}
                          className="px-2.5 py-1 rounded-lg text-[11px] font-medium text-slate-500 dark:text-zinc-400 hover:text-slate-800 dark:hover:text-zinc-200 cursor-pointer"
                        >
                          Đóng
                        </button>
                      )}
                    </div>
                    {authLogin.status === 'error' && authLogin.message && (
                      <p className="text-[11px] text-red-600 dark:text-red-400 font-mono break-all">
                        {authLogin.message}
                      </p>
                    )}
                    {authLogin.status === 'awaiting-browser' && (
                      <div className="flex gap-2">
                        <input
                          type="text"
                          value={authCodeInput}
                          onChange={(e) => setAuthCodeInput(e.target.value)}
                          onKeyDown={(e) => e.key === 'Enter' && handleSubmitAuthCode()}
                          placeholder="Nếu trình duyệt không tự quay lại: dán redirect URL hoặc mã xác thực vào đây"
                          className="flex-1 px-3 py-1.5 text-[11px] rounded-lg border border-border bg-panel text-slate-800 dark:text-zinc-200 outline-none font-mono focus:border-codex-accent"
                        />
                        <button
                          onClick={handleSubmitAuthCode}
                          disabled={!authCodeInput.trim()}
                          className="px-3 py-1.5 text-[11px] font-semibold bg-surface-highlight hover:bg-surface text-slate-800 dark:text-zinc-200 rounded-lg border border-border disabled:opacity-40 cursor-pointer"
                        >
                          Gửi
                        </button>
                      </div>
                    )}
                  </div>
                )}

                {/* Tìm kiếm Login Providers */}
                <div className="relative">
                  <Search className="w-3.5 h-3.5 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
                  <input
                    type="text"
                    value={loginSearchQuery}
                    onChange={(e) => setLoginSearchQuery(e.target.value)}
                    placeholder="Tìm kiếm dịch vụ login (vd: openai, claude, github, copilot, gemini, cursor...)"
                    className="w-full pl-9 pr-3 py-1.5 bg-surface border border-border rounded-lg text-xs text-slate-900 dark:text-zinc-100 placeholder-slate-400 focus:outline-none focus:border-codex-accent"
                  />
                </div>

                {/* Danh sách Services */}
                <div className="max-h-48 overflow-y-auto bg-surface rounded-xl border border-border divide-y divide-border">
                  {filteredLoginProviders.map((lp) => (
                    <div
                      key={lp.id}
                      className="px-3.5 py-2 flex items-center justify-between text-xs hover:bg-surface-highlight/50 transition-colors"
                    >
                      <div className="flex items-center gap-2">
                        <div>
                          <div className="font-medium text-slate-800 dark:text-zinc-200">{lp.name}</div>
                          <div className="text-[10px] font-mono text-slate-400 dark:text-zinc-500">{lp.id}</div>
                        </div>
                        {authedProviders.includes(lp.id) && (
                          <span className="px-1.5 py-0.5 rounded bg-green-500/10 text-green-600 dark:text-green-400 text-[10px] font-medium border border-green-500/30">
                            ✓ Đã đăng nhập
                          </span>
                        )}
                      </div>
                      <button
                        onClick={() => handleStartAuthLogin(lp)}
                        disabled={isAuthLoginPending}
                        className={`px-2 py-1 border rounded text-[10.5px] font-medium flex items-center gap-1 cursor-pointer disabled:opacity-40 disabled:cursor-default ${
                          authLogin?.providerId === lp.id && isAuthLoginPending
                            ? 'bg-codex-accent/10 border-codex-accent/40 text-codex-accent'
                            : 'bg-surface-highlight hover:bg-surface border-border text-slate-600 dark:text-zinc-300'
                        }`}
                        title="Đăng nhập OAuth qua trình duyệt"
                      >
                        {authLogin?.providerId === lp.id && isAuthLoginPending ? (
                          <RotateCw className="w-3 h-3 animate-spin" />
                        ) : (
                          <LogIn className="w-3 h-3" />
                        )}
                        <span>
                          {authLogin?.providerId === lp.id && isAuthLoginPending
                            ? 'Đang chờ...'
                            : authedProviders.includes(lp.id)
                              ? 'Đăng nhập lại'
                              : 'Đăng nhập'}
                        </span>
                      </button>
                    </div>
                  ))}
                  {filteredLoginProviders.length === 0 && (
                    <div className="p-4 text-center text-xs text-slate-400 dark:text-zinc-500">
                      Không tìm thấy dịch vụ login phù hợp với từ khóa "{loginSearchQuery}".
                    </div>
                  )}
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Modal Footer / Restart Banner */}
        <div className="p-4 border-t border-border bg-surface flex items-center justify-between">
          <div className="flex items-center gap-2">
            {hasEngineChanged && (
              <span className="text-xs text-amber-600 dark:text-amber-400 flex items-center gap-1.5 font-medium">
                <AlertTriangle className="w-3.5 h-3.5 shrink-0" />
                Thay đổi sẽ có hiệu lực khi khởi động lại engine.
              </span>
            )}
          </div>
          <div className="flex items-center gap-2.5">
            {hasEngineChanged && onRestartEngine && (
              <button
                onClick={handleRestartEngine}
                disabled={isRestarting}
                className="px-3 py-1.5 bg-codex-accent text-white rounded-lg text-xs font-medium hover:bg-codex-accent/90 transition-colors flex items-center gap-1.5 cursor-pointer disabled:opacity-50"
              >
                <RotateCw className={`w-3.5 h-3.5 ${isRestarting ? 'animate-spin' : ''}`} />
                {isRestarting ? 'Đang khởi động lại...' : isEngineRunning ? 'Khởi động lại Engine ngay' : 'Khởi động Engine ngay'}
              </button>
            )}
            <button
              onClick={onClose}
              className="px-4 py-1.5 bg-surface hover:bg-surface-highlight border border-border rounded-lg text-xs font-medium text-slate-700 dark:text-zinc-300 transition-colors cursor-pointer"
            >
              Đóng
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
