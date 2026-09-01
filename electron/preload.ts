const { contextBridge, ipcRenderer } = require('electron');
import type {
  OmpAgentStatus,
  ThinkingBlock,
  ToolCall,
  FileDiffItem,
  PermissionRequest,
  OmpUiRequest,
  ChatMessage,
  WorkspaceFile,
  OmpThinkingLevel,
} from './types';

contextBridge.exposeInMainWorld('electronAPI', {
  // OMP Process & Discovery Actions
  checkOmpInstallation: () =>
    ipcRenderer.invoke('omp:check-installation'),

  setCustomBinaryPath: (customPath: string) =>
    ipcRenderer.invoke('omp:set-custom-path', customPath),

  selectBinaryFile: () =>
    ipcRenderer.invoke('fs:select-binary'),

  startOmpProcess: (workspacePath: string, model?: string) =>
    ipcRenderer.invoke('omp:start-process', workspacePath, model),

  stopOmpProcess: () =>
    ipcRenderer.invoke('omp:stop-process'),

  sendOmpMessage: (prompt: string, context?: { files?: string[] }) =>
    ipcRenderer.invoke('omp:send-message', prompt, context),

  respondToPermission: (requestId: string, approved: boolean) =>
    ipcRenderer.invoke('omp:respond-permission', requestId, approved),

  respondUiRequest: (id: string, payload: { value?: unknown; confirmed?: boolean; cancelled?: boolean }) =>
    ipcRenderer.invoke('omp:ui-respond', id, payload),

  // Model Catalog & Engine State (Phase 2 Additions)
  getAvailableModels: () =>
    ipcRenderer.invoke('omp:get-models'),

  setModel: (provider: string, modelId: string) =>
    ipcRenderer.invoke('omp:set-model', provider, modelId),

  setThinkingLevel: (level: OmpThinkingLevel) =>
    ipcRenderer.invoke('omp:set-thinking-level', level),

  getEngineState: () =>
    ipcRenderer.invoke('omp:get-state'),

  getState: () =>
    ipcRenderer.invoke('omp:get-state'),

  // Sessions & Subagent Hub (Phase 1 Additions)
  listSessions: () =>
    ipcRenderer.invoke('omp:list-sessions'),

  newSession: (parentSession?: string) =>
    ipcRenderer.invoke('omp:new-session', parentSession),

  switchSession: (sessionPath: string) =>
    ipcRenderer.invoke('omp:switch-session', sessionPath),

  branchSession: (entryId: string) =>
    ipcRenderer.invoke('omp:branch-session', entryId),

  loadHistory: () =>
    ipcRenderer.invoke('omp:load-history'),

  getBranchEntries: () =>
    ipcRenderer.invoke('omp:branch-entries'),

  getSubagents: () =>
    ipcRenderer.invoke('omp:get-subagents'),

  // File System & Dialogs
  selectFolder: () =>
    ipcRenderer.invoke('fs:select-folder'),

  readDirectory: (dirPath: string) =>
    ipcRenderer.invoke('fs:read-dir', dirPath),

  readFile: (filePath: string) =>
    ipcRenderer.invoke('fs:read-file', filePath),

  saveFile: (filePath: string, content: string) =>
    ipcRenderer.invoke('fs:save-file', filePath, content),

  deleteFile: (filePath: string) =>
    ipcRenderer.invoke('fs:delete-file', filePath),

  // IPC Event Listeners
  onOmpStatusChange: (callback: (status: OmpAgentStatus) => void) => {
    const handler = (_: any, status: OmpAgentStatus) => callback(status);
    ipcRenderer.on('omp:status-change', handler);
    return () => ipcRenderer.removeListener('omp:status-change', handler);
  },

  onOmpStreamToken: (callback: (token: string) => void) => {
    const handler = (_: any, token: string) => callback(token);
    ipcRenderer.on('omp:stream-token', handler);
    return () => ipcRenderer.removeListener('omp:stream-token', handler);
  },

  onOmpThinking: (callback: (thinking: ThinkingBlock) => void) => {
    const handler = (_: any, thinking: ThinkingBlock) => callback(thinking);
    ipcRenderer.on('omp:thinking', handler);
    return () => ipcRenderer.removeListener('omp:thinking', handler);
  },

  onOmpToolCall: (callback: (toolCall: ToolCall) => void) => {
    const handler = (_: any, toolCall: ToolCall) => callback(toolCall);
    ipcRenderer.on('omp:tool-call', handler);
    return () => ipcRenderer.removeListener('omp:tool-call', handler);
  },

  onOmpDiffGenerated: (callback: (diff: FileDiffItem) => void) => {
    const handler = (_: any, diff: FileDiffItem) => callback(diff);
    ipcRenderer.on('omp:diff-generated', handler);
    return () => ipcRenderer.removeListener('omp:diff-generated', handler);
  },

  onOmpPermissionRequest: (callback: (request: PermissionRequest) => void) => {
    const handler = (_: any, req: PermissionRequest) => callback(req);
    ipcRenderer.on('omp:permission-request', handler);
    return () => ipcRenderer.removeListener('omp:permission-request', handler);
  },

  onOmpUiRequest: (callback: (request: OmpUiRequest) => void) => {
    const handler = (_: any, req: OmpUiRequest) => callback(req);
    ipcRenderer.on('omp:ui-request', handler);
    return () => ipcRenderer.removeListener('omp:ui-request', handler);
  },

  onOmpUiRequestCancel: (callback: (targetId: string) => void) => {
    const handler = (_: any, targetId: string) => callback(targetId);
    ipcRenderer.on('omp:ui-request-cancel', handler);
    return () => ipcRenderer.removeListener('omp:ui-request-cancel', handler);
  },

  onOmpMessageComplete: (callback: (message: ChatMessage) => void) => {
    const handler = (_: any, msg: ChatMessage) => callback(msg);
    ipcRenderer.on('omp:message-complete', handler);
    return () => ipcRenderer.removeListener('omp:message-complete', handler);
  },

  onOmpSubagentUpdate: (callback: (subagents: any[]) => void) => {
    const handler = (_: any, subagents: any[]) => callback(subagents);
    ipcRenderer.on('omp:subagent-update', handler);
    return () => ipcRenderer.removeListener('omp:subagent-update', handler);
  },
});
