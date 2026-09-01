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
  PanelLeft,
  PanelLeftClose,
  PanelRight,
  PanelRightClose,
} from 'lucide-react';
import { OmpAgentStatus, OmpInstallStatus, ThemeMode } from '../types';

interface HeaderBarProps {
  workspaceName: string;
  onOpenFolder: () => void;
  status: OmpAgentStatus;
  installStatus?: OmpInstallStatus | null;
  onOpenInstallModal?: () => void;
  selectedModel: string;
  onSelectModel: (model: string) => void;
  onOpenOmnibar: () => void;
  theme: ThemeMode;
  onToggleTheme: () => void;
  isLeftSidebarOpen: boolean;
  onToggleLeftSidebar: () => void;
  isRightSidebarOpen: boolean;
  onToggleRightSidebar: () => void;
}

const AVAILABLE_MODELS = [
  'claude-3-7-sonnet',
  'gpt-4o',
  'pi-deepseek-r1',
  'qwen-2.5-coder-32b',
];

export const HeaderBar: React.FC<HeaderBarProps> = ({
  workspaceName,
  onOpenFolder,
  status,
  installStatus,
  onOpenInstallModal,
  selectedModel,
  onSelectModel,
  onOpenOmnibar,
  theme,
  onToggleTheme,
  isLeftSidebarOpen,
  onToggleLeftSidebar,
  isRightSidebarOpen,
  onToggleRightSidebar,
}) => {
  const [isModelDropdownOpen, setIsModelDropdownOpen] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
        setIsModelDropdownOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const getStatusBadge = () => {
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
            onClick={() => setIsModelDropdownOpen(!isModelDropdownOpen)}
            className="flex items-center gap-2 px-3 py-1.5 rounded-lg text-xs bg-surface hover:bg-surface-highlight border border-border text-slate-800 dark:text-zinc-200 transition-colors font-medium cursor-pointer"
          >
            <Cpu className="w-3.5 h-3.5 text-codex-accent shrink-0" />
            <span className="font-mono text-[12px]">{selectedModel}</span>
            <ChevronDown className="w-3 h-3 text-slate-400 dark:text-zinc-500 shrink-0" />
          </button>

          {isModelDropdownOpen && (
            <div className="absolute top-full mt-1.5 left-0 w-52 bg-panel border border-border rounded-xl shadow-xl py-1.5 z-50 animate-fade-in">
              <div className="px-3 py-1 text-[11px] font-semibold text-slate-400 dark:text-zinc-500 uppercase tracking-wider">
                Select Model
              </div>
              {AVAILABLE_MODELS.map((model) => (
                <button
                  key={model}
                  onClick={() => {
                    onSelectModel(model);
                    setIsModelDropdownOpen(false);
                  }}
                  className={`w-full flex items-center justify-between px-3 py-1.5 text-xs text-left transition-colors cursor-pointer ${
                    selectedModel === model
                      ? 'bg-codex-accent/10 text-codex-accent font-semibold'
                      : 'text-slate-700 dark:text-zinc-300 hover:bg-surface-highlight'
                  }`}
                >
                  <span className="font-mono">{model}</span>
                  {selectedModel === model && <Check className="w-3.5 h-3.5 text-codex-accent" />}
                </button>
              ))}
            </div>
          )}
        </div>

        {getStatusBadge()}
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

        <button
          onClick={onOpenOmnibar}
          className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs bg-surface hover:bg-surface-highlight text-slate-600 dark:text-zinc-400 hover:text-slate-900 dark:hover:text-zinc-100 border border-border transition-colors cursor-pointer"
          title="Mở thanh lệnh nhanh (⌘K)"
        >
          <Command className="w-3.5 h-3.5" />
          <span className="font-semibold text-[11px]">K</span>
        </button>
      </div>
    </header>
  );
};
