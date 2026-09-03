import React, { useState, useRef, useEffect } from 'react';
import {
  FolderOpen,
  Sparkles,
  Command,
  ChevronDown,
  Cpu,
  Zap,
  RotateCw,
  Sun,
  Moon,
  Check,
  Copy,
  PanelLeft,
  PanelLeftClose,
  PanelRight,
  PanelRightClose,
  Brain,
  Database,
  Shield,
  Settings,
  SlidersHorizontal,
  Terminal,
  Volume2,
  Square,
} from 'lucide-react';
import { useI18n } from '../i18n/I18nProvider';
import {
  OmpAgentStatus,
  OmpInstallStatus,
  ThemeMode,
  OmpModelInfo,
  OmpThinkingLevel,
  OmpContextUsage,
  OmpSessionStats,
  OmpApprovalMode,
  GlobalUsageResult,
  GlobalStatsResult,
  FetchGlobalUsageOptions,
  FetchUsageHistoryOptions,
  UsageHistoryResult,
  FetchUsageClientsOptions,
  UsageClientsResult,
  InvalidateUsageOptions,
  UsageInvalidateResult,
  StartStatsDashboardOptions,
  StatsDashboardResult,
  StatsDashboardStatus,
} from '../types';
import { SessionStatsPanel } from './HeaderBar/SessionStatsPanel';
interface HeaderBarProps {
  workspaceName: string;
  hasWorkspace?: boolean;
  onOpenFolder: () => void;
  status: OmpAgentStatus;
  installStatus?: OmpInstallStatus | null;
  onOpenInstallModal?: () => void;
  selectedModel?: OmpModelInfo | string | null;
  availableModels?: OmpModelInfo[];
  thinkingLevel?: OmpThinkingLevel;
  onSelectModel?: (provider: string, modelId: string) => void;
  onSelectThinkingLevel?: (level: OmpThinkingLevel) => void;
  onOpenOmnibar: () => void;
  theme: ThemeMode;
  onToggleTheme: () => void;
  isLeftSidebarOpen: boolean;
  onToggleLeftSidebar: () => void;
  isRightSidebarOpen: boolean;
  onToggleRightSidebar: () => void;
  contextUsage?: OmpContextUsage | null;
  tokensPerSecond?: number | null;
  onGetSessionStats?: () => Promise<{ success: boolean; stats?: OmpSessionStats; error?: string }>;
  onGetGlobalUsage?: (options?: boolean | FetchGlobalUsageOptions) => Promise<GlobalUsageResult>;
  onGetGlobalStats?: (forceRefresh?: boolean) => Promise<GlobalStatsResult>;
  onGetUsageHistory?: (options?: FetchUsageHistoryOptions) => Promise<UsageHistoryResult>;
  onGetUsageClients?: (options?: FetchUsageClientsOptions) => Promise<UsageClientsResult>;
  onInvalidateUsage?: (options?: InvalidateUsageOptions) => Promise<UsageInvalidateResult>;
  onStartStatsDashboard?: (options?: StartStatsDashboardOptions) => Promise<StatsDashboardResult>;
  onStopStatsDashboard?: () => Promise<StatsDashboardResult>;
  onGetStatsDashboardStatus?: () => Promise<StatsDashboardStatus>;
  onOpenExternal?: (url: string) => Promise<{ success: boolean; error?: string }>;
  approvalMode?: OmpApprovalMode;
  onSelectApprovalMode?: (mode: OmpApprovalMode) => void;
  isCompacting?: boolean;
  autoCompactionEnabled?: boolean;
  onCompact?: (customInstructions?: string) => Promise<{ success: boolean; error?: string }>;
  onSetAutoCompaction?: (enabled: boolean) => Promise<{ success: boolean; error?: string }>;
  onOpenSettingsModal?: () => void;
  onOpenOpsModal?: () => void;
  onCopyLastAssistantText?: () => Promise<string | null>;
  isSpeaking?: boolean;
  onSpeakLastAssistantText?: () => void;
  onStopSpeaking?: () => void;
  onToggleTerminal?: () => void;
  isTerminalActive?: boolean;
}

const FALLBACK_MODELS: OmpModelInfo[] = [
  { id: 'claude-3-7-sonnet', name: 'Claude 3.7 Sonnet', provider: 'anthropic', reasoning: true },
  { id: 'gpt-4o', name: 'GPT-4o', provider: 'openai', reasoning: false },
  { id: 'pi-deepseek-r1', name: 'DeepSeek R1', provider: 'deepseek', reasoning: true },
  { id: 'qwen-2.5-coder-32b', name: 'Qwen 2.5 Coder 32B', provider: 'lmstudio', reasoning: false },
];

const THINKING_LEVELS: OmpThinkingLevel[] = [
  'off',
  'minimal',
  'low',
  'medium',
  'high',
  'xhigh',
  'max',
  'auto',
];

interface ApprovalOption {
  id: OmpApprovalMode;
  label: string;
  description: string;
}

export const HeaderBar: React.FC<HeaderBarProps> = ({
  workspaceName,
  hasWorkspace = true,
  onOpenFolder,
  status,
  installStatus,
  onOpenInstallModal,
  selectedModel,
  availableModels = [],
  thinkingLevel = 'off',
  onSelectModel,
  onSelectThinkingLevel,
  onOpenOmnibar,
  theme,
  onToggleTheme,
  isLeftSidebarOpen,
  onToggleLeftSidebar,
  isRightSidebarOpen,
  onToggleRightSidebar,
  contextUsage,
  tokensPerSecond,
  onGetSessionStats,
  onGetGlobalUsage,
  onGetGlobalStats,
  onGetUsageHistory,
  onGetUsageClients,
  onInvalidateUsage,
  onStartStatsDashboard,
  onStopStatsDashboard,
  onGetStatsDashboardStatus,
  onOpenExternal,
  approvalMode,
  onSelectApprovalMode,
  isCompacting = false,
  autoCompactionEnabled = false,
  onCompact,
  onSetAutoCompaction,
  onOpenOpsModal,
  onOpenSettingsModal,
  onToggleTerminal,
  isTerminalActive,
  onCopyLastAssistantText,
  isSpeaking,
  onSpeakLastAssistantText,
  onStopSpeaking,
}) => {
  const { t } = useI18n();
  const approvalOptions: ApprovalOption[] = React.useMemo(() => [
    { id: 'always-ask', label: t('header.approval.alwaysAsk'), description: t('header.approval.alwaysAskDesc') },
    { id: 'write', label: t('header.approval.write'), description: t('header.approval.writeDesc') },
    { id: 'yolo', label: t('header.approval.yolo'), description: t('header.approval.yoloDesc') },
  ], [t]);
  const [isModelDropdownOpen, setIsModelDropdownOpen] = useState(false);
  const [isApprovalDropdownOpen, setIsApprovalDropdownOpen] = useState(false);
  const [isStatsPanelOpen, setIsStatsPanelOpen] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);
  const approvalDropdownRef = useRef<HTMLDivElement>(null);
  const [copiedLastText, setCopiedLastText] = useState(false);

  const handleCopyLastAssistantText = async () => {
    if (onCopyLastAssistantText) {
      const text = await onCopyLastAssistantText();
      if (text) {
        await navigator.clipboard.writeText(text);
        setCopiedLastText(true);
        setTimeout(() => setCopiedLastText(false), 2000);
      }
    }
  };

  const isBusy = status !== 'idle';
  const modelList = availableModels.length > 0 ? availableModels : FALLBACK_MODELS;

  const activeModelId = typeof selectedModel === 'string'
    ? selectedModel
    : (selectedModel?.id || modelList[0]?.id);

  const activeModelName = typeof selectedModel === 'string'
    ? selectedModel
    : (selectedModel?.name || selectedModel?.id || modelList[0]?.name || 'Select Model');

  const activeProvider = typeof selectedModel === 'object' && selectedModel
    ? selectedModel.provider
    : modelList.find((m) => m.id === activeModelId)?.provider;

  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
        setIsModelDropdownOpen(false);
      }
      if (approvalDropdownRef.current && !approvalDropdownRef.current.contains(e.target as Node)) {
        setIsApprovalDropdownOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);
  const getStatusBadge = () => {
    if (isCompacting) {
      return (
        <span
          className="flex items-center gap-1.5 whitespace-nowrap px-2.5 lg:px-3 py-1 rounded-md text-xs font-medium bg-purple-500/10 text-purple-600 dark:text-purple-400 border border-purple-500/20 animate-pulse shrink-0"
          title={t('header.compactingContext')}
        >
          <RotateCw className="w-3.5 h-3.5 animate-spin text-purple-500 shrink-0" />
          <span className="hidden sm:inline">{t('header.compactingContext')}</span>
          <span className="sm:hidden">Compacting...</span>
        </span>
      );
    }
    switch (status) {
      case 'thinking':
        return (
          <span
            className="flex items-center gap-1.5 whitespace-nowrap px-2.5 lg:px-3 py-1 rounded-md text-xs font-medium bg-codex-500/10 text-codex-500 dark:text-codex-400 border border-codex-500/20 shrink-0"
            title="Thinking (AST / LSP)..."
          >
            <span className="w-2 h-2 rounded-full bg-codex-500 animate-pulse shrink-0"></span>
            <span className="hidden 2xl:inline">Thinking (AST / LSP)...</span>
            <span className="2xl:hidden">Thinking...</span>
          </span>
        );
      case 'executing_tool':
        return (
          <span
            className="flex items-center gap-1.5 whitespace-nowrap px-2.5 lg:px-3 py-1 rounded-md text-xs font-medium bg-blue-500/10 text-blue-600 dark:text-blue-400 border border-blue-500/20 shrink-0"
            title="Executing Tool"
          >
            <RotateCw className="w-3.5 h-3.5 animate-spin text-blue-500 shrink-0" />
            <span className="hidden sm:inline">Executing Tool</span>
            <span className="sm:hidden">Running...</span>
          </span>
        );
      case 'streaming':
        return (
          <span
            className="flex items-center gap-1.5 whitespace-nowrap px-2.5 lg:px-3 py-1 rounded-md text-xs font-medium bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border border-emerald-500/20 shrink-0"
            title="Generating Response"
          >
            <Zap className="w-3.5 h-3.5 text-emerald-500 animate-pulse shrink-0" />
            <span className="hidden sm:inline">Generating Response</span>
            <span className="sm:hidden">Generating...</span>
          </span>
        );
      case 'waiting_permission':
        return (
          <span
            className="flex items-center gap-1.5 whitespace-nowrap px-2.5 lg:px-3 py-1 rounded-md text-xs font-semibold bg-amber-500/10 text-amber-600 dark:text-amber-400 border border-amber-500/30 animate-pulse shrink-0"
            title="Requires Approval"
          >
            <span className="hidden sm:inline">Requires Approval</span>
            <span className="sm:hidden">Approval</span>
          </span>
        );
      default:
        return null;
    }
  };

  const formatCompactTokens = (tokens?: number | null): string => {
    if (tokens == null || isNaN(tokens)) return '';
    if (tokens >= 1_000_000) return `${(tokens / 1_000_000).toFixed(1)}M`;
    if (tokens >= 1_000) return `${(tokens / 1_000).toFixed(1)}k`;
    return String(tokens);
  };

  const hasContextUsage =
    contextUsage?.percent != null &&
    typeof contextUsage.percent === 'number' &&
    !isNaN(contextUsage.percent);

  const percent = hasContextUsage
    ? Math.round((contextUsage!.percent as number) * 10) / 10
    : null;

  const formattedTokens = contextUsage?.tokens != null ? formatCompactTokens(contextUsage.tokens) : null;
  const formattedWindow = contextUsage?.contextWindow != null ? formatCompactTokens(contextUsage.contextWindow) : null;

  const contextTooltip = hasContextUsage
    ? contextUsage!.tokens != null && contextUsage!.contextWindow != null
      ? t('header.contextUsageDetail', { tokens: (contextUsage!.tokens as number).toLocaleString(), window: (contextUsage!.contextWindow as number).toLocaleString(), percent: percent ?? 0 })
      : t('header.contextUsageSimple', { percent: percent ?? 0 })
    : undefined;
  const getMeterColorClass = (pct: number) => {
    if (pct > 90) {
      return 'bg-rose-500/10 text-rose-600 dark:text-rose-400 border-rose-500/30 animate-pulse font-semibold';
    }
    if (pct > 75) {
      return 'bg-amber-500/10 text-amber-600 dark:text-amber-400 border-amber-500/30 font-semibold';
    }
    return 'bg-surface hover:bg-surface-highlight text-slate-600 dark:text-zinc-400 hover:text-slate-900 dark:hover:text-zinc-100 border-border';
  };

  return (
    <header className="h-12 bg-panel border-b border-border flex items-center justify-between px-3 pl-20 app-drag-region select-none min-w-0 relative z-30">
      {/* Left: Project Folder Picker, Sidebar Toggle & OMP Status */}
      <div className="flex items-center gap-2 lg:gap-2.5 app-no-drag shrink-0 min-w-0">
        {/* Toggle Left Sidebar Button */}
        <button
          onClick={onToggleLeftSidebar}
          className={`p-1.5 rounded-lg text-xs border transition-colors cursor-pointer shrink-0 ${
            isLeftSidebarOpen
              ? 'bg-surface-highlight text-codex-accent border-border'
              : 'bg-surface text-slate-500 dark:text-zinc-400 hover:text-slate-900 dark:hover:text-zinc-100 border-border'
          }`}
          title={isLeftSidebarOpen ? t('header.collapseExplorer') : t('header.expandExplorer')}
        >
          {isLeftSidebarOpen ? (
            <PanelLeftClose className="w-4 h-4" />
          ) : (
            <PanelLeft className="w-4 h-4" />
          )}
        </button>

        <button
          onClick={onOpenFolder}
          className="flex items-center gap-1.5 lg:gap-2 px-2.5 lg:px-3 py-1.5 rounded-lg text-xs font-medium bg-surface hover:bg-surface-highlight text-slate-800 dark:text-zinc-200 border border-border transition-colors cursor-pointer shrink-0"
          title={t('header.openProjectFolder')}
        >
          <FolderOpen className="w-3.5 h-3.5 text-slate-500 dark:text-zinc-400 shrink-0" />
          <span className="max-w-[100px] sm:max-w-[130px] lg:max-w-[150px] truncate font-medium">{workspaceName}</span>
          <ChevronDown className="w-3.5 h-3.5 text-slate-400 dark:text-zinc-500 shrink-0" />
        </button>

        <div className="h-4 w-[1px] bg-border shrink-0" />

        {/* Antigravity / OMP Branding Badge */}
        <div className="flex items-center gap-1.5 lg:gap-2 text-xs shrink-0">
          <div className="flex items-center gap-1.5 font-bold tracking-tight text-slate-900 dark:text-zinc-100 shrink-0">
            <Sparkles className="w-3.5 h-3.5 text-codex-accent shrink-0" />
            <span>OMP</span>
          </div>

          {installStatus?.installed ? (
            <span
              className="text-[11px] font-medium px-1.5 sm:px-2 py-0.5 bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 rounded-md border border-emerald-500/20 flex items-center gap-1.5 shrink-0"
              title={`OMP Binary: ${installStatus.binaryPath}`}
            >
              <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 shrink-0"></span>
              <span className="hidden sm:inline">{installStatus.version || 'Connected'}</span>
            </span>
          ) : (
            <button
              onClick={onOpenInstallModal}
              className="text-[11px] font-semibold px-2 py-0.5 bg-amber-500/10 text-amber-600 dark:text-amber-400 rounded-md border border-amber-500/30 hover:bg-amber-500/20 transition-colors flex items-center gap-1.5 cursor-pointer shrink-0"
              title={t('header.setupOmpTooltip')}
            >
              <span className="w-1.5 h-1.5 rounded-full bg-amber-500 animate-ping shrink-0"></span>
              Setup OMP
            </button>
          )}
        </div>
      </div>

      {/* Center: Model Selector & Agent Status */}
      <div className="flex-1 flex items-center justify-center gap-1.5 lg:gap-2 app-no-drag min-w-0 mx-1 sm:mx-2">
        <div className="relative shrink-0 min-w-0" ref={dropdownRef}>
          <button
            onClick={() => {
              if (!isBusy && hasWorkspace) {
                setIsModelDropdownOpen(!isModelDropdownOpen);
              }
            }}
            disabled={isBusy || !hasWorkspace}
            className={`flex items-center gap-1.5 lg:gap-2 px-2.5 lg:px-3 py-1.5 rounded-lg text-xs border border-border transition-colors font-medium shrink-0 ${
              isBusy || !hasWorkspace
                ? 'bg-surface opacity-70 cursor-not-allowed text-slate-500 dark:text-zinc-400'
                : 'bg-surface hover:bg-surface-highlight text-slate-800 dark:text-zinc-200 cursor-pointer'
            }`}
            title={
              !hasWorkspace
                ? t('header.openProjectBeforeModel')
                : isBusy
                  ? t('header.modelDisabledBusy')
                  : t('header.selectModelAndThinking')
            }
          >
            <Cpu className="w-3.5 h-3.5 text-codex-accent shrink-0" />
            <span className="font-mono text-[12px] max-w-[90px] sm:max-w-[130px] lg:max-w-[160px] truncate">{activeModelName}</span>
            {thinkingLevel !== 'off' && (
              <span className="text-[10px] px-1.5 py-0.2 rounded bg-codex-accent/15 text-codex-accent font-semibold uppercase shrink-0">
                {thinkingLevel}
              </span>
            )}
            <ChevronDown className="w-3 h-3 text-slate-400 dark:text-zinc-500 shrink-0" />
          </button>

          {isModelDropdownOpen && (
            <div className="absolute top-full mt-1.5 left-0 w-72 bg-panel border border-border rounded-xl shadow-xl py-2 z-50 animate-fade-in divide-y divide-border">
              {/* Section 1: Model Selection */}
              <div className="pb-2">
                <div className="flex items-center justify-between px-3 py-1 text-[10.5px] font-semibold text-slate-400 dark:text-zinc-500 uppercase tracking-wider">
                  <span>Available Models</span>
                  {availableModels.length > 0 && (
                    <span className="text-[10px] text-emerald-600 dark:text-emerald-400 font-mono">Live</span>
                  )}
                </div>
                <div className="max-h-56 overflow-y-auto mt-1 space-y-0.5 px-1">
                  {modelList.map((model) => {
                    const isSelected =
                      model.id === activeModelId &&
                      (!activeProvider || model.provider === activeProvider);

                    return (
                      <button
                        key={`${model.provider}/${model.id}`}
                        onClick={() => {
                          onSelectModel?.(model.provider, model.id);
                          setIsModelDropdownOpen(false);
                        }}
                        className={`w-full flex items-center justify-between px-2.5 py-1.5 rounded-lg text-xs text-left transition-colors cursor-pointer ${
                          isSelected
                            ? 'bg-codex-accent/10 text-codex-accent font-semibold'
                            : 'text-slate-700 dark:text-zinc-300 hover:bg-surface-highlight'
                        }`}
                      >
                        <div className="flex flex-col min-w-0 pr-2">
                          <div className="flex items-center gap-1.5">
                            <span className="font-mono text-[11.5px] truncate">
                              {model.name || model.id}
                            </span>
                            {model.reasoning && (
                              <span title={t('header.reasoningModel')}>
                                <Brain className="w-3 h-3 text-amber-500 shrink-0" />
                              </span>
                            )}
                          </div>
                          <span className="text-[10px] text-slate-400 dark:text-zinc-500 truncate">
                            {model.provider}
                          </span>
                        </div>
                        {isSelected && (
                          <Check className="w-3.5 h-3.5 text-codex-accent shrink-0" />
                        )}
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* Section 2: Thinking Level Selection */}
              <div className="pt-2 px-3">
                <div className="flex items-center justify-between py-1 text-[10.5px] font-semibold text-slate-400 dark:text-zinc-500 uppercase tracking-wider">
                  <span className="flex items-center gap-1.5">
                    <Brain className="w-3 h-3 text-codex-accent" />
                    Thinking Level
                  </span>
                  <span className="text-[10px] text-codex-accent font-mono capitalize">
                    {thinkingLevel}
                  </span>
                </div>
                <div className="grid grid-cols-4 gap-1 mt-1.5">
                  {THINKING_LEVELS.map((level) => {
                    const isSelected = thinkingLevel === level;
                    return (
                      <button
                        key={level}
                        onClick={() => {
                          onSelectThinkingLevel?.(level);
                        }}
                        className={`px-2 py-1 rounded-md text-[11px] font-mono text-center transition-colors cursor-pointer ${
                          isSelected
                            ? 'bg-codex-accent text-white font-semibold shadow-xs'
                            : 'bg-surface hover:bg-surface-highlight text-slate-700 dark:text-zinc-300 border border-border/50'
                        }`}
                      >
                        {level}
                      </button>
                    );
                  })}
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Approval Mode Selector */}
        <div className="relative shrink-0 min-w-0" ref={approvalDropdownRef}>
          <button
            onClick={() => {
              setIsApprovalDropdownOpen(!isApprovalDropdownOpen);
            }}
            className="flex items-center gap-1.5 px-2 lg:px-2.5 py-1.5 rounded-lg text-xs border border-border bg-surface hover:bg-surface-highlight text-slate-800 dark:text-zinc-200 transition-colors font-medium cursor-pointer shrink-0"
            title={t('header.approvalModeTooltip')}
          >
            <Shield className="w-3.5 h-3.5 text-codex-accent shrink-0" />
            <span className="text-[12px] truncate max-w-[70px] sm:max-w-[90px] lg:max-w-[120px]">
              {approvalMode === 'always-ask'
                ? t('header.approval.alwaysAsk')
                : approvalMode === 'yolo'
                ? t('header.approval.yolo')
                : t('header.approval.write')}
            </span>
            <ChevronDown className="w-3 h-3 text-slate-400 dark:text-zinc-500 shrink-0" />
          </button>

          {isApprovalDropdownOpen && (
            <div className="absolute top-full mt-1.5 left-0 w-64 bg-panel border border-border rounded-xl shadow-xl py-2 z-50 animate-fade-in divide-y divide-border">
              <div className="px-3 py-1 text-[10.5px] font-semibold text-slate-400 dark:text-zinc-500 uppercase tracking-wider">
                Approval Mode
              </div>
              <div className="pt-1 space-y-0.5 px-1">
                {approvalOptions.map((opt) => {
                  const isSelected = approvalMode === opt.id || (!approvalMode && opt.id === 'write');
                  return (
                    <button
                      key={opt.id}
                      onClick={() => {
                        onSelectApprovalMode?.(opt.id);
                        setIsApprovalDropdownOpen(false);
                      }}
                      className={`w-full flex items-center justify-between px-2.5 py-2 rounded-lg text-xs text-left transition-colors cursor-pointer ${
                        isSelected
                          ? 'bg-codex-accent/10 text-codex-accent font-semibold'
                          : 'text-slate-700 dark:text-zinc-300 hover:bg-surface-highlight'
                      }`}
                    >
                      <div className="flex flex-col min-w-0 pr-2">
                        <span className="text-[11.5px] font-medium">{opt.label}</span>
                        <span className="text-[10px] text-slate-400 dark:text-zinc-500 leading-tight mt-0.5">
                          {opt.description}
                        </span>
                      </div>
                      {isSelected && (
                        <Check className="w-3.5 h-3.5 text-codex-accent shrink-0" />
                      )}
                    </button>
                  );
                })}
              </div>
            </div>
          )}
        </div>

        {getStatusBadge()}

        {status === 'streaming' && tokensPerSecond != null && tokensPerSecond > 0 && (
          <span
            className="flex items-center gap-1 whitespace-nowrap px-2 py-1 rounded-md text-[11px] font-mono font-medium bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border border-emerald-500/20 animate-pulse shrink-0"
            title={t('header.tokensPerSecondTooltip')}
          >
            <Zap className="w-3 h-3 text-emerald-500 shrink-0" />
            <span>{tokensPerSecond >= 10 ? Math.round(tokensPerSecond) : tokensPerSecond.toFixed(1)}</span>
            <span className="hidden sm:inline"> tok/s</span>
            <span className="sm:hidden">/s</span>
          </span>
        )}

        {hasContextUsage && percent != null && (
          <button
            onClick={() => setIsStatsPanelOpen(true)}
            className={`flex items-center gap-1.5 whitespace-nowrap px-2 lg:px-2.5 py-1.5 rounded-lg text-xs border transition-colors cursor-pointer shrink-0 ${getMeterColorClass(percent)}`}
            title={contextTooltip}
          >
            <Database className="w-3.5 h-3.5 shrink-0 text-codex-accent" />
            <span className="font-mono text-[11.5px] hidden xl:inline">
              {formattedTokens && formattedWindow ? `${formattedTokens}/${formattedWindow} (${percent}%)` : formattedTokens ? `${formattedTokens} (${percent}%)` : `${percent}%`}
            </span>
            <span className="font-mono text-[11.5px] hidden sm:inline xl:hidden">
              {formattedTokens ? `${formattedTokens} (${percent}%)` : `${percent}%`}
            </span>
            <span className="font-mono text-[11.5px] sm:hidden">
              {percent}%
            </span>
          </button>
        )}
      </div>

      {/* Right: Right Sidebar Toggle, Theme Toggle & Quick Action ⌘K */}
      <div className="flex items-center gap-1 sm:gap-1.5 app-no-drag shrink-0">
        {/* Toggle Right Agent Panel Button */}
        <button
          onClick={onToggleRightSidebar}
          className={`p-1.5 rounded-lg text-xs border transition-colors cursor-pointer shrink-0 ${
            isRightSidebarOpen
              ? 'bg-surface-highlight text-codex-accent border-border font-semibold shadow-xs'
              : 'bg-surface text-slate-600 dark:text-zinc-400 hover:text-slate-900 dark:hover:text-zinc-100 border-border'
          }`}
          title={isRightSidebarOpen ? t('header.collapseAgent') : t('header.expandAgent')}
        >
          {isRightSidebarOpen ? (
            <PanelRightClose className="w-3.5 h-3.5 text-codex-accent shrink-0" />
          ) : (
            <PanelRight className="w-3.5 h-3.5 text-slate-500 dark:text-zinc-400 shrink-0" />
          )}
        </button>
        <button
          onClick={onToggleTheme}
          className="p-1.5 lg:p-2 rounded-lg text-xs bg-surface hover:bg-surface-highlight text-slate-600 dark:text-zinc-400 hover:text-slate-900 dark:hover:text-zinc-100 border border-border transition-colors cursor-pointer shrink-0"
          title={t('header.switchTheme', { theme: theme === 'light' ? 'Dark' : 'Light' })}
        >
          {theme === 'light' ? (
            <Moon className="w-3.5 h-3.5 text-slate-700 shrink-0" />
          ) : (
            <Sun className="w-3.5 h-3.5 text-amber-400 shrink-0" />
          )}
        </button>
        {onCopyLastAssistantText && (
          <div className="flex items-center gap-1 shrink-0">
            <button
              onClick={handleCopyLastAssistantText}
              className="p-1.5 lg:p-2 rounded-lg text-xs bg-surface hover:bg-surface-highlight text-slate-600 dark:text-zinc-400 hover:text-slate-900 dark:hover:text-zinc-100 border border-border transition-colors cursor-pointer shrink-0"
              title={copiedLastText ? t('header.copiedLastResponse') : t('header.copyLastResponseAction')}
            >
              {copiedLastText ? (
                <Check className="w-3.5 h-3.5 text-emerald-500 shrink-0" />
              ) : (
                <Copy className="w-3.5 h-3.5 shrink-0" />
              )}
            </button>

            {onSpeakLastAssistantText && (
              <button
                onClick={() => {
                  if (isSpeaking) {
                    onStopSpeaking?.();
                  } else {
                    onSpeakLastAssistantText();
                  }
                }}
                className={`p-1.5 lg:p-2 rounded-lg text-xs border transition-colors cursor-pointer shrink-0 ${
                  isSpeaking
                    ? 'bg-amber-500/15 border-amber-500/30 text-amber-600 dark:text-amber-400 animate-pulse'
                    : 'bg-surface hover:bg-surface-highlight text-slate-600 dark:text-zinc-400 hover:text-slate-900 dark:hover:text-zinc-100 border-border'
                }`}
                title={isSpeaking ? t('tts.stop') : t('tts.speakLast')}
              >
                {isSpeaking ? (
                  <Square className="w-3.5 h-3.5 fill-current shrink-0" />
                ) : (
                  <Volume2 className="w-3.5 h-3.5 shrink-0" />
                )}
              </button>
            )}
          </div>
        )}
        {onToggleTerminal && (
          <button
            onClick={onToggleTerminal}
            className={`p-1.5 lg:p-2 rounded-lg text-xs border transition-colors cursor-pointer shrink-0 ${
              isTerminalActive
                ? 'bg-emerald-950/60 border-emerald-800/60 text-emerald-400'
                : 'bg-surface hover:bg-surface-highlight text-slate-600 dark:text-zinc-400 hover:text-slate-900 dark:hover:text-zinc-100 border-border'
            }`}
            title={t('header.toggleTerminal')}
          >
            <Terminal className="w-3.5 h-3.5 shrink-0" />
          </button>
        )}

        {onOpenOpsModal && (
          <button
            onClick={onOpenOpsModal}
            className="p-1.5 lg:p-2 rounded-lg text-xs bg-surface hover:bg-surface-highlight text-slate-600 dark:text-zinc-400 hover:text-slate-900 dark:hover:text-zinc-100 border border-border transition-colors cursor-pointer shrink-0"
            title={t('header.opsCenterTooltip')}
          >
            <SlidersHorizontal className="w-3.5 h-3.5 shrink-0" />
          </button>
        )}


        {onOpenSettingsModal && (
          <button
            onClick={onOpenSettingsModal}
            className="p-1.5 lg:p-2 rounded-lg text-xs bg-surface hover:bg-surface-highlight text-slate-600 dark:text-zinc-400 hover:text-slate-900 dark:hover:text-zinc-100 border border-border transition-colors cursor-pointer shrink-0"
            title={t('header.settingsTooltip')}
          >
            <Settings className="w-3.5 h-3.5 shrink-0" />
          </button>
        )}

        <button
          onClick={onOpenOmnibar}
          className="flex items-center gap-1.5 px-2 lg:px-2.5 py-1.5 rounded-lg text-xs bg-surface hover:bg-surface-highlight text-slate-600 dark:text-zinc-400 hover:text-slate-900 dark:hover:text-zinc-100 border border-border transition-colors cursor-pointer shrink-0"
          title={t('header.omnibarTooltip')}
        >
          <Command className="w-3.5 h-3.5 shrink-0" />
          <span className="font-semibold text-[11px]">K</span>
        </button>
      </div>
      {onGetSessionStats && (
        <SessionStatsPanel
          isOpen={isStatsPanelOpen}
          onClose={() => setIsStatsPanelOpen(false)}
          onRefresh={onGetSessionStats}
          contextUsage={contextUsage}
          isCompacting={isCompacting}
          autoCompactionEnabled={autoCompactionEnabled}
          onGetGlobalUsage={onGetGlobalUsage}
          onGetGlobalStats={onGetGlobalStats}
          onGetUsageHistory={onGetUsageHistory}
          onGetUsageClients={onGetUsageClients}
          onInvalidateUsage={onInvalidateUsage}
          onStartStatsDashboard={onStartStatsDashboard}
          onStopStatsDashboard={onStopStatsDashboard}
          onGetStatsDashboardStatus={onGetStatsDashboardStatus}
          onOpenExternal={onOpenExternal}
          onCompact={onCompact}
          onSetAutoCompaction={onSetAutoCompaction}
        />
      )}
    </header>
  );
};

