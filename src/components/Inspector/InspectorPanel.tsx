import React, { memo, useState, useCallback, useEffect } from 'react';
import {
  Gauge,
  GitCommit,
  Globe,
  Maximize2,
  PanelRightClose,
} from 'lucide-react';
import { useI18n } from '../../i18n/I18nProvider';
import { BrowserPanel } from './BrowserPanel';
import { SummaryPanel } from './SummaryPanel';
import { DiffViewer } from '../Canvas/DiffViewer';
import type {
  InspectorTab,
  FileDiffItem,
  OmpContextUsage,
  OmpSessionStats,
  ThemeMode,
} from '../../types';

export interface InspectorPanelProps {
  isOpen: boolean;
  onClose: () => void;
  activeTab?: InspectorTab;
  onTabChange?: (tab: InspectorTab) => void;
  // Browser Tab
  initialBrowserUrl?: string;
  onSendUrlToChat?: (url: string) => void;
  // Changes Tab
  diffFiles?: FileDiffItem[];
  activeDiffIndex?: number;
  onSelectDiff?: (index: number) => void;
  onAcceptDiff?: () => void;
  onRejectDiff?: () => void;
  // Summary Tab
  contextUsage?: OmpContextUsage | null;
  tokensPerSecond?: number | null;
  sessionStats?: OmpSessionStats | null;
  onRefreshStats?: () => Promise<unknown>;
  model?: string;
  workspacePath?: string;
  // Canvas Expand
  onExpandCanvas?: () => void;
  theme?: ThemeMode;
  className?: string;
}

export const InspectorPanel: React.FC<InspectorPanelProps> = memo(function InspectorPanel({
  isOpen,
  onClose,
  activeTab,
  onTabChange,
  initialBrowserUrl = 'http://localhost:5173',
  onSendUrlToChat,
  diffFiles = [],
  activeDiffIndex = 0,
  onSelectDiff,
  onAcceptDiff,
  onRejectDiff,
  contextUsage,
  tokensPerSecond,
  sessionStats,
  onRefreshStats,
  model,
  workspacePath,
  onExpandCanvas,
  theme = 'light',
  className = '',
}) {
  const { t } = useI18n();
  const [internalTab, setInternalTab] = useState<InspectorTab>(activeTab ?? 'summary');
  const currentTab = activeTab !== undefined ? activeTab : internalTab;

  useEffect(() => {
    if (activeTab !== undefined) {
      setInternalTab(activeTab);
    }
  }, [activeTab]);

  const handleTabSelect = useCallback(
    (tab: InspectorTab) => {
      setInternalTab(tab);
      onTabChange?.(tab);
    },
    [onTabChange]
  );

  // Keyboard shortcut: Cmd+Shift+B opens Browser tab
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.shiftKey && e.key.toLowerCase() === 'b') {
        e.preventDefault();
        handleTabSelect('browser');
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [handleTabSelect]);

  if (!isOpen) {
    return null;
  }

  const currentDiff =
    diffFiles.length > 0
      ? diffFiles[Math.min(activeDiffIndex, diffFiles.length - 1)]
      : null;

  return (
    <div
      className={`flex flex-col h-full w-full bg-surface border-l border-border select-none overflow-hidden ${className}`}
    >
      {/* Top Header & Tab Strip */}
      <div className="h-10 px-2 bg-surface border-b border-border flex items-center justify-between shrink-0">
        <div className="flex items-center gap-1 overflow-x-auto no-scrollbar">
          {/* Summary Tab */}
          <button
            type="button"
            onClick={() => handleTabSelect('summary')}
            className={`flex items-center gap-1.5 px-2.5 py-1 rounded-md text-xs font-medium transition-colors ${
              currentTab === 'summary'
                ? 'bg-surface-highlight text-accent font-semibold shadow-2xs'
                : 'text-slate-600 dark:text-zinc-400 hover:text-slate-900 dark:hover:text-zinc-200'
            }`}
          >
            <Gauge className="w-3.5 h-3.5" />
            <span>{t('inspector.tabs.summary')}</span>
          </button>

          {/* Changes Tab */}
          <button
            type="button"
            onClick={() => handleTabSelect('changes')}
            className={`flex items-center gap-1.5 px-2.5 py-1 rounded-md text-xs font-medium transition-colors ${
              currentTab === 'changes'
                ? 'bg-surface-highlight text-accent font-semibold shadow-2xs'
                : 'text-slate-600 dark:text-zinc-400 hover:text-slate-900 dark:hover:text-zinc-200'
            }`}
          >
            <GitCommit className="w-3.5 h-3.5" />
            <span>{t('inspector.tabs.changes', { count: diffFiles.length })}</span>
          </button>

          {/* Browser Tab */}
          <button
            type="button"
            onClick={() => handleTabSelect('browser')}
            className={`flex items-center gap-1.5 px-2.5 py-1 rounded-md text-xs font-medium transition-colors ${
              currentTab === 'browser'
                ? 'bg-surface-highlight text-accent font-semibold shadow-2xs'
                : 'text-slate-600 dark:text-zinc-400 hover:text-slate-900 dark:hover:text-zinc-200'
            }`}
          >
            <Globe className="w-3.5 h-3.5" />
            <span>{t('inspector.tabs.browser')}</span>
          </button>

        </div>

        {/* Action Controls */}
        <div className="flex items-center gap-1 shrink-0 ml-2">
          {onExpandCanvas && (
            <button
              type="button"
              onClick={onExpandCanvas}
              title={t('inspector.expandToCanvas')}
              className="p-1 rounded-md hover:bg-surface-highlight text-slate-500 dark:text-zinc-400 hover:text-slate-800 dark:hover:text-zinc-200 transition-colors"
            >
              <Maximize2 className="w-3.5 h-3.5" />
            </button>
          )}

          <button
            type="button"
            onClick={onClose}
            title={t('inspector.close')}
            className="p-1 rounded-md hover:bg-surface-highlight text-slate-500 dark:text-zinc-400 hover:text-slate-800 dark:hover:text-zinc-200 transition-colors"
          >
            <PanelRightClose className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>

      {/* Main Tab Panels Viewport (Persistent Mounting for Browser Webview) */}
      <div className="flex-1 min-h-0 relative overflow-hidden">
        {/* Summary Tab */}
        <div className={`h-full w-full ${currentTab === 'summary' ? 'block' : 'hidden'}`}>
          <SummaryPanel
            contextUsage={contextUsage}
            tokensPerSecond={tokensPerSecond}
            sessionStats={sessionStats}
            onRefreshStats={onRefreshStats}
            model={model}
            workspacePath={workspacePath}
          />
        </div>

        {/* Changes Tab */}
        <div className={`h-full w-full flex flex-col ${currentTab === 'changes' ? 'block' : 'hidden'}`}>
          {diffFiles.length > 1 && (
            <div className="px-3 py-2 bg-surface border-b border-border flex items-center gap-2 shrink-0">
              <span className="text-xs text-slate-500 dark:text-zinc-400 shrink-0">File:</span>
              <select
                value={activeDiffIndex}
                onChange={(e) => onSelectDiff?.(Number(e.target.value))}
                className="flex-1 bg-surface-highlight text-xs font-mono rounded-md px-2 py-1 border border-border text-slate-700 dark:text-zinc-300 outline-none"
              >
                {diffFiles.map((item, idx) => (
                  <option key={item.filePath || idx} value={idx}>
                    {item.relativePath || item.filePath || `File #${idx + 1}`}
                  </option>
                ))}
              </select>
            </div>
          )}
          <div className="flex-1 min-h-0">
            <DiffViewer
              diff={currentDiff}
              onAccept={onAcceptDiff ?? (() => {})}
              onReject={onRejectDiff ?? (() => {})}
              theme={theme}
            />
          </div>
        </div>

        {/* Browser Tab - KEPT PERSISTENTLY MOUNTED */}
        <div className={`h-full w-full ${currentTab === 'browser' ? 'block' : 'hidden'}`}>
          <BrowserPanel
            initialUrl={initialBrowserUrl}
            onSendUrlToChat={onSendUrlToChat}
          />
        </div>

      </div>
    </div>
  );
});
