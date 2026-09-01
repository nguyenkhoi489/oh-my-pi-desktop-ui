import React from 'react';
import { Sparkles, PanelRightClose } from 'lucide-react';
import {
  ChatMessage,
  ThinkingBlock,
  ToolCall,
  OmpAgentStatus,
} from '../../types';
import { ChatHistory } from './ChatHistory';
import { PromptComposer } from './PromptComposer';

interface AgentPanelProps {
  messages: ChatMessage[];
  currentThinking: ThinkingBlock | null;
  activeToolCalls: ToolCall[];
  currentStreamText: string;
  status: OmpAgentStatus;
  onSendMessage: (prompt: string, contextFiles?: string[]) => void;
  onCollapsePanel?: () => void;
}

export const AgentPanel: React.FC<AgentPanelProps> = ({
  messages,
  currentThinking,
  activeToolCalls,
  currentStreamText,
  status,
  onSendMessage,
  onCollapsePanel,
}) => {
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
          <span className="text-[11px] font-mono px-2 py-0.5 rounded-md bg-surface-highlight text-slate-600 dark:text-zinc-400">
            1.2k tokens
          </span>

          {onCollapsePanel && (
            <button
              onClick={onCollapsePanel}
              className="p-1 rounded-md hover:bg-surface-highlight text-slate-400 hover:text-slate-700 dark:hover:text-zinc-200 transition-colors cursor-pointer"
              title="Thu gọn Agent Panel (⌘J)"
            >
              <PanelRightClose className="w-3.5 h-3.5" />
            </button>
          )}
        </div>
      </div>

      {/* Message & Execution Timeline */}
      <ChatHistory
        messages={messages}
        currentThinking={currentThinking}
        activeToolCalls={activeToolCalls}
        currentStreamText={currentStreamText}
      />

      {/* Docked Prompt Composer */}
      <PromptComposer
        onSendMessage={onSendMessage}
        status={status}
      />
    </div>
  );
};
