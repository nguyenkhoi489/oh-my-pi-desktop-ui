import React, { useCallback } from 'react';
import { Sparkles, PanelRightClose, RefreshCw } from 'lucide-react';
import {
  ChatMessage,
  ThinkingBlock,
  ToolCall,
  OmpAgentStatus,
  OmpContextUsage,
  OmpEngineStatusEntry,
  OmpWidgetEntry,
  WorkspaceFile,
  OmpCommandInfo,
  OmpUiRequest,
  OmpTodoPhase,
  OmpTodoItem,
  OmpRetryState,
  OmpModelInfo,
  OmpThinkingLevel,
  OmpApprovalMode,
} from '../../types';
import { ChatHistory } from './ChatHistory';
import { AgentActivityIndicator } from './AgentActivityIndicator';
import { PromptComposer } from './PromptComposer';
import { ToolApprovalCard } from './ToolApprovalCard';
import { EngineStatusStrip } from '../Notifications/EngineStatusStrip';
import { TodoPanel } from './TodoPanel';
import { FloatingChangesCard } from './FloatingChangesCard';
import { useI18n } from '../../i18n/I18nProvider';
export interface AgentPanelProps {
  messages: ChatMessage[];
  currentThinking: ThinkingBlock | null;
  activeToolCalls: ToolCall[];
  currentStreamText: string;
  status: OmpAgentStatus;
  contextUsage?: OmpContextUsage | null;
  engineStatuses?: OmpEngineStatusEntry[];
  engineWidgets?: OmpWidgetEntry[];
  workspaceFiles?: WorkspaceFile[];
  workspacePath?: string;
  availableCommands?: OmpCommandInfo[];
  pendingToolApproval?: OmpUiRequest | null;
  toolApprovalQueueLength?: number;
  onApproveTool?: (id: string) => void;
  onDenyTool?: (id: string) => void;
  onSendMessage: (prompt: string, contextFiles?: string[]) => void;
  onSteerMessage?: (prompt: string, contextFiles?: string[]) => void;
  onAbortAndPrompt?: (prompt: string, contextFiles?: string[]) => void;
  onFollowUpMessage?: (prompt: string, contextFiles?: string[]) => void;
  followUpQueue?: Array<{ id: string; content: string; files?: string[]; timestamp: number }>;
  onBranchSession?: (entryId: string) => void;
  onCollapsePanel?: () => void;
  onOpenFile?: (filePath: string) => void;
  externalAttachment?: { path: string; nonce: number } | null;
  todoPhases?: OmpTodoPhase[];
  todos?: OmpTodoItem[];
  retryState?: OmpRetryState;
  onAbortRetry?: () => void;
  onRepairSession?: () => void;
  projectName?: string;
  gitBranch?: string;
  floatingChanges?: {
    filesChanged: number;
    insertions?: number;
    deletions?: number;
    onReview: () => void;
    onDismiss?: () => void;
  } | null;
  availableModels?: OmpModelInfo[];
  selectedModel?: OmpModelInfo | string | null;
  onSelectModel?: (provider: string, modelId: string) => void;
  thinkingLevel?: OmpThinkingLevel;
  onSelectThinkingLevel?: (level: OmpThinkingLevel) => void;
  approvalMode?: OmpApprovalMode;
  onSelectApprovalMode?: (mode: OmpApprovalMode) => void;
  onOpenStatsPanel?: () => void;
}

const AgentPanelComponent: React.FC<AgentPanelProps> = ({
  messages,
  currentThinking,
  activeToolCalls,
  currentStreamText,
  status,
  contextUsage,
  engineStatuses,
  engineWidgets,
  workspaceFiles,
  workspacePath,
  availableCommands,
  pendingToolApproval,
  toolApprovalQueueLength = 1,
  onApproveTool,
  onDenyTool,
  onSendMessage,
  onSteerMessage,
  onAbortAndPrompt,
  onBranchSession,
  onCollapsePanel,
  onOpenFile,
  externalAttachment,
  onFollowUpMessage,
  followUpQueue,
  todoPhases,
  todos,
  retryState,
  onAbortRetry,
  onRepairSession,
  projectName,
  gitBranch,
  floatingChanges,
  availableModels,
  selectedModel,
  onSelectModel,
  thinkingLevel,
  onSelectThinkingLevel,
  approvalMode,
  onSelectApprovalMode,
  onOpenStatsPanel,
}) => {
  const { t } = useI18n();
  const handleRetry = useCallback((prompt?: string) => {
    onSendMessage(prompt || '');
  }, [onSendMessage]);

  return (
    <div className="w-full flex flex-col h-full bg-panel select-none">
      {/* Agent Panel Header */}
      <div className="h-11 bg-surface border-b border-border flex items-center justify-between px-4 shrink-0">
        <div className="flex items-center gap-2 min-w-0">
          <div className="w-5 h-5 rounded-md bg-codex-500/15 flex items-center justify-center shrink-0">
            <Sparkles className="w-3.5 h-3.5 text-codex-accent" />
          </div>
          <span className="text-xs font-semibold text-slate-800 dark:text-zinc-100 truncate">
            {projectName || 'OMP Agent Chat'}
          </span>
          {gitBranch && (
            <span className="px-2 py-0.5 rounded-full text-[10px] font-mono bg-surface-highlight text-slate-500 dark:text-zinc-400 shrink-0 border border-border/50">
              {gitBranch}
            </span>
          )}
        </div>

        <div className="flex items-center gap-2">
          {contextUsage?.tokens != null && (
            <span className="text-[11px] font-mono px-2 py-0.5 rounded-md bg-surface-highlight text-slate-600 dark:text-zinc-400">
              {contextUsage.tokens >= 1000 ? `${(contextUsage.tokens / 1000).toFixed(1)}k` : contextUsage.tokens} tokens
            </span>
          )}
          {onCollapsePanel && (
            <button
              onClick={onCollapsePanel}
              className="p-1 rounded-md hover:bg-surface-highlight text-slate-400 hover:text-slate-700 dark:hover:text-zinc-200 transition-colors cursor-pointer"
              title={t('agentPanel.collapse')}
            >
              <PanelRightClose className="w-3.5 h-3.5" />
            </button>
          )}
        </div>
      </div>

      {/* Center Stage Content Body */}
      <div className="flex-1 flex flex-col min-h-0 overflow-hidden">
        <div className="flex-1 flex flex-col min-h-0 max-w-4xl w-full mx-auto">
          {/* Todo Progress & Plan Panel */}
          <TodoPanel phases={todoPhases} todos={todos} engineStatus={status} />

          {/* Message & Execution Timeline */}
          <ChatHistory
            messages={messages}
            currentThinking={currentThinking}
            activeToolCalls={activeToolCalls}
            currentStreamText={currentStreamText}
            status={status}
            onBranchSession={onBranchSession}
            onOpenFile={onOpenFile}
            onRetry={handleRetry}
            onRepairSession={onRepairSession}
          />

          {/* Engine Status & Widgets Strip */}
          <EngineStatusStrip
            statuses={engineStatuses}
            widgets={engineWidgets}
          />

          {/* Non-blocking Tool Approval Card */}
          {pendingToolApproval && onApproveTool && onDenyTool && (
            <ToolApprovalCard
              request={pendingToolApproval}
              queueLength={toolApprovalQueueLength}
              onApprove={onApproveTool}
              onDeny={onDenyTool}
            />
          )}

          {/* Auto-Retry Status Banner */}
          {retryState?.isRetrying && (
            <div className="px-4 py-2 bg-amber-500/10 border-t border-amber-500/20 flex items-center justify-between gap-2 shrink-0 animate-fade-in">
              <div className="flex items-center gap-2 text-xs text-amber-600 dark:text-amber-400 min-w-0">
                <RefreshCw className="w-3.5 h-3.5 animate-spin shrink-0" />
                <span className="truncate">
                  {t('agentPanel.retrying', { attempt: retryState.attempt || 1, max: retryState.maxAttempts || 3 })}
                  {retryState.error ? ` - ${retryState.error}` : ''}
                </span>
              </div>
              {onAbortRetry && (
                <button
                  onClick={onAbortRetry}
                  className="px-2.5 py-1 text-xs font-medium bg-amber-500/20 hover:bg-amber-500/30 text-amber-700 dark:text-amber-300 rounded-md transition-colors cursor-pointer shrink-0"
                  title={t('agentPanel.cancelRetryTitle')}
                >
                  {t('agentPanel.cancelRetry')}
                </button>
              )}
            </div>
          )}

          {/* Agent activity indicator, rendered above composer */}
          <AgentActivityIndicator status={status} activeToolCalls={activeToolCalls} />

          {/* Floating Changes Card */}
          {floatingChanges && (floatingChanges.filesChanged > 0 || (floatingChanges.insertions || 0) > 0 || (floatingChanges.deletions || 0) > 0) && (
            <div className="px-4 pb-2 flex justify-center shrink-0">
              <FloatingChangesCard
                filesChanged={floatingChanges.filesChanged}
                insertions={floatingChanges.insertions}
                deletions={floatingChanges.deletions}
                onReview={floatingChanges.onReview}
                onDismiss={floatingChanges.onDismiss}
              />
            </div>
          )}

          {/* Docked Prompt Composer */}
          <PromptComposer
            onSendMessage={onSendMessage}
            onSteerMessage={onSteerMessage}
            onAbortAndPrompt={onAbortAndPrompt}
            status={status}
            workspaceFiles={workspaceFiles}
            workspacePath={workspacePath}
            onFollowUpMessage={onFollowUpMessage}
            followUpQueue={followUpQueue}
            availableCommands={availableCommands}
            isToolApprovalPending={Boolean(pendingToolApproval)}
            externalAttachment={externalAttachment}
            availableModels={availableModels}
            selectedModel={selectedModel}
            onSelectModel={onSelectModel}
            thinkingLevel={thinkingLevel}
            onSelectThinkingLevel={onSelectThinkingLevel}
            approvalMode={approvalMode}
            onSelectApprovalMode={onSelectApprovalMode}
            contextUsage={contextUsage}
            onOpenStatsPanel={onOpenStatsPanel}
          />
        </div>
      </div>
    </div>
  );
};

export const AgentPanel = React.memo(AgentPanelComponent);
