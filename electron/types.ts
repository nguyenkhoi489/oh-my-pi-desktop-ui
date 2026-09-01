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

export interface OmpInstallStatus {
  installed: boolean;
  version?: string;
  binaryPath?: string;
  error?: string;
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
  
  // Workspace / Filesystem
  selectFolder: () => Promise<string | null>;
  readDirectory: (dirPath: string) => Promise<WorkspaceFile[]>;
  readFile: (filePath: string) => Promise<string>;
  saveFile: (filePath: string, content: string) => Promise<boolean>;
  
  // Event listeners from Main to Renderer
  onOmpStatusChange: (callback: (status: OmpAgentStatus) => void) => () => void;
  onOmpStreamToken: (callback: (token: string) => void) => () => void;
  onOmpThinking: (callback: (thinking: ThinkingBlock) => void) => () => void;
  onOmpToolCall: (callback: (toolCall: ToolCall) => void) => () => void;
  onOmpDiffGenerated: (callback: (diff: FileDiffItem) => void) => () => void;
  onOmpPermissionRequest: (callback: (request: PermissionRequest) => void) => () => void;
  onOmpMessageComplete: (callback: (message: ChatMessage) => void) => () => void;
}

declare global {
  interface Window {
    electronAPI?: ElectronAPI;
  }
}
