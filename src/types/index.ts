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

export interface ElectronAPI {
  checkOmpInstallation: () => Promise<OmpInstallStatus>;
  setCustomBinaryPath: (path: string) => Promise<OmpInstallStatus>;
  selectBinaryFile: () => Promise<string | null>;
  startOmpProcess: (workspacePath: string, model?: string) => Promise<any>;
  stopOmpProcess: () => Promise<any>;
  sendOmpMessage: (prompt: string, context?: { files?: string[] }) => Promise<any>;
  respondToPermission: (requestId: string, approved: boolean) => Promise<any>;
  selectFolder: () => Promise<string | null>;
  readDirectory: (dirPath: string) => Promise<WorkspaceFile[]>;
  readFile: (filePath: string) => Promise<string>;
  saveFile: (filePath: string, content: string) => Promise<any>;
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
