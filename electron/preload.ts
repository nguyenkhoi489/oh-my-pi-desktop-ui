const { contextBridge, ipcRenderer, webUtils } = require('electron');
import type {
  OmpAgentStatus,
  ThinkingBlock,
  ToolCall,
  FileDiffItem,
  PermissionRequest,
  OmpUiRequest,
  OmpNotification,
  OmpEngineStatusEntry,
  OmpWidgetEntry,
  ChatMessage,
  WorkspaceFile,
  OmpThinkingLevel,
  OmpApprovalMode,
  OmpContextUsageUpdate,
  OmpSessionStats,
  OmpCommandInfo,
  AppSettings,
  AuthLoginEvent,
  OmpTodoPhase,
  OmpTodoItem,
} from './types';

contextBridge.exposeInMainWorld('electronAPI', {
  // OMP Process & Discovery Actions
  checkOmpInstallation: () =>
    ipcRenderer.invoke('omp:check-installation'),

  setCustomBinaryPath: (customPath: string) =>
    ipcRenderer.invoke('omp:set-custom-path', customPath),

  selectBinaryFile: () =>
    ipcRenderer.invoke('fs:select-binary'),

  startOmpProcess: (workspacePath: string, model?: string, options?: { provider?: string; extraArgs?: string[]; approvalMode?: OmpApprovalMode }) =>
    ipcRenderer.invoke('omp:start-process', workspacePath, model, options),

  stopOmpProcess: () =>
    ipcRenderer.invoke('omp:stop-process'),

  sendOmpMessage: (prompt: string, context?: { files?: string[] }) =>
    ipcRenderer.invoke('omp:send-message', prompt, context),

  steerOmp: (message: string, context?: { files?: string[] }) =>
    ipcRenderer.invoke('omp:steer', message, context),

  abortAndPromptOmp: (prompt: string, context?: { files?: string[] }) =>
    ipcRenderer.invoke('omp:abort-and-prompt', prompt, context),

  followUpOmp: (message: string, context?: { files?: string[] }) =>
    ipcRenderer.invoke('omp:follow-up', message, context),

  setSteeringMode: (mode: string) =>
    ipcRenderer.invoke('omp:set-steering-mode', mode),

  setFollowUpMode: (mode: string) =>
    ipcRenderer.invoke('omp:set-follow-up-mode', mode),

  setInterruptMode: (mode: string) =>
    ipcRenderer.invoke('omp:set-interrupt-mode', mode),

  abortOmp: () =>
    ipcRenderer.invoke('omp:abort'),
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

  getSessionStats: () =>
    ipcRenderer.invoke('omp:session-stats'),

  setApprovalMode: (mode: OmpApprovalMode) =>
    ipcRenderer.invoke('omp:set-approval-mode', mode),

  getApprovalMode: () =>
    ipcRenderer.invoke('omp:get-approval-mode'),

  compact: (customInstructions?: string) =>
    ipcRenderer.invoke('omp:compact', customInstructions),

  setAutoCompaction: (enabled: boolean) =>
    ipcRenderer.invoke('omp:set-auto-compaction', enabled),
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

  renameSession: (name: string) =>
    ipcRenderer.invoke('omp:rename-session', name),

  deleteSession: (sessionPath: string) =>
    ipcRenderer.invoke('omp:delete-session', sessionPath),

  exportSession: () =>
    ipcRenderer.invoke('omp:export-session'),

  getSubagents: () =>
    ipcRenderer.invoke('omp:get-subagents'),

  getSubagentMessages: (params: { subagentId?: string; sessionFile?: string; fromByte?: number }) =>
    ipcRenderer.invoke('omp:get-subagent-messages', params),

  getAvailableCommands: () =>
    ipcRenderer.invoke('omp:get-commands'),

  // Todos Management (Phase 4)
  getTodos: () =>
    ipcRenderer.invoke('omp:get-todos'),

  setTodos: (phases: OmpTodoPhase[]) =>
    ipcRenderer.invoke('omp:set-todos', phases),
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

  saveImageAttachment: (buffer: Uint8Array | ArrayBuffer, extension: string, originalName?: string) =>
    ipcRenderer.invoke('fs:save-image-attachment', buffer, extension, originalName),

  readImageAsDataUrl: (filePath: string) =>
    ipcRenderer.invoke('fs:read-image-base64', filePath),

  // Lấy đường dẫn thật của File được kéo thả (Electron >= 32 đã bỏ File.path)
  getPathForFile: (file: any) => {
    try {
      return webUtils.getPathForFile(file) || undefined;
    } catch {
      return undefined;
    }
  },

  // Settings & Persistence (Phase 7)
  getSettings: () => ipcRenderer.invoke('settings:get'),
  setSettings: (settings: Partial<AppSettings>) => ipcRenderer.invoke('settings:set', settings),

  // Provider & Custom LLM Management (Phase 8)
  getModelsConfig: () =>
    ipcRenderer.invoke('omp:models-config-read'),

  saveModelsConfig: (providers: any[]) =>
    ipcRenderer.invoke('omp:models-config-write', { providers }),

  // Model Roles trong ~/.omp/agent/config.yml
  getModelRolesConfig: () =>
    ipcRenderer.invoke('omp:model-roles-read'),

  saveModelRolesConfig: (roles: Record<string, string>) =>
    ipcRenderer.invoke('omp:model-roles-write', { roles }),

  getLoginProviders: () =>
    ipcRenderer.invoke('omp:login-providers'),

  // OAuth Login qua auth-broker
  startAuthLogin: (providerId: string) =>
    ipcRenderer.invoke('omp:auth-login-start', providerId),

  cancelAuthLogin: () =>
    ipcRenderer.invoke('omp:auth-login-cancel'),

  getAuthStatus: () =>
    ipcRenderer.invoke('omp:auth-status'),

  sendAuthLoginInput: (text: string) =>
    ipcRenderer.invoke('omp:auth-login-input', text),

  onAuthLoginEvent: (callback: (event: AuthLoginEvent) => void) => {
    const handler = (_: unknown, event: AuthLoginEvent) => callback(event);
    ipcRenderer.on('omp:auth-login-event', handler);
    return () => ipcRenderer.removeListener('omp:auth-login-event', handler);
  },

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

  onOmpNotification: (callback: (notification: OmpNotification) => void) => {
    const handler = (_: unknown, notif: OmpNotification) => callback(notif);
    ipcRenderer.on('omp:notification', handler);
    return () => ipcRenderer.removeListener('omp:notification', handler);
  },

  onOmpEngineStatus: (callback: (statuses: OmpEngineStatusEntry[]) => void) => {
    const handler = (_: unknown, statuses: OmpEngineStatusEntry[]) => callback(statuses);
    ipcRenderer.on('omp:engine-status', handler);
    return () => ipcRenderer.removeListener('omp:engine-status', handler);
  },

  onOmpWidgetUpdate: (callback: (widgets: OmpWidgetEntry[]) => void) => {
    const handler = (_: unknown, widgets: OmpWidgetEntry[]) => callback(widgets);
    ipcRenderer.on('omp:widget-update', handler);
    return () => ipcRenderer.removeListener('omp:widget-update', handler);
  },
  onOmpContextUsage: (callback: (data: OmpContextUsageUpdate) => void) => {
    const handler = (_: unknown, data: OmpContextUsageUpdate) => callback(data);
    ipcRenderer.on('omp:context-usage', handler);
    return () => ipcRenderer.removeListener('omp:context-usage', handler);
  },
  onOmpCommandsUpdate: (callback: (commands: OmpCommandInfo[]) => void) => {
    const handler = (_: unknown, commands: OmpCommandInfo[]) => callback(commands);
    ipcRenderer.on('omp:commands-update', handler);
    return () => ipcRenderer.removeListener('omp:commands-update', handler);
  },
  onOmpCommandOutput: (callback: (data: { text: string }) => void) => {
    const handler = (_: unknown, data: { text: string }) => callback(data);
    ipcRenderer.on('omp:command-output', handler);
    return () => ipcRenderer.removeListener('omp:command-output', handler);
  },
  onOmpTodosUpdate: (callback: (data: { phases: OmpTodoPhase[]; todos: OmpTodoItem[] }) => void) => {
    const handler = (_: unknown, data: { phases: OmpTodoPhase[]; todos: OmpTodoItem[] }) => callback(data);
    ipcRenderer.on('omp:todos-update', handler);
    return () => ipcRenderer.removeListener('omp:todos-update', handler);
  },
});
