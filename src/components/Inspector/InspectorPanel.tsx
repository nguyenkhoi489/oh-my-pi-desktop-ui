import React, { memo, useState, useCallback, useEffect, useMemo } from 'react';
import {
  Bot,
  GitCommit,
  Globe,
  Loader2,
  Maximize2,
  PanelRightClose,
  ChevronLeft,
} from 'lucide-react';
import { useI18n } from '../../i18n/I18nProvider';
import { BrowserPanel } from './BrowserPanel';
import { SummaryPanel } from './SummaryPanel';
import { DiffViewer } from '../Canvas/DiffViewer';
import { ArtifactsOverview } from './ArtifactsOverview';
import { SubagentTranscript } from '../AgentPanel/SubagentTranscript';
import type {
  InspectorTab,
  FileDiffItem,
  OmpContextUsage,
  OmpSessionStats,
  ThemeMode,
  ChatFileAttachment,
  OmpSubagentInfo,
} from '../../types';

export interface InspectorPanelProps {
  isOpen: boolean;
  onClose: () => void;
  activeTab?: InspectorTab;
  onTabChange?: (tab: InspectorTab) => void;
  // Browser Tab
  initialBrowserUrl?: string;
  browserUrlNonce?: number;
  onSendUrlToChat?: (url: string) => void;
  // Changes Tab
  diffFiles?: FileDiffItem[];
  activeDiffIndex?: number;
  onSelectDiff?: (index: number) => void;
  onAcceptDiff?: () => void;
  onRejectDiff?: () => void;
  // Summary Tab
  sources?: ChatFileAttachment[];
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
  subagents?: OmpSubagentInfo[];
}

export const InspectorPanel: React.FC<InspectorPanelProps> = memo(function InspectorPanel({
  isOpen,
  onClose,
  activeTab,
  onTabChange,
  initialBrowserUrl = 'http://localhost:5173',
  browserUrlNonce,
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
  sources = [],
  className = '',
  subagents = [],
}) {
  const { t } = useI18n();
  const [internalTab, setInternalTab] = useState<InspectorTab>(activeTab ?? 'changes');
  const currentTab = activeTab !== undefined ? activeTab : internalTab;

  const [isViewingDiffDetail, setIsViewingDiffDetail] = useState<boolean>(false);

  // Reset diff detail mode when diffs are cleared
  useEffect(() => {
    if (diffFiles.length === 0) {
      setIsViewingDiffDetail(false);
    }
  }, [diffFiles.length]);
  const [selectedSubagentId, setSelectedSubagentId] = useState<string | null>(null);
  const activeSelectedSubagent = useMemo(() => {
    if (!selectedSubagentId || !subagents) return null;
    return (
      subagents.find((s) => s.id === selectedSubagentId) ||
      ({ id: selectedSubagentId, agent: 'task', status: 'completed' } as OmpSubagentInfo)
    );
  }, [selectedSubagentId, subagents]);

  const hasSubagents = Array.isArray(subagents) && subagents.length > 0;
  const activeSubagentsCount = Array.isArray(subagents)
    ? subagents.filter((s) => s.status === 'running' || s.status === 'started').length
    : 0;
  const hasChanges = diffFiles.length > 0;

  const hasSubagentsTab = hasSubagents || currentTab === 'subagents';
  const hasChangesTab = hasChanges || currentTab === 'changes';
  const [hasVisitedBrowser, setHasVisitedBrowser] = useState<boolean>(false);
  useEffect(() => {
    if (currentTab === 'browser' || initialBrowserUrl) {
      setHasVisitedBrowser(true);
    }
  }, [currentTab, initialBrowserUrl]);
  const hasBrowserTab = currentTab === 'browser' || hasVisitedBrowser || Boolean(initialBrowserUrl);
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
          {/* Sub-agents Tab - Only show if subagents exist or currently selected */}
          {hasSubagentsTab && (
            <button
              type="button"
              onClick={() => handleTabSelect('subagents')}
              className={`flex items-center gap-1.5 px-2.5 py-1 rounded-md text-xs font-medium transition-colors cursor-pointer ${
                currentTab === 'subagents'
                  ? 'bg-surface-highlight text-accent font-semibold shadow-2xs'
                  : 'text-slate-600 dark:text-zinc-400 hover:text-slate-900 dark:hover:text-zinc-200'
              }`}
            >
              <Bot className="w-3.5 h-3.5" />
              <span>{t('inspector.tabs.subagents')}</span>
              {activeSubagentsCount > 0 && (
                <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
              )}
            </button>
          )}

          {/* Changes Tab - Only show if diffFiles exist or currently selected */}
          {hasChangesTab && (
            <button
              type="button"
              onClick={() => handleTabSelect('changes')}
              className={`flex items-center gap-1.5 px-2.5 py-1 rounded-md text-xs font-medium transition-colors cursor-pointer ${
                currentTab === 'changes'
                  ? 'bg-surface-highlight text-accent font-semibold shadow-2xs'
                  : 'text-slate-600 dark:text-zinc-400 hover:text-slate-900 dark:hover:text-zinc-200'
              }`}
            >
              <GitCommit className="w-3.5 h-3.5" />
              <span>{t('inspector.tabs.changes', { count: diffFiles.length })}</span>
            </button>
          )}

          {/* Browser Tab - Only show if currentTab === 'browser' */}
          {hasBrowserTab && (
            <button
              type="button"
              onClick={() => handleTabSelect('browser')}
              className={`flex items-center gap-1.5 px-2.5 py-1 rounded-md text-xs font-medium transition-colors cursor-pointer ${
                currentTab === 'browser'
                  ? 'bg-surface-highlight text-accent font-semibold shadow-2xs'
                  : 'text-slate-600 dark:text-zinc-400 hover:text-slate-900 dark:hover:text-zinc-200'
              }`}
            >
              <Globe className="w-3.5 h-3.5" />
              <span>{t('inspector.tabs.browser')}</span>
            </button>
          )}

          {/* Fallback if no tabs match */}
          {!hasSubagentsTab && !hasChangesTab && !hasBrowserTab && (
            <span className="text-[11px] text-slate-400 dark:text-zinc-500 px-2 font-medium">
              {t('inspector.tabs.noActiveTasks')}
            </span>
          )}
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
        {/* Sub-agents Tab */}
        <div className={`h-full w-full overflow-y-auto ${currentTab === 'subagents' ? 'block' : 'hidden'}`}>
          <div className="p-3 space-y-2">
            {!hasSubagents ? (
              <div className="py-12 flex flex-col items-center justify-center text-center text-slate-400 dark:text-zinc-500">
                <Bot className="w-8 h-8 mb-2 opacity-40" />
                <span className="text-xs font-medium">{t('inspector.tabs.noActiveTasks')}</span>
              </div>
            ) : (
              subagents.map((subagent) => {
                const isRunning = subagent.status === 'running' || subagent.status === 'started';
                return (
                  <div
                    key={subagent.id}
                    onClick={() => setSelectedSubagentId(subagent.id)}
                    className="flex flex-col gap-1.5 p-3 rounded-lg bg-surface border border-border hover:border-blue-500/50 hover:bg-surface-highlight text-slate-900 dark:text-zinc-100 shadow-2xs select-none cursor-pointer transition-all"
                  >
                    <div className="flex items-center justify-between gap-1.5">
                      <div className="flex items-center gap-1.5 min-w-0 flex-1">
                        <Bot className="w-4 h-4 text-slate-500 dark:text-zinc-400 shrink-0" />
                        <span className="font-semibold truncate text-xs">
                          {subagent.id}
                        </span>
                        {subagent.agent && subagent.agent !== subagent.id && (
                          <span className="text-[10px] text-slate-400 dark:text-zinc-500 truncate">
                            ({subagent.agent})
                          </span>
                        )}
                      </div>
                      <span
                        className={`inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-medium shrink-0 ${
                          isRunning
                            ? 'bg-blue-500/10 text-blue-600 dark:text-blue-400 border border-blue-500/20'
                            : 'bg-slate-500/10 text-slate-600 dark:text-slate-400 border border-slate-500/20'
                        }`}
                      >
                        {isRunning && <Loader2 className="w-2.5 h-2.5 animate-spin" />}
                        {subagent.status}
                      </span>
                    </div>

                    {(subagent.description || subagent.task) && (
                      <div className="text-xs text-slate-600 dark:text-zinc-300 line-clamp-2 leading-relaxed">
                        {subagent.description || subagent.task}
                      </div>
                    )}

                    {subagent.progressText && (
                      <div className="text-[11px] text-slate-400 dark:text-zinc-400 flex items-center gap-1 truncate pt-0.5">
                        <span className="w-1 h-1 rounded-full bg-blue-500 shrink-0" />
                        <span className="truncate">{subagent.progressText}</span>
                      </div>
                    )}
                  </div>
                );
              })
            )}
          </div>
        </div>
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
          {!isViewingDiffDetail ? (
            <ArtifactsOverview
              diffFiles={diffFiles}
              sources={sources}
              onSelectDiff={(idx) => {
                onSelectDiff?.(idx);
                setIsViewingDiffDetail(true);
              }}
            />
          ) : (
            <div className="h-full w-full flex flex-col">
              <div className="px-3 py-1.5 bg-surface border-b border-border flex items-center justify-between gap-2 shrink-0">
                <button
                  type="button"
                  onClick={() => setIsViewingDiffDetail(false)}
                  className="flex items-center gap-1 text-xs text-slate-600 dark:text-zinc-400 hover:text-slate-900 dark:hover:text-zinc-200 transition-colors cursor-pointer"
                >
                  <ChevronLeft className="w-3.5 h-3.5" />
                  <span>{t('inspector.artifacts.backToOverview')}</span>
                </button>
                {diffFiles.length > 1 && (
                  <select
                    value={activeDiffIndex}
                    onChange={(e) => onSelectDiff?.(Number(e.target.value))}
                    className="bg-surface-highlight text-xs font-mono rounded-md px-2 py-0.5 border border-border text-slate-700 dark:text-zinc-300 outline-none max-w-[200px] truncate"
                  >
                    {diffFiles.map((item, idx) => (
                  <option key={item.filePath || idx} value={idx}>
                    {item.relativePath || item.filePath || `File #${idx + 1}`}
                  </option>
                ))}
              </select>
            )}
              </div>
              <div className="flex-1 min-h-0">
                <DiffViewer
                  diff={currentDiff}
                  onAccept={onAcceptDiff ?? (() => {})}
                  onReject={onRejectDiff ?? (() => {})}
                  theme={theme}
                />
              </div>
            </div>
          )}
        </div>

        {/* Browser Tab - KEPT PERSISTENTLY MOUNTED */}
        <div className={`h-full w-full ${currentTab === 'browser' ? 'block' : 'hidden'}`}>
          <BrowserPanel
            initialUrl={initialBrowserUrl}
            urlNonce={browserUrlNonce}
            onSendUrlToChat={onSendUrlToChat}
          />
        </div>

      </div>
      {/* Transcript Drawer */}
      <SubagentTranscript
        subagent={activeSelectedSubagent}
        isOpen={Boolean(activeSelectedSubagent)}
        onClose={() => setSelectedSubagentId(null)}
      />
    </div>
  );
});
