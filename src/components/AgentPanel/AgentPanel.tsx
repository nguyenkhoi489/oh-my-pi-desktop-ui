import React from 'react';
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
} from '../../types';
import { ChatHistory } from './ChatHistory';
import { AgentActivityIndicator } from './AgentActivityIndicator';
import { PromptComposer } from './PromptComposer';
import { ToolApprovalCard } from './ToolApprovalCard';
import { EngineStatusStrip } from '../Notifications/EngineStatusStrip';
import { TodoPanel } from './TodoPanel';
import { useI18n } from '../../i18n/I18nProvider';
interface AgentPanelProps {
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
}) => {
  const { t } = useI18n();
  return (
    <div className="w-full flex flex-col h-full bg-panel select-none">
      {/* Agent Panel Header */}
      <div className="h-11 bg-surface border-b border-border flex items-center justify-between px-4 shrink-0">
        <div className="flex items-center gap-2">
          <div className="w-5 h-5 rounded-md bg-codex-500/15 flex items-center justify-center">
            <Sparkles className="w-3.5 h-3.5 text-codex-accent" />
          </div>
          <span className="text-xs font-semibold text-slate-800 dark:text-zinc-100">
            OMP Agent Chat
          </span>
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

      {/* Todo Progress & Plan Panel */}
      <TodoPanel phases={todoPhases} todos={todos} />

      {/* Message & Execution Timeline */}
      <ChatHistory
        messages={messages}
        currentThinking={currentThinking}
        activeToolCalls={activeToolCalls}
        currentStreamText={currentStreamText}
        status={status}
        onBranchSession={onBranchSession}
        onOpenFile={onOpenFile}
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
      />
    </div>
  );
};

export const AgentPanel = React.memo(AgentPanelComponent);
