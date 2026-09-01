export type OmpAgentStatus = 'idle' | 'thinking' | 'executing_tool' | 'waiting_permission' | 'streaming';

export type ThemeMode = 'light' | 'dark';

export interface ToolCall {
  id: string;
  name: string;
  params: Record<string, any>;
  status: 'pending' | 'running' | 'completed' | 'failed' | 'requires_permission';
  result?: any;
  error?: string;
  startTime?: number;
  endTime?: number;
}

export interface ThinkingBlock {
  id: string;
  thought: string;
  timestamp: number;
  completed: boolean;
}

export interface ChatFileAttachment {
  path: string;
  name?: string;
  content?: string;
  lineCount?: number;
}

export interface ChatMessage {
  id: string;
  role: 'user' | 'assistant' | 'system' | 'fileMention';
  content: string;
  timestamp: number;
  thinking?: ThinkingBlock;
  toolCalls?: ToolCall[];
  entryId?: string;
  files?: ChatFileAttachment[];
}

export interface FileDiffItem {
  id: string;
  filePath: string;
  relativePath: string;
  originalContent: string;
  modifiedContent: string;
  status: 'pending' | 'accepted' | 'rejected';
  additions: number;
  deletions: number;
  op?: 'update' | 'create' | 'delete';
}

export interface WorkspaceFile {
  name: string;
  path: string;
  relativePath: string;
  isDirectory: boolean;
  size?: number;
  children?: WorkspaceFile[];
  gitStatus?: 'modified' | 'added' | 'deleted' | 'untracked';
}

export interface PermissionRequest {
  id: string;
  toolName: string;
  description: string;
  command?: string;
  targetFile?: string;
  dangerous: boolean;
}

export interface OmpUiRequest {
  id: string;
  method: 'select' | 'confirm' | 'input' | 'editor';
  title: string;
  message?: string;
  options?: string[];
  optionDetails?: Array<{ description?: string; [key: string]: unknown }>;
  placeholder?: string;
  prefill?: string;
  timeout?: number;
  isToolApproval: boolean;
}

export interface OmpInstallStatus {
  installed: boolean;
  version?: string;
  binaryPath?: string;
  error?: string;
}

export type ActiveCanvasTab = 'diff' | 'editor' | 'artifact' | 'terminal';

export type ArtifactType = 'html' | 'react' | 'svg' | 'markdown' | 'plan' | 'walkthrough';

export interface ArtifactDocument {
  id: string;
  title: string;
  type: ArtifactType;
  content: string;
  description?: string;
  language?: string;
}
export interface OmpNotification {
  id: string;
  message: string;
  notifyType: 'info' | 'warning' | 'error' | string;
  timestamp: number;
}

export interface OmpEngineStatusEntry {
  key: string;
  text: string;
}

export interface OmpWidgetEntry {
  key: string;
  lines: string[];
  placement?: string;
}


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

export interface OmpSessionInfo {
  path: string;
  id: string;
  title: string;
  timestamp: string;
  updatedAt?: string;
  active?: boolean;
}

export interface OmpBranchEntry {
  entryId: string;
  text?: string;
  role?: string;
  timestamp?: number;
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
  queuedMessageCount?: number;
  fastModeEnabled?: boolean;
  tokensPerSecond?: number | null;
  fastModeActive?: boolean;
  messageCount?: number;
  contextUsage?: OmpContextUsage;
  tools?: unknown[];
  commands?: OmpCommandInfo[];
  [key: string]: unknown;
}

export interface AppSettings {
  theme?: 'light' | 'dark';
  customBinaryPath?: string;
  defaultProvider?: string;
  defaultModel?: string;
  defaultThinkingLevel?: OmpThinkingLevel;
  approvalMode?: OmpApprovalMode;
  autoCompaction?: boolean;
}

export interface ElectronAPI {
  checkOmpInstallation: () => Promise<OmpInstallStatus>;
  setCustomBinaryPath: (path: string) => Promise<OmpInstallStatus>;
  selectBinaryFile: () => Promise<string | null>;
  startOmpProcess: (workspacePath: string, model?: string, options?: { provider?: string; extraArgs?: string[]; approvalMode?: OmpApprovalMode }) => Promise<any>;
  stopOmpProcess: () => Promise<any>;
  sendOmpMessage: (prompt: string, context?: { files?: string[] }) => Promise<any>;
  respondToPermission: (requestId: string, approved: boolean) => Promise<any>;
  respondUiRequest: (id: string, payload: { value?: unknown; confirmed?: boolean; cancelled?: boolean }) => Promise<any>;

  // Model Catalog & Engine State (Phase 2 Additions)
  getAvailableModels: () => Promise<{ success: boolean; models?: OmpModelInfo[]; error?: string }>;
  setModel: (provider: string, modelId: string) => Promise<{ success: boolean; model?: OmpModelInfo; error?: string }>;
  setThinkingLevel: (level: OmpThinkingLevel) => Promise<{ success: boolean; error?: string }>;
  getEngineState: () => Promise<{ success: boolean; state?: OmpEngineState; error?: string }>;
  getState: () => Promise<{ success: boolean; state?: OmpEngineState; error?: string }>;
  getSessionStats: () => Promise<{ success: boolean; stats?: OmpSessionStats; error?: string }>;
  setApprovalMode: (mode: OmpApprovalMode) => Promise<{ success: boolean; mode?: OmpApprovalMode; error?: string }>;
  getApprovalMode: () => Promise<{ success: boolean; mode?: OmpApprovalMode; error?: string }>;
  compact: (customInstructions?: string) => Promise<{ success: boolean; error?: string }>;
  setAutoCompaction: (enabled: boolean) => Promise<{ success: boolean; error?: string }>;
  listSessions: () => Promise<{ success: boolean; sessions?: OmpSessionInfo[]; error?: string }>;
  newSession: (parentSession?: string) => Promise<{ success: boolean; error?: string }>;
  switchSession: (sessionPath: string) => Promise<{ success: boolean; error?: string }>;
  branchSession: (entryId: string) => Promise<{ success: boolean; error?: string }>;
  loadHistory: () => Promise<{ success: boolean; messages?: ChatMessage[]; error?: string }>;
  getBranchEntries: () => Promise<{ success: boolean; entries?: OmpBranchEntry[]; error?: string }>;
  renameSession: (name: string) => Promise<{ success: boolean; error?: string }>;
  deleteSession: (sessionPath: string) => Promise<{ success: boolean; error?: string }>;
  exportSession: () => Promise<{ success: boolean; path?: string; cancelled?: boolean; error?: string }>;
  getSubagents?: () => Promise<OmpSubagentInfo[]>;
  getAvailableCommands: () => Promise<{ success: boolean; commands?: OmpCommandInfo[]; error?: string }>;
  selectFolder: () => Promise<string | null>;
  readDirectory: (dirPath: string) => Promise<WorkspaceFile[]>;
  readFile: (filePath: string) => Promise<string>;
  saveFile: (filePath: string, content: string) => Promise<any>;
  deleteFile: (filePath: string) => Promise<boolean>;
  onOmpStatusChange: (callback: (status: OmpAgentStatus) => void) => () => void;
  onOmpStreamToken: (callback: (token: string) => void) => () => void;
  onOmpThinking: (callback: (thinking: ThinkingBlock) => void) => () => void;
  onOmpToolCall: (callback: (toolCall: ToolCall) => void) => () => void;
  onOmpDiffGenerated: (callback: (diff: FileDiffItem) => void) => () => void;
  onOmpPermissionRequest: (callback: (request: PermissionRequest) => void) => () => void;
  onOmpUiRequest: (callback: (request: OmpUiRequest) => void) => () => void;
  onOmpUiRequestCancel: (callback: (targetId: string) => void) => () => void;
  onOmpMessageComplete: (callback: (message: ChatMessage) => void) => () => void;
  onOmpSubagentUpdate: (callback: (subagents: OmpSubagentInfo[]) => void) => () => void;

  // Settings & Persistence (Phase 7)
  getSettings: () => Promise<AppSettings>;
  setSettings: (settings: Partial<AppSettings>) => Promise<AppSettings>;
  onOmpNotification: (callback: (notification: OmpNotification) => void) => () => void;
  onOmpEngineStatus: (callback: (statuses: OmpEngineStatusEntry[]) => void) => () => void;
  onOmpWidgetUpdate: (callback: (widgets: OmpWidgetEntry[]) => void) => () => void;
  onOmpContextUsage: (callback: (data: OmpContextUsageUpdate) => void) => () => void;
  onOmpCommandsUpdate: (callback: (commands: OmpCommandInfo[]) => void) => () => void;
  onOmpCommandOutput: (callback: (data: { text: string }) => void) => () => void;
}
declare global {
  interface Window {
    electronAPI?: ElectronAPI;
  }
}
