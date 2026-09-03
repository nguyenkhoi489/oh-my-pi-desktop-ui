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
  steering?: boolean;
  queued?: boolean;
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
export interface OmpRetryState {
  isRetrying: boolean;
  attempt?: number;
  maxAttempts?: number;
  delayMs?: number;
  error?: string;
  success?: boolean;
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
  path?: string;
  isLoaded?: boolean;
}
export interface OmpNotification {
  id: string;
  message: string;
  notifyType: 'info' | 'warning' | 'error' | string;
  timestamp: number;
}

export interface HostOpenRequest {
  kind: 'file' | 'session';
  target: string;
  line?: number;
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


export type OmpTodoStatus =
  | 'pending'
  | 'in_progress'
  | 'done'
  | 'completed'
  | 'cancelled'
  | 'dropped'
  | 'blocked'
  | string;

export interface OmpTodoItem {
  id?: string;
  content: string;
  status: OmpTodoStatus;
  phase?: string;
  reason?: string;
  [key: string]: unknown;
}

export interface OmpTodoPhase {
  name: string;
  tasks: OmpTodoItem[];
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
export interface OmpUsageLimitAmount {
  used: number;
  limit: number;
  remaining: number;
  usedFraction: number;
  remainingFraction: number;
  unit: string;
}

export interface OmpUsageLimitWindow {
  id: string;
  label: string;
  durationMs?: number;
  resetsAt?: number;
}

export interface OmpUsageLimit {
  id: string;
  label: string;
  scope?: {
    provider?: string;
    windowId?: string;
    shared?: boolean;
    accountId?: string;
    tier?: string;
    modelId?: string;
  };
  window?: OmpUsageLimitWindow;
  amount?: OmpUsageLimitAmount;
  status?: string;
}

export interface OmpUsageReportMetadata {
  planType?: string;
  allowed?: boolean;
  limitReached?: boolean;
  email?: string;
  accountId?: string;
  orgId?: string;
  orgName?: string;
  meterStates?: Record<string, { allowed?: boolean; limitReached?: boolean }>;
}

export interface OmpUsageReport {
  provider: string;
  fetchedAt?: number;
  limits?: OmpUsageLimit[];
  metadata?: OmpUsageReportMetadata;
  resetCredits?: {
    availableCount?: number;
  };
}

export interface OmpUsageCapacityItem {
  window: string;
  durationMs?: number;
  meter?: string;
  accounts?: number;
  usedAccounts?: number;
  remainingAccounts?: number;
}

export interface OmpGlobalUsageData {
  generatedAt?: number;
  reports?: OmpUsageReport[];
  capacity?: Record<string, OmpUsageCapacityItem[]>;
  accountsWithoutUsage?: any[];
  disabledCredentials?: any[];
}

export interface OmpOverallStats {
  totalRequests: number;
  successfulRequests: number;
  failedRequests: number;
  errorRate: number;
  totalInputTokens: number;
  totalOutputTokens: number;
  totalCacheReadTokens: number;
  totalCacheWriteTokens: number;
  cacheRate: number;
  cacheSavings: number;
  totalCost: number;
  unpricedRequests: number;
  totalPremiumRequests: number;
  avgDuration?: number | null;
  avgTtft?: number | null;
  avgTokensPerSecond?: number | null;
  firstTimestamp?: number | null;
  lastTimestamp?: number | null;
}

export interface OmpModelStats {
  model: string;
  provider: string;
  totalRequests: number;
  successfulRequests: number;
  failedRequests: number;
  errorRate: number;
  totalInputTokens: number;
  totalOutputTokens: number;
  totalCacheReadTokens: number;
  totalCacheWriteTokens: number;
  cacheRate: number;
  cacheSavings: number;
  totalCost: number;
  avgDuration?: number | null;
  avgTtft?: number | null;
  avgTokensPerSecond?: number | null;
}

export interface OmpFolderStats {
  folder: string;
  totalRequests: number;
  successfulRequests: number;
  failedRequests: number;
  errorRate: number;
  totalInputTokens: number;
  totalOutputTokens: number;
  totalCost: number;
}

export interface OmpAgentTypeStats {
  agentType: string;
  totalRequests: number;
  totalInputTokens: number;
  totalOutputTokens: number;
  totalCacheReadTokens?: number;
  totalCost: number;
}

export interface OmpGlobalStatsData {
  overall?: OmpOverallStats;
  byModel?: OmpModelStats[];
  byFolder?: OmpFolderStats[];
  byAgentType?: OmpAgentTypeStats[];
}

export interface GlobalUsageResult {
  success: boolean;
  data?: OmpGlobalUsageData;
  raw?: string;
  error?: string;
}

export interface GlobalStatsResult {
  success: boolean;
  data?: OmpGlobalStatsData;
  raw?: string;
  error?: string;
}

export interface ForeignSessionCandidate {
  source: 'claude' | 'codex';
  id: string;
  path: string;
  cwd?: string;
  title?: string;
  created: string;
  modified: string;
  firstMessage?: string;
  messageCount?: number;
}

export interface ImportSessionResult {
  success: boolean;
  sessionId?: string;
  sessionPath?: string;
  title?: string;
  error?: string;
}

export interface EngineUpdateCheckResult {
  success: boolean;
  currentVersion: string;
  hasUpdate: boolean;
  latestVersion?: string;
  rawOutput?: string;
  error?: string;
}

export interface EngineComponentStatus {
  id: string;
  name: string;
  description: string;
  isInstalled: boolean;
  details?: string;
}

export interface TinyModelItem {
  key: string;
  isDefault: boolean;
  description: string;
}

export interface MaintenanceEvent {
  taskId: string;
  type: 'stdout' | 'stderr' | 'status';
  text?: string;
  status?: 'running' | 'done' | 'error';
  exitCode?: number;
}

export interface BashResultData {
  exitCode?: number;
  output?: string;
  outputBytes?: number;
  totalLines?: number;
  truncated?: boolean;
}

export interface ShareSessionResult {
  success: boolean;
  url?: string;
  rawOutput?: string;
  error?: string;
}

export interface JoinSessionResult {
  success: boolean;
  message?: string;
  rawOutput?: string;
  error?: string;
}

export interface OmpDaemonInfo {
  name: string;
  id?: string;
  state: 'running' | 'exited' | 'starting' | 'stopped' | string;
  createdAt?: number;
  startedAt?: number;
  readyAt?: number;
  exitedAt?: number;
  exitCode?: number;
  restartCount?: number;
  outputBytes?: number;
  readyMatch?: string;
  persist?: boolean;
  detached?: boolean;
  command?: string;
  cwd?: string;
  supervised?: boolean;
}

export interface OmpPsScope {
  kind: 'project' | 'global' | string;
  projectDir?: string;
  service?: string;
  runtimeDir?: string;
  brokerPid?: number;
  daemons: OmpDaemonInfo[];
}

export interface OmpWorktreeInfo {
  path: string;
  branch?: string;
  commit?: string;
  mtime?: number | string;
  isPrCheckout?: boolean;
  isDirty?: boolean;
  sizeBytes?: number;
  [key: string]: unknown;
}

export interface OmpPluginInfo {
  name: string;
  version?: string;
  description?: string;
  source?: 'npm' | 'marketplace' | 'local' | string;
  enabled?: boolean;
  scope?: 'user' | 'project' | string;
  path?: string;
  features?: string[];
  config?: Record<string, unknown>;
  [key: string]: unknown;
}

export interface OmpPluginDoctorItem {
  name: string;
  status: 'ok' | 'warning' | 'error' | string;
  message: string;
}

export interface OmpPluginFeatureItem {
  name: string;
  enabled?: boolean;
  description?: string;
}

export interface OmpMarketplaceItem {
  name: string;
  source: string;
}

export interface OmpDiscoverPluginItem {
  name: string;
  version?: string;
  description?: string;
  marketplace?: string;
  source?: string;
}

export interface OmpAgentItem {
  id: string;
  name: string;
  description?: string;
  scope: 'bundled' | 'user' | 'project';
  path?: string;
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
  approvalMode?: OmpApprovalMode;
  thinkingLevel?: OmpThinkingLevel;
  fastModeEnabled?: boolean;
  tokensPerSecond?: number | null;
  fastModeActive?: boolean;
  messageCount?: number;
  contextUsage?: OmpContextUsage;
  tools?: unknown[];
  commands?: OmpCommandInfo[];
  todoPhases?: OmpTodoPhase[];
  todos?: OmpTodoItem[];
  [key: string]: unknown;
  profile?: string;
}

export interface OmpLaunchOptions {
  addDirs?: string[];
  tools?: string[];
  noTools?: boolean;
  noLsp?: boolean;
  noPty?: boolean;
  skills?: string[];
  noSkills?: boolean;
  noRules?: boolean;
  noExtensions?: boolean;
  extensions?: string[];
  hooks?: string[];
  advisor?: boolean;
  prewalk?: boolean;
  prewalkInto?: string;
  planYolo?: boolean;
  planYoloInto?: string;
  maxTime?: string;
  serviceTier?: string;
  systemPrompt?: string;
  appendSystemPrompt?: string;
  configOverlays?: string[];
  models?: string[];
  hideThinking?: boolean;
  noTitle?: boolean;
}

export interface AppSettings {
  theme?: 'light' | 'dark';
  language?: 'vi' | 'en';
  customBinaryPath?: string;
  defaultProvider?: string;
  defaultModel?: string;
  defaultThinkingLevel?: OmpThinkingLevel;
  approvalMode?: OmpApprovalMode;
  autoCompaction?: boolean;
  autoRetry?: boolean;
  fastMode?: boolean;
  steeringMode?: string;
  followUpMode?: string;
  interruptMode?: string;
  profile?: string;
  hostToolsEnabled?: boolean;
  launchOptions?: OmpLaunchOptions;
}

export interface CustomModelCost {
  input?: number;
  output?: number;
  cacheRead?: number;
  cacheWrite?: number;
}

export type OmpEffortLevel = 'minimal' | 'low' | 'medium' | 'high' | 'xhigh' | 'max';

export type CustomThinkingMode =
  | 'effort'
  | 'budget'
  | 'google-level'
  | 'anthropic-adaptive'
  | 'anthropic-budget-effort';

export interface CustomModelThinking {
  mode: CustomThinkingMode;
  efforts?: OmpEffortLevel[];
  defaultLevel?: OmpEffortLevel;
}

export type CustomProviderDiscoveryType =
  | 'ollama'
  | 'llama.cpp'
  | 'lm-studio'
  | 'openai-models-list'
  | 'proxy'
  | 'litellm';

export interface CustomProviderDiscovery {
  type: CustomProviderDiscoveryType;
  timeoutMs?: number;
}

export interface CustomModelConfig {
  id: string;
  name?: string;
  contextWindow?: number;
  maxTokens?: number;
  input?: ('text' | 'image')[];
  reasoning?: boolean;
  supportsTools?: boolean;
  cost?: CustomModelCost;
  thinking?: CustomModelThinking;
  premiumMultiplier?: number;
  omitMaxOutputTokens?: boolean;
}

export interface CustomProviderConfig {
  id: string;
  baseUrl: string;
  api?: string;
  apiKey?: string;
  authHeader?: boolean;
  auth?: 'apiKey' | 'none' | 'oauth';
  headers?: Record<string, string>;
  discovery?: CustomProviderDiscovery;
  compat?: {
    supportsUsageInStreaming?: boolean;
    [key: string]: unknown;
  };
  models?: CustomModelConfig[];
  hasEnvVar?: boolean;
}

export interface ModelsConfigReadResult {
  providers: CustomProviderConfig[];
  filePath: string;
  isWritable: boolean;
  error?: string;
}

export interface ModelsConfigWriteResult {
  success: boolean;
  filePath?: string;
  backupPath?: string;
  error?: string;
}

export interface ModelRolesReadResult {
  roles: Record<string, string>;
  filePath: string;
  isWritable: boolean;
  error?: string;
}

export interface ModelRolesWriteResult {
  success: boolean;
  filePath?: string;
  backupPath?: string;
  error?: string;
}

export type EngineConfigValueType = 'string' | 'number' | 'boolean' | 'enum' | 'array' | 'record';

export interface EngineConfigEntry {
  key: string;
  value?: unknown;
  type: EngineConfigValueType | string;
  description?: string;
  enumOptions?: string[];
  redacted?: boolean;
}

export interface FetchEngineConfigOptions {
  profile?: string;
  forceRefresh?: boolean;
}

export interface SetEngineConfigOptions {
  profile?: string;
}

export interface ResetEngineConfigOptions {
  profile?: string;
}

export interface EngineConfigPathOptions {
  profile?: string;
}

export interface EngineConfigListResult {
  success: boolean;
  entries?: EngineConfigEntry[];
  error?: string;
}

export interface EngineConfigMutationResult {
  success: boolean;
  error?: string;
}

export interface EngineConfigPathResult {
  success: boolean;
  path?: string;
  error?: string;
}

export interface LoginProviderItem {
  id: string;
  name: string;
}

export interface AuthLoginEvent {
  providerId: string;
  status: 'started' | 'awaiting-browser' | 'success' | 'error' | 'cancelled';
  url?: string;
  message?: string;
}

export interface ElectronAPI {
  checkOmpInstallation: () => Promise<OmpInstallStatus>;
  setCustomBinaryPath: (path: string) => Promise<OmpInstallStatus>;
  selectBinaryFile: () => Promise<string | null>;
  startOmpProcess: (workspacePath: string, model?: string, options?: { provider?: string; extraArgs?: string[]; approvalMode?: OmpApprovalMode }) => Promise<any>;
  stopOmpProcess: () => Promise<any>;
  sendOmpMessage: (prompt: string, context?: { files?: string[] }) => Promise<any>;
  steerOmp: (message: string, context?: { files?: string[] }) => Promise<{ success: boolean; error?: string }>;
  abortAndPromptOmp: (prompt: string, context?: { files?: string[] }) => Promise<{ success: boolean; error?: string }>;
  followUpOmp: (message: string, context?: { files?: string[] }) => Promise<{ success: boolean; error?: string }>;
  setSteeringMode: (mode: string) => Promise<{ success: boolean; error?: string }>;
  setFollowUpMode: (mode: string) => Promise<{ success: boolean; error?: string }>;
  setInterruptMode: (mode: string) => Promise<{ success: boolean; error?: string }>;
  abortOmp: () => Promise<{ success: boolean; error?: string }>;
  respondToPermission: (requestId: string, approved: boolean) => Promise<any>;
  respondUiRequest: (id: string, payload: { value?: unknown; confirmed?: boolean; cancelled?: boolean }) => Promise<any>;

  // Model Catalog & Engine State (Phase 2 Additions)
  getAvailableModels: () => Promise<{ success: boolean; models?: OmpModelInfo[]; error?: string }>;
  setModel: (provider: string, modelId: string) => Promise<{ success: boolean; model?: OmpModelInfo; error?: string }>;
  setThinkingLevel: (level: OmpThinkingLevel) => Promise<{ success: boolean; error?: string }>;
  getEngineState: () => Promise<{ success: boolean; state?: OmpEngineState; error?: string }>;
  getState: () => Promise<{ success: boolean; state?: OmpEngineState; error?: string }>;
  getSessionStats: () => Promise<{ success: boolean; stats?: OmpSessionStats; error?: string }>;
  getGlobalUsage: (forceRefresh?: boolean) => Promise<GlobalUsageResult>;
  getGlobalStats: (forceRefresh?: boolean) => Promise<GlobalStatsResult>;
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
  listImportCandidates: (source?: 'claude' | 'codex') => Promise<{ success: boolean; candidates?: ForeignSessionCandidate[]; error?: string }>;
  importSession: (candidate: ForeignSessionCandidate, targetCwd?: string) => Promise<ImportSessionResult>;
  getSubagents?: () => Promise<OmpSubagentInfo[]>;
  getSubagentMessages?: (params: {
    subagentId?: string;
    sessionFile?: string;
    fromByte?: number;
  }) => Promise<{
    success: boolean;
    data?: {
      sessionFile?: string;
      fromByte: number;
      nextByte: number;
      reset: boolean;
      messages: ChatMessage[];
    };
    error?: string;
  }>;
  getAvailableCommands: () => Promise<{ success: boolean; commands?: OmpCommandInfo[]; error?: string }>;
  // Auto-retry, Fast Mode & Utils (Phase 6)
  setAutoRetry: (enabled: boolean) => Promise<{ success: boolean; error?: string }>;
  abortRetry: () => Promise<{ success: boolean; error?: string }>;
  setFastMode: (enabled: boolean) => Promise<{ success: boolean; data?: { enabled?: boolean }; error?: string }>;
  getLastAssistantText: () => Promise<{ success: boolean; text?: string; error?: string }>;
  handoff: () => Promise<{ success: boolean; data?: unknown; error?: string }>;
  // Engine Maintenance (Phase 9)
  checkEngineUpdate: () => Promise<EngineUpdateCheckResult>;
  checkEngineComponents: () => Promise<{ success: boolean; components?: EngineComponentStatus[]; error?: string }>;
  listTinyModels: () => Promise<{ success: boolean; models?: TinyModelItem[]; error?: string }>;
  runMaintenanceTask: (taskId: string, args: string[]) => Promise<{ success: boolean; error?: string }>;
  cancelMaintenanceTask: () => Promise<{ success: boolean }>;
  onMaintenanceOutput: (callback: (event: MaintenanceEvent) => void) => () => void;
  // Bash Bridge & Terminal (Phase 10 & 11)
  runBash?: (command: string) => Promise<{ success: boolean; data?: BashResultData; error?: string }>;
  abortBash?: () => Promise<{ success: boolean; error?: string }>;
  onBashOutput?: (callback: (data: { text: string; id?: string }) => void) => () => void;
  // Collab Share & Join (Phase 12)
  shareSession?: (sessionIdentifier: string, options?: { gist?: boolean }) => Promise<ShareSessionResult>;
  joinSession?: (link: string) => Promise<JoinSessionResult>;
  // Background Process & Worktree Managers (Phase 13)
  listProcesses?: (options?: { all?: boolean; global?: string }) => Promise<{ success: boolean; scopes?: OmpPsScope[]; error?: string }>;
  controlProcess?: (action: 'stop' | 'kill' | 'restart', name: string, options?: { global?: string; timeout?: number }) => Promise<{ success: boolean; message?: string; error?: string }>;
  getProcessLogs?: (name: string, options?: { lines?: number; head?: boolean; grep?: string; global?: string }) => Promise<{ success: boolean; logs?: string; error?: string }>;
  listWorktrees?: () => Promise<{ success: boolean; worktrees?: OmpWorktreeInfo[]; error?: string }>;
  clearWorktrees?: (options?: { all?: boolean; dryRun?: boolean }) => Promise<{ success: boolean; rawOutput?: string; error?: string }>;
  // Plugin & Agents Managers (Phase 14, 15 & Expansion)
  listPlugins?: (options?: { local?: boolean }) => Promise<{ success: boolean; plugins?: OmpPluginInfo[]; error?: string }>;
  installPlugin?: (target: string, options?: { scope?: 'user' | 'project'; force?: boolean; local?: boolean; dryRun?: boolean }) => Promise<{ success: boolean; message?: string; error?: string }>;
  uninstallPlugin?: (target: string, options?: { scope?: 'user' | 'project'; local?: boolean; dryRun?: boolean }) => Promise<{ success: boolean; message?: string; error?: string }>;
  linkPlugin?: (localPath: string) => Promise<{ success: boolean; message?: string; error?: string }>;
  pluginDoctor?: (options?: { fix?: boolean; local?: boolean }) => Promise<{ success: boolean; items?: OmpPluginDoctorItem[]; message?: string; error?: string }>;
  pluginFeatures?: (pluginName: string, options?: { local?: boolean }) => Promise<{ success: boolean; features?: OmpPluginFeatureItem[]; rawOutput?: string; error?: string }>;
  pluginToggleFeature?: (pluginName: string, feature: string, enabled: boolean, options?: { local?: boolean }) => Promise<{ success: boolean; message?: string; error?: string }>;
  pluginSetConfig?: (pluginName: string, pairs: Array<{ key: string; value: string }>, options?: { local?: boolean }) => Promise<{ success: boolean; message?: string; error?: string }>;
  pluginGetConfig?: (pluginName: string, options?: { local?: boolean }) => Promise<{ success: boolean; config?: Record<string, unknown>; rawOutput?: string; error?: string }>;
  pluginToggle?: (pluginName: string, enabled: boolean, options?: { local?: boolean }) => Promise<{ success: boolean; message?: string; error?: string }>;
  pluginUpgrade?: (options?: { name?: string; dryRun?: boolean; local?: boolean }) => Promise<{ success: boolean; message?: string; rawOutput?: string; error?: string }>;
  pluginDiscover?: (options?: { local?: boolean }) => Promise<{ success: boolean; plugins?: OmpDiscoverPluginItem[]; rawOutput?: string; error?: string }>;
  pluginMarketplace?: (action: 'list' | 'add' | 'remove', source?: string, options?: { local?: boolean }) => Promise<{ success: boolean; marketplaces?: OmpMarketplaceItem[]; message?: string; rawOutput?: string; error?: string }>;
  listAgents?: () => Promise<{ success: boolean; agents?: OmpAgentItem[]; error?: string }>;
  unpackAgents?: (options?: { scope?: 'user' | 'project'; force?: boolean; dir?: string }) => Promise<{ success: boolean; rawOutput?: string; error?: string }>;
  // Profile Management (Phase 16)
  getProfile?: () => Promise<{ success: boolean; profile: string; error?: string }>;
  setProfile?: (profile: string) => Promise<{ success: boolean; profile: string; error?: string }>;
  listProfiles?: () => Promise<{ success: boolean; profiles?: string[]; error?: string }>;
  createProfile?: (name: string) => Promise<{ success: boolean; profile?: string; error?: string }>;
  deleteProfile?: (name: string) => Promise<{ success: boolean; error?: string }>;
  // Host Tools & URI Schemes (Phase 17 & 18)
  registerHostTools?: () => Promise<{ success: boolean; toolNames?: string[]; error?: string }>;
  setHostUriSchemes?: (schemes: string[]) => Promise<{ success: boolean; schemes?: string[]; error?: string }>;
  // Todos Management (Phase 4)
  getTodos?: () => Promise<{ success: boolean; phases?: OmpTodoPhase[]; todos?: OmpTodoItem[]; error?: string }>;
  setTodos?: (phases: OmpTodoPhase[]) => Promise<{ success: boolean; phases?: OmpTodoPhase[]; error?: string }>;
  selectFolder: () => Promise<string | null>;
  selectFile?: (options?: { title?: string; filters?: { name: string; extensions: string[] }[] }) => Promise<string | null>;
  readDirectory: (dirPath: string) => Promise<WorkspaceFile[]>;
  readFile: (filePath: string) => Promise<string>;
  saveFile: (filePath: string, content: string) => Promise<any>;
  deleteFile: (filePath: string) => Promise<boolean>;
  revealInFinder: (filePath: string) => Promise<boolean>;
  saveImageAttachment: (
    buffer: Uint8Array | ArrayBuffer,
    extension: string,
    originalName?: string
  ) => Promise<{ success: boolean; filePath: string; relativePath?: string; error?: string }>;
  readImageAsDataUrl: (
    filePath: string
  ) => Promise<{ success: boolean; dataUrl?: string; error?: string }>;
  getPathForFile: (file: File) => string | undefined;
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
  // Provider & Custom LLM Management (Phase 8)
  getModelsConfig: () => Promise<ModelsConfigReadResult>;
  saveModelsConfig: (providers: CustomProviderConfig[]) => Promise<ModelsConfigWriteResult>;
  getModelRolesConfig: () => Promise<ModelRolesReadResult>;
  saveModelRolesConfig: (roles: Record<string, string>) => Promise<ModelRolesWriteResult>;
  getLoginProviders: () => Promise<{ success: boolean; providers?: LoginProviderItem[]; error?: string }>;
  startAuthLogin?: (providerId: string) => Promise<{ success: boolean; error?: string }>;
  cancelAuthLogin?: () => Promise<{ success: boolean }>;
  getAuthStatus?: () => Promise<{ success: boolean; providers?: string[]; error?: string }>;
  sendAuthLoginInput?: (text: string) => Promise<{ success: boolean; error?: string }>;
  onAuthLoginEvent?: (callback: (event: AuthLoginEvent) => void) => () => void;
  // Engine Configuration (Phase 2)
  getEngineConfig?: (options?: FetchEngineConfigOptions) => Promise<EngineConfigListResult>;
  setEngineConfigValue?: (key: string, value: string, options?: SetEngineConfigOptions) => Promise<EngineConfigMutationResult>;
  resetEngineConfigValue?: (key: string, options?: ResetEngineConfigOptions) => Promise<EngineConfigMutationResult>;
  getEngineConfigPath?: (options?: EngineConfigPathOptions) => Promise<EngineConfigPathResult>;
  onOmpNotification: (callback: (notification: OmpNotification) => void) => () => void;
  onHostOpenRequest: (callback: (request: HostOpenRequest) => void) => () => void;
  onOmpEngineStatus: (callback: (statuses: OmpEngineStatusEntry[]) => void) => () => void;
  onOmpWidgetUpdate: (callback: (widgets: OmpWidgetEntry[]) => void) => () => void;
  onOmpContextUsage: (callback: (data: OmpContextUsageUpdate) => void) => () => void;
  onOmpCommandsUpdate: (callback: (commands: OmpCommandInfo[]) => void) => () => void;
  onOmpCommandOutput: (callback: (data: { text: string }) => void) => () => void;
  onOmpTodosUpdate?: (callback: (data: { phases: OmpTodoPhase[]; todos: OmpTodoItem[] }) => void) => () => void;
  onOmpRetryState: (callback: (state: OmpRetryState) => void) => () => void;
}
declare global {
  interface Window {
    electronAPI?: ElectronAPI;
  }
}
