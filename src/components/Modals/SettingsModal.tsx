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
  LogOut,
  XCircle,
  Eye,
  EyeOff,
  Radio,
  Clock,
  FileCode,
  User,
  Zap,
  Square,
} from 'lucide-react';
import { ModelsCatalogSection } from './settings/ModelsCatalogSection.tsx';
import { LaunchOptionsSection } from './settings/LaunchOptionsSection.tsx';
import { EngineConfigEditor } from './settings/EngineConfigEditor.tsx';
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
  FetchEngineConfigOptions,
  SetEngineConfigOptions,
  ResetEngineConfigOptions,
  EngineConfigPathOptions,
  EngineConfigListResult,
  EngineConfigMutationResult,
  EngineConfigPathResult,
} from '../../types';

import {
  ModelRoleSpec,
  ROLE_THINKING_LEVELS,
  RoleThinkingLevel,
  formatModelRoleSpec,
  parseModelRoleSpec,
} from '../../utils/model-role-spec';
import { useI18n } from '../../i18n/I18nProvider';
import { I18nKey } from '../../../shared/i18n';

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

// Convert headers object <-> textarea as "Name: Value" per line
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
  onRefreshModels?: () => Promise<unknown>;
  thinkingLevel?: OmpThinkingLevel;
  onSelectThinkingLevel?: (level: OmpThinkingLevel) => void;
  onRestartEngine?: () => Promise<void>;
  isEngineRunning?: boolean;
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
}

const THINKING_LEVELS: { id: OmpThinkingLevel; labelKey: I18nKey; descKey: I18nKey }[] = [
  { id: 'off', labelKey: 'settings.thinking.off.label', descKey: 'settings.thinking.off.desc' },
  { id: 'minimal', labelKey: 'settings.thinking.minimal.label', descKey: 'settings.thinking.minimal.desc' },
  { id: 'low', labelKey: 'settings.thinking.low.label', descKey: 'settings.thinking.low.desc' },
  { id: 'medium', labelKey: 'settings.thinking.medium.label', descKey: 'settings.thinking.medium.desc' },
  { id: 'high', labelKey: 'settings.thinking.high.label', descKey: 'settings.thinking.high.desc' },
  { id: 'xhigh', labelKey: 'settings.thinking.xhigh.label', descKey: 'settings.thinking.xhigh.desc' },
  { id: 'max', labelKey: 'settings.thinking.max.label', descKey: 'settings.thinking.max.desc' },
  { id: 'auto', labelKey: 'settings.thinking.auto.label', descKey: 'settings.thinking.auto.desc' },
];

const APPROVAL_OPTIONS: { id: OmpApprovalMode; labelKey: I18nKey; descKey: I18nKey }[] = [
  { id: 'always-ask', labelKey: 'settings.approval.alwaysAsk.label', descKey: 'settings.approval.alwaysAsk.desc' },
  { id: 'write', labelKey: 'settings.approval.write.label', descKey: 'settings.approval.write.desc' },
  { id: 'yolo', labelKey: 'settings.approval.yolo.label', descKey: 'settings.approval.yolo.desc' },
];

const STEERING_MODES: { id: string; labelKey: I18nKey; descKey: I18nKey }[] = [
  { id: 'default', labelKey: 'settings.steering.default.label', descKey: 'settings.steering.default.desc' },
  { id: 'immediate', labelKey: 'settings.steering.immediate.label', descKey: 'settings.steering.immediate.desc' },
  { id: 'next_turn', labelKey: 'settings.steering.nextTurn.label', descKey: 'settings.steering.nextTurn.desc' },
];

const FOLLOW_UP_MODES: { id: string; labelKey: I18nKey; descKey: I18nKey }[] = [
  { id: 'default', labelKey: 'settings.followUp.default.label', descKey: 'settings.followUp.default.desc' },
  { id: 'immediate', labelKey: 'settings.followUp.immediate.label', descKey: 'settings.followUp.immediate.desc' },
  { id: 'next_turn', labelKey: 'settings.followUp.nextTurn.label', descKey: 'settings.followUp.nextTurn.desc' },
];

const INTERRUPT_MODES: { id: string; labelKey: I18nKey; descKey: I18nKey }[] = [
  { id: 'default', labelKey: 'settings.interrupt.default.label', descKey: 'settings.interrupt.default.desc' },
  { id: 'immediate', labelKey: 'settings.interrupt.immediate.label', descKey: 'settings.interrupt.immediate.desc' },
  { id: 'next_turn', labelKey: 'settings.interrupt.nextTurn.label', descKey: 'settings.interrupt.nextTurn.desc' },
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

// Supported model roles in ~/.omp/agent/config.yml (modelRoles)
const KNOWN_MODEL_ROLES: { id: string; descKey: I18nKey }[] = [
  { id: 'default', descKey: 'settings.roles.defaultDesc' },
  { id: 'smol', descKey: 'settings.roles.smolDesc' },
  { id: 'slow', descKey: 'settings.roles.slowDesc' },
  { id: 'plan', descKey: 'settings.roles.planDesc' },
  { id: 'advisor', descKey: 'settings.roles.advisorDesc' },
  { id: 'task', descKey: 'settings.roles.taskDesc' },
  { id: 'commit', descKey: 'settings.roles.commitDesc' },
  { id: 'vision', descKey: 'settings.roles.visionDesc' },
  { id: 'tiny', descKey: 'settings.roles.tinyDesc' },
];

const MOCK_MODEL_ROLES: Record<string, string> = {
  default: 'anthropic/claude-sonnet-5',
  smol: 'anthropic/claude-haiku-4-5',
  plan: 'anthropic/claude-opus-5',
};

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
  onRefreshModels,
  thinkingLevel,
  onSelectThinkingLevel,
  onRestartEngine,
  isEngineRunning = false,
  getEngineConfig,
  setEngineConfigValue,
  resetEngineConfigValue,
  getEngineConfigPath,
}) => {
  const { locale, setLocale, t } = useI18n();
  const [activeTab, setActiveTab] = useState<'general' | 'engine' | 'providers' | 'engine-config'>('general');
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
  const [isEngineOnline, setIsEngineOnline] = useState<boolean | null>(null);
  const [loggingOutProviderId, setLoggingOutProviderId] = useState<string | null>(null);

  // State cho Model Roles (config.yml)
  const [modelRoles, setModelRoles] = useState<Record<string, string>>({});
  // Manual role input mode (alias/glob) instead of selecting from model list
  const [rawRoles, setRawRoles] = useState<Set<string>>(new Set());
  const [rolesConfigPath, setRolesConfigPath] = useState<string>('~/.omp/agent/config.yml');
  const [isRolesWritable, setIsRolesWritable] = useState<boolean>(true);
  const [rolesError, setRolesError] = useState<string | null>(null);
  const [rolesDirty, setRolesDirty] = useState<boolean>(false);
  const [rolesSaveSuccess, setRolesSaveSuccess] = useState<boolean>(false);
  const [newRoleName, setNewRoleName] = useState<string>('');

  // State cho Profile (Phase 16)
  const [availableProfiles, setAvailableProfiles] = useState<string[]>(['default']);
  const [newProfileInput, setNewProfileInput] = useState<string>('');
  const [isCreatingProfile, setIsCreatingProfile] = useState<boolean>(false);
  const [profileError, setProfileError] = useState<string | null>(null);

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
      console.warn('[SettingsModal] Failed to load settings:', err);
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
      console.warn('[SettingsModal] Failed to load models.yml:', err);
      setCustomProviders(MOCK_CUSTOM_PROVIDERS);
    }

    if (window.electronAPI?.isEngineRunning) {
      try {
        const running = await window.electronAPI.isEngineRunning();
        setIsEngineOnline(Boolean(running));
      } catch {
        setIsEngineOnline(false);
      }
    }
    try {
      if (window.electronAPI?.getLoginProviders) {
        const res = await window.electronAPI.getLoginProviders();
        if (res.success && res.providers) {
          setLoginProviders(res.providers);
          const authedFromRpc = res.providers.filter((p) => p.authenticated).map((p) => p.id);
          if (authedFromRpc.length > 0) {
            setAuthedProviders((prev) => Array.from(new Set([...prev, ...authedFromRpc])));
          }
        } else {
          setLoginProviders(MOCK_LOGIN_PROVIDERS);
        }
      }
    } catch (err) {
      console.warn('[SettingsModal] Failed to load login providers:', err);
      setLoginProviders(MOCK_LOGIN_PROVIDERS);
    }
  }, []);

  const applyLoadedRoles = useCallback((roles: Record<string, string>) => {
    setModelRoles(roles);
    setRawRoles(
      new Set(
        Object.entries(roles)
          .filter(([, value]) => value.trim() && !parseModelRoleSpec(value))
          .map(([role]) => role)
      )
    );
  }, []);

  const loadModelRoles = useCallback(async () => {
    try {
      if (window.electronAPI?.getModelRolesConfig) {
        const res = await window.electronAPI.getModelRolesConfig();
        applyLoadedRoles(res.roles || {});
        if (res.filePath) setRolesConfigPath(res.filePath);
        setIsRolesWritable(res.isWritable !== false);
        setRolesError(res.error || null);
      } else {
        applyLoadedRoles({ ...MOCK_MODEL_ROLES });
        setIsRolesWritable(true);
        setRolesError(null);
      }
    } catch (err) {
      console.warn('[SettingsModal] Failed to load model roles:', err);
      applyLoadedRoles({ ...MOCK_MODEL_ROLES });
    }
    setRolesDirty(false);
    setRolesSaveSuccess(false);
  }, [applyLoadedRoles]);

  const loadProfiles = useCallback(async () => {
    try {
      if (window.electronAPI?.listProfiles) {
        const res = await window.electronAPI.listProfiles();
        if (res.success && res.profiles) {
          setAvailableProfiles(res.profiles);
        }
      }
    } catch {}
  }, []);

  const handleSwitchProfile = async (newProfile: string) => {
    setProfileError(null);
    try {
      if (window.electronAPI?.setProfile) {
        const res = await window.electronAPI.setProfile(newProfile);
        if (res.success) {
          setSettings((prev) => ({ ...prev, profile: res.profile }));
          setHasEngineChanged(true);
        } else {
          setProfileError(res.error || t('settings.profile.switchError'));
        }
      } else {
        setSettings((prev) => ({ ...prev, profile: newProfile }));
      }
    } catch (err: any) {
      setProfileError(err?.message || t('settings.profile.switchError'));
    }
  };

  const handleCreateProfile = async () => {
    const name = newProfileInput.trim();
    if (!name) return;
    setIsCreatingProfile(true);
    setProfileError(null);
    try {
      if (window.electronAPI?.createProfile) {
        const res = await window.electronAPI.createProfile(name);
        if (res.success && res.profile) {
          setNewProfileInput('');
          await loadProfiles();
          await handleSwitchProfile(res.profile);
        } else {
          setProfileError(res.error || t('settings.profile.createError'));
        }
      }
    } catch (err: any) {
      setProfileError(err?.message || t('settings.profile.createError'));
    } finally {
      setIsCreatingProfile(false);
    }
  };

  // Authenticated status fetched from `omp usage --json` (background query)
  const refreshAuthStatus = useCallback(async () => {
    try {
      if (window.electronAPI?.getAuthStatus) {
        const res = await window.electronAPI.getAuthStatus();
        if (res.success && res.providers) {
          setAuthedProviders(res.providers);
        }
      }
    } catch (err) {
      console.warn('[SettingsModal] Failed to check login status:', err);
    }
  }, []);

  useEffect(() => {
    if (isOpen) {
      loadSettings();
      loadProvidersData();
      loadModelRoles();
      refreshAuthStatus();
      setHasEngineChanged(false);
      setSaveStatus(null);
      setIsEditingProvider(false);
      setEditingProvider(null);
      setModelsSaveSuccess(false);
      setShowApiKey(false);
      loadProfiles();
    }
  }, [isOpen, loadSettings, loadProvidersData, loadModelRoles, refreshAuthStatus]);

  // Monitor OAuth login progress; abort active session on modal close
  useEffect(() => {
    if (!isOpen || !window.electronAPI?.onAuthLoginEvent) return;
    const unsubscribe = window.electronAPI.onAuthLoginEvent((event) => {
      setAuthLogin((prev) =>
        event.status === 'cancelled' && prev?.providerId !== event.providerId ? prev : event
      );
      if (event.status === 'success') {
        refreshAuthStatus();
        loadProvidersData();
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
      setSaveStatus(t('settings.saved'));
      setTimeout(() => setSaveStatus(null), 2000);
    } catch (err) {
      console.error('[SettingsModal] Failed to save settings:', err);
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

  const setRoleValue = (role: string, value: string) => {
    setModelRoles((prev) => ({ ...prev, [role]: value }));
    setRolesDirty(true);
    setRolesSaveSuccess(false);
  };

  // Format model and thinking level as "provider/model[:level]" per OMP spec
  const handleRoleSpecChange = (role: string, model: string, level?: RoleThinkingLevel) => {
    setRoleValue(role, formatModelRoleSpec(model, level));
  };

  const handleToggleRawRole = (role: string) => {
    setRawRoles((prev) => {
      const next = new Set(prev);
      if (next.has(role)) next.delete(role);
      else next.add(role);
      return next;
    });
  };

  const handleRemoveRole = (role: string) => {
    setModelRoles((prev) => {
      const next = { ...prev };
      delete next[role];
      return next;
    });
    setRawRoles((prev) => {
      if (!prev.has(role)) return prev;
      const next = new Set(prev);
      next.delete(role);
      return next;
    });
    setRolesDirty(true);
    setRolesSaveSuccess(false);
  };

  const handleAddRole = () => {
    const role = newRoleName.trim();
    if (!role || modelRoles[role] !== undefined) return;
    setModelRoles((prev) => ({ ...prev, [role]: '' }));
    setNewRoleName('');
    setRolesDirty(true);
    setRolesSaveSuccess(false);
  };

  const handleSaveModelRoles = async () => {
    setRolesError(null);
    setRolesSaveSuccess(false);

    const cleanRoles: Record<string, string> = {};
    for (const [role, model] of Object.entries(modelRoles)) {
      if (role.trim() && model.trim()) cleanRoles[role.trim()] = model.trim();
    }

    try {
      if (window.electronAPI?.saveModelRolesConfig) {
        const res = await window.electronAPI.saveModelRolesConfig(cleanRoles);
        if (res.success) {
          setRolesSaveSuccess(true);
          setRolesDirty(false);
          setHasEngineChanged(true);
        } else {
          setRolesError(res.error || t('settings.roles.unknownSaveError'));
        }
      } else {
        setRolesSaveSuccess(true);
        setRolesDirty(false);
      }
    } catch (err: any) {
      setRolesError(t('settings.roles.saveError', { error: err?.message || String(err) }));
    }
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
  const handleAutoRetryToggle = () => {
    const nextVal = !settings.autoRetry;
    savePartial({ autoRetry: nextVal });
    if (window.electronAPI?.setAutoRetry) {
      window.electronAPI.setAutoRetry(nextVal).catch(() => {});
    }
  };

  const handleFastModeToggle = () => {
    const nextVal = !settings.fastMode;
    savePartial({ fastMode: nextVal });
    if (window.electronAPI?.setFastMode) {
      window.electronAPI.setFastMode(nextVal).catch(() => {});
    }
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
        if (window.electronAPI?.isEngineRunning) {
          setIsEngineOnline(Boolean(await window.electronAPI.isEngineRunning().catch(() => false)));
        }
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

  // Classify apiKey value by OMP resolution: !cmd, env var, or literal key
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


  const effectiveEngineRunning = isEngineOnline !== null ? isEngineOnline : isEngineRunning;

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

  const handleLogout = async (providerId: string) => {
    if (!window.electronAPI?.logoutAuthProvider) return;
    setLoggingOutProviderId(providerId);
    try {
      const res = await window.electronAPI.logoutAuthProvider(providerId);
      if (res.success) {
        setAuthedProviders((prev) => prev.filter((id) => id !== providerId));
        setLoginProviders((prev) =>
          prev.map((p) => (p.id === providerId ? { ...p, authenticated: false } : p))
        );
        refreshAuthStatus();
        loadProvidersData();
      } else {
        alert(res.error || t('settings.providers.logoutFailed'));
      }
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      alert(msg || t('settings.providers.logoutError'));
    } finally {
      setLoggingOutProviderId(null);
    }
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
    if (!window.confirm(t('settings.providers.confirmDelete', { id: providerId }))) {
      return;
    }
    const updated = customProviders.filter((p) => p.id !== providerId);
    setCustomProviders(updated);
    await saveCustomProvidersToFile(updated);
  };

  const handleSaveEditingProvider = async () => {
    if (!editingProvider || !editingProvider.id.trim() || !editingProvider.baseUrl.trim()) {
      alert(t('settings.providers.validationAlert'));
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
          setConfigError(res.error || t('settings.providers.unknownSaveError'));
        }
      } else {
        setModelsSaveSuccess(true);
        setHasEngineChanged(true);
      }
    } catch (err: any) {
      setConfigError(t('settings.providers.saveError', { error: err?.message || String(err) }));
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

  // Empty cost -> remove field; undefined to avoid writing to YAML
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

  // defaultLevel must belong to selected efforts list
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
    const provider = m.provider || t('settings.providers.otherGroup');
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
              <h2 className="text-sm font-semibold text-slate-900 dark:text-zinc-100">{t('settings.title')}</h2>
              <p className="text-xs text-slate-500 dark:text-zinc-400">{t('settings.desc')}</p>
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
              title={t('settings.close')}
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
            {t('settings.tab.general')}
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
            {t('settings.tab.engine')}
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
            {t('settings.tab.providers')}
          </button>
          <button
            onClick={() => {
              setActiveTab('engine-config');
              setIsEditingProvider(false);
            }}
            className={`flex items-center gap-2 py-3 px-3 text-xs font-medium border-b-2 transition-colors cursor-pointer ${
              activeTab === 'engine-config'
                ? 'border-codex-accent text-codex-accent'
                : 'border-transparent text-slate-500 dark:text-zinc-400 hover:text-slate-900 dark:hover:text-zinc-200'
            }`}
          >
            <FileCode className="w-3.5 h-3.5" />
            {t('settings.tab.engineConfig')}
          </button>
        </div>

        {/* Modal Body */}
        <div className="flex-1 overflow-y-auto p-6 space-y-6">
          {/* TAB 1: General */}
          {activeTab === 'general' && (
            <div className="space-y-6">
              <div>
                <label className="text-xs font-semibold text-slate-900 dark:text-zinc-100 block mb-2">
                  {t('settings.theme.title')}
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
                      <div className="text-xs font-medium text-slate-900 dark:text-zinc-100">{t('settings.theme.light')}</div>
                      <div className="text-[11px] text-slate-500 dark:text-zinc-400">{t('settings.theme.light.desc')}</div>
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
                      <div className="text-xs font-medium text-slate-900 dark:text-zinc-100">{t('settings.theme.dark')}</div>
                      <div className="text-[11px] text-slate-500 dark:text-zinc-400">{t('settings.theme.dark.desc')}</div>
                    </div>
                  </button>
                </div>
              </div>

              {/* Language Switcher */}
              <div>
                <label className="text-xs font-semibold text-slate-900 dark:text-zinc-100 block mb-2">
                  {t('settings.language.title')}
                </label>
                <div className="grid grid-cols-2 gap-3">
                  <button
                    onClick={() => setLocale('vi')}
                    className={`flex items-center gap-3 p-3.5 rounded-xl border transition-all cursor-pointer text-left ${
                      locale === 'vi'
                        ? 'bg-surface-highlight border-codex-accent ring-2 ring-codex-accent/20'
                        : 'bg-surface border-border hover:border-slate-300 dark:hover:border-zinc-700'
                    }`}
                  >
                    <div className="p-2 rounded-lg bg-emerald-500/10 text-emerald-500 shrink-0">
                      <Globe className="w-5 h-5" />
                    </div>
                    <div>
                      <div className="text-xs font-medium text-slate-900 dark:text-zinc-100">{t('settings.language.vi')}</div>
                      <div className="text-[11px] text-slate-500 dark:text-zinc-400">{t('settings.language.vi.desc')}</div>
                    </div>
                  </button>

                  <button
                    onClick={() => setLocale('en')}
                    className={`flex items-center gap-3 p-3.5 rounded-xl border transition-all cursor-pointer text-left ${
                      locale === 'en'
                        ? 'bg-surface-highlight border-codex-accent ring-2 ring-codex-accent/20'
                        : 'bg-surface border-border hover:border-slate-300 dark:hover:border-zinc-700'
                    }`}
                  >
                    <div className="p-2 rounded-lg bg-blue-500/10 text-blue-400 shrink-0">
                      <Globe className="w-5 h-5" />
                    </div>
                    <div>
                      <div className="text-xs font-medium text-slate-900 dark:text-zinc-100">{t('settings.language.en')}</div>
                      <div className="text-[11px] text-slate-500 dark:text-zinc-400">{t('settings.language.en.desc')}</div>
                    </div>
                  </button>
                </div>
              </div>
            </div>
          )}

          {/* TAB 2: Engine & Launch */}
          {activeTab === 'engine' && (
            <div className="space-y-6">
              {/* Binary Path Section */}
              <div className="space-y-2">
                <label className="text-xs font-semibold text-slate-900 dark:text-zinc-100 flex items-center gap-1.5">
                  <Terminal className="w-3.5 h-3.5 text-codex-accent" />
                  {t('settings.engine.binaryPath')}
                </label>
                <div className="p-3 bg-surface rounded-xl border border-border space-y-2.5">
                  <div className="flex items-center justify-between text-xs">
                    <span className="text-slate-500 dark:text-zinc-400">{t('settings.engine.autoDetectPath')}</span>
                    <span className="font-mono text-[11px] text-slate-700 dark:text-zinc-300 max-w-[320px] truncate">
                      {installStatus?.binaryPath || t('settings.engine.notFound')}
                    </span>
                  </div>
                  <div>
                    <label className="text-[11px] text-slate-500 dark:text-zinc-400 block mb-1">
                      {t('settings.engine.customPathLabel')}
                    </label>
                    <div className="flex gap-2">
                      <input
                        type="text"
                        value={customPathInput}
                        onChange={(e) => setCustomPathInput(e.target.value)}
                        placeholder={t('settings.engine.customPathPlaceholder')}
                        className="flex-1 px-3 py-1.5 bg-surface-highlight border border-border rounded-lg text-xs font-mono text-slate-900 dark:text-zinc-100 placeholder-slate-400 focus:outline-none focus:border-codex-accent"
                      />
                      <button
                        onClick={handleBrowseBinary}
                        className="px-3 py-1.5 bg-surface hover:bg-surface-highlight border border-border rounded-lg text-xs font-medium text-slate-700 dark:text-zinc-300 transition-colors flex items-center gap-1.5 cursor-pointer"
                        title={t('settings.engine.browseDisk')}
                      >
                        <FolderSearch className="w-3.5 h-3.5" />
                        {t('settings.engine.browseBtn')}
                      </button>
                      <button
                        onClick={handleApplyCustomPath}
                        className="px-3 py-1.5 bg-codex-accent text-white rounded-lg text-xs font-medium hover:bg-codex-accent/90 transition-colors cursor-pointer"
                      >
                        {t('settings.engine.applyBtn')}
                      </button>
                    </div>
                  </div>
                </div>
              </div>

              {/* Profile Management Section (Phase 16) */}
              <div className="space-y-2">
                <label className="text-xs font-semibold text-slate-900 dark:text-zinc-100 flex items-center justify-between">
                  <span className="flex items-center gap-1.5">
                    <User className="w-3.5 h-3.5 text-codex-accent" />
                    {t('settings.engine.profileTitle')}
                  </span>
                  {settings.profile && settings.profile !== 'default' && (
                    <span className="px-2 py-0.5 rounded text-[10px] font-mono bg-purple-500/10 text-purple-500 border border-purple-500/20">
                      active: {settings.profile}
                    </span>
                  )}
                </label>
                <div className="p-3 bg-surface rounded-xl border border-border space-y-3">
                  <p className="text-[11px] text-slate-500 dark:text-zinc-400 leading-relaxed">
                    {t('settings.engine.profileDesc')}
                  </p>

                  {profileError && (
                    <div className="p-2.5 rounded-lg bg-rose-500/10 border border-rose-500/20 text-rose-600 dark:text-rose-400 text-xs">
                      {profileError}
                    </div>
                  )}

                  <div className="flex flex-col sm:flex-row gap-2 items-stretch sm:items-center">
                    <select
                      value={settings.profile || 'default'}
                      onChange={(e) => handleSwitchProfile(e.target.value)}
                      className="flex-1 px-3 py-1.5 bg-surface-highlight border border-border rounded-lg text-xs font-medium text-slate-900 dark:text-zinc-100 outline-none"
                    >
                      {availableProfiles.map((p) => (
                        <option key={p} value={p}>
                          {p === 'default' ? t('settings.engine.profileDefault') : p}
                        </option>
                      ))}
                    </select>
                  </div>

                  {/* Create new profile */}
                  <div className="pt-2 border-t border-border flex gap-2">
                    <input
                      type="text"
                      value={newProfileInput}
                      onChange={(e) => setNewProfileInput(e.target.value)}
                      placeholder={t('settings.engine.newProfilePlaceholder')}
                      disabled={isCreatingProfile}
                      className="flex-1 px-3 py-1.5 bg-surface-highlight border border-border rounded-lg text-xs font-mono text-slate-900 dark:text-zinc-100 placeholder-slate-400 outline-none"
                    />
                    <button
                      type="button"
                      onClick={handleCreateProfile}
                      disabled={!newProfileInput.trim() || isCreatingProfile}
                      className="flex items-center gap-1 px-3 py-1.5 bg-codex-accent text-white rounded-lg text-xs font-medium hover:bg-codex-accent/90 transition-colors cursor-pointer disabled:opacity-50 shrink-0"
                    >
                      <Plus className="w-3.5 h-3.5" />
                      <span>{isCreatingProfile ? t('settings.engine.creatingProfile') : t('settings.engine.createProfileBtn')}</span>
                    </button>
                  </div>
                </div>
              </div>

              {/* Default Model & Provider */}
              <div className="space-y-2">
                <label className="text-xs font-semibold text-slate-900 dark:text-zinc-100 flex items-center justify-between">
                  <span className="flex items-center gap-1.5">
                    <Brain className="w-3.5 h-3.5 text-codex-accent" />
                    {t('settings.engine.defaultModelTitle')}
                  </span>
                  {!isCurrentModelInCatalog && (
                    <span className="text-[11px] text-amber-500 flex items-center gap-1 font-normal">
                      <AlertTriangle className="w-3 h-3" />
                      {t('settings.engine.modelNotInCatalog')}
                    </span>
                  )}
                </label>
                <div className="bg-surface rounded-xl border border-border p-3 space-y-2">
                  <select
                    value={currentModelValue}
                    onChange={handleModelSelect}
                    className="w-full px-3 py-2 bg-surface-highlight border border-border rounded-lg text-xs text-slate-900 dark:text-zinc-100 focus:outline-none focus:border-codex-accent cursor-pointer"
                  >
                    <option value="">{t('settings.engine.defaultModelOption')}</option>
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
                      <optgroup label={t('settings.engine.savedModelGroup')}>
                        <option value={currentModelValue}>
                          {settings.defaultModel} ({settings.defaultProvider})
                        </option>
                      </optgroup>
                    )}
                  </select>
                  <p className="text-[11px] text-slate-500 dark:text-zinc-400">
                    {availableModels.length > 0
                      ? t('settings.engine.loadedModelsCount', { count: availableModels.length })
                      : t('settings.engine.noModelsLoaded')}
                  </p>
                </div>
              </div>

              {/* Model Roles (modelRoles trong config.yml) */}
              <div className="space-y-2">
                <label className="text-xs font-semibold text-slate-900 dark:text-zinc-100 flex items-center gap-1.5">
                  <Boxes className="w-3.5 h-3.5 text-codex-accent" />
                  {t('settings.engine.rolesTitle')}
                </label>
                <div className="bg-surface rounded-xl border border-border p-3 space-y-2.5">
                  {(!isRolesWritable || rolesError) && (
                    <div className="flex items-start gap-2 p-2.5 bg-amber-500/10 border border-amber-500/30 rounded-lg">
                      <AlertTriangle className="w-3.5 h-3.5 text-amber-500 shrink-0 mt-0.5" />
                      <span className="text-[11px] text-amber-600 dark:text-amber-400 break-all">
                        {rolesError || t('settings.engine.rolesNoPermission', { path: rolesConfigPath })}
                      </span>
                    </div>
                  )}

                  {Object.keys(modelRoles).length === 0 && (
                    <p className="text-[11px] text-slate-500 dark:text-zinc-400">
                      {t('settings.engine.rolesEmpty')}
                    </p>
                  )}

                  {Object.entries(modelRoles)
                    .sort(([a], [b]) => {
                      const ia = KNOWN_MODEL_ROLES.findIndex((r) => r.id === a);
                      const ib = KNOWN_MODEL_ROLES.findIndex((r) => r.id === b);
                      if (ia === -1 && ib === -1) return a.localeCompare(b);
                      if (ia === -1) return 1;
                      if (ib === -1) return -1;
                      return ia - ib;
                    })
                    .map(([role, rawValue]) => {
                      const known = KNOWN_MODEL_ROLES.find((r) => r.id === role);
                      const isRawMode = rawRoles.has(role);
                      const spec: ModelRoleSpec = isRawMode
                        ? { model: rawValue }
                        : parseModelRoleSpec(rawValue) || { model: rawValue.trim() };
                      const catalogModel = availableModels.find((m) => `${m.provider}/${m.id}` === spec.model);
                      const lacksReasoning = !!spec.level && catalogModel?.reasoning === false;
                      return (
                        <div key={role} className="flex items-center gap-2">
                          <div className="w-28 shrink-0">
                            <div className="text-xs font-mono font-medium text-slate-900 dark:text-zinc-100">{role}</div>
                            {known && (
                              <div className="text-[10px] text-slate-500 dark:text-zinc-400 leading-tight">{t(known.descKey)}</div>
                            )}
                          </div>
                          {isRawMode ? (
                            <input
                              type="text"
                              value={rawValue}
                              onChange={(e) => setRoleValue(role, e.target.value)}
                              placeholder={t('settings.engine.rolePlaceholder')}
                              spellCheck={false}
                              className="flex-1 min-w-0 px-3 py-1.5 bg-surface-highlight border border-border rounded-lg text-xs font-mono text-slate-900 dark:text-zinc-100 focus:outline-none focus:border-codex-accent"
                            />
                          ) : (
                            <>
                              <select
                                value={spec.model}
                                onChange={(e) => handleRoleSpecChange(role, e.target.value, spec.level)}
                                className="flex-1 min-w-0 px-3 py-1.5 bg-surface-highlight border border-border rounded-lg text-xs text-slate-900 dark:text-zinc-100 focus:outline-none focus:border-codex-accent cursor-pointer"
                              >
                                <option value="">{t('settings.engine.roleUnassigned')}</option>
                                {Object.entries(groupedModels).map(([provider, models]) => (
                                  <optgroup key={provider} label={provider.toUpperCase()}>
                                    {models.map((m) => (
                                      <option key={`${provider}/${m.id}`} value={`${provider}/${m.id}`}>
                                        {m.name || m.id} {m.reasoning ? '🧠' : ''}
                                      </option>
                                    ))}
                                  </optgroup>
                                ))}
                                {spec.model && !catalogModel && (
                                  <optgroup label={t('settings.engine.roleOutOfCatalog')}>
                                    <option value={spec.model}>{spec.model}</option>
                                  </optgroup>
                                )}
                              </select>
                              <select
                                value={spec.level || ''}
                                onChange={(e) =>
                                  handleRoleSpecChange(
                                    role,
                                    spec.model,
                                    e.target.value ? (e.target.value as RoleThinkingLevel) : undefined
                                  )
                                }
                                disabled={!spec.model}
                                title={t('settings.engine.roleThinkingTitle')}
                                className="w-28 shrink-0 px-2 py-1.5 bg-surface-highlight border border-border rounded-lg text-xs text-slate-900 dark:text-zinc-100 focus:outline-none focus:border-codex-accent cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed"
                              >
                                <option value="">{t('settings.engine.roleInherit')}</option>
                                {ROLE_THINKING_LEVELS.map((lvl) => (
                                  <option key={lvl} value={lvl}>
                                    {lvl}
                                  </option>
                                ))}
                              </select>
                              {lacksReasoning && (
                                <span
                                  className="shrink-0"
                                  title={t('settings.engine.roleNoReasoningWarning')}
                                >
                                  <AlertTriangle className="w-3.5 h-3.5 text-amber-500" />
                                </span>
                              )}
                            </>
                          )}
                          <button
                            onClick={() => handleToggleRawRole(role)}
                            className="p-1.5 text-slate-400 hover:text-codex-accent transition-colors cursor-pointer shrink-0"
                            title={
                              isRawMode
                                ? t('settings.engine.roleSelectFromList')
                                : t('settings.engine.roleManualInput')
                            }
                          >
                            {isRawMode ? <Boxes className="w-3.5 h-3.5" /> : <Edit3 className="w-3.5 h-3.5" />}
                          </button>
                          <button
                            onClick={() => handleRemoveRole(role)}
                            className="p-1.5 text-slate-400 hover:text-red-500 transition-colors cursor-pointer shrink-0"
                            title={t('settings.engine.deleteRole', { role })}
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      );
                    })}

                  {/* Add new role */}
                  <div className="flex items-center gap-2 pt-1 border-t border-border">
                    <select
                      value={newRoleName}
                      onChange={(e) => setNewRoleName(e.target.value)}
                      className="flex-1 px-3 py-1.5 bg-surface-highlight border border-border rounded-lg text-xs text-slate-900 dark:text-zinc-100 focus:outline-none focus:border-codex-accent cursor-pointer"
                    >
                      <option value="">{t('settings.engine.addRolePlaceholder')}</option>
                      {KNOWN_MODEL_ROLES.filter((r) => modelRoles[r.id] === undefined).map((r) => (
                        <option key={r.id} value={r.id}>
                          {r.id} — {t(r.descKey)}
                        </option>
                      ))}
                    </select>
                    <button
                      onClick={handleAddRole}
                      disabled={!newRoleName.trim()}
                      className="px-3 py-1.5 bg-surface hover:bg-surface-highlight border border-border rounded-lg text-xs font-medium text-slate-700 dark:text-zinc-300 transition-colors flex items-center gap-1.5 cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed"
                    >
                      <Plus className="w-3.5 h-3.5" />
                      {t('settings.engine.addRoleBtn')}
                    </button>
                  </div>

                  <div className="flex items-center justify-between pt-1">
                    <span className="text-[10.5px] font-mono text-slate-500 dark:text-zinc-400 truncate max-w-[300px]">
                      {rolesConfigPath}
                    </span>
                    <div className="flex items-center gap-2">
                      {rolesSaveSuccess && (
                        <span className="text-[11px] text-emerald-500 flex items-center gap-1">
                          <Check className="w-3 h-3" />
                          {t('settings.engine.rolesSaved')}
                        </span>
                      )}
                      <button
                        onClick={handleSaveModelRoles}
                        disabled={!rolesDirty || !isRolesWritable}
                        className="px-3 py-1.5 bg-codex-accent text-white rounded-lg text-xs font-medium hover:bg-codex-accent/90 transition-colors cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed"
                      >
                        {t('settings.engine.saveRolesBtn')}
                      </button>
                    </div>
                  </div>
                </div>
              </div>

              {/* Thinking Level */}
              <div className="space-y-2">
                <label className="text-xs font-semibold text-slate-900 dark:text-zinc-100 flex items-center gap-1.5">
                  <Brain className="w-3.5 h-3.5 text-indigo-400" />
                  {t('settings.engine.thinkingTitle')}
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
                          {t(tl.labelKey)}
                          {isSelected && <Check className="w-3.5 h-3.5 text-codex-accent" />}
                        </div>
                        <div className="text-[10.5px] text-slate-500 dark:text-zinc-400 mt-0.5">{t(tl.descKey)}</div>
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* Approval Mode */}
              <div className="space-y-2">
                <label className="text-xs font-semibold text-slate-900 dark:text-zinc-100 flex items-center gap-1.5">
                  <Shield className="w-3.5 h-3.5 text-emerald-500" />
                  {t('settings.engine.approvalTitle')}
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
                          <div className="text-xs font-medium text-slate-900 dark:text-zinc-100">{t(opt.labelKey)}</div>
                          <div className="text-[11px] text-slate-500 dark:text-zinc-400">{t(opt.descKey)}</div>
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
                      {t('settings.engine.autoCompactionTitle')}
                    </div>
                    <div className="text-[11px] text-slate-500 dark:text-zinc-400">
                      {t('settings.engine.autoCompactionDesc')}
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
              {/* Auto Retry */}
              <div className="p-3.5 bg-surface rounded-xl border border-border flex items-center justify-between">
                <div className="flex items-center gap-2.5">
                  <RotateCw className="w-4 h-4 text-amber-500 shrink-0" />
                  <div>
                    <div className="text-xs font-semibold text-slate-900 dark:text-zinc-100">
                      {t('settings.engine.autoRetryTitle')}
                    </div>
                    <div className="text-[11px] text-slate-500 dark:text-zinc-400">
                      {t('settings.engine.autoRetryDesc')}
                    </div>
                  </div>
                </div>
                <button
                  onClick={handleAutoRetryToggle}
                  className={`w-11 h-6 flex items-center rounded-full p-1 transition-colors cursor-pointer ${
                    settings.autoRetry ? 'bg-codex-accent justify-end' : 'bg-slate-300 dark:bg-zinc-700 justify-start'
                  }`}
                >
                  <div className="w-4 h-4 rounded-full bg-white shadow-xs" />
                </button>
              </div>

              {/* Fast Mode */}
              <div className="p-3.5 bg-surface rounded-xl border border-border flex items-center justify-between">
                <div className="flex items-center gap-2.5">
                  <Zap className="w-4 h-4 text-emerald-500 shrink-0" />
                  <div>
                    <div className="text-xs font-semibold text-slate-900 dark:text-zinc-100">
                      {t('settings.engine.fastModeTitle')}
                    </div>
                    <div className="text-[11px] text-slate-500 dark:text-zinc-400">
                      {t('settings.engine.fastModeDesc')}
                    </div>
                  </div>
                </div>
                <button
                  onClick={handleFastModeToggle}
                  className={`w-11 h-6 flex items-center rounded-full p-1 transition-colors cursor-pointer ${
                    settings.fastMode ? 'bg-codex-accent justify-end' : 'bg-slate-300 dark:bg-zinc-700 justify-start'
                  }`}
                >
                  <div className="w-4 h-4 rounded-full bg-white shadow-xs" />
                </button>
              </div>

              {/* Host Tools & Desktop Integration Toggle (Phase 18) */}
              <div className="p-3.5 bg-surface rounded-xl border border-border flex items-center justify-between">
                <div className="flex items-center gap-2.5">
                  <Boxes className="w-4 h-4 text-purple-500 shrink-0" />
                  <div>
                    <div className="text-xs font-semibold text-slate-900 dark:text-zinc-100">
                      {t('settings.engine.hostToolsTitle')}
                    </div>
                    <div className="text-[11px] text-slate-500 dark:text-zinc-400">
                      {t('settings.engine.hostToolsDesc')}
                    </div>
                  </div>
                </div>
                <button
                  onClick={() => savePartial({ hostToolsEnabled: settings.hostToolsEnabled === false ? true : false })}
                  className={`w-11 h-6 flex items-center rounded-full p-1 transition-colors cursor-pointer ${
                    settings.hostToolsEnabled !== false ? 'bg-codex-accent justify-end' : 'bg-slate-300 dark:bg-zinc-700 justify-start'
                  }`}
                >
                  <div className="w-4 h-4 rounded-full bg-white shadow-xs" />
                </button>
              </div>

              {/* Engine Behavior Modes */}
              <div className="space-y-4 pt-2 border-t border-border">
                <div>
                  <h4 className="text-xs font-semibold text-slate-900 dark:text-zinc-100 flex items-center gap-1.5">
                    <Sliders className="w-3.5 h-3.5 text-blue-500" />
                    {t('settings.engine.behaviorModesTitle')}
                  </h4>
                  <p className="text-[11px] text-slate-500 dark:text-zinc-400 mt-0.5">
                    {t('settings.engine.behaviorModesDesc')}
                  </p>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                  {/* Steering Mode */}
                  <div className="p-3 bg-surface rounded-xl border border-border space-y-2">
                    <label className="text-xs font-semibold text-slate-800 dark:text-zinc-200 flex items-center gap-1.5">
                      <Radio className="w-3.5 h-3.5 text-amber-500" />
                      Steering Mode
                    </label>
                    <select
                      value={settings.steeringMode || 'default'}
                      onChange={(e) => savePartial({ steeringMode: e.target.value })}
                      className="w-full text-xs bg-surface-highlight border border-border rounded-lg px-2.5 py-1.5 text-slate-800 dark:text-zinc-200 focus:outline-none focus:ring-1 focus:ring-codex-accent cursor-pointer"
                    >
                      {STEERING_MODES.map((m) => (
                        <option key={m.id} value={m.id}>
                          {t(m.labelKey)}
                        </option>
                      ))}
                    </select>
                    <div className="text-[10.5px] text-slate-500 dark:text-zinc-400 leading-tight">
                      {t(STEERING_MODES.find((m) => m.id === (settings.steeringMode || 'default'))?.descKey || 'settings.steering.default.desc')}
                    </div>
                  </div>

                  {/* Follow-up Mode */}
                  <div className="p-3 bg-surface rounded-xl border border-border space-y-2">
                    <label className="text-xs font-semibold text-slate-800 dark:text-zinc-200 flex items-center gap-1.5">
                      <Clock className="w-3.5 h-3.5 text-blue-500" />
                      Follow-up Mode
                    </label>
                    <select
                      value={settings.followUpMode || 'default'}
                      onChange={(e) => savePartial({ followUpMode: e.target.value })}
                      className="w-full text-xs bg-surface-highlight border border-border rounded-lg px-2.5 py-1.5 text-slate-800 dark:text-zinc-200 focus:outline-none focus:ring-1 focus:ring-codex-accent cursor-pointer"
                    >
                      {FOLLOW_UP_MODES.map((m) => (
                        <option key={m.id} value={m.id}>
                          {t(m.labelKey)}
                        </option>
                      ))}
                    </select>
                    <div className="text-[10.5px] text-slate-500 dark:text-zinc-400 leading-tight">
                      {t(FOLLOW_UP_MODES.find((m) => m.id === (settings.followUpMode || 'default'))?.descKey || 'settings.followUp.default.desc')}
                    </div>
                  </div>

                  {/* Interrupt Mode */}
                  <div className="p-3 bg-surface rounded-xl border border-border space-y-2">
                    <label className="text-xs font-semibold text-slate-800 dark:text-zinc-200 flex items-center gap-1.5">
                      <Square className="w-3.5 h-3.5 text-rose-500" />
                      Interrupt Mode
                    </label>
                    <select
                      value={settings.interruptMode || 'default'}
                      onChange={(e) => savePartial({ interruptMode: e.target.value })}
                      className="w-full text-xs bg-surface-highlight border border-border rounded-lg px-2.5 py-1.5 text-slate-800 dark:text-zinc-200 focus:outline-none focus:ring-1 focus:ring-codex-accent cursor-pointer"
                    >
                      {INTERRUPT_MODES.map((m) => (
                        <option key={m.id} value={m.id}>
                          {t(m.labelKey)}
                        </option>
                      ))}
                    </select>
                    <div className="text-[10.5px] text-slate-500 dark:text-zinc-400 leading-tight">
                      {t(INTERRUPT_MODES.find((m) => m.id === (settings.interruptMode || 'default'))?.descKey || 'settings.interrupt.default.desc')}
                    </div>
                  </div>
                </div>
              </div>

              {/* Launch Options Section (Phase 4) */}
              <LaunchOptionsSection
                launchOptions={settings.launchOptions}
                onChange={(launchOptions) => savePartial({ launchOptions })}
                onRestartEngine={onRestartEngine}
              />
            </div>
          )}

          {/* TAB 3: Providers & Custom LLM Management */}
          {activeTab === 'providers' && (
            <div className="space-y-6">
              {/* EACCES permission warning if needed */}
              {(!isConfigWritable || configError) && (
                <div className="p-3.5 bg-amber-500/10 border border-amber-500/30 rounded-xl space-y-2">
                  <div className="flex items-start gap-2 text-amber-600 dark:text-amber-400">
                    <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5" />
                    <div className="text-xs space-y-1">
                      <div className="font-semibold">{t('settings.providers.permissionRestricted')}</div>
                      <p className="text-slate-600 dark:text-zinc-300">
                        {configError || t('settings.providers.permissionDesc', { path: modelsConfigPath })}
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
                          <span>{t('settings.providers.copied')}</span>
                        </>
                      ) : (
                        <>
                          <Copy className="w-3 h-3" />
                          <span>{t('settings.providers.copyCmd')}</span>
                        </>
                      )}
                    </button>
                  </div>
                </div>
              )}

              {/* Save success notification */}
              {modelsSaveSuccess && (
                <div className="p-3 bg-emerald-500/10 border border-emerald-500/30 rounded-xl flex items-center justify-between">
                  <div className="flex items-center gap-2 text-xs text-emerald-600 dark:text-emerald-400 font-medium">
                    <Check className="w-4 h-4 shrink-0" />
                    <span>{t('settings.providers.saveSuccess')}</span>
                  </div>
                  {onRestartEngine && (
                    <button
                      onClick={handleRestartEngine}
                      disabled={isRestarting}
                      className="px-2.5 py-1 bg-codex-accent text-white rounded-lg text-xs font-medium hover:bg-codex-accent/90 transition-colors flex items-center gap-1 cursor-pointer disabled:opacity-50"
                    >
                      <RotateCw className={`w-3 h-3 ${isRestarting ? 'animate-spin' : ''}`} />
                      {isRestarting ? t('settings.providers.restarting') : t('settings.providers.restartNow')}
                    </button>
                  )}
                </div>
              )}

              {/* PART 1: Custom LLM Providers (models.yml) */}
              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <div>
                    <h3 className="text-xs font-semibold text-slate-900 dark:text-zinc-100 flex items-center gap-1.5">
                      <Server className="w-3.5 h-3.5 text-codex-accent" />
                      Custom LLM Providers ({modelsConfigPath})
                    </h3>
                    <p className="text-[11px] text-slate-500 dark:text-zinc-400">
                      {t('settings.providers.customDesc')}
                    </p>
                  </div>
                  {!isEditingProvider && (
                    <button
                      onClick={handleAddNewProvider}
                      className="px-3 py-1.5 bg-codex-accent text-white rounded-lg text-xs font-medium hover:bg-codex-accent/90 transition-colors flex items-center gap-1.5 cursor-pointer"
                    >
                      <Plus className="w-3.5 h-3.5" />
                      {t('settings.providers.addProviderBtn')}
                    </button>
                  )}
                </div>

                {/* Provider edit / add form */}
                {isEditingProvider && editingProvider && (
                  <div className="p-4 bg-surface rounded-xl border border-codex-accent/40 space-y-4 shadow-sm animate-fade-in">
                    <div className="flex items-center justify-between border-b border-border pb-2">
                      <span className="text-xs font-semibold text-slate-900 dark:text-zinc-100 flex items-center gap-1.5">
                        <Edit3 className="w-3.5 h-3.5 text-codex-accent" />
                        {editingOriginalId ? t('settings.providers.editTitle', { id: editingOriginalId }) : t('settings.providers.newTitle')}
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
                          {t('settings.providers.idLabel')}
                        </label>
                        <input
                          type="text"
                          value={editingProvider.id}
                          onChange={(e) => setEditingProvider({ ...editingProvider, id: e.target.value })}
                          placeholder={t('settings.providers.idPlaceholder')}
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
                          placeholder={t('settings.providers.baseUrlPlaceholder')}
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
                            placeholder={t('settings.providers.apiKeyPlaceholder')}
                            autoComplete="off"
                            className="w-full pl-3 pr-9 py-1.5 bg-surface-highlight border border-border rounded-lg text-xs font-mono text-slate-900 dark:text-zinc-100 focus:outline-none focus:border-codex-accent"
                          />
                          <button
                            type="button"
                            onClick={() => setShowApiKey(!showApiKey)}
                            className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 dark:hover:text-zinc-200 cursor-pointer"
                            title={showApiKey ? t('settings.providers.hideKey') : t('settings.providers.showKey')}
                          >
                            {showApiKey ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
                          </button>
                        </div>
                        <span className="text-[10px] text-slate-400 dark:text-zinc-500 mt-0.5 block">
                          {t('settings.providers.apiKeyHint')}
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
                        <span>{t('settings.providers.authHeader')}</span>
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
                        <span>{t('settings.providers.streamUsage')}</span>
                      </label>
                    </div>

                    <div className="grid grid-cols-3 gap-3 pt-1">
                      <div>
                        <label className="text-xs font-medium text-slate-700 dark:text-zinc-300 block mb-1">
                          {t('settings.providers.authMode')}
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
                          <option value="">{t('settings.providers.authDefault')}</option>
                          <option value="none">{t('settings.providers.authNone')}</option>
                          <option value="oauth">OAuth</option>
                        </select>
                      </div>

                      <div>
                        <label className="text-xs font-medium text-slate-700 dark:text-zinc-300 block mb-1">
                          {t('settings.providers.discoveryTitle')}
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
                          <option value="">{t('settings.providers.discoveryOff')}</option>
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
                          placeholder={t('settings.providers.discoveryPlaceholder')}
                          className="w-full px-2.5 py-1.5 bg-surface border border-border rounded-lg text-xs font-mono text-slate-900 dark:text-zinc-100 focus:outline-none focus:border-codex-accent disabled:opacity-40"
                        />
                      </div>
                    </div>

                    <div>
                      <label className="text-xs font-medium text-slate-700 dark:text-zinc-300 block mb-1">
                        {t('settings.providers.customHeaders')}
                      </label>
                      <textarea
                        value={headersText}
                        onChange={(e) => setHeadersText(e.target.value)}
                        placeholder={t('settings.providers.customHeadersPlaceholder')}
                        rows={2}
                        className="w-full px-2.5 py-1.5 bg-surface border border-border rounded-lg text-xs font-mono text-slate-900 dark:text-zinc-100 focus:outline-none focus:border-codex-accent resize-y"
                      />
                    </div>

                    {/* Model list for this provider */}
                    <div className="space-y-2 border-t border-border pt-3">
                      <div className="flex items-center justify-between">
                        <label className="text-xs font-semibold text-slate-900 dark:text-zinc-100">
                          {t('settings.providers.modelListTitle')}
                        </label>
                        <button
                          type="button"
                          onClick={handleAddModelRow}
                          className="text-[11px] text-codex-accent hover:underline flex items-center gap-1 cursor-pointer"
                        >
                          <Plus className="w-3 h-3" />
                          {t('settings.providers.addModelRow')}
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
                                placeholder={t('settings.providers.modelIdPlaceholder')}
                                className="flex-2 px-2.5 py-1 bg-surface border border-border rounded text-xs font-mono text-slate-900 dark:text-zinc-100 focus:outline-none focus:border-codex-accent"
                              />
                              <input
                                type="text"
                                value={m.name || ''}
                                onChange={(e) => handleUpdateModelRow(idx, 'name', e.target.value)}
                                placeholder={t('settings.providers.modelNamePlaceholder')}
                                className="flex-2 px-2.5 py-1 bg-surface border border-border rounded text-xs text-slate-900 dark:text-zinc-100 focus:outline-none focus:border-codex-accent"
                              />
                              <input
                                type="number"
                                value={m.contextWindow || ''}
                                onChange={(e) => handleUpdateModelRow(idx, 'contextWindow', e.target.value ? Number(e.target.value) : undefined)}
                                placeholder={t('settings.providers.contextPlaceholder')}
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
                                title={t('settings.providers.deleteModel')}
                              >
                                <Trash2 className="w-3.5 h-3.5" />
                              </button>
                            </div>

                            <div className="flex items-center gap-4 flex-wrap pl-0.5">
                              <label className="flex items-center gap-1.5 text-[11px] text-slate-600 dark:text-zinc-300 cursor-pointer" title={t('settings.providers.visionTitle')}>
                                <input
                                  type="checkbox"
                                  checked={m.input?.includes('image') === true}
                                  onChange={(e) =>
                                    handleUpdateModelRow(idx, 'input', e.target.checked ? ['text', 'image'] : undefined)
                                  }
                                  className="rounded text-codex-accent focus:ring-codex-accent"
                                />
                                <span>{t('settings.providers.imageInput')}</span>
                              </label>

                              <label className="flex items-center gap-1.5 text-[11px] text-slate-600 dark:text-zinc-300 cursor-pointer" title={t('settings.providers.reasoningTitle')}>
                                <input
                                  type="checkbox"
                                  checked={m.reasoning === true}
                                  onChange={(e) =>
                                    handleUpdateModelRow(idx, 'reasoning', e.target.checked ? true : undefined)
                                  }
                                  className="rounded text-codex-accent focus:ring-codex-accent"
                                />
                                <span>{t('settings.modelsCatalog.reasoning')}</span>
                              </label>

                              <label className="flex items-center gap-1.5 text-[11px] text-slate-600 dark:text-zinc-300 cursor-pointer" title={t('settings.providers.toolsTitle')}>
                                <input
                                  type="checkbox"
                                  checked={m.supportsTools !== false}
                                  onChange={(e) =>
                                    handleUpdateModelRow(idx, 'supportsTools', e.target.checked ? undefined : false)
                                  }
                                  className="rounded text-codex-accent focus:ring-codex-accent"
                                />
                                <span>{t('settings.providers.toolCalling')}</span>
                              </label>

                              <div className="flex items-center gap-1.5 ml-auto" title={t('settings.providers.costTitle')}>
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
                              <div className="flex items-center gap-1.5" title={t('settings.providers.premiumTitle')}>
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

                              <label className="flex items-center gap-1.5 text-[11px] text-slate-600 dark:text-zinc-300 cursor-pointer" title={t('settings.providers.omitMaxTokensTitle')}>
                                <input
                                  type="checkbox"
                                  checked={m.omitMaxOutputTokens === true}
                                  onChange={(e) =>
                                    handleUpdateModelRow(idx, 'omitMaxOutputTokens', e.target.checked ? true : undefined)
                                  }
                                  className="rounded text-codex-accent focus:ring-codex-accent"
                                />
                                <span>{t('settings.providers.omitMaxTokens')}</span>
                              </label>

                              <div className="flex items-center gap-1.5" title={t('settings.providers.thinkingConfigTitle')}>
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
                                  <option value="">{t('settings.providers.discoveryOff')}</option>
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
                                  <span className="text-[10px] text-slate-400 dark:text-zinc-500">{t('settings.providers.thinkingDefaultLabel')}</span>
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
                                  <span className="text-[10px] text-amber-500">{t('settings.providers.thinkingEffortWarning')}</span>
                                )}
                              </div>
                            )}
                          </div>
                        ))}
                        {(!editingProvider.models || editingProvider.models.length === 0) && (
                          <div className="text-[11px] text-slate-400 dark:text-zinc-500 italic py-1">
                            {t('settings.providers.noModelsYet')}
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
                        {t('settings.providers.cancel')}
                      </button>
                      <button
                        type="button"
                        onClick={handleSaveEditingProvider}
                        className="px-4 py-1.5 bg-codex-accent text-white rounded-lg text-xs font-medium hover:bg-codex-accent/90 transition-colors cursor-pointer"
                      >
                        {t('settings.providers.saveProviderBtn')}
                      </button>
                    </div>
                  </div>
                )}

                {/* Configured custom providers list */}
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
                            title={t('settings.providers.editProvider')}
                          >
                            <Edit3 className="w-3.5 h-3.5" />
                          </button>
                          <button
                            onClick={() => handleDeleteProvider(cp.id)}
                            className="p-1.5 rounded-lg hover:bg-surface-highlight text-slate-400 hover:text-red-500 transition-colors cursor-pointer"
                            title={t('settings.providers.deleteProvider')}
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      </div>

                      {/* API Key environment variable status */}
                      <div className="flex items-center gap-3 text-xs pt-1 border-t border-border/50">
                        {cp.apiKey ? (
                          <div className="flex items-center gap-1.5">
                            <KeyRound className="w-3.5 h-3.5 text-slate-400" />
                            <span className="font-mono text-[11px] text-slate-700 dark:text-zinc-300">
                              {classifyApiKey(cp) === 'literal' ? maskSecret(cp.apiKey) : cp.apiKey}
                            </span>
                            {classifyApiKey(cp) === 'env-ok' && (
                              <span className="px-1.5 py-0.5 rounded text-[10px] font-medium bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border border-emerald-500/20">
                                {t('settings.providers.envPresent')}
                              </span>
                            )}
                            {classifyApiKey(cp) === 'env-missing' && (
                              <span className="px-1.5 py-0.5 rounded text-[10px] font-medium bg-amber-500/10 text-amber-600 dark:text-amber-400 border border-amber-500/20">
                                {t('settings.providers.envMissing')}
                              </span>
                            )}
                            {classifyApiKey(cp) === 'literal' && (
                              <span className="px-1.5 py-0.5 rounded text-[10px] font-medium bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border border-emerald-500/20">
                                {t('settings.providers.literalKey')}
                              </span>
                            )}
                            {classifyApiKey(cp) === 'command' && (
                              <span className="px-1.5 py-0.5 rounded text-[10px] font-medium bg-sky-500/10 text-sky-600 dark:text-sky-400 border border-sky-500/20">
                                {t('settings.providers.commandKey')}
                              </span>
                            )}
                          </div>
                        ) : (
                          <div className="flex items-center gap-1 text-[11px] text-slate-400 dark:text-zinc-500">
                            <KeyRound className="w-3 h-3" />
                            <span>{t('settings.providers.noKeyNeeded')}</span>
                          </div>
                        )}

                        <div className="text-[11px] text-slate-500 dark:text-zinc-400 ml-auto">
                          {t('settings.providers.registeredModels', { count: cp.models?.length || 0 })}
                        </div>
                      </div>

                      {/* Model chips list */}
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
                        {t('settings.providers.noProvidersInPath', { path: modelsConfigPath })}
                      </div>
                      <button
                        onClick={handleAddNewProvider}
                        className="text-xs text-codex-accent hover:underline font-medium cursor-pointer"
                      >
                        {t('settings.providers.addFirstProvider')}
                      </button>
                    </div>
                  )}
                </div>
              </div>

              {/* PART 2: Model Catalog Search & Refresh (Phase 7) */}
              <ModelsCatalogSection onRefreshModels={onRefreshModels} />

              {/* PART 3: Available Models from Engine RPC */}
              <div className="space-y-3 pt-4 border-t border-border">
                <div>
                  <h3 className="text-xs font-semibold text-slate-900 dark:text-zinc-100 flex items-center gap-1.5">
                    <Boxes className="w-3.5 h-3.5 text-indigo-400" />
                    {t('settings.providers.availableModelsTitle', { count: availableModels.length })}
                  </h3>
                  <p className="text-[11px] text-slate-500 dark:text-zinc-400">
                    {t('settings.providers.availableModelsDesc')}
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
                      {t('settings.providers.engineNotRunningModels')}
                    </div>
                  )}
                </div>
              </div>

              {/* PART 4: OAuth Login Services List */}
              <div className="space-y-3 pt-4 border-t border-border">
                <div className="flex items-center justify-between">
                  <div>
                    <h3 className="text-xs font-semibold text-slate-900 dark:text-zinc-100 flex items-center gap-1.5">
                      <Lock className="w-3.5 h-3.5 text-emerald-500" />
                      {t('settings.providers.oauthTitle', { count: loginProviders.length })}
                    </h3>
                    <p className="text-[11px] text-slate-500 dark:text-zinc-400">
                      {t('settings.providers.oauthDesc')}
                    </p>
                  </div>
                </div>
                {/* Engine offline warning */}
                {!effectiveEngineRunning && (
                  <div className="p-3 bg-amber-500/10 border border-amber-500/30 rounded-xl flex items-center gap-2 text-xs text-amber-700 dark:text-amber-400">
                    <AlertTriangle className="w-4 h-4 shrink-0" />
                    <span>{t('settings.providers.engineOfflineHint')}</span>
                  </div>
                )}


                {/* Terminal login instructions */}
                <div className="p-3 bg-surface rounded-xl border border-border space-y-2">
                  <div className="flex items-center justify-between text-xs">
                    <span className="text-slate-600 dark:text-zinc-300 font-medium flex items-center gap-1.5">
                      <Terminal className="w-3.5 h-3.5 text-codex-accent" />
                      {t('settings.providers.terminalLoginTitle')}
                    </span>
                    <button
                      onClick={() => handleCopyText('omp')}
                      className="px-2.5 py-1 bg-surface-highlight hover:bg-surface border border-border rounded text-xs font-medium text-slate-700 dark:text-zinc-300 flex items-center gap-1 cursor-pointer"
                    >
                      {copiedText === 'omp' ? (
                        <>
                          <Check className="w-3 h-3 text-emerald-500" />
                          <span>{t('settings.providers.copiedOmp')}</span>
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
                    {t('settings.providers.terminalLoginHint')}
                  </p>
                </div>

                {/* OAuth login session status */}
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
                        {authLogin.status === 'started' && t('settings.providers.authStarted', { providerId: authLogin.providerId })}
                        {authLogin.status === 'awaiting-browser' && t('settings.providers.authAwaitingBrowser', { providerId: authLogin.providerId })}
                        {authLogin.status === 'success' && t('settings.providers.authSuccess', { providerId: authLogin.providerId })}
                        {authLogin.status === 'error' && t('settings.providers.authFailed', { providerId: authLogin.providerId })}
                        {authLogin.status === 'cancelled' && t('settings.providers.authCancelled', { providerId: authLogin.providerId })}
                      </span>
                      {isAuthLoginPending ? (
                        <button
                          onClick={handleCancelAuthLogin}
                          className="px-2.5 py-1 rounded-lg text-[11px] font-medium bg-surface-highlight hover:bg-surface border border-border text-slate-600 dark:text-zinc-300 cursor-pointer"
                        >
                          {t('settings.providers.cancel')}
                        </button>
                      ) : (
                        <button
                          onClick={() => setAuthLogin(null)}
                          className="px-2.5 py-1 rounded-lg text-[11px] font-medium text-slate-500 dark:text-zinc-400 hover:text-slate-800 dark:hover:text-zinc-200 cursor-pointer"
                        >
                          {t('settings.providers.authClose')}
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
                          placeholder={t('settings.providers.authRedirectPlaceholder')}
                          className="flex-1 px-3 py-1.5 text-[11px] rounded-lg border border-border bg-panel text-slate-800 dark:text-zinc-200 outline-none font-mono focus:border-codex-accent"
                        />
                        <button
                          onClick={handleSubmitAuthCode}
                          disabled={!authCodeInput.trim()}
                          className="px-3 py-1.5 text-[11px] font-semibold bg-surface-highlight hover:bg-surface text-slate-800 dark:text-zinc-200 rounded-lg border border-border disabled:opacity-40 cursor-pointer"
                        >
                          {t('settings.providers.authSubmit')}
                        </button>
                      </div>
                    )}
                  </div>
                )}

                {/* Search Login Providers */}
                <div className="relative">
                  <Search className="w-3.5 h-3.5 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
                  <input
                    type="text"
                    value={loginSearchQuery}
                    onChange={(e) => setLoginSearchQuery(e.target.value)}
                    placeholder={t('settings.providers.searchLoginPlaceholder')}
                    className="w-full pl-9 pr-3 py-1.5 bg-surface border border-border rounded-lg text-xs text-slate-900 dark:text-zinc-100 placeholder-slate-400 focus:outline-none focus:border-codex-accent"
                  />
                </div>

                {/* Services List */}
                <div className="max-h-48 overflow-y-auto bg-surface rounded-xl border border-border divide-y divide-border">
                  {filteredLoginProviders.map((lp) => {
                    const isAuthed = authedProviders.includes(lp.id) || Boolean(lp.authenticated);
                    const isLoggingIn = authLogin?.providerId === lp.id && isAuthLoginPending;
                    const isLoggingOut = loggingOutProviderId === lp.id;
                    const isLoginDisabled = isAuthLoginPending;

                    return (
                      <div
                        key={lp.id}
                        className="px-3.5 py-2 flex items-center justify-between text-xs hover:bg-surface-highlight/50 transition-colors"
                      >
                        <div className="flex items-center gap-2">
                          <div>
                            <div className="font-medium text-slate-800 dark:text-zinc-200">{lp.name}</div>
                            <div className="text-[10px] font-mono text-slate-400 dark:text-zinc-500">{lp.id}</div>
                          </div>
                          {isAuthed && (
                            <span className="px-1.5 py-0.5 rounded bg-green-500/10 text-green-600 dark:text-green-400 text-[10px] font-medium border border-green-500/30">
                              ✓ {t('settings.providers.authenticated')}
                            </span>
                          )}
                        </div>
                        <div className="flex items-center gap-1.5">
                          {isAuthed && (
                            <button
                              onClick={() => handleLogout(lp.id)}
                              disabled={isLoggingOut || isAuthLoginPending}
                              className="px-2 py-1 border border-red-500/30 hover:bg-red-500/10 text-red-600 dark:text-red-400 rounded text-[10.5px] font-medium flex items-center gap-1 cursor-pointer disabled:opacity-40 disabled:cursor-default transition-colors"
                              title={t('settings.providers.logout')}
                            >
                              {isLoggingOut ? (
                                <RotateCw className="w-3 h-3 animate-spin" />
                              ) : (
                                <LogOut className="w-3 h-3" />
                              )}
                              <span>
                                {isLoggingOut
                                  ? t('settings.providers.loggingOut')
                                  : t('settings.providers.logout')}
                              </span>
                            </button>
                          )}
                          <button
                            onClick={() => handleStartAuthLogin(lp)}
                            disabled={isLoginDisabled}
                            className={`px-2 py-1 border rounded text-[10.5px] font-medium flex items-center gap-1 cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed ${
                              isLoggingIn
                                ? 'bg-codex-accent/10 border-codex-accent/40 text-codex-accent'
                                : 'bg-surface-highlight hover:bg-surface border-border text-slate-600 dark:text-zinc-300'
                            }`}
                            title={
                              !effectiveEngineRunning
                                ? t('settings.providers.engineOfflineBtnTooltip')
                                : t('settings.providers.oauthBrowser')
                            }
                          >
                            {isLoggingIn ? (
                              <RotateCw className="w-3 h-3 animate-spin" />
                            ) : (
                              <LogIn className="w-3 h-3" />
                            )}
                            <span>
                              {isLoggingIn
                                ? t('settings.providers.awaitingAuth')
                                : isAuthed
                                  ? t('settings.providers.relogin')
                                  : t('settings.providers.login')}
                            </span>
                          </button>
                        </div>
                      </div>
                    );
                  })}
                  {filteredLoginProviders.length === 0 && (
                    <div className="p-4 text-center text-xs text-slate-400 dark:text-zinc-500">
                      {t('settings.providers.noLoginResults', { query: loginSearchQuery })}
                    </div>
                  )}
                </div>
              </div>
            </div>
          )}

          {/* TAB 4: Engine Configuration Editor (Phase 3) */}
          {activeTab === 'engine-config' && (
            <EngineConfigEditor
              getEngineConfig={getEngineConfig}
              setEngineConfigValue={setEngineConfigValue}
              resetEngineConfigValue={resetEngineConfigValue}
              getEngineConfigPath={getEngineConfigPath}
              currentProfile={settings.profile || 'default'}
            />
          )}
        </div>

        {/* Modal Footer / Restart Banner */}
        <div className="p-4 border-t border-border bg-surface flex items-center justify-between">
          <div className="flex items-center gap-2">
            {hasEngineChanged && (
              <span className="text-xs text-amber-600 dark:text-amber-400 flex items-center gap-1.5 font-medium">
                <AlertTriangle className="w-3.5 h-3.5 shrink-0" />
                {t('settings.footer.restartBanner')}
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
                {isRestarting ? t('settings.footer.restarting') : effectiveEngineRunning ? t('settings.footer.restartNow') : t('settings.footer.startNow')}
              </button>
            )}
            <button
              onClick={onClose}
              className="px-4 py-1.5 bg-surface hover:bg-surface-highlight border border-border rounded-lg text-xs font-medium text-slate-700 dark:text-zinc-300 transition-colors cursor-pointer"
            >
              {t('settings.footer.close')}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
