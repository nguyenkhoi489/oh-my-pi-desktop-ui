const { contextBridge, ipcRenderer, webUtils } = require('electron');
import type {
  OmpAgentStatus,
  ThinkingBlock,
  ToolCall,
  FileDiffItem,
  PermissionRequest,
  OmpUiRequest,
  OmpNotification,
  HostOpenRequest,
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
  FetchEngineConfigOptions,
  SetEngineConfigOptions,
  ResetEngineConfigOptions,
  EngineConfigPathOptions,
  FetchGlobalUsageOptions,
  FetchUsageHistoryOptions,
  FetchUsageClientsOptions,
  InvalidateUsageOptions,
  StartStatsDashboardOptions,
  StorageGcOptions,
  ImageBackendsAction,
  ImageBackendsOptions,
  SshHostAddInput,
  GrievancesListOptions,
  GrievancesCleanOptions,
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

  findModels: (pattern: string) =>
    ipcRenderer.invoke('omp:models-find', pattern),

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

  getGlobalUsage: (options?: boolean | FetchGlobalUsageOptions) =>
    ipcRenderer.invoke('omp:global-usage', options),

  getGlobalStats: (forceRefresh?: boolean) =>
    ipcRenderer.invoke('omp:global-stats', forceRefresh),

  getUsageHistory: (options?: FetchUsageHistoryOptions) =>
    ipcRenderer.invoke('omp:usage-history', options),

  getUsageClients: (options?: FetchUsageClientsOptions) =>
    ipcRenderer.invoke('omp:usage-clients', options),

  invalidateUsage: (options?: InvalidateUsageOptions) =>
    ipcRenderer.invoke('omp:usage-invalidate', options),

  startStatsDashboard: (options?: StartStatsDashboardOptions) =>
    ipcRenderer.invoke('omp:stats-dashboard-start', options),

  stopStatsDashboard: () =>
    ipcRenderer.invoke('omp:stats-dashboard-stop'),

  getStatsDashboardStatus: () =>
    ipcRenderer.invoke('omp:stats-dashboard-status'),

  openExternal: (url: string) =>
    ipcRenderer.invoke('shell:open-external', url),
  // Engine Configuration (Phase 2)
  getEngineConfig: (options?: FetchEngineConfigOptions) =>
    ipcRenderer.invoke('omp:config-list', options),

  setEngineConfigValue: (key: string, value: string, options?: SetEngineConfigOptions) =>
    ipcRenderer.invoke('omp:config-set', key, value, options),

  resetEngineConfigValue: (key: string, options?: ResetEngineConfigOptions) =>
    ipcRenderer.invoke('omp:config-reset', key, options),

  getEngineConfigPath: (options?: EngineConfigPathOptions) =>
    ipcRenderer.invoke('omp:config-path', options),

  setApprovalMode: (mode: OmpApprovalMode) =>
    ipcRenderer.invoke('omp:set-approval-mode', mode),

  getApprovalMode: () =>
    ipcRenderer.invoke('omp:get-approval-mode'),

  compact: (customInstructions?: string) =>
    ipcRenderer.invoke('omp:compact', customInstructions),

  setAutoCompaction: (enabled: boolean) =>
    ipcRenderer.invoke('omp:set-auto-compaction', enabled),
  setAutoRetry: (enabled: boolean) =>
    ipcRenderer.invoke('omp:set-auto-retry', enabled),

  abortRetry: () =>
    ipcRenderer.invoke('omp:abort-retry'),

  setFastMode: (enabled: boolean) =>
    ipcRenderer.invoke('omp:set-fast-mode', enabled),

  getLastAssistantText: () =>
    ipcRenderer.invoke('omp:get-last-assistant-text'),

  handoff: () =>
    ipcRenderer.invoke('omp:handoff'),
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

  listImportCandidates: (source?: 'claude' | 'codex') =>
    ipcRenderer.invoke('omp:list-import-candidates', source),

  importSession: (candidate: any, targetCwd?: string) =>
    ipcRenderer.invoke('omp:import-session', candidate, targetCwd),
  // Engine Maintenance (Phase 9)
  checkEngineUpdate: () =>
    ipcRenderer.invoke('omp:maintenance-check-update'),

  checkEngineComponents: () =>
    ipcRenderer.invoke('omp:maintenance-check-components'),

  listTinyModels: () =>
    ipcRenderer.invoke('omp:maintenance-list-tiny-models'),

  runMaintenanceTask: (taskId: string, args: string[]) =>
    ipcRenderer.invoke('omp:maintenance-run-task', taskId, args),

  cancelMaintenanceTask: () =>
    ipcRenderer.invoke('omp:maintenance-cancel-task'),

  getSubagents: () =>
    ipcRenderer.invoke('omp:get-subagents'),

  getSubagentMessages: (params: { subagentId?: string; sessionFile?: string; fromByte?: number }) =>
    ipcRenderer.invoke('omp:get-subagent-messages', params),

  // Bash Bridge & Terminal (Phase 10 & 11)
  runBash: (command: string) =>
    ipcRenderer.invoke('omp:run-bash', command),

  abortBash: () =>
    ipcRenderer.invoke('omp:abort-bash'),

  // Collab Share & Join (Phase 12)
  shareSession: (sessionIdentifier: string, options?: { gist?: boolean }) =>
    ipcRenderer.invoke('omp:share-session', sessionIdentifier, options),

  joinSession: (link: string) =>
    ipcRenderer.invoke('omp:join-session', link),

  // Background Process & Worktree Managers (Phase 13)
  listProcesses: (options?: { all?: boolean; global?: string }) =>
    ipcRenderer.invoke('omp:ps-list', options),

  controlProcess: (action: 'stop' | 'kill' | 'restart', name: string, options?: { global?: string; timeout?: number; dir?: string }) =>
    ipcRenderer.invoke('omp:ps-control', action, name, options),

  removeProcess: (name: string, options?: { global?: string; dir?: string }) =>
    ipcRenderer.invoke('omp:ps-remove', name, options),

  getProcessLogs: (name: string, options?: { lines?: number; head?: boolean; grep?: string; global?: string; dir?: string }) =>
    ipcRenderer.invoke('omp:ps-logs', name, options),

  getProcessInfo: (name: string, options?: { global?: string; dir?: string }) =>
    ipcRenderer.invoke('omp:ps-info', name, options),

  startProcessLogFollow: (name: string, options?: { lines?: number; head?: boolean; grep?: string; global?: string; dir?: string }) =>
    ipcRenderer.invoke('omp:ps-logs-follow-start', name, options),
  stopProcessLogFollow: () =>
    ipcRenderer.invoke('omp:ps-logs-follow-stop'),

  onPsLogLine: (callback: (data: { name: string; line: string }) => void) => {
    const listener = (_: any, data: { name: string; line: string }) => callback(data);
    ipcRenderer.on('omp:ps-log-line', listener);
    return () => {
      ipcRenderer.removeListener('omp:ps-log-line', listener);
    };
  },

  listWorktrees: () =>
    ipcRenderer.invoke('omp:worktree-list'),

  clearWorktrees: (options?: { all?: boolean; dryRun?: boolean }) =>
    ipcRenderer.invoke('omp:worktree-clear', options),

  // Storage GC (Phase 10)
  runGc: (options?: StorageGcOptions) =>
    ipcRenderer.invoke('omp:gc-run', options),

  // Image Backends (Phase 11)
  runImages: (action?: ImageBackendsAction, options?: ImageBackendsOptions) =>
    ipcRenderer.invoke('omp:images-run', action, options),

  // SSH Hosts (Phase 12)
  listSshHosts: () => ipcRenderer.invoke('omp:ssh-list'),
  addSshHost: (input: SshHostAddInput) => ipcRenderer.invoke('omp:ssh-add', input),
  removeSshHost: (name: string, scope: 'project' | 'user') =>
    ipcRenderer.invoke('omp:ssh-remove', name, scope),

  // Grievances (Phase 13)
  listGrievances: (options?: GrievancesListOptions) =>
    ipcRenderer.invoke('omp:grievances-list', options),
  cleanGrievances: (options: GrievancesCleanOptions) =>
    ipcRenderer.invoke('omp:grievances-clean', options),
  pushGrievances: (options?: { profile?: string | null }) =>
    ipcRenderer.invoke('omp:grievances-push', options),

  // Plugin & Agents Managers (Phase 14, 15 & Expansion)
  listPlugins: (options?: { local?: boolean }) =>
    ipcRenderer.invoke('omp:plugin-list', options),

  installPlugin: (target: string, options?: { scope?: 'user' | 'project'; force?: boolean; local?: boolean; dryRun?: boolean }) =>
    ipcRenderer.invoke('omp:plugin-install', target, options),

  uninstallPlugin: (target: string, options?: { scope?: 'user' | 'project'; local?: boolean; dryRun?: boolean }) =>
    ipcRenderer.invoke('omp:plugin-uninstall', target, options),

  linkPlugin: (localPath: string) =>
    ipcRenderer.invoke('omp:plugin-link', localPath),

  pluginDoctor: (options?: { fix?: boolean; local?: boolean }) =>
    ipcRenderer.invoke('omp:plugin-doctor', options),

  pluginFeatures: (pluginName: string, options?: { local?: boolean }) =>
    ipcRenderer.invoke('omp:plugin-features', pluginName, options),

  pluginToggleFeature: (pluginName: string, feature: string, enabled: boolean, options?: { local?: boolean }) =>
    ipcRenderer.invoke('omp:plugin-feature-toggle', pluginName, feature, enabled, options),

  pluginSetConfig: (pluginName: string, pairs: Array<{ key: string; value: string }>, options?: { local?: boolean }) =>
    ipcRenderer.invoke('omp:plugin-config-set', pluginName, pairs, options),

  pluginGetConfig: (pluginName: string, options?: { local?: boolean }) =>
    ipcRenderer.invoke('omp:plugin-config-get', pluginName, options),

  pluginToggle: (pluginName: string, enabled: boolean, options?: { local?: boolean }) =>
    ipcRenderer.invoke('omp:plugin-toggle', pluginName, enabled, options),

  pluginUpgrade: (options?: { name?: string; dryRun?: boolean; local?: boolean }) =>
    ipcRenderer.invoke('omp:plugin-upgrade', options),

  pluginDiscover: (options?: { local?: boolean }) =>
    ipcRenderer.invoke('omp:plugin-discover', options),

  pluginMarketplace: (action: 'list' | 'add' | 'remove', source?: string, options?: { local?: boolean }) =>
    ipcRenderer.invoke('omp:plugin-marketplace', action, source, options),
  listAgents: () =>
    ipcRenderer.invoke('omp:agents-list'),

  unpackAgents: (options?: { scope?: 'user' | 'project'; force?: boolean; dir?: string }) =>
    ipcRenderer.invoke('omp:agents-unpack', options),

  // Profile Management (Phase 16)
  getProfile: () =>
    ipcRenderer.invoke('omp:get-profile'),

  setProfile: (profile: string) =>
    ipcRenderer.invoke('omp:set-profile', profile),

  listProfiles: () =>
    ipcRenderer.invoke('omp:profile-list'),

  createProfile: (name: string) =>
    ipcRenderer.invoke('omp:profile-create', name),

  deleteProfile: (name: string) =>
    ipcRenderer.invoke('omp:profile-delete', name),

  // Host Tools & URI Schemes (Phase 17 & 18)
  registerHostTools: () =>
    ipcRenderer.invoke('omp:register-host-tools'),

  setHostUriSchemes: (schemes: string[]) =>
    ipcRenderer.invoke('omp:set-host-uri-schemes', schemes),

  // Commit Assistant (Phase 14)
  runCommit: (options: any) =>
    ipcRenderer.invoke('omp:commit-run', options),

  cancelCommit: () =>
    ipcRenderer.invoke('omp:commit-cancel'),

  getCommitStatus: (cwd?: string) =>
    ipcRenderer.invoke('omp:commit-status', cwd),


  // Cleanse Runner (Phase 15)
  runCleanse: (options: any) =>
    ipcRenderer.invoke('omp:cleanse-run', options),

  cancelCleanse: () =>
    ipcRenderer.invoke('omp:cleanse-cancel'),
  // Browser Relay Service (Phase 16)
  installBrowserRelay: (options?: any) =>
    ipcRenderer.invoke('omp:browser-relay-install', options),
  startBrowserRelay: (options?: any) =>
    ipcRenderer.invoke('omp:browser-relay-start', options),
  stopBrowserRelay: () =>
    ipcRenderer.invoke('omp:browser-relay-stop'),
  getBrowserRelayStatus: () =>
    ipcRenderer.invoke('omp:browser-relay-status'),
  // Text-to-Speech (Phase 17)
  startSay: (text: string, options?: any) =>
    ipcRenderer.invoke('omp:say-start', text, options),
  stopSay: () =>
    ipcRenderer.invoke('omp:say-stop'),
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

  selectFile: (options?: { title?: string; filters?: { name: string; extensions: string[] }[] }) =>
    ipcRenderer.invoke('fs:select-file', options),
  readDirectory: (dirPath: string) =>
    ipcRenderer.invoke('fs:read-dir', dirPath),

  readFile: (filePath: string) =>
    ipcRenderer.invoke('fs:read-file', filePath),

  saveFile: (filePath: string, content: string) =>
    ipcRenderer.invoke('fs:save-file', filePath, content),

  deleteFile: (filePath: string) =>
    ipcRenderer.invoke('fs:delete-file', filePath),

  revealInFinder: (filePath: string) =>
    ipcRenderer.invoke('fs:reveal-in-finder', filePath),

  getFileHistory: (filePath: string) =>
    ipcRenderer.invoke('git:file-history', filePath),

  getFileAtCommit: (commitHash: string, filePath: string) =>
    ipcRenderer.invoke('git:file-at-commit', commitHash, filePath),

  saveImageAttachment: (buffer: Uint8Array | ArrayBuffer, extension: string, originalName?: string) =>
    ipcRenderer.invoke('fs:save-image-attachment', buffer, extension, originalName),

  readImageAsDataUrl: (filePath: string) =>
    ipcRenderer.invoke('fs:read-image-base64', filePath),

  // Real file path resolver for drag-and-drop (Electron >= 32 removed File.path)
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
  logoutAuthProvider: (providerId: string) =>
    ipcRenderer.invoke('omp:auth-logout', providerId),
  isEngineRunning: () =>
    ipcRenderer.invoke('omp:is-engine-running'),

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

  onHostOpenRequest: (callback: (request: HostOpenRequest) => void) => {
    const handler = (_: unknown, request: HostOpenRequest) => callback(request);
    ipcRenderer.on('omp:host-open-request', handler);
    return () => ipcRenderer.removeListener('omp:host-open-request', handler);
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
  onOmpRetryState: (callback: (state: any) => void) => {
    const handler = (_: unknown, state: any) => callback(state);
    ipcRenderer.on('omp:retry-state', handler);
    return () => ipcRenderer.removeListener('omp:retry-state', handler);
  },
  onMaintenanceOutput: (callback: (event: any) => void) => {
    const handler = (_: unknown, event: any) => callback(event);
    ipcRenderer.on('omp:maintenance-output', handler);
    return () => ipcRenderer.removeListener('omp:maintenance-output', handler);
  },
  onCommitOutput: (callback: (event: any) => void) => {
    const handler = (_: unknown, event: any) => callback(event);
    ipcRenderer.on('omp:commit-output', handler);
    return () => ipcRenderer.removeListener('omp:commit-output', handler);
  },
  onCleanseOutput: (callback: (event: any) => void) => {
    const handler = (_: unknown, event: any) => callback(event);
    ipcRenderer.on('omp:cleanse-output', handler);
    return () => ipcRenderer.removeListener('omp:cleanse-output', handler);
  },
  onBrowserRelayOutput: (callback: (event: any) => void) => {
    const handler = (_: unknown, event: any) => callback(event);
    ipcRenderer.on('omp:browser-relay-output', handler);
    return () => ipcRenderer.removeListener('omp:browser-relay-output', handler);
  },
  onSayStatus: (callback: (status: any) => void) => {
    const handler = (_: unknown, status: any) => callback(status);
    ipcRenderer.on('omp:say-status', handler);
    return () => ipcRenderer.removeListener('omp:say-status', handler);
  },
  onBashOutput: (callback: (data: { text: string; id?: string }) => void) => {
    const handler = (_: unknown, data: { text: string; id?: string }) => callback(data);
    ipcRenderer.on('omp:bash-output', handler);
    return () => ipcRenderer.removeListener('omp:bash-output', handler);
  },
});
