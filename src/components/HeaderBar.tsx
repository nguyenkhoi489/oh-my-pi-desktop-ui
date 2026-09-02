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
} from 'lucide-react';
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
  onGetGlobalUsage?: (forceRefresh?: boolean) => Promise<GlobalUsageResult>;
  onGetGlobalStats?: (forceRefresh?: boolean) => Promise<GlobalStatsResult>;
  approvalMode?: OmpApprovalMode;
  onSelectApprovalMode?: (mode: OmpApprovalMode) => void;
  isCompacting?: boolean;
  autoCompactionEnabled?: boolean;
  onCompact?: (customInstructions?: string) => Promise<{ success: boolean; error?: string }>;
  onSetAutoCompaction?: (enabled: boolean) => Promise<{ success: boolean; error?: string }>;
  onOpenSettingsModal?: () => void;
  onOpenOpsModal?: () => void;
  onCopyLastAssistantText?: () => Promise<string | null>;
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

const APPROVAL_OPTIONS: ApprovalOption[] = [
  { id: 'always-ask', label: 'Hỏi mọi tool', description: 'Yêu cầu phê duyệt trước khi gọi bất kỳ tool nào' },
  { id: 'write', label: 'Hỏi khi ghi & exec', description: 'Chỉ yêu cầu phê duyệt khi sửa file hoặc thực thi lệnh' },
  { id: 'yolo', label: 'Tự chạy', description: 'Tự động thực thi mọi tool mà không cần hỏi' },
];
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
  approvalMode,
  onSelectApprovalMode,
  isCompacting = false,
  autoCompactionEnabled = false,
  onCompact,
  onSetAutoCompaction,
  onOpenOpsModal,
  onOpenSettingsModal,
  onGetGlobalUsage,
  onGetGlobalStats,
  onToggleTerminal,
  isTerminalActive,
  onCopyLastAssistantText,
}) => {
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
        <span className="flex items-center gap-1.5 px-3 py-1 rounded-md text-xs font-medium bg-purple-500/10 text-purple-600 dark:text-purple-400 border border-purple-500/20 animate-pulse">
          <RotateCw className="w-3.5 h-3.5 animate-spin text-purple-500" />
          Đang nén context...
        </span>
      );
    }
    switch (status) {
      case 'thinking':
        return (
          <span className="flex items-center gap-1.5 px-3 py-1 rounded-md text-xs font-medium bg-codex-500/10 text-codex-500 dark:text-codex-400 border border-codex-500/20">
            <span className="w-2 h-2 rounded-full bg-codex-500 animate-pulse"></span>
            Thinking (AST / LSP)...
          </span>
        );
      case 'executing_tool':
        return (
          <span className="flex items-center gap-1.5 px-3 py-1 rounded-md text-xs font-medium bg-blue-500/10 text-blue-600 dark:text-blue-400 border border-blue-500/20">
            <RotateCw className="w-3.5 h-3.5 animate-spin text-blue-500" />
            Executing Tool
          </span>
        );
      case 'streaming':
        return (
          <span className="flex items-center gap-1.5 px-3 py-1 rounded-md text-xs font-medium bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border border-emerald-500/20">
            <Zap className="w-3.5 h-3.5 text-emerald-500 animate-pulse" />
            Generating Response
          </span>
        );
      case 'waiting_permission':
        return (
          <span className="flex items-center gap-1.5 px-3 py-1 rounded-md text-xs font-semibold bg-amber-500/10 text-amber-600 dark:text-amber-400 border border-amber-500/30 animate-pulse">
            Requires Approval
          </span>
        );
      default:
        return (
          <span className="flex items-center gap-1.5 px-2.5 py-1 rounded-md text-xs font-medium bg-surface text-slate-500 dark:text-zinc-400 border border-border">
            <span className="w-1.5 h-1.5 rounded-full bg-slate-400 dark:bg-zinc-500"></span>
            Idle
          </span>
        );
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
      ? `Ngữ cảnh: ${(contextUsage!.tokens as number).toLocaleString()} / ${(contextUsage!.contextWindow as number).toLocaleString()} tokens (${percent}%) - Click xem chi tiết`
      : `Ngữ cảnh: ${percent}% - Click xem chi tiết`
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
    <header className="h-12 bg-panel border-b border-border flex items-center justify-between px-3 pl-20 app-drag-region select-none">
      {/* Left: Project Folder Picker, Sidebar Toggle & OMP Status */}
      <div className="flex items-center gap-2.5 app-no-drag">
        {/* Toggle Left Sidebar Button */}
        <button
          onClick={onToggleLeftSidebar}
          className={`p-1.5 rounded-lg text-xs border transition-colors cursor-pointer ${
            isLeftSidebarOpen
              ? 'bg-surface-highlight text-codex-accent border-border'
              : 'bg-surface text-slate-500 dark:text-zinc-400 hover:text-slate-900 dark:hover:text-zinc-100 border-border'
          }`}
          title={isLeftSidebarOpen ? 'Thu gọn Explorer (⌘B)' : 'Mở rộng Explorer (⌘B)'}
        >
          {isLeftSidebarOpen ? (
            <PanelLeftClose className="w-4 h-4" />
          ) : (
            <PanelLeft className="w-4 h-4" />
          )}
        </button>

        <button
          onClick={onOpenFolder}
          className="flex items-center gap-2 px-3 py-1.5 rounded-lg text-xs font-medium bg-surface hover:bg-surface-highlight text-slate-800 dark:text-zinc-200 border border-border transition-colors cursor-pointer"
          title="Mở thư mục dự án"
        >
          <FolderOpen className="w-3.5 h-3.5 text-slate-500 dark:text-zinc-400 shrink-0" />
          <span className="max-w-[150px] truncate font-medium">{workspaceName}</span>
          <ChevronDown className="w-3.5 h-3.5 text-slate-400 dark:text-zinc-500 shrink-0" />
        </button>

        <div className="h-4 w-[1px] bg-border" />

        {/* Antigravity / OMP Branding Badge */}
        <div className="flex items-center gap-2 text-xs">
          <div className="flex items-center gap-1.5 font-bold tracking-tight text-slate-900 dark:text-zinc-100">
            <Sparkles className="w-3.5 h-3.5 text-codex-accent" />
            <span>OMP</span>
          </div>

          {installStatus?.installed ? (
            <span
              className="text-[11px] font-medium px-2 py-0.5 bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 rounded-md border border-emerald-500/20 flex items-center gap-1.5"
              title={`OMP Binary: ${installStatus.binaryPath}`}
            >
              <span className="w-1.5 h-1.5 rounded-full bg-emerald-500"></span>
              {installStatus.version || 'Connected'}
            </span>
          ) : (
            <button
              onClick={onOpenInstallModal}
              className="text-[11px] font-semibold px-2 py-0.5 bg-amber-500/10 text-amber-600 dark:text-amber-400 rounded-md border border-amber-500/30 hover:bg-amber-500/20 transition-colors flex items-center gap-1.5 cursor-pointer"
              title="Click để xem hướng dẫn cài đặt OMP"
            >
              <span className="w-1.5 h-1.5 rounded-full bg-amber-500 animate-ping"></span>
              Setup OMP
            </button>
          )}
        </div>
      </div>

      {/* Center: Model Selector & Agent Status */}
      <div className="flex items-center gap-2.5 app-no-drag">
        <div className="relative" ref={dropdownRef}>
          <button
            onClick={() => {
              if (!isBusy && hasWorkspace) {
                setIsModelDropdownOpen(!isModelDropdownOpen);
              }
            }}
            disabled={isBusy || !hasWorkspace}
            className={`flex items-center gap-2 px-3 py-1.5 rounded-lg text-xs border border-border transition-colors font-medium ${
              isBusy || !hasWorkspace
                ? 'bg-surface opacity-70 cursor-not-allowed text-slate-500 dark:text-zinc-400'
                : 'bg-surface hover:bg-surface-highlight text-slate-800 dark:text-zinc-200 cursor-pointer'
            }`}
            title={
              !hasWorkspace
                ? 'Mở project trước khi chọn model'
                : isBusy
                  ? 'Không thể đổi model khi agent đang hoạt động'
                  : 'Chọn Model & Thinking Level'
            }
          >
            <Cpu className="w-3.5 h-3.5 text-codex-accent shrink-0" />
            <span className="font-mono text-[12px] max-w-[180px] truncate">{activeModelName}</span>
            {thinkingLevel !== 'off' && (
              <span className="text-[10px] px-1.5 py-0.2 rounded bg-codex-accent/15 text-codex-accent font-semibold uppercase">
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
                              <span title="Reasoning model">
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
        <div className="relative" ref={approvalDropdownRef}>
          <button
            onClick={() => {
              setIsApprovalDropdownOpen(!isApprovalDropdownOpen);
            }}
            className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs border border-border bg-surface hover:bg-surface-highlight text-slate-800 dark:text-zinc-200 transition-colors font-medium cursor-pointer"
            title="Chế độ phê duyệt công cụ (Approval Mode)"
          >
            <Shield className="w-3.5 h-3.5 text-codex-accent shrink-0" />
            <span className="text-[12px] truncate max-w-[130px]">
              {approvalMode === 'always-ask'
                ? 'Hỏi mọi tool'
                : approvalMode === 'yolo'
                ? 'Tự chạy'
                : 'Hỏi khi ghi & exec'}
            </span>
            <ChevronDown className="w-3 h-3 text-slate-400 dark:text-zinc-500 shrink-0" />
          </button>

          {isApprovalDropdownOpen && (
            <div className="absolute top-full mt-1.5 left-0 w-64 bg-panel border border-border rounded-xl shadow-xl py-2 z-50 animate-fade-in divide-y divide-border">
              <div className="px-3 py-1 text-[10.5px] font-semibold text-slate-400 dark:text-zinc-500 uppercase tracking-wider">
                Approval Mode
              </div>
              <div className="pt-1 space-y-0.5 px-1">
                {APPROVAL_OPTIONS.map((opt) => {
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
            className="flex items-center gap-1 px-2 py-1 rounded-md text-[11px] font-mono font-medium bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border border-emerald-500/20 animate-pulse"
            title="Tốc độ sinh token"
          >
            <Zap className="w-3 h-3 text-emerald-500" />
            {tokensPerSecond >= 10 ? Math.round(tokensPerSecond) : tokensPerSecond.toFixed(1)} tok/s
          </span>
        )}

        {hasContextUsage && percent != null && (
          <button
            onClick={() => setIsStatsPanelOpen(true)}
            className={`flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs border transition-colors cursor-pointer ${getMeterColorClass(percent)}`}
            title={contextTooltip}
          >
            <Database className="w-3.5 h-3.5 shrink-0 text-codex-accent" />
            <span className="font-mono text-[11.5px]">
              {formattedTokens && formattedWindow ? `${formattedTokens}/${formattedWindow} (${percent}%)` : formattedTokens ? `${formattedTokens} (${percent}%)` : `${percent}%`}
            </span>
          </button>
        )}
      </div>

      {/* Right: Right Sidebar Toggle, Theme Toggle & Quick Action ⌘K */}
      <div className="flex items-center gap-2 app-no-drag">
        {/* Toggle Right Agent Panel Button */}
        <button
          onClick={onToggleRightSidebar}
          className={`flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs border transition-colors cursor-pointer ${
            isRightSidebarOpen
              ? 'bg-surface-highlight text-codex-accent border-border font-semibold shadow-xs'
              : 'bg-surface text-slate-600 dark:text-zinc-400 hover:text-slate-900 dark:hover:text-zinc-100 border-border'
          }`}
          title={isRightSidebarOpen ? 'Thu gọn Agent Panel (⌘J)' : 'Mở rộng Agent Panel (⌘J)'}
        >
          {isRightSidebarOpen ? (
            <PanelRightClose className="w-3.5 h-3.5 text-codex-accent" />
          ) : (
            <PanelRight className="w-3.5 h-3.5 text-slate-500 dark:text-zinc-400" />
          )}
          <span className="font-medium text-[11.5px]">Copilot</span>
        </button>

        <button
          onClick={onToggleTheme}
          className="p-2 rounded-lg text-xs bg-surface hover:bg-surface-highlight text-slate-600 dark:text-zinc-400 hover:text-slate-900 dark:hover:text-zinc-100 border border-border transition-colors cursor-pointer"
          title={`Chuyển sang chế độ ${theme === 'light' ? 'Dark' : 'Light'}`}
        >
          {theme === 'light' ? (
            <Moon className="w-3.5 h-3.5 text-slate-700" />
          ) : (
            <Sun className="w-3.5 h-3.5 text-amber-400" />
          )}
        </button>
        {onCopyLastAssistantText && (
          <button
            onClick={handleCopyLastAssistantText}
            className="p-2 rounded-lg text-xs bg-surface hover:bg-surface-highlight text-slate-600 dark:text-zinc-400 hover:text-slate-900 dark:hover:text-zinc-100 border border-border transition-colors cursor-pointer"
            title={copiedLastText ? 'Đã sao chép phản hồi cuối' : 'Sao chép phản hồi cuối cùng'}
          >
            {copiedLastText ? (
              <Check className="w-3.5 h-3.5 text-emerald-500" />
            ) : (
              <Copy className="w-3.5 h-3.5" />
            )}
          </button>
        )}

        {onToggleTerminal && (
          <button
            onClick={onToggleTerminal}
            className={`p-2 rounded-lg text-xs border transition-colors cursor-pointer ${
              isTerminalActive
                ? 'bg-emerald-950/60 border-emerald-800/60 text-emerald-400'
                : 'bg-surface hover:bg-surface-highlight text-slate-600 dark:text-zinc-400 hover:text-slate-900 dark:hover:text-zinc-100 border-border'
            }`}
            title="Bật/tắt Terminal Console (⌘`)"
          >
            <Terminal className="w-3.5 h-3.5" />
          </button>
        )}


        {onOpenOpsModal && (
          <button
            onClick={onOpenOpsModal}
            className="p-2 rounded-lg text-xs bg-surface hover:bg-surface-highlight text-slate-600 dark:text-zinc-400 hover:text-slate-900 dark:hover:text-zinc-100 border border-border transition-colors cursor-pointer"
            title="Quản lý vận hành (Ops Center)"
          >
            <SlidersHorizontal className="w-3.5 h-3.5" />
          </button>
        )}

        {onOpenSettingsModal && (
          <button
            onClick={onOpenSettingsModal}
            className="p-2 rounded-lg text-xs bg-surface hover:bg-surface-highlight text-slate-600 dark:text-zinc-400 hover:text-slate-900 dark:hover:text-zinc-100 border border-border transition-colors cursor-pointer"
            title="Cài đặt (Settings)"
          >
            <Settings className="w-3.5 h-3.5" />
          </button>
        )}

        <button
          onClick={onOpenOmnibar}
          className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs bg-surface hover:bg-surface-highlight text-slate-600 dark:text-zinc-400 hover:text-slate-900 dark:hover:text-zinc-100 border border-border transition-colors cursor-pointer"
          title="Mở thanh lệnh nhanh (⌘K)"
        >
          <Command className="w-3.5 h-3.5" />
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
          onCompact={onCompact}
          onSetAutoCompaction={onSetAutoCompaction}
        />
      )}
    </header>
  );
};

