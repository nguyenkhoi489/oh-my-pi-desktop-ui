import React, { useState } from 'react';
import {
  FolderOpen,
  ChevronDown,
  Sparkles,
  Command,
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
  Settings,
  SlidersHorizontal,
  Volume2,
  Square,
  MessageSquare,
  LayoutDashboard,
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

  centerView?: 'chat' | 'workbench';
  onToggleCenterView?: (view: 'chat' | 'workbench') => void;
}


export const HeaderBar: React.FC<HeaderBarProps> = ({
  workspaceName,
  onOpenFolder,
  status,
  installStatus,
  onOpenInstallModal,
  onOpenOmnibar,
  theme,
  onToggleTheme,
  isLeftSidebarOpen,
  onToggleLeftSidebar,
  isRightSidebarOpen,
  onToggleRightSidebar,
  tokensPerSecond,
  isCompacting = false,
  onOpenOpsModal,
  onOpenSettingsModal,
  onCopyLastAssistantText,
  isSpeaking,
  onSpeakLastAssistantText,
  onStopSpeaking,
  centerView = 'chat',
  onToggleCenterView,
}) => {
  const { t } = useI18n();

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

      {/* Center: Agent Status & Stream Rate */}
      <div className="flex-1 flex items-center justify-center gap-1.5 lg:gap-2 app-no-drag min-w-0 mx-1 sm:mx-2">
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
        {onToggleCenterView && (
          <div className="flex items-center p-0.5 rounded-lg bg-surface border border-border shrink-0">
            <button
              type="button"
              onClick={() => onToggleCenterView('chat')}
              className={`px-2 py-1 rounded-md text-xs font-medium transition-colors cursor-pointer flex items-center gap-1.5 ${
                centerView === 'chat'
                  ? 'bg-surface-highlight text-codex-accent shadow-xs'
                  : 'text-slate-500 dark:text-zinc-400 hover:text-slate-900 dark:hover:text-zinc-100'
              }`}
              title={t('header.chatView')}
            >
              <MessageSquare className="w-3 h-3" />
              <span className="hidden xl:inline">{t('header.chat')}</span>
            </button>
            <button
              type="button"
              onClick={() => onToggleCenterView('workbench')}
              className={`px-2 py-1 rounded-md text-xs font-medium transition-colors cursor-pointer flex items-center gap-1.5 ${
                centerView === 'workbench'
                  ? 'bg-surface-highlight text-codex-accent shadow-xs'
                  : 'text-slate-500 dark:text-zinc-400 hover:text-slate-900 dark:hover:text-zinc-100'
              }`}
              title={t('header.workbenchView')}
            >
              <LayoutDashboard className="w-3 h-3" />
              <span className="hidden xl:inline">{t('header.workbench')}</span>
            </button>
          </div>
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

    </header>
  );
};

