// OMP RPC Types & Electron IPC Definitions

export interface OmpRpcRequest {
  id: string | number;
  method: string;
  params?: any;
}

export interface OmpRpcResponse {
  id: string | number;
  result?: any;
  error?: {
    code: number;
    message: string;
    data?: any;
  };
}

export type OmpAgentStatus = 'idle' | 'thinking' | 'executing_tool' | 'waiting_permission' | 'streaming';

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

export interface ChatMessage {
  id: string;
  role: 'user' | 'assistant' | 'system';
  content: string;
  timestamp: number;
  thinking?: ThinkingBlock;
  toolCalls?: ToolCall[];
  entryId?: string;
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

export interface WorkspaceFolder {
  path: string;
  name: string;
  files: WorkspaceFile[];
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

export type OmpThinkingLevel =
  | 'off'
  | 'minimal'
  | 'low'
  | 'medium'
  | 'high'
  | 'xhigh'
  | 'max'
  | 'auto';

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
  role: string;
  timestamp?: number;
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
  queuedMessageCount?: number;
  fastModeEnabled?: boolean;
  tokensPerSecond?: number | null;
  fastModeActive?: boolean;
  messageCount?: number;
  contextUsage?: {
    tokens?: number;
    contextWindow?: number;
    percent?: number;
    [key: string]: unknown;
  };
  tools?: unknown[];
  commands?: unknown[];
  [key: string]: unknown;
}

export interface ElectronAPI {
  // OMP Process Management & Discovery
  checkOmpInstallation: () => Promise<OmpInstallStatus>;
  setCustomBinaryPath: (customPath: string) => Promise<OmpInstallStatus>;
  selectBinaryFile: () => Promise<string | null>;
  startOmpProcess: (workspacePath: string, model?: string) => Promise<{ success: boolean; pid?: number }>;
  stopOmpProcess: () => Promise<{ success: boolean }>;
  sendOmpMessage: (prompt: string, context?: { files?: string[] }) => Promise<{ success: boolean }>;
  respondToPermission: (requestId: string, approved: boolean) => Promise<void>;
  respondUiRequest: (id: string, payload: { value?: unknown; confirmed?: boolean; cancelled?: boolean }) => Promise<void>;

  // Model Catalog & Engine State (Phase 2 Additions)
  getAvailableModels: () => Promise<{ success: boolean; models?: OmpModelInfo[]; error?: string }>;
  setModel: (provider: string, modelId: string) => Promise<{ success: boolean; model?: OmpModelInfo; error?: string }>;
  setThinkingLevel: (level: OmpThinkingLevel) => Promise<{ success: boolean; error?: string }>;
  getEngineState: () => Promise<{ success: boolean; state?: OmpEngineState; error?: string }>;
  getState: () => Promise<{ success: boolean; state?: OmpEngineState; error?: string }>;

  // Sessions & Subagent Hub (Phase 1 & 3 Additions)
  listSessions: () => Promise<{ success: boolean; sessions?: OmpSessionInfo[]; error?: string }>;
  newSession: (parentSession?: string) => Promise<{ success: boolean; error?: string }>;
  switchSession: (sessionPath: string) => Promise<{ success: boolean; error?: string }>;
  branchSession: (entryId: string) => Promise<{ success: boolean; error?: string }>;
  loadHistory: () => Promise<{ success: boolean; messages?: ChatMessage[]; error?: string }>;
  getBranchEntries: () => Promise<{ success: boolean; entries?: OmpBranchEntry[]; error?: string }>;
  getSubagents?: () => Promise<OmpSubagentInfo[]>;
  
  // Workspace / Filesystem
  selectFolder: () => Promise<string | null>;
  readDirectory: (dirPath: string) => Promise<WorkspaceFile[]>;
  readFile: (filePath: string) => Promise<string>;
  saveFile: (filePath: string, content: string) => Promise<boolean>;
  deleteFile: (filePath: string) => Promise<boolean>;
  
  // Event listeners from Main to Renderer
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
}

declare global {
  interface Window {
    electronAPI?: ElectronAPI;
  }
}
