/**
 * OMP RPC Protocol Type Definitions
 * Based on oh-my-pi NDJSON protocol (--mode rpc)
 * 
 * NOTE: Pure TypeScript module with NO Electron dependencies.
 */

export type OmpProtocolVersion = 1 | 2;

export type OmpThinkingLevel =
  | 'off'
  | 'minimal'
  | 'low'
  | 'medium'
  | 'high'
  | 'xhigh'
  | 'max'
  | 'auto';

// ==========================================
// Handshake & Base Envelope Frames
// ==========================================

export interface ReadyFrame {
  type: 'ready';
  protocolVersion?: number;
  supportedProtocolVersions: number[];
  maxFrameBytes: number;
  maxReassembledFrameBytes: number;
  [key: string]: unknown;
}

export interface ResponseFrame<T = unknown> {
  type: 'response';
  id?: string;
  command: string;
  success: boolean;
  data?: T;
  error?: string;
  [key: string]: unknown;
}

// ==========================================
// Host -> Engine Command Frames
// ==========================================

export interface NegotiateProtocolCommand {
  type: 'negotiate_protocol';
  id?: string;
  protocolVersion: number;
  [key: string]: unknown;
}

export interface PromptCommand {
  type: 'prompt';
  id?: string;
  message: string;
  prompt?: string;
  images?: unknown[];
  [key: string]: unknown;
}

export interface SteerCommand {
  type: 'steer';
  id?: string;
  message?: string;
  prompt?: string;
  [key: string]: unknown;
}

export interface AbortCommand {
  type: 'abort';
  id?: string;
  [key: string]: unknown;
}

export interface GetStateCommand {
  type: 'get_state';
  id?: string;
  [key: string]: unknown;
}

export interface GetAvailableModelsCommand {
  type: 'get_available_models';
  id?: string;
  [key: string]: unknown;
}

export interface SetModelCommand {
  type: 'set_model';
  id?: string;
  modelId?: string;
  model?: string;
  provider?: string;
  [key: string]: unknown;
}

export interface SetThinkingLevelCommand {
  type: 'set_thinking_level';
  id?: string;
  level: OmpThinkingLevel;
  [key: string]: unknown;
}

export interface SwitchSessionCommand {
  type: 'switch_session';
  id?: string;
  sessionId?: string;
  sessionPath?: string;
  [key: string]: unknown;
}

export interface BranchCommand {
  type: 'branch';
  id?: string;
  [key: string]: unknown;
}

export interface GetSubagentsCommand {
  type: 'get_subagents';
  id?: string;
  [key: string]: unknown;
}

export interface GetMessagesPageCommand {
  type: 'get_messages_page';
  id?: string;
  page?: number;
  limit?: number;
  [key: string]: unknown;
}

export interface ExtensionUiResponseCommand {
  type: 'extension_ui_response';
  id?: string;
  requestId?: string;
  approved?: boolean;
  response?: unknown;
  [key: string]: unknown;
}

export interface CompactCommand {
  type: 'compact';
  id?: string;
  [key: string]: unknown;
}

export interface ForkCommand {
  type: 'fork';
  id?: string;
  [key: string]: unknown;
}

export interface NewSessionCommand {
  type: 'new_session';
  id?: string;
  [key: string]: unknown;
}

export type OmpCommandFrame =
  | NegotiateProtocolCommand
  | PromptCommand
  | SteerCommand
  | AbortCommand
  | GetStateCommand
  | GetAvailableModelsCommand
  | SetModelCommand
  | SetThinkingLevelCommand
  | SwitchSessionCommand
  | BranchCommand
  | GetSubagentsCommand
  | GetMessagesPageCommand
  | ExtensionUiResponseCommand
  | CompactCommand
  | ForkCommand
  | NewSessionCommand;

// ==========================================
// Engine -> Host Event Frames
// ==========================================

export interface AgentStartEvent {
  type: 'agent_start';
  id?: string;
  [key: string]: unknown;
}

export interface AgentEndEvent {
  type: 'agent_end';
  id?: string;
  messages?: unknown[];
  isTerminal?: boolean;
  [key: string]: unknown;
}

export interface TurnStartEvent {
  type: 'turn_start';
  id?: string;
  turnId?: string;
  [key: string]: unknown;
}

export interface TurnEndEvent {
  type: 'turn_end';
  id?: string;
  turnId?: string;
  message?: unknown;
  toolResults?: unknown[];
  [key: string]: unknown;
}

export interface MessageStartEvent {
  type: 'message_start';
  id?: string;
  messageId?: string;
  role?: string;
  message?: unknown;
  [key: string]: unknown;
}

export interface AssistantMessageToolCall {
  type: 'toolCall' | string;
  id: string;
  name: string;
  arguments?: Record<string, unknown>;
  partialArgs?: string;
  intent?: string;
  [key: string]: unknown;
}

export type AssistantMessageEventType =
  | 'text_start'
  | 'text_delta'
  | 'text_end'
  | 'thinking_start'
  | 'thinking_delta'
  | 'thinking_end'
  | 'toolcall_start'
  | 'toolcall_delta'
  | 'toolcall_end'
  | string;

export interface AssistantMessageEvent {
  type: AssistantMessageEventType;
  contentIndex?: number;
  delta?: string;
  content?: string;
  toolCall?: AssistantMessageToolCall;
  partial?: unknown;
  [key: string]: unknown;
}

export interface MessageUpdateEvent {
  type: 'message_update';
  id?: string;
  messageId?: string;
  delta?: string;
  assistantMessageEvent?: AssistantMessageEvent;
  message?: unknown;
  [key: string]: unknown;
}

export interface MessageEndEvent {
  type: 'message_end';
  id?: string;
  messageId?: string;
  message?: unknown;
  [key: string]: unknown;
}

export interface ToolExecutionStartEvent {
  type: 'tool_execution_start';
  id?: string;
  toolCallId?: string;
  toolName?: string;
  args?: Record<string, unknown>;
  intent?: string;
  [key: string]: unknown;
}

export interface ToolExecutionUpdateEvent {
  type: 'tool_execution_update';
  id?: string;
  toolCallId?: string;
  output?: unknown;
  [key: string]: unknown;
}

export interface EditToolResultDetails {
  diff?: string;
  oldText?: string;
  newText?: string;
  firstChangedLine?: number;
  op?: string;
  path?: string;
  [key: string]: unknown;
}

export interface ReadToolResultDetails {
  totalLines?: number;
  displayContent?: {
    text: string;
    startLine: number;
    lineNumbers: number[];
  };
  fileSize?: number;
  meta?: {
    source: {
      type: string;
      value: string;
    };
  };
  [key: string]: unknown;
}

export interface ToolResultPayload {
  content?: Array<{ type: string; text?: string; [key: string]: unknown }>;
  details?: EditToolResultDetails & ReadToolResultDetails & Record<string, unknown>;
  [key: string]: unknown;
}

export interface ToolExecutionEndEvent {
  type: 'tool_execution_end';
  id?: string;
  toolCallId?: string;
  toolName?: string;
  result?: ToolResultPayload | unknown;
  error?: unknown;
  isError?: boolean;
  [key: string]: unknown;
}

export interface ExtensionUiRequestEvent {
  type: 'extension_ui_request';
  id?: string;
  requestId?: string;
  method?: string;
  widgetKey?: string;
  params?: unknown;
  [key: string]: unknown;
}

export interface AvailableCommandsUpdateEvent {
  type: 'available_commands_update';
  commands?: unknown[];
  [key: string]: unknown;
}

export interface SubagentLifecycleEvent {
  type: 'subagent_lifecycle';
  subagentId?: string;
  state?: string;
  [key: string]: unknown;
}

export interface SubagentProgressEvent {
  type: 'subagent_progress';
  subagentId?: string;
  progress?: unknown;
  [key: string]: unknown;
}

export interface SubagentEvent {
  type: 'subagent_event';
  subagentId?: string;
  event?: unknown;
  [key: string]: unknown;
}

export interface UnknownFrame {
  type: string;
  [key: string]: unknown;
}

export type OmpEventFrame =
  | AgentStartEvent
  | AgentEndEvent
  | TurnStartEvent
  | TurnEndEvent
  | MessageStartEvent
  | MessageUpdateEvent
  | MessageEndEvent
  | ToolExecutionStartEvent
  | ToolExecutionUpdateEvent
  | ToolExecutionEndEvent
  | ExtensionUiRequestEvent
  | AvailableCommandsUpdateEvent
  | SubagentLifecycleEvent
  | SubagentProgressEvent
  | SubagentEvent;

// ==========================================
// Inbound, Outbound & Overall Frame Unions
// ==========================================

export type OmpInboundFrame =
  | ReadyFrame
  | ResponseFrame
  | OmpEventFrame
  | UnknownFrame;

export type OmpOutboundFrame = OmpCommandFrame;

export type OmpFrame = OmpInboundFrame | OmpOutboundFrame;
