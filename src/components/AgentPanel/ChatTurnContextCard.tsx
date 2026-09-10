import React, { memo, useState, useMemo } from 'react';
import {
  Wrench,
  FileCode,
  FileEdit,
  Terminal,
  Globe,
  Search,
  CheckCircle2,
  AlertTriangle,
  Loader2,
  ChevronRight,
  ChevronDown,
  ExternalLink,
  Bot,
} from 'lucide-react';
import { useI18n } from '../../i18n/I18nProvider';
import type { ToolCall, FileDiffItem, OmpSubagentInfo } from '../../types';

export interface ChatTurnContextCardProps {
  toolCalls: ToolCall[];
  isActive?: boolean;
  activeToolName?: string;
  subagents?: OmpSubagentInfo[];
  diffFiles?: FileDiffItem[];
  onSelectDiff?: (idx: number) => void;
  onOpenBrowser?: (url: string) => void;
  onOpenFile?: (path: string) => void;
  className?: string;
}

function getToolIcon(name: string) {
  switch (name) {
    case 'read':
    case 'write':
      return FileCode;
    case 'edit':
    case 'ast_edit':
      return FileEdit;
    case 'bash':
      return Terminal;
    case 'browser':
    case 'browser_navigate':
    case 'browser_click':
    case 'browser_type':
    case 'browser_snapshot':
    case 'browser_screenshot':
      return Globe;
    case 'glob':
    case 'grep':
      return Search;
    default:
      return Wrench;
  }
}

function getToolSummary(tc: ToolCall): string {
  if (!tc.params) return '';
  const params = tc.params;
  if (typeof params.path === 'string') return params.path;
  if (typeof params.command === 'string') return params.command;
  if (typeof params.pattern === 'string') return params.pattern;
  if (typeof params.url === 'string') return params.url;
  if (typeof params.query === 'string') return params.query;
  return '';
}

export const ChatTurnContextCard: React.FC<ChatTurnContextCardProps> = memo(function ChatTurnContextCard({
  toolCalls = [],
  isActive = false,
  activeToolName,
  subagents = [],
  diffFiles = [],
  onSelectDiff,
  onOpenBrowser,
  onOpenFile,
  className = '',
}) {
  const { t } = useI18n();
  const [isExpanded, setIsExpanded] = useState<boolean>(false);
  const [activeTab, setActiveTab] = useState<'sources' | 'outputs'>('sources');
  const [expandedToolId, setExpandedToolId] = useState<string | null>(null);

  const hasFailed = useMemo(() => {
    return toolCalls.some((tc) => tc.status === 'failed');
  }, [toolCalls]);

  const latestTool = toolCalls[toolCalls.length - 1];
  const currentRunningName = activeToolName || latestTool?.name || 'tool';

  const totalSourcesCount = toolCalls.length + subagents.length;

  if (toolCalls.length === 0 && subagents.length === 0 && diffFiles.length === 0) {
    return null;
  }

  return (
    <div
      className={`border border-border/80 bg-surface/80 rounded-xl overflow-hidden shadow-2xs transition-all select-none ${className}`}
    >
      {/* Collapsed Pill Header */}
      <div
        onClick={() => setIsExpanded((prev) => !prev)}
        className="flex items-center justify-between px-3 py-2.5 cursor-pointer hover:bg-surface-highlight/70 transition-colors gap-3"
      >
        <div className="flex items-center gap-2 min-w-0 flex-1">
          {isActive ? (
            <Loader2 className="w-4 h-4 animate-spin text-blue-500 shrink-0" />
          ) : hasFailed ? (
            <AlertTriangle className="w-4 h-4 text-amber-500 shrink-0" />
          ) : (
            <CheckCircle2 className="w-4 h-4 text-emerald-500 shrink-0" />
          )}

          <span className="text-xs font-medium text-slate-700 dark:text-zinc-200 truncate">
            {isActive
              ? t('chat.context.toolsRunning', { name: currentRunningName })
              : t('chat.context.toolsExecuted', { count: toolCalls.length })}
          </span>
        </div>

        <div className="flex items-center gap-1.5 shrink-0">
          {toolCalls.length > 0 && (
            <span className="px-2 py-0.5 rounded-md text-[11px] font-medium bg-surface-highlight text-slate-600 dark:text-zinc-400 border border-border/60">
              {toolCalls.length} tools
            </span>
          )}

          {diffFiles.length > 0 && (
            <span className="px-2 py-0.5 rounded-md text-[11px] font-medium bg-blue-500/10 text-blue-600 dark:text-blue-400 border border-blue-500/20">
              {diffFiles.length} files
            </span>
          )}

          <ChevronRight
            className={`w-3.5 h-3.5 text-slate-400 transition-transform duration-150 ${
              isExpanded ? 'rotate-90' : ''
            }`}
          />
        </div>
      </div>

      {/* Expanded Details Popover / Card Body */}
      {isExpanded && (
        <div className="border-t border-border/60 bg-background/50 animate-fade-in">
          {/* Navigation Tabs (Sources & Outputs) */}
          <div className="flex items-center border-b border-border/40 px-3 pt-1.5 gap-4 bg-surface/40">
            <button
              type="button"
              onClick={() => setActiveTab('sources')}
              className={`flex items-center gap-1.5 py-1.5 text-xs font-medium border-b-2 transition-colors cursor-pointer ${
                activeTab === 'sources'
                  ? 'border-blue-500 text-blue-600 dark:text-blue-400'
                  : 'border-transparent text-slate-500 dark:text-zinc-400 hover:text-slate-700 dark:hover:text-zinc-200'
              }`}
            >
              <Wrench className="w-3.5 h-3.5" />
              <span>{t('chat.context.sources', { count: totalSourcesCount })}</span>
            </button>

            <button
              type="button"
              onClick={() => setActiveTab('outputs')}
              className={`flex items-center gap-1.5 py-1.5 text-xs font-medium border-b-2 transition-colors cursor-pointer ${
                activeTab === 'outputs'
                  ? 'border-blue-500 text-blue-600 dark:text-blue-400'
                  : 'border-transparent text-slate-500 dark:text-zinc-400 hover:text-slate-700 dark:hover:text-zinc-200'
              }`}
            >
              <FileCode className="w-3.5 h-3.5" />
              <span>{t('chat.context.outputs', { count: diffFiles.length })}</span>
            </button>
          </div>

          {/* Tab 1: Sources & Tools */}
          {activeTab === 'sources' && (
            <div className="p-2.5 space-y-2 max-h-[360px] overflow-y-auto">
              {/* Subagents List if any */}
              {subagents.length > 0 && (
                <div className="space-y-1 mb-2">
                  <div className="text-[10.5px] font-semibold text-slate-500 dark:text-zinc-400 px-1 uppercase tracking-wider">
                    {t('chat.context.subagents', { count: subagents.length })}
                  </div>
                  {subagents.map((sa) => (
                    <div
                      key={sa.id}
                      className="flex items-center justify-between p-2 rounded-lg bg-surface border border-border/70 text-xs"
                    >
                      <div className="flex items-center gap-2 min-w-0">
                        <Bot className="w-3.5 h-3.5 text-slate-400 shrink-0" />
                        <span className="font-mono font-medium truncate">{sa.id}</span>
                        {sa.agent && (
                          <span className="text-[10px] text-slate-400 dark:text-zinc-500 truncate">
                            ({sa.agent})
                          </span>
                        )}
                      </div>
                      <span className="text-[10px] px-1.5 py-0.5 rounded bg-surface-highlight text-slate-500">
                        {sa.status}
                      </span>
                    </div>
                  ))}
                </div>
              )}

              {/* Tool Calls List */}
              {toolCalls.length === 0 && subagents.length === 0 ? (
                <div className="py-6 text-center text-xs text-slate-400 dark:text-zinc-500">
                  {t('chat.context.noSources')}
                </div>
              ) : (
                <div className="space-y-1">
                  {toolCalls.map((tc) => {
                    const Icon = getToolIcon(tc.name);
                    const summary = getToolSummary(tc);
                    const isItemExpanded = expandedToolId === tc.id;
                    const isRunning = tc.status === 'running';
                    const isFailed = tc.status === 'failed';

                    return (
                      <div
                        key={tc.id}
                        className="rounded-lg border border-border/70 bg-surface text-xs overflow-hidden transition-all"
                      >
                        <div
                          onClick={() => setExpandedToolId(isItemExpanded ? null : tc.id)}
                          className="flex items-center justify-between p-2 hover:bg-surface-highlight/60 cursor-pointer gap-2"
                        >
                          <div className="flex items-center gap-2 min-w-0 flex-1">
                            <Icon className="w-3.5 h-3.5 text-slate-500 dark:text-zinc-400 shrink-0" />
                            <span className="font-mono font-semibold text-slate-800 dark:text-zinc-200 shrink-0">
                              {tc.name}
                            </span>
                            {summary && (
                              <span className="text-slate-500 dark:text-zinc-400 truncate text-[11px]">
                                {summary}
                              </span>
                            )}
                          </div>
                          <div className="flex items-center gap-1.5 shrink-0">
                            {onOpenBrowser && typeof tc.params?.url === 'string' && (
                              <button
                                type="button"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  onOpenBrowser(tc.params!.url as string);
                                }}
                                className="p-1 rounded text-slate-400 hover:text-blue-500 hover:bg-surface-highlight transition-colors cursor-pointer"
                                title={tc.params.url as string}
                              >
                                <ExternalLink className="w-3 h-3" />
                              </button>
                            )}
                            {isRunning && (
                              <Loader2 className="w-3 h-3 animate-spin text-blue-500" />
                            )}
                            {isFailed && (
                              <AlertTriangle className="w-3 h-3 text-amber-500" />
                            )}
                            {!isRunning && !isFailed && (
                              <CheckCircle2 className="w-3 h-3 text-emerald-500" />
                            )}
                            <ChevronDown
                              className={`w-3 h-3 text-slate-400 transition-transform ${
                                isItemExpanded ? 'rotate-180' : ''
                              }`}
                            />
                          </div>
                        </div>

                        {/* Expandable Raw Payload View */}
                        {isItemExpanded && (
                          <div className="p-2.5 border-t border-border/50 bg-background/80 space-y-2 text-[11px] font-mono select-text">
                            {tc.params && Object.keys(tc.params).length > 0 && (
                              <div>
                                <div className="text-[10px] font-semibold text-slate-400 dark:text-zinc-500 mb-1">
                                  Input
                                </div>
                                <pre className="p-2 rounded bg-surface border border-border/40 overflow-x-auto text-slate-700 dark:text-zinc-300 max-h-32">
                                  {JSON.stringify(tc.params, null, 2)}
                                </pre>
                              </div>
                            )}
                            {tc.result != null && (
                              <div>
                                <div className="text-[10px] font-semibold text-slate-400 dark:text-zinc-500 mb-1">
                                  Output
                                </div>
                                <pre className="p-2 rounded bg-surface border border-border/40 overflow-x-auto text-slate-700 dark:text-zinc-300 max-h-32">
                                  {typeof tc.result === 'string'
                                    ? tc.result
                                    : JSON.stringify(tc.result, null, 2)}
                                </pre>
                              </div>
                            )}
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          )}

          {/* Tab 2: Outputs */}
          {activeTab === 'outputs' && (
            <div className="p-2.5 max-h-[360px] overflow-y-auto">
              {diffFiles.length === 0 ? (
                <div className="py-6 text-center text-xs text-slate-400 dark:text-zinc-500">
                  {t('chat.context.noOutputs')}
                </div>
              ) : (
                <div className="space-y-1.5">
                  {diffFiles.map((file, idx) => (
                    <div
                      key={file.id || file.filePath}
                      className="flex items-center justify-between p-2 rounded-lg border border-border/70 bg-surface hover:bg-surface-highlight/70 transition-colors text-xs gap-2"
                    >
                      <div className="flex items-center gap-2 min-w-0 flex-1">
                        <FileCode className="w-3.5 h-3.5 text-blue-500 shrink-0" />
                        <span className="font-mono truncate text-slate-800 dark:text-zinc-200">
                          {file.filePath}
                        </span>
                      </div>

                      <div className="flex items-center gap-2 shrink-0">
                        {file.additions != null && file.additions > 0 && (
                          <span className="flex items-center text-[10px] font-semibold text-emerald-600 dark:text-emerald-400">
                            +{file.additions}
                          </span>
                        )}
                        {file.deletions != null && file.deletions > 0 && (
                          <span className="flex items-center text-[10px] font-semibold text-rose-600 dark:text-rose-400">
                            -{file.deletions}
                          </span>
                        )}

                        {onSelectDiff && (
                          <button
                            type="button"
                            onClick={() => onSelectDiff(idx)}
                            className="px-2 py-0.5 rounded text-[10.5px] font-medium bg-blue-500/10 text-blue-600 dark:text-blue-400 hover:bg-blue-500/20 transition-colors cursor-pointer"
                          >
                            Diff
                          </button>
                        )}
                        {onOpenFile && (
                          <button
                            type="button"
                            onClick={() => onOpenFile(file.filePath)}
                            className="p-1 rounded text-slate-400 hover:text-slate-600 dark:hover:text-zinc-200 hover:bg-surface-highlight transition-colors cursor-pointer"
                            title={file.filePath}
                          >
                            <ExternalLink className="w-3 h-3" />
                          </button>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
});
