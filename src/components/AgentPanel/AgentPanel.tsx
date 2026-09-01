import React from 'react';
import { Bot } from 'lucide-react';
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
}

export const AgentPanel: React.FC<AgentPanelProps> = ({
  messages,
  currentThinking,
  activeToolCalls,
  currentStreamText,
  status,
  onSendMessage,
}) => {
  return (
    <div className="w-96 flex flex-col h-full bg-panel shrink-0 select-none">
      {/* Agent Panel Header */}
      <div className="h-9 bg-surface border-b border-border flex items-center justify-between px-3 shrink-0">
        <div className="flex items-center gap-2">
          <Bot className="w-4 h-4 text-purple-600 dark:text-purple-400" />
          <span className="text-xs font-semibold text-slate-800 dark:text-zinc-200">
            OMP Copilot
          </span>
        </div>

        <div className="flex items-center gap-1.5 text-[11px] text-slate-500 dark:text-zinc-500 font-medium">
          <span>Tokens: 1.2k</span>
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
