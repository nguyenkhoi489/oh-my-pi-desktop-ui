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

export type OmpApprovalMode = 'always-ask' | 'write' | 'yolo';
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

export interface GetSessionStatsCommand {
  type: 'get_session_stats';
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
  sessionPath: string;
  sessionId?: string;
  [key: string]: unknown;
}

export interface BranchCommand {
  type: 'branch';
  id?: string;
  entryId: string;
  [key: string]: unknown;
}

export interface SetSubagentSubscriptionCommand {
  type: 'set_subagent_subscription';
  id?: string;
  level: 'off' | 'progress' | 'events';
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
  cursor?: number;
  limit?: number;
  page?: number;
  [key: string]: unknown;
}

export interface ExtensionUiResponseCommand {
  type: 'extension_ui_response';
  id: string;
  value?: unknown;
  confirmed?: boolean;
  cancelled?: boolean;
  [key: string]: unknown;
}

export interface CompactCommand {
  type: 'compact';
  id?: string;
  customInstructions?: string;
  [key: string]: unknown;
}

export interface SetAutoCompactionCommand {
  type: 'set_auto_compaction';
  id?: string;
  enabled: boolean;
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
  parentSession?: string;
  [key: string]: unknown;
}
export interface SetSessionNameCommand {
  type: 'set_session_name';
  id?: string;
  name: string;
  [key: string]: unknown;
}

export interface ExportHtmlCommand {
  type: 'export_html';
  id?: string;
  outputPath: string;
  [key: string]: unknown;
}

export interface GetBranchMessagesCommand {
  type: 'get_branch_messages';
  id?: string;
  [key: string]: unknown;
}

export interface GetAvailableCommandsCommand {
  type: 'get_available_commands';
  id?: string;
  [key: string]: unknown;
}
export type OmpCommandFrame =
  | NegotiateProtocolCommand
  | PromptCommand
  | SteerCommand
  | AbortCommand
  | GetStateCommand
  | GetSessionStatsCommand
  | GetAvailableModelsCommand
  | SetModelCommand
  | SetThinkingLevelCommand
  | SetSubagentSubscriptionCommand
  | SwitchSessionCommand
  | BranchCommand
  | GetSubagentsCommand
  | GetMessagesPageCommand
  | ExtensionUiResponseCommand
  | CompactCommand
  | ForkCommand
  | NewSessionCommand
  | SetSessionNameCommand
  | ExportHtmlCommand
  | GetBranchMessagesCommand
  | GetAvailableCommandsCommand
  | SetAutoCompactionCommand;
// ==========================================
// Message Content & Envelope Definitions
// ==========================================

export interface TextContentBlock {
  type: 'text';
  text: string;
  [key: string]: unknown;
}

export interface ToolCallContentBlock {
  type: 'toolCall' | string;
  id: string;
  name: string;
  arguments?: Record<string, unknown>;
  partialArgs?: string;
  intent?: string;
  [key: string]: unknown;
}

export type AgentContentBlock =
  | TextContentBlock
  | ToolCallContentBlock
  | { type: string; [key: string]: unknown };

export interface AgentMessageUsage {
  input?: number;
  output?: number;
  cacheRead?: number;
  cacheWrite?: number;
  totalTokens?: number;
  cost?: {
    input?: number;
    output?: number;
    cacheRead?: number;
    cacheWrite?: number;
    total?: number;
    [key: string]: unknown;
  };
  [key: string]: unknown;
}

export interface AgentMessage {
  role?: 'user' | 'assistant' | 'system' | 'toolResult' | string;
  content?: AgentContentBlock[];
  api?: string;
  provider?: string;
  model?: string;
  usage?: AgentMessageUsage;
  stopReason?: string | null;
  timestamp?: number;
  responseId?: string;
  duration?: number;
  ttft?: number;
  completedAt?: number;
  attribution?: string;
  toolCallId?: string;
  toolName?: string;
  details?: unknown;
  isError?: boolean;
  [key: string]: unknown;
}

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
  messages?: AgentMessage[];
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
  message?: AgentMessage;
  toolResults?: unknown[];
  [key: string]: unknown;
}

export interface MessageStartEvent {
  type: 'message_start';
  id?: string;
  messageId?: string;
  role?: string;
  message?: AgentMessage;
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
  partial?: AgentMessage;
  [key: string]: unknown;
}

export interface MessageUpdateEvent {
  type: 'message_update';
  id?: string;
  messageId?: string;
  delta?: string;
  assistantMessageEvent?: AssistantMessageEvent;
  message?: AgentMessage;
  [key: string]: unknown;
}

export interface MessageEndEvent {
  type: 'message_end';
  id?: string;
  messageId?: string;
  message?: AgentMessage;
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
  toolName?: string;
  args?: Record<string, unknown>;
  partialResult?: {
    content?: Array<{ type: string; text?: string; [key: string]: unknown }>;
    details?: Record<string, unknown>;
    [key: string]: unknown;
  };
  [key: string]: unknown;
}

export interface EditToolResultDetails {
  diff?: string;
  oldText?: string;
  newText?: string;
  firstChangedLine?: number;
  op?: string;
  path?: string;
  move?: string | boolean;
  sourcePath?: string;
  snapshotsPruned?: boolean;
  perFileResults?: EditToolResultDetails[];
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
  title?: string;
  message?: string;
  options?: string[];
  optionDetails?: Array<{ description?: string; [key: string]: unknown }>;
  placeholder?: string;
  prefill?: string;
  promptStyle?: string;
  timeout?: number;
  targetId?: string;
  widgetKey?: string;
  widgetLines?: string[];
  widgetPlacement?: string;
  statusKey?: string;
  statusText?: string;
  notifyType?: string;
  params?: unknown;
  [key: string]: unknown;
}

export interface OmpSubcommandInfo {
  name: string;
  description?: string;
  [key: string]: unknown;
}

export interface OmpCommandInfo {
  name: string;
  description?: string;
  inputHint?: string;
  subcommands?: OmpSubcommandInfo[];
  [key: string]: unknown;
}

export interface GetAvailableCommandsResponseData {
  commands?: OmpCommandInfo[];
  [key: string]: unknown;
}

export interface AvailableCommandsUpdateEvent {
  type: 'available_commands_update';
  commands?: OmpCommandInfo[];
  [key: string]: unknown;
}

export interface CommandOutputEvent {
  type: 'command_output';
  text?: string;
  id?: string;
  [key: string]: unknown;
}

export interface SessionInfoUpdateEvent {
  type: 'session_info_update';
  title?: string;
  sessionId?: string;
  [key: string]: unknown;
}

export interface ConfigUpdateEvent {
  type: 'config_update';
  model?: OmpModelInfo | string;
  thinkingLevel?: OmpThinkingLevel;
  [key: string]: unknown;
}

export interface SubagentLifecyclePayload {
  id: string;
  agent: string;
  agentSource?: string;
  parentToolCallId?: string;
  detached?: boolean;
  status: string;
  sessionFile?: string;
  index?: number;
  description?: string;
  task?: string;
  [key: string]: unknown;
}

export interface SubagentProgressDetail {
  index?: number;
  id?: string;
  agent?: string;
  agentSource?: string;
  status?: string;
  task?: string;
  assignment?: string;
  lastIntent?: string;
  description?: string;
  recentTools?: unknown[];
  recentOutput?: unknown[];
  toolCount?: number;
  requests?: number;
  tokens?: number;
  cost?: number;
  durationMs?: number;
  contextTokens?: number;
  extractedToolData?: unknown;
  [key: string]: unknown;
}

export interface SubagentProgressPayload {
  index?: number;
  agent?: string;
  agentSource?: string;
  task?: string;
  assignment?: string;
  parentToolCallId?: string;
  detached?: boolean;
  sessionFile?: string;
  id?: string;
  status?: string;
  progress?: SubagentProgressDetail;
  [key: string]: unknown;
}

export interface SubagentLifecycleEvent {
  type: 'subagent_lifecycle';
  id?: string;
  subagentId?: string;
  state?: string;
  payload?: SubagentLifecyclePayload;
  [key: string]: unknown;
}

export interface SubagentProgressEvent {
  type: 'subagent_progress';
  id?: string;
  subagentId?: string;
  progress?: unknown;
  payload?: SubagentProgressPayload;
  [key: string]: unknown;
}

export interface SubagentEvent {
  type: 'subagent_event';
  subagentId?: string;
  event?: unknown;
  payload?: unknown;
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
  | CommandOutputEvent
  | SessionInfoUpdateEvent
  | ConfigUpdateEvent
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

// ==========================================
// Model Catalog & Engine State Payloads
// ==========================================

export interface OmpModelCost {
  input?: number;
  output?: number;
  cacheRead?: number;
  cacheWrite?: number;
  total?: number;
  [key: string]: unknown;
}

export interface OmpModelInfo {
  id: string;
  name: string;
  provider: string;
  reasoning?: boolean;
  contextWindow?: number;
  maxTokens?: number;
  cost?: OmpModelCost;
  api?: string;
  baseUrl?: string;
  [key: string]: unknown;
}

export interface GetAvailableModelsResponseData {
  models: OmpModelInfo[];
  [key: string]: unknown;
}

export interface SessionChangeResponseData {
  cancelled?: boolean;
  text?: string;
  [key: string]: unknown;
}

export interface OmpSubagentInfo {
  id: string;
  index?: number;
  agent: string;
  description?: string;
  status: string;
  task?: string;
  sessionFile?: string;
  progressText?: string;
  lastUpdate?: number;
}

export interface GetSubagentsResponseData {
  subagents: Array<{
    id: string;
    index?: number;
    agent: string;
    description?: string;
    status: string;
    task?: string;
    assignment?: string;
    sessionFile?: string;
    lastUpdate?: number;
    progress?: unknown;
    [key: string]: unknown;
  }>;
  [key: string]: unknown;
}

export interface GetMessagesPageResponseData {
  messages: AgentMessage[];
  totalMessages?: number;
  sessionId?: string;
  leafId?: string;
  messageCount?: number;
  cursor?: number;
  [key: string]: unknown;
}
export interface OmpBranchMessage {
  entryId: string;
  text: string;
  [key: string]: unknown;
}

export interface GetBranchMessagesResponseData {
  messages: OmpBranchMessage[];
  [key: string]: unknown;
}

export interface ExportHtmlResponseData {
  path?: string;
  [key: string]: unknown;
}

export interface OmpContextUsage {
  tokens?: number;
  contextWindow?: number;
  percent?: number;
  [key: string]: unknown;
}

export interface OmpSessionStatsTokens {
  input?: number;
  output?: number;
  reasoning?: number;
  cacheRead?: number;
  cacheWrite?: number;
  total?: number;
  [key: string]: unknown;
}

export interface OmpSessionStats {
  sessionId?: string;
  sessionFile?: string;
  userMessages?: number;
  assistantMessages?: number;
  toolCalls?: number;
  toolResults?: number;
  totalMessages?: number;
  tokens?: OmpSessionStatsTokens;
  cost?: number;
  premiumRequests?: number;
  contextUsage?: OmpContextUsage;
  [key: string]: unknown;
}

export interface OmpContextUsageUpdate {
  contextUsage: OmpContextUsage | null;
  tokensPerSecond?: number | null;
  sessionName?: string;
}

export interface OmpEngineState {
  model?: OmpModelInfo;
  isStreaming?: boolean;
  isCompacting?: boolean;
  steeringMode?: string;
  followUpMode?: string;
  interruptMode?: string;
  sessionId?: string;
  sessionFile?: string;
  sessionName?: string;
  autoCompactionEnabled?: boolean;
  approvalMode?: OmpApprovalMode;
  fastModeEnabled?: boolean;
  tokensPerSecond?: number | null;
  fastModeActive?: boolean;
  messageCount?: number;
  contextUsage?: OmpContextUsage;
  tools?: unknown[];
  commands?: unknown[];
  [key: string]: unknown;
}

