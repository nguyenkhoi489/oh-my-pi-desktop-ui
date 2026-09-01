const { contextBridge, ipcRenderer } = require('electron');
import type {
  OmpAgentStatus,
  ThinkingBlock,
  ToolCall,
  FileDiffItem,
  PermissionRequest,
  ChatMessage,
  WorkspaceFile,
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

  // File System & Dialogs
  selectFolder: () =>
    ipcRenderer.invoke('fs:select-folder'),

  readDirectory: (dirPath: string) =>
    ipcRenderer.invoke('fs:read-dir', dirPath),

  readFile: (filePath: string) =>
    ipcRenderer.invoke('fs:read-file', filePath),

  saveFile: (filePath: string, content: string) =>
    ipcRenderer.invoke('fs:save-file', filePath, content),

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

  onOmpMessageComplete: (callback: (message: ChatMessage) => void) => {
    const handler = (_: any, msg: ChatMessage) => callback(msg);
    ipcRenderer.on('omp:message-complete', handler);
    return () => ipcRenderer.removeListener('omp:message-complete', handler);
  },
});
