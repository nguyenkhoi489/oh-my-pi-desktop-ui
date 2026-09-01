import React from 'react';
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
} from 'lucide-react';
import { OmpAgentStatus, ThemeMode } from '../types';

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
}

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
}) => {
  const getStatusBadge = () => {
    switch (status) {
      case 'thinking':
        return (
          <span className="flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-medium bg-purple-500/10 text-purple-600 dark:text-purple-400 border border-purple-500/30 animate-pulse">
            <span className="w-1.5 h-1.5 rounded-full bg-purple-600 dark:bg-purple-400"></span>
            Thinking (AST / LSP)...
          </span>
        );
      case 'executing_tool':
        return (
          <span className="flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-medium bg-blue-500/10 text-blue-600 dark:text-blue-400 border border-blue-500/30">
            <RotateCw className="w-3 h-3 animate-spin text-blue-600 dark:text-blue-400" />
            Executing Tool
          </span>
        );
      case 'streaming':
        return (
          <span className="flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-medium bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border border-emerald-500/30">
            <Zap className="w-3 h-3 text-emerald-600 dark:text-emerald-400" />
            Generating Response
          </span>
        );
      case 'waiting_permission':
        return (
          <span className="flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-medium bg-amber-500/10 text-amber-600 dark:text-amber-400 border border-amber-500/30 animate-bounce">
            Requires Approval
          </span>
        );
      default:
        return (
          <span className="flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-medium bg-slate-100 dark:bg-zinc-800 text-slate-600 dark:text-zinc-400 border border-slate-200 dark:border-zinc-700/50">
            <span className="w-1.5 h-1.5 rounded-full bg-slate-400 dark:bg-zinc-500"></span>
            Idle
          </span>
        );
    }
  };

  return (
    <header className="h-11 bg-panel border-b border-border flex items-center justify-between px-3 pl-20 app-drag-region select-none shadow-sm dark:shadow-none">
      {/* Left: Project Folder Picker */}
      <div className="flex items-center gap-3 app-no-drag">
        <button
          onClick={onOpenFolder}
          className="flex items-center gap-1.5 px-2.5 py-1 rounded-md text-xs font-medium bg-surface hover:bg-surface-highlight text-slate-700 dark:text-zinc-300 border border-border hover:border-slate-300 dark:hover:border-zinc-600 transition-colors"
          title="Mở thư mục dự án"
        >
          <FolderOpen className="w-3.5 h-3.5 text-slate-500 dark:text-zinc-400" />
          <span className="max-w-[140px] truncate">{workspaceName}</span>
          <ChevronDown className="w-3 h-3 text-slate-400 dark:text-zinc-500" />
        </button>

        <div className="h-4 w-[1px] bg-slate-200 dark:bg-zinc-800" />

        {/* Antigravity / OMP Branding Badge */}
        <div className="flex items-center gap-1.5 text-xs text-slate-600 dark:text-zinc-400">
          <Sparkles className="w-3.5 h-3.5 text-purple-600 dark:text-purple-400" />
          <span className="font-bold text-slate-900 dark:text-zinc-200">OMP</span>

          {installStatus?.installed ? (
            <span
              className="text-[10px] uppercase font-semibold tracking-wider px-1.5 py-0.2 bg-emerald-100 dark:bg-emerald-950/60 text-emerald-700 dark:text-emerald-300 rounded border border-emerald-300 dark:border-emerald-500/30 flex items-center gap-1"
              title={`OMP Binary: ${installStatus.binaryPath}`}
            >
              <span className="w-1.5 h-1.5 rounded-full bg-emerald-500"></span>
              {installStatus.version || 'Connected'}
            </span>
          ) : (
            <button
              onClick={onOpenInstallModal}
              className="text-[10px] uppercase font-bold tracking-wider px-1.5 py-0.2 bg-amber-100 dark:bg-amber-950/60 text-amber-700 dark:text-amber-300 rounded border border-amber-300 dark:border-amber-500/30 hover:bg-amber-200 transition-colors flex items-center gap-1"
              title="Click để xem hướng dẫn cài đặt OMP"
            >
              <span className="w-1.5 h-1.5 rounded-full bg-amber-500 animate-ping"></span>
              Setup OMP
            </button>
          )}
        </div>
      </div>

      {/* Center: Model Selector & Agent Status */}
      <div className="flex items-center gap-2 app-no-drag">
        <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-md text-xs bg-surface border border-border text-slate-700 dark:text-zinc-300 hover:border-slate-300 dark:hover:border-zinc-600 cursor-pointer transition-colors">
          <Cpu className="w-3.5 h-3.5 text-purple-600 dark:text-purple-400" />
          <span className="font-medium">{selectedModel}</span>
          <ChevronDown className="w-3 h-3 text-slate-400 dark:text-zinc-500" />
        </div>

        {getStatusBadge()}
      </div>

      {/* Right: Theme Toggle & Quick Action ⌘K */}
      <div className="flex items-center gap-1.5 app-no-drag">
        <button
          onClick={onToggleTheme}
          className="p-1.5 rounded-md text-xs bg-surface hover:bg-surface-highlight text-slate-600 dark:text-zinc-400 hover:text-slate-900 dark:hover:text-zinc-200 border border-border transition-colors"
          title={`Chuyển sang chế độ ${theme === 'light' ? 'Dark' : 'Light'}`}
        >
          {theme === 'light' ? (
            <Moon className="w-3.5 h-3.5 text-slate-600" />
          ) : (
            <Sun className="w-3.5 h-3.5 text-amber-400" />
          )}
        </button>

        <button
          onClick={onOpenOmnibar}
          className="flex items-center gap-1.5 px-2.5 py-1 rounded-md text-xs bg-surface hover:bg-surface-highlight text-slate-600 dark:text-zinc-400 hover:text-slate-900 dark:hover:text-zinc-200 border border-border transition-colors"
          title="Mở thanh lệnh nhanh (⌘K)"
        >
          <Command className="w-3 h-3" />
          <span className="font-semibold">K</span>
        </button>
      </div>
    </header>
  );
};
