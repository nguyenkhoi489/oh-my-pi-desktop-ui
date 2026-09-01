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
  LoginProviderItem,
} from '../../types';

interface SettingsModalProps {
  isOpen: boolean;
  onClose: () => void;
  theme: ThemeMode;
  onThemeChange: (theme: ThemeMode) => void;
  installStatus?: OmpInstallStatus | null;
  onSelectBinaryFile?: () => Promise<string | null>;
  onSetCustomBinaryPath?: (path: string) => Promise<void | OmpInstallStatus>;
  availableModels: OmpModelInfo[];
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
  const [isEditingProvider, setIsEditingProvider] = useState<boolean>(false);
  const [editingProvider, setEditingProvider] = useState<CustomProviderConfig | null>(null);
  const [editingOriginalId, setEditingOriginalId] = useState<string | null>(null);
  const [copiedText, setCopiedText] = useState<string | null>(null);
  const [modelsSaveSuccess, setModelsSaveSuccess] = useState<boolean>(false);

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

  useEffect(() => {
    if (isOpen) {
      loadSettings();
      loadProvidersData();
      setHasEngineChanged(false);
      setSaveStatus(null);
      setIsEditingProvider(false);
      setEditingProvider(null);
      setModelsSaveSuccess(false);
    }
  }, [isOpen, loadSettings, loadProvidersData]);

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
    setHasEngineChanged(true);
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
    setIsEditingProvider(true);
  };

  const handleEditProvider = (provider: CustomProviderConfig) => {
    setEditingOriginalId(provider.id);
    setEditingProvider({
      ...provider,
      compat: { ...(provider.compat || { supportsUsageInStreaming: false }) },
      models: provider.models ? provider.models.map((m) => ({ ...m })) : [],
    });
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
        id: m.id.trim(),
        name: m.name?.trim() || undefined,
        contextWindow: m.contextWindow ? Number(m.contextWindow) : undefined,
        maxTokens: m.maxTokens ? Number(m.maxTokens) : undefined,
      }));

    const finalProvider: CustomProviderConfig = {
      ...editingProvider,
      id: cleanId,
      baseUrl: cleanBaseUrl,
      api: editingProvider.api?.trim() || 'openai-completions',
      apiKey: cleanApiKey,
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
                    const isSelected = (settings.defaultThinkingLevel || 'off') === tl.id;
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
                          Tên biến môi trường API Key (Env Var):
                        </label>
                        <input
                          type="text"
                          value={editingProvider.apiKey || ''}
                          onChange={(e) => setEditingProvider({ ...editingProvider, apiKey: e.target.value })}
                          placeholder="Ví dụ: LMSTUDIO_API_KEY (không nhập raw secret)"
                          className="w-full px-3 py-1.5 bg-surface-highlight border border-border rounded-lg text-xs font-mono text-slate-900 dark:text-zinc-100 focus:outline-none focus:border-codex-accent"
                        />
                        <span className="text-[10px] text-slate-400 dark:text-zinc-500 mt-0.5 block">
                          Tên biến trong process.env, app không bao giờ chạm giá trị key.
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
                          <div key={idx} className="flex items-center gap-2 bg-surface-highlight/60 p-2 rounded-lg border border-border">
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
                            <span className="font-mono text-[11px] text-slate-700 dark:text-zinc-300">{cp.apiKey}:</span>
                            {cp.hasEnvVar ? (
                              <span className="px-1.5 py-0.5 rounded text-[10px] font-medium bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border border-emerald-500/20">
                                ✓ Đã có trong process.env
                              </span>
                            ) : (
                              <span className="px-1.5 py-0.5 rounded text-[10px] font-medium bg-amber-500/10 text-amber-600 dark:text-amber-400 border border-amber-500/20">
                                ⚠ Chưa đặt biến môi trường
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
                      OAuth login là giao thức TUI-only. Hãy copy lệnh và chạy trong Terminal để xác thực.
                    </p>
                  </div>
                </div>

                {/* Hướng dẫn đăng nhập Terminal */}
                <div className="p-3 bg-surface rounded-xl border border-border space-y-2">
                  <div className="flex items-center justify-between text-xs">
                    <span className="text-slate-600 dark:text-zinc-300 font-medium flex items-center gap-1.5">
                      <Terminal className="w-3.5 h-3.5 text-codex-accent" />
                      Lệnh mở Terminal và đăng nhập:
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
                      <div>
                        <div className="font-medium text-slate-800 dark:text-zinc-200">{lp.name}</div>
                        <div className="text-[10px] font-mono text-slate-400 dark:text-zinc-500">{lp.id}</div>
                      </div>
                      <button
                        onClick={() => handleCopyText(`omp\n/login`)}
                        className="px-2 py-1 bg-surface-highlight hover:bg-surface border border-border rounded text-[10.5px] font-medium text-slate-600 dark:text-zinc-300 flex items-center gap-1 cursor-pointer"
                        title="Sao chép hướng dẫn đăng nhập"
                      >
                        <Terminal className="w-3 h-3" />
                        <span>Đăng nhập</span>
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
