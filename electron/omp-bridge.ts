import { tm } from '../shared/i18n/index.ts';
import { spawn, execFile, type ChildProcess } from 'child_process';
import { promisify } from 'util';

const execFileAsync = promisify(execFile);
import type { BrowserWindow } from 'electron';
import fs from 'fs';
import os from 'os';
import path from 'path';
import type {
  OmpAgentStatus,
  ToolCall,
  ThinkingBlock,
  ChatMessage,
  FileDiffItem,
  PermissionRequest,
  OmpUiRequest,
  OmpNotification,
  OmpEngineStatusEntry,
  OmpWidgetEntry,
  OmpInstallStatus,
  OmpSessionInfo,
  OmpBranchEntry,
  OmpSubagentInfo,
  OmpContextUsage,
  OmpSessionStats,
  OmpContextUsageUpdate,
  OmpApprovalMode,
  OmpCommandInfo,
  OmpTodoPhase,
  OmpTodoItem,
  OmpTodoStatus,
  HostOpenRequest,
  LoginProviderItem,
  AuthLoginEvent,
} from './types.ts';
import type { SettingsStore } from './settings-store.ts';
import { NdjsonFramer } from './ndjson-framer.ts';
import { RpcFrameLogger } from './rpc-frame-logger.ts';
import { buildLaunchArgs } from './launch-args.ts';
import { HostToolRegistry, HostUriRouter } from './host-tools.ts';
import type {
  OmpFrame,
  OmpInboundFrame,
  OmpOutboundFrame,
  OmpCommandFrame,
  ResponseFrame,
  NegotiateProtocolCommand,
  PromptCommand,
  SteerCommand,
  AbortCommand,
  AbortAndPromptCommand,
  FollowUpCommand,
  SetSteeringModeCommand,
  SetFollowUpModeCommand,
  SetInterruptModeCommand,
  BashCommand,
  AbortBashCommand,
  BashResultData,
  NewSessionCommand,
  SwitchSessionCommand,
  BranchCommand,
  GetMessagesPageCommand,
  SetSubagentSubscriptionCommand,
  GetSubagentsCommand,
  GetSubagentsResponseData,
  GetSubagentMessagesCommand,
  GetSubagentMessagesResponseData,
  SessionChangeResponseData,
  GetMessagesPageResponseData,
  ExtensionUiResponseCommand,
  ExtensionUiRequestEvent,
  GetAvailableModelsCommand,
  SetModelCommand,
  SetThinkingLevelCommand,
  GetStateCommand,
  GetSessionStatsCommand,
  CompactCommand,
  SetAutoCompactionCommand,
  OmpThinkingLevel,
  OmpApprovalMode as OmpRpcApprovalMode,
  OmpModelInfo,
  OmpEngineState,
  GetAvailableModelsResponseData,
  MessageUpdateEvent,
  MessageEndEvent,
  AssistantMessageEvent,
  AgentMessage,
  AgentEndEvent,
  TurnStartEvent,
  ToolExecutionStartEvent,
  ToolExecutionUpdateEvent,
  ToolExecutionEndEvent,
  EditToolResultDetails,
  SubagentLifecycleEvent,
  SubagentProgressEvent,
  SetSessionNameCommand,
  ExportHtmlCommand,
  GetBranchMessagesCommand,
  GetBranchMessagesResponseData,
  ExportHtmlResponseData,
  GetAvailableCommandsCommand,
  GetAvailableCommandsResponseData,
  AvailableCommandsUpdateEvent,
  CommandOutputEvent,
  SessionInfoUpdateEvent,
  ConfigUpdateEvent,
  SetHostToolsCommand,
  SetHostUriSchemesCommand,
  HostToolResultFrame,
  HostUriRequestEvent,
  HostUriResultFrame,
  SetTodosCommand,
  SetTodosResponseData,
  TodosEvent,
  TodoReminderEvent,
  SetAutoRetryCommand,
  AbortRetryCommand,
  SetFastModeCommand,
  GetLastAssistantTextCommand,
  HandoffCommand,
  AutoRetryStartEvent,
  AutoRetryEndEvent,
  GetLoginProvidersCommand,
  LoginCommand,
  GetLoginProvidersResponseData,
  LoginResponseData,
} from './omp-rpc-types.ts';

export type BridgeLifecycleState =
  | 'idle'
  | 'spawning'
  | 'awaiting_ready'
  | 'negotiating'
  | 'ready';

interface PendingCommand {
  resolve: (res: ResponseFrame<any>) => void;
  reject: (err: Error) => void;
  timer: NodeJS.Timeout;
  command: string;
}

export class ThinkingAccumulator {
  private activeBlocks: Map<number, ThinkingBlock> = new Map();

  public handleEvent(
    event: AssistantMessageEvent,
    turnKey: string = ''
  ): { block: ThinkingBlock; isNew: boolean } | null {
    const idx = event.contentIndex ?? 0;
    const now = Date.now();

    if (event.type === 'thinking_start') {
      const block: ThinkingBlock = {
        id: `think-${turnKey}-${idx}-${now}`,
        thought: '',
        timestamp: now,
        completed: false,
      };
      this.activeBlocks.set(idx, block);
      return { block, isNew: true };
    }

    if (event.type === 'thinking_delta') {
      let block = this.activeBlocks.get(idx);
      const isNew = !block;
      if (!block) {
        block = {
          id: `think-${turnKey}-${idx}-${now}`,
          thought: '',
          timestamp: now,
          completed: false,
        };
        this.activeBlocks.set(idx, block);
      }
      if (typeof event.delta === 'string') {
        block.thought += event.delta;
      }
      return { block, isNew };
    }

    if (event.type === 'thinking_end') {
      let block = this.activeBlocks.get(idx);
      const isNew = !block;
      if (!block) {
        block = {
          id: `think-${turnKey}-${idx}-${now}`,
          thought: '',
          timestamp: now,
          completed: true,
        };
      } else {
        block.completed = true;
      }
      if (typeof event.content === 'string') {
        block.thought = event.content;
      }
      this.activeBlocks.delete(idx);
      return { block, isNew };
    }

    return null;
  }

  public getActiveBlock(idx: number): ThinkingBlock | undefined {
    return this.activeBlocks.get(idx);
  }

  public reset() {
    this.activeBlocks.clear();
  }
}
export type OmpEventSink = (channel: string, payload: unknown) => void;

export class OmpBridge {
  private process: ChildProcess | null = null;
  private window: BrowserWindow | null = null;
  private eventSink?: OmpEventSink;
  private status: OmpAgentStatus = 'idle';
  private lifecycleState: BridgeLifecycleState = 'idle';

  private framer: NdjsonFramer;
  private frameLogger: RpcFrameLogger;
  private thinkingAccumulator: ThinkingAccumulator = new ThinkingAccumulator();
  private currentTurnId: string | null = null;
  private workspacePath: string | null = null;
  private activeToolCalls: Map<string, ToolCall> = new Map();
  private writeSnapshots: Map<string, string | null> = new Map();
  private pendingCommands: Map<string, PendingCommand> = new Map();
  private pendingPermissions: Map<string, (approved: boolean) => void> = new Map();
  private pendingUiRequests: Map<string, OmpUiRequest> = new Map();
  private activeSubagents: Map<string, OmpSubagentInfo> = new Map();
  private currentTodoPhases: OmpTodoPhase[] = [];
  private currentTodos: OmpTodoItem[] = [];
  private currentSessionFile: string | null = null;
  private currentSessionId: string | null = null;
  private engineStatuses: Map<string, string> = new Map();
  private engineWidgets: Map<string, { lines: string[]; placement?: string }> = new Map();
  private currentApprovalMode: OmpApprovalMode | undefined = undefined;
  private currentProfile: string = 'default';
  private currentThinkingLevel: OmpThinkingLevel = 'off';
  private availableCommands: OmpCommandInfo[] = [];
  public hostToolRegistry: HostToolRegistry = new HostToolRegistry({
    openInApp: (request) => this.emitHostOpenRequest(request),
  });
  public hostUriRouter: HostUriRouter = new HostUriRouter({
    openInApp: (request) => this.emitHostOpenRequest(request),
    resolvePath: (target) => path.resolve(this.workspacePath || process.cwd(), target),
    notify: (message) => this.emitNotification(message, 'info'),
  });
  private activeHostUriRequests: Map<string, AbortController> = new Map();
  private activeHostToolCalls: Map<string, AbortController> = new Map();
  private sessionName: string | undefined = undefined;
  private lastContextUsage: OmpContextUsage | null = null;
  private lastTokensPerSecond: number | null = null;
  private currentModel: string | undefined = undefined;
  private currentProvider: string | undefined = undefined;
  private handshakePromise: {
    resolve: (val: { success: boolean; pid?: number }) => void;
    reject: (err: any) => void;
    timer: NodeJS.Timeout;
  } | null = null;

  private detectedPath: string | null = null;
  private cachedVersion: { path: string; version: string } | null = null;
  private customPath: string | null = null;
  private commandCounter: number = 0;
  private settingsStore?: SettingsStore;
  private retryState: { isRetrying: boolean; attempt?: number; maxAttempts?: number; delayMs?: number; error?: string; success?: boolean } = { isRetrying: false };
  private openUrlHandler?: (url: string) => Promise<void>;
  private interactiveFallback?: (providerId: string) => Promise<{ success: boolean; error?: string }>;
  private activeAuthLogin: {
    providerId: string;
    loginCommandId: string;
    pendingInputReqId?: string;
    isCancelled?: boolean;
  } | null = null;


  constructor(window?: BrowserWindow | null, settingsStore?: SettingsStore | null, eventSink?: OmpEventSink) {
    this.window = window ?? null;
    this.settingsStore = settingsStore ?? undefined;
    this.eventSink = eventSink;
    if (this.settingsStore) {
      this.currentThinkingLevel = this.settingsStore.get().defaultThinkingLevel || 'off';
    }
    this.frameLogger = new RpcFrameLogger();
    this.framer = new NdjsonFramer({
      onRawLine: (line) => {
        console.log('[OMP RAW]:', line);
      },
      onError: (err, raw) => {
        console.warn('[OMP FRAMER ERROR]:', err.message, raw.slice(0, 100));
      },
    });
  }

  public setEventSink(eventSink?: OmpEventSink) {
    this.eventSink = eventSink;
  }

  public setWindow(window: BrowserWindow | null) {
    this.window = window;
  }

  private emit(channel: string, payload: unknown) {
    if (this.eventSink) {
      this.eventSink(channel, payload);
    } else if (this.window && !this.window.isDestroyed()) {
      this.window.webContents.send(channel, payload);
    }
  }

  public setSettingsStore(settingsStore: SettingsStore) {
    this.settingsStore = settingsStore;
  }

  public getWorkspacePath(): string | null {
    return this.workspacePath;
  }

  public getLifecycleState(): BridgeLifecycleState {
    return this.lifecycleState;
  }
  public isRunning(): boolean {
    return this.lifecycleState === 'ready' && Boolean(this.process);
  }
  public getStatus(): OmpAgentStatus {
    return this.status;
  }
  public isStreaming(): boolean {
    return this.status === 'streaming' || this.status === 'thinking' || this.status === 'executing_tool';
  }


  public getCurrentSessionFile(): string | null {
    return this.currentSessionFile;
  }

  public getCurrentSessionId(): string | null {
    return this.currentSessionId;
  }

  public getSessionInfo(): { sessionId: string | null; sessionFile: string | null } {
    return {
      sessionId: this.currentSessionId,
      sessionFile: this.currentSessionFile,
    };
  }

  public setSessionInfo(sessionFile: string | null, sessionId: string | null) {
    this.currentSessionFile = sessionFile;
    this.currentSessionId = sessionId;
  }
  public getRetryState(): { isRetrying: boolean; attempt?: number; maxAttempts?: number; delayMs?: number; error?: string; success?: boolean } {
    return { ...this.retryState };
  }


  public getSubagents(): OmpSubagentInfo[] {
    return Array.from(this.activeSubagents.values());
  }
  public getEngineStatuses(): OmpEngineStatusEntry[] {
    return Array.from(this.engineStatuses.entries()).map(([key, text]) => ({ key, text }));
  }

  public getEngineWidgets(): OmpWidgetEntry[] {
    return Array.from(this.engineWidgets.entries()).map(([key, item]) => ({
      key,
      lines: item.lines,
      placement: item.placement,
    }));
  }

  public getTodos(): { phases: OmpTodoPhase[]; todos: OmpTodoItem[] } {
    return {
      phases: this.currentTodoPhases,
      todos: this.currentTodos,
    };
  }

  public async setTodos(
    phases: OmpTodoPhase[]
  ): Promise<{ success: boolean; phases?: OmpTodoPhase[]; error?: string }> {
    if (this.lifecycleState !== 'ready' || !this.process || !this.process.stdin?.writable) {
      this.normalizeAndSetTodos(phases);
      return { success: true, phases: this.currentTodoPhases };
    }
    try {
      const res = await this.sendCommand<SetTodosResponseData>({
        type: 'set_todos',
        id: this.generateId(),
        phases,
      });
      if (res.success) {
        const respPhases = res.data?.todoPhases || res.data?.phases || phases;
        this.normalizeAndSetTodos(respPhases, res.data?.todos);
        return { success: true, phases: this.currentTodoPhases };
      }
      return { success: false, error: res.error || 'Failed to set todos' };
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      return { success: false, error: msg || 'Error executing set_todos' };
    }
  }

  private normalizeAndSetTodos(phases?: OmpTodoPhase[], todos?: OmpTodoItem[]): void {
    if (Array.isArray(phases) && phases.length > 0) {
      this.currentTodoPhases = phases;
      const flat: OmpTodoItem[] = [];
      for (const p of phases) {
        if (Array.isArray(p.tasks)) {
          for (const t of p.tasks) {
            flat.push({
              ...t,
              phase: p.name,
            });
          }
        }
      }
      this.currentTodos = flat;
    } else if (Array.isArray(todos)) {
      this.currentTodos = todos;
      if (todos.length > 0) {
        const phaseMap = new Map<string, OmpTodoItem[]>();
        for (const t of todos) {
          const pName = typeof t.phase === 'string' && t.phase ? t.phase : 'Plan';
          if (!phaseMap.has(pName)) {
            phaseMap.set(pName, []);
          }
          phaseMap.get(pName)!.push(t);
        }
        this.currentTodoPhases = Array.from(phaseMap.entries()).map(([name, tasks]) => ({
          name,
          tasks,
        }));
      } else {
        this.currentTodoPhases = [];
      }
    } else {
      this.currentTodoPhases = [];
      this.currentTodos = [];
    }
    this.emitTodosUpdate();
  }

  // Reminder only returns flat todos without phase; preserve phase structure and sync status only
  private mergeTodoStatuses(todos: OmpTodoItem[]): boolean {
    if (this.currentTodoPhases.length === 0 || todos.some((t) => typeof t.phase === 'string' && t.phase)) {
      return false;
    }
    const statusByContent = new Map<string, OmpTodoStatus>();
    for (const t of todos) {
      if (typeof t.content === 'string' && t.content) {
        statusByContent.set(t.content, t.status);
      }
    }
    let matched = false;
    const mergedPhases = this.currentTodoPhases.map((phase) => ({
      ...phase,
      tasks: (phase.tasks || []).map((task) => {
        const next = statusByContent.get(task.content);
        if (next === undefined || next === task.status) {
          if (next !== undefined) matched = true;
          return task;
        }
        matched = true;
        return { ...task, status: next };
      }),
    }));
    if (!matched) {
      return false;
    }
    this.normalizeAndSetTodos(mergedPhases);
    return true;
  }

  private emitTodosUpdate(): void {
    this.emit('omp:todos-update', {
      phases: this.currentTodoPhases,
      todos: this.currentTodos,
    });
  }

  // Update progress immediately when agent calls "todo" tool, without waiting for end of turn
  private applyTodosFromToolResult(toolName: string | undefined, result: unknown): void {
    if (toolName !== 'todo') {
      return;
    }
    const details =
      result && typeof result === 'object' && 'details' in (result as Record<string, unknown>)
        ? (result as Record<string, unknown>).details
        : undefined;
    if (!details || typeof details !== 'object') {
      return;
    }
    const record = details as Record<string, unknown>;
    const phases = Array.isArray(record.phases) ? (record.phases as OmpTodoPhase[]) : undefined;
    const todos = Array.isArray(record.todos) ? (record.todos as OmpTodoItem[]) : undefined;
    if (phases || todos) {
      this.normalizeAndSetTodos(phases, todos);
    }
  }


  public async setSubagentSubscription(
    level: 'off' | 'progress' | 'events' = 'progress'
  ): Promise<{ success: boolean; error?: string }> {
    if (this.lifecycleState !== 'ready' || !this.process || !this.process.stdin?.writable) {
      return { success: false, error: 'OMP process is not ready or offline' };
    }
    try {
      const res = await this.sendCommand<unknown>({
        type: 'set_subagent_subscription',
        id: this.generateId(),
        level,
      });
      return { success: Boolean(res?.success) };
    } catch (err: any) {
      return { success: false, error: err.message || 'Failed to set subagent subscription' };
    }
  }

  public async refreshSubagentsOnDemand(): Promise<{ success: boolean; subagents?: OmpSubagentInfo[]; error?: string }> {
    if (this.lifecycleState !== 'ready' || !this.process || !this.process.stdin?.writable) {
      return { success: false, error: 'OMP process is not ready or offline' };
    }
    try {
      const res = await this.sendCommand<GetSubagentsResponseData>({
        type: 'get_subagents',
        id: this.generateId(),
      });
      if (res.success && res.data && Array.isArray(res.data.subagents)) {
        let changed = false;
        const incomingIds = new Set<string>();
        for (const s of res.data.subagents) {
          if (s && s.id) {
            const status = String(s.status || '').toLowerCase();
            const isTerminal = status !== 'started' && status !== 'running';
            if (isTerminal) {
              if (this.activeSubagents.has(s.id)) {
                this.activeSubagents.delete(s.id);
                changed = true;
              }
            } else {
              incomingIds.add(s.id);
              const prev = this.activeSubagents.get(s.id);
              this.activeSubagents.set(s.id, {
                id: s.id,
                index: typeof s.index === 'number' ? s.index : prev?.index,
                agent: s.agent || prev?.agent || 'task',
                description: s.description || prev?.description,
                status: s.status || 'running',
                task: s.task || prev?.task,
                sessionFile: s.sessionFile || prev?.sessionFile,
                progressText: prev?.progressText,
                lastUpdate: typeof s.lastUpdate === 'number' ? s.lastUpdate : Date.now(),
              });
              changed = true;
            }
          }
        }
        for (const currentId of Array.from(this.activeSubagents.keys())) {
          if (!incomingIds.has(currentId)) {
            this.activeSubagents.delete(currentId);
            changed = true;
          }
        }
        if (changed) {
          this.emitSubagentUpdate();
        }
        return { success: true, subagents: this.getSubagents() };
      }
      return { success: false, error: res.error || 'Failed to fetch subagents' };
    } catch (err: any) {
      return { success: false, error: err.message || 'Error executing get_subagents' };
    }
  }
  public async getSubagentMessages(params: {
    subagentId?: string;
    sessionFile?: string;
    fromByte?: number;
  }): Promise<{
    success: boolean;
    data?: {
      sessionFile?: string;
      fromByte: number;
      nextByte: number;
      reset: boolean;
      messages: ChatMessage[];
    };
    error?: string;
  }> {
    if (this.lifecycleState !== 'ready' || !this.process || !this.process.stdin?.writable) {
      return { success: false, error: 'OMP process is not ready or offline' };
    }

    if (!params.subagentId && !params.sessionFile) {
      return { success: false, error: 'get_subagent_messages requires subagentId or sessionFile' };
    }

    try {
      const res = await this.sendCommand<GetSubagentMessagesResponseData>({
        type: 'get_subagent_messages',
        id: this.generateId(),
        subagentId: params.subagentId,
        sessionFile: params.sessionFile,
        fromByte: params.fromByte,
      });

      if (res.success && res.data) {
        const rawMessages = Array.isArray(res.data.messages) ? res.data.messages : [];
        const messages = this.translateHistoryMessages(rawMessages);
        return {
          success: true,
          data: {
            sessionFile: res.data.sessionFile,
            fromByte: typeof res.data.fromByte === 'number' ? res.data.fromByte : (params.fromByte ?? 0),
            nextByte: typeof res.data.nextByte === 'number' ? res.data.nextByte : (params.fromByte ?? 0),
            reset: Boolean(res.data.reset),
            messages,
          },
        };
      }
      return { success: false, error: res.error || 'Failed to fetch subagent messages' };
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      return { success: false, error: msg || 'Error executing get_subagent_messages' };
    }
  }


  private emitSubagentUpdate() {
    this.emit('omp:subagent-update', Array.from(this.activeSubagents.values()));
  }

  public setCustomBinaryPath(rawPath?: string | null) {
    if (!rawPath || typeof rawPath !== 'string' || !rawPath.trim()) {
      this.customPath = null;
      this.detectedPath = null;
      if (this.settingsStore) {
        this.settingsStore.set({ customBinaryPath: undefined });
      }
      return;
    }
    let resolved = rawPath.trim();
    if (resolved.startsWith('~')) {
      resolved = path.join(os.homedir(), resolved.slice(1));
    }
    this.customPath = resolved;
    this.detectedPath = resolved;
    if (this.settingsStore) {
      this.settingsStore.set({ customBinaryPath: rawPath });
    }
  }

  public detectBinaryPath(): string | null {
    if (!this.customPath && this.settingsStore?.get()?.customBinaryPath) {
      let custom = this.settingsStore.get().customBinaryPath!.trim();
      if (custom.startsWith('~')) {
        custom = path.join(os.homedir(), custom.slice(1));
      }
      this.customPath = custom;
      this.detectedPath = custom;
    }
    // 1. If user set a custom path
    if (this.customPath) {
      let resolved = this.customPath.trim();
      if (resolved.startsWith('~')) {
        resolved = path.join(os.homedir(), resolved.slice(1));
      }
      if (fs.existsSync(resolved)) {
        return resolved;
      }
    }

    if (this.detectedPath && fs.existsSync(this.detectedPath)) {
      return this.detectedPath;
    }

    const homedir = os.homedir();
    const binaryNames = ['omp', 'oh-my-pi', 'pi-coding-agent', 'pi'];

    // 2. Candidate fixed directories
    const candidateDirs = [
      path.join(homedir, '.local/bin'),
      path.join(homedir, '.bun/bin'),
      '/opt/homebrew/bin',
      '/usr/local/bin',
      '/usr/bin',
      '/bin',
      path.join(homedir, '.cargo/bin'),
      path.join(homedir, '.npm-global/bin'),
      path.join(homedir, 'Library/pnpm'),
      path.join(homedir, '.yarn/bin'),
      path.join(homedir, '.asdf/shims'),
      path.join(homedir, '.volta/bin'),
      path.join(homedir, '.nix-profile/bin'),
    ];

    // Scan candidate fixed directories for all possible binary names
    for (const dir of candidateDirs) {
      for (const name of binaryNames) {
        const fullPath = path.join(dir, name);
        if (fs.existsSync(fullPath)) {
          this.detectedPath = fullPath;
          return fullPath;
        }
      }
    }

    // 3. Scan dynamic NVM versions directories (e.g. ~/.nvm/versions/node/*/bin/omp)
    const nvmDir = path.join(homedir, '.nvm/versions/node');
    if (fs.existsSync(nvmDir)) {
      try {
        const versions = fs.readdirSync(nvmDir);
        for (const v of versions) {
          for (const name of binaryNames) {
            const nvmBin = path.join(nvmDir, v, 'bin', name);
            if (fs.existsSync(nvmBin)) {
              this.detectedPath = nvmBin;
              return nvmBin;
            }
          }
        }
      } catch {}
    }

    return null;
  }

  // Fallback: ask login shell asynchronously to avoid blocking main process
  private async detectViaLoginShell(): Promise<string | null> {
    const binaryNames = ['omp', 'oh-my-pi', 'pi-coding-agent', 'pi'];
    for (const name of binaryNames) {
      try {
        const { stdout } = await execFileAsync('/bin/zsh', ['-l', '-c', `which ${name}`], {
          encoding: 'utf-8',
          timeout: 2500,
        });
        const found = stdout.trim();
        if (found && fs.existsSync(found)) {
          this.detectedPath = found;
          return found;
        }
      } catch {}
    }
    return null;
  }

  public async checkInstallation(): Promise<OmpInstallStatus> {
    const binaryPath = this.detectBinaryPath() ?? (await this.detectViaLoginShell());

    if (!binaryPath || !fs.existsSync(binaryPath)) {
      return {
        installed: false,
        error: tm('electron.bridge.binaryNotFound'),
      };
    }

    const homedir = os.homedir();
    const extendedPath = [
      process.env.PATH,
      '/opt/homebrew/bin',
      '/usr/local/bin',
      path.join(homedir, '.local/bin'),
      path.join(homedir, '.bun/bin'),
      path.join(homedir, '.cargo/bin'),
      path.join(homedir, 'Library/pnpm'),
      '/usr/bin',
      '/bin',
    ].filter(Boolean).join(':');

    // Reuse cached version to avoid repeatedly spawning child processes
    if (this.cachedVersion?.path === binaryPath) {
      return {
        installed: true,
        version: this.cachedVersion.version,
        binaryPath,
      };
    }

    let versionOutput = '';
    try {
      const { stdout } = await execFileAsync(binaryPath, ['--version'], {
        env: { ...process.env, PATH: extendedPath },
        encoding: 'utf-8',
        timeout: 3000,
      });
      versionOutput = stdout.trim();
    } catch {
      try {
        const { stdout } = await execFileAsync(binaryPath, ['-v'], {
          env: { ...process.env, PATH: extendedPath },
          encoding: 'utf-8',
          timeout: 3000,
        });
        versionOutput = stdout.trim();
      } catch {}
    }

    const version = versionOutput || 'v0.1.0';
    this.cachedVersion = { path: binaryPath, version };

    return {
      installed: true,
      version,
      binaryPath,
    };
  }

  public setStatus(newStatus: OmpAgentStatus) {
    this.status = newStatus;
    this.emit('omp:status-change', newStatus);
  }

  public async startProcess(
    workspacePath: string,
    model?: string,
    options?: { provider?: string; extraArgs?: string[]; approvalMode?: OmpApprovalMode; profile?: string }
  ): Promise<{ success: boolean; pid?: number }> {
    if (this.process) {
      // Wait for old process to fully exit before spawning to prevent race condition
      const oldProcess = this.process;
      this.stopProcess();
      await this.waitForProcessExit(oldProcess, 3000);
    }

    this.rejectAllPending(tm('electron.bridge.startingNewProcess'));
    this.frameLogger.truncate();
    this.framer.reset();
    this.thinkingAccumulator.reset();
    this.activeToolCalls.clear();
    this.writeSnapshots.clear();
    this.pendingUiRequests.clear();
    this.activeSubagents.clear();
    this.currentSessionFile = null;
    this.currentSessionId = null;
    this.currentTurnId = null;
    this.workspacePath = workspacePath;

    const settings = this.settingsStore?.get();
    const effectiveProvider = options?.provider ?? settings?.defaultProvider;
    const effectiveModel = model ?? settings?.defaultModel;
    const effectiveApprovalMode = options?.approvalMode ?? settings?.approvalMode ?? this.currentApprovalMode;

    this.currentModel = effectiveModel;
    this.currentProvider = effectiveProvider;
    if (effectiveApprovalMode) {
      this.currentApprovalMode = effectiveApprovalMode;
    }
    const effectiveProfile = options?.profile ?? settings?.profile ?? this.currentProfile ?? 'default';
    this.currentProfile = effectiveProfile;
    const binaryPath = this.detectBinaryPath() ?? (await this.detectViaLoginShell());
    if (!binaryPath || !fs.existsSync(binaryPath)) {
      console.warn('[OmpBridge] Binary not found. Live process start aborted; fallback mode available.');
      this.lifecycleState = 'idle';
      this.setStatus('idle');
      return { success: false };
    }

    const args = ['--mode', 'rpc', '--cwd', workspacePath];
    if (effectiveProvider) {
      args.push('--provider', effectiveProvider);
    }
    if (effectiveModel) {
      args.push('--model', effectiveModel);
    }
    if (effectiveApprovalMode) {
      args.push('--approval-mode', effectiveApprovalMode);
    }
    if (effectiveProfile && effectiveProfile !== 'default') {
      args.push('--profile', effectiveProfile);
    }
    if (settings?.launchOptions) {
      args.push(...buildLaunchArgs(settings.launchOptions));
    }
    if (options?.extraArgs && Array.isArray(options.extraArgs)) {
      args.push(...options.extraArgs);
    }

    const homedir = os.homedir();
    const extendedPath = [
      process.env.PATH,
      '/opt/homebrew/bin',
      '/usr/local/bin',
      path.join(homedir, '.local/bin'),
      path.join(homedir, '.bun/bin'),
      path.join(homedir, '.cargo/bin'),
      path.join(homedir, 'Library/pnpm'),
      '/usr/bin',
      '/bin',
    ].filter(Boolean).join(':');

    try {
      this.process = spawn(binaryPath, args, {
        cwd: workspacePath,
        env: { ...process.env, PATH: extendedPath, FORCE_COLOR: '0' },
        stdio: ['pipe', 'pipe', 'pipe'],
      });

      this.lifecycleState = 'spawning';

      return new Promise<{ success: boolean; pid?: number }>((resolve) => {
        const handshakeTimeoutMs = 15000;
        const handshakeTimer = setTimeout(() => {
          console.warn(`[OmpBridge] Handshake timed out after ${handshakeTimeoutMs}ms`);
          this.emitNotification(
            tm('electron.bridge.handshakeTimeout'),
            'error'
          );
          this.cleanupProcess();
          resolve({ success: false });
        }, handshakeTimeoutMs);

        this.handshakePromise = {
          resolve: (val) => {
            clearTimeout(handshakeTimer);
            this.handshakePromise = null;
            resolve(val);
          },
          reject: (err) => {
            clearTimeout(handshakeTimer);
            this.handshakePromise = null;
            console.warn('[OmpBridge] Handshake rejected:', err);
            resolve({ success: false });
          },
          timer: handshakeTimer,
        };

        this.lifecycleState = 'awaiting_ready';

        const childProc = this.process;

        childProc?.stdout?.on('data', (chunk: Buffer) => {
          if (this.process === childProc) {
            this.handleStdoutData(chunk.toString('utf-8'));
          }
        });

        childProc?.stderr?.on('data', (chunk: Buffer) => {
          console.error('[OMP STDERR]:', chunk.toString('utf-8'));
        });

        childProc?.on('close', (code) => {
          if (this.process === childProc) {
            console.log(`[OmpBridge] Process exited with code ${code}`);
            this.handleProcessExit(code);
          }
        });

        childProc?.on('error', (err) => {
          if (this.process === childProc) {
            console.warn('[OmpBridge] Process error:', err.message);
            this.handleProcessExit(-1);
          }
        });
      });
    } catch (err: any) {
      console.error('[OmpBridge] Failed to spawn process:', err);
      this.cleanupProcess();
      return { success: false };
    }
  }

  public stopProcess(): { success: boolean } {
    if (this.process) {
      const activeProcess = this.process;
      try {
        if (activeProcess.stdin?.writable) {
          const abortCmd: OmpCommandFrame = {
            type: 'abort',
            id: this.generateId(),
          };
          this.writeFrame(abortCmd);
        }
      } catch {
        // Ignored
      }

      // Flush grace period before termination
      setTimeout(() => {
        try {
          if (activeProcess && !activeProcess.killed) {
            activeProcess.kill('SIGTERM');
          }
        } catch {
          // Ignored
        }
      }, 500);

      this.cleanupProcess();
    } else {
      this.cleanupProcess();
    }

    this.setStatus('idle');
    return { success: true };
  }

  public async sendCommand<T = unknown>(
    frame: OmpCommandFrame,
    timeoutMs = 15000
  ): Promise<ResponseFrame<T>> {
    if (!this.process || !this.process.stdin?.writable) {
      return Promise.reject(new Error('OMP process is not running or stdin is closed'));
    }

    if (!frame.id) {
      frame.id = this.generateId();
    }

    const commandId = frame.id;

    return new Promise<ResponseFrame<T>>((resolve, reject) => {
      const timer = setTimeout(() => {
        this.pendingCommands.delete(commandId);
        reject(new Error(`Command '${frame.type}' (id: ${commandId}) timed out after ${timeoutMs}ms`));
      }, timeoutMs);

      this.pendingCommands.set(commandId, {
        resolve: (res) => {
          clearTimeout(timer);
          resolve(res as ResponseFrame<T>);
        },
        reject: (err) => {
          clearTimeout(timer);
          reject(err);
        },
        timer,
        command: frame.type,
      });

      this.writeFrame(frame);
    });
  }

  public async sendMessage(prompt: string, context?: { files?: string[] }): Promise<{ success: boolean }> {
    // If active process is ready and writable, send prompt command frame
    if (this.lifecycleState === 'ready' && this.process && this.process.stdin?.writable) {
      const promptCmd: PromptCommand = {
        type: 'prompt',
        id: this.generateId(),
        message: prompt,
      };

      this.setStatus('thinking');
      this.sendCommand(promptCmd).catch((err) => {
        console.error('[OmpBridge] Prompt command error:', err.message);
      });
      return { success: true };
    }

    // Fallback simulation flow when process is offline or binary is absent
    this.simulateAgentFlow(prompt, context);
    return { success: true };
  }

  public async steer(message: string, context?: { files?: string[] }): Promise<{ success: boolean; error?: string }> {
    if (this.lifecycleState === 'ready' && this.process && this.process.stdin?.writable) {
      const steerCmd: SteerCommand = {
        type: 'steer',
        id: this.generateId(),
        message,
      };

      this.sendCommand(steerCmd).catch((err) => {
        console.error('[OmpBridge] Steer command error:', err.message);
      });
      return { success: true };
    }

    this.simulateAgentFlow(message, context);
    return { success: true };
  }

  public async abortAndPrompt(prompt: string, context?: { files?: string[] }): Promise<{ success: boolean; error?: string }> {
    if (this.lifecycleState === 'ready' && this.process && this.process.stdin?.writable) {
      const abortPromptCmd: AbortAndPromptCommand = {
        type: 'abort_and_prompt',
        id: this.generateId(),
        prompt,
        message: prompt,
      };

      this.setStatus('thinking');
      this.sendCommand(abortPromptCmd).catch((err) => {
        console.error('[OmpBridge] Abort and prompt command error:', err.message);
      });
      return { success: true };
    }

    this.thinkingAccumulator.reset();
    this.activeToolCalls.clear();
    this.simulateAgentFlow(prompt, context);
    return { success: true };
  }

  public async followUp(message: string, context?: { files?: string[] }): Promise<{ success: boolean; error?: string }> {
    if (this.lifecycleState === 'ready' && this.process && this.process.stdin?.writable) {
      const followUpCmd: FollowUpCommand = {
        type: 'follow_up',
        id: this.generateId(),
        message,
      };

      try {
        const res = await this.sendCommand(followUpCmd);
        return { success: res.success, error: res.error };
      } catch (err: any) {
        console.error('[OmpBridge] Follow-up command error:', err?.message);
        return { success: false, error: err?.message || 'Follow-up command failed' };
      }
    }

    this.simulateAgentFlow(message, context);
    return { success: true };
  }

  public async abort(): Promise<{ success: boolean; error?: string }> {
    if (this.lifecycleState === 'ready' && this.process && this.process.stdin?.writable) {
      const abortCmd: AbortCommand = {
        type: 'abort',
        id: this.generateId(),
      };

      this.sendCommand(abortCmd).catch((err) => {
        console.error('[OmpBridge] Abort command error:', err.message);
      });
      return { success: true };
    }

    this.setStatus('idle');
    return { success: true };
  }
  public respondPermission(requestId: string, approved: boolean) {
    const resolver = this.pendingPermissions.get(requestId);
    if (resolver) {
      resolver(approved);
      this.pendingPermissions.delete(requestId);
    }

    if (this.process && this.process.stdin?.writable) {
      const responseFrame: ExtensionUiResponseCommand = {
        type: 'extension_ui_response',
        id: requestId,
        value: approved ? 'Approve' : 'Deny',
        confirmed: approved,
      };
      this.writeFrame(responseFrame);
    }
  }

  public respondUiRequest(
    id: string,
    payload: { value?: unknown; confirmed?: boolean; cancelled?: boolean }
  ) {
    if (!this.pendingUiRequests.has(id)) {
      console.warn(`[OmpBridge] respondUiRequest: No pending UI request with id ${id}`);
    }
    this.pendingUiRequests.delete(id);

    if (this.pendingUiRequests.size === 0 && this.status === 'waiting_permission') {
      this.setStatus(this.currentTurnId ? 'thinking' : 'idle');
    }

    if (this.process && this.process.stdin?.writable) {
      const responseFrame: ExtensionUiResponseCommand = {
        type: 'extension_ui_response',
        id,
        ...payload,
      };
      this.writeFrame(responseFrame);
    }
  }

  public async getAvailableModels(): Promise<{ success: boolean; models?: OmpModelInfo[]; error?: string }> {
    if (this.lifecycleState !== 'ready' || !this.process || !this.process.stdin?.writable) {
      return { success: false, error: 'OMP process is not ready or offline' };
    }
    try {
      const res = await this.sendCommand<GetAvailableModelsResponseData>({
        type: 'get_available_models',
        id: this.generateId(),
      });
      if (res.success && res.data && Array.isArray(res.data.models)) {
        return { success: true, models: res.data.models };
      }
      return { success: false, error: res.error || 'Failed to fetch available models' };
    } catch (err: any) {
      return { success: false, error: err.message || 'Error executing get_available_models' };
    }
  }
  public async getAvailableCommands(): Promise<{ success: boolean; commands?: OmpCommandInfo[]; error?: string }> {
    if (this.lifecycleState !== 'ready' || !this.process || !this.process.stdin?.writable) {
      return { success: false, error: 'OMP process is not ready or offline', commands: this.availableCommands };
    }
    try {
      const res = await this.sendCommand<GetAvailableCommandsResponseData>({
        type: 'get_available_commands',
        id: this.generateId(),
      });
      if (res.success && res.data && Array.isArray(res.data.commands)) {
        this.availableCommands = res.data.commands;
        this.emitCommandsUpdate();
        return { success: true, commands: this.availableCommands };
      } else if (res.success && Array.isArray((res as any).commands)) {
        this.availableCommands = (res as any).commands;
        this.emitCommandsUpdate();
        return { success: true, commands: this.availableCommands };
      }
      return { success: false, error: res.error || 'Failed to fetch available commands', commands: this.availableCommands };
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      return { success: false, error: msg || 'Error executing get_available_commands', commands: this.availableCommands };
    }
  }

  private emitCommandsUpdate() {
    this.emit('omp:commands-update', [...this.availableCommands]);
  }


  public async setModel(
    provider: string,
    modelId: string
  ): Promise<{ success: boolean; model?: OmpModelInfo; error?: string }> {
    if (this.lifecycleState !== 'ready' || !this.process || !this.process.stdin?.writable) {
      return { success: false, error: 'OMP process is not ready or offline' };
    }
    try {
      const res = await this.sendCommand<OmpModelInfo>({
        type: 'set_model',
        id: this.generateId(),
        provider,
        modelId,
      });
      if (res.success) {
        if (this.settingsStore) {
          this.settingsStore.set({ defaultProvider: provider, defaultModel: modelId });
        }
        return { success: true, model: res.data };
      }
      return { success: false, error: res.error || 'Failed to set model' };
    } catch (err: any) {
      return { success: false, error: err.message || 'Error executing set_model' };
    }
  }

  public async setThinkingLevel(
    level: OmpThinkingLevel
  ): Promise<{ success: boolean; error?: string }> {
    if (this.lifecycleState !== 'ready' || !this.process || !this.process.stdin?.writable) {
      return { success: false, error: 'OMP process is not ready or offline' };
    }
    try {
      const res = await this.sendCommand({
        type: 'set_thinking_level',
        id: this.generateId(),
        level,
      });
      if (res.success) {
        this.currentThinkingLevel = level;
        if (this.settingsStore) {
          this.settingsStore.set({ defaultThinkingLevel: level });
        }
        return { success: true };
      }
      return { success: false, error: res.error || 'Failed to set thinking level' };
    } catch (err: any) {
      return { success: false, error: err.message || 'Error executing set_thinking_level' };
    }
  }
  public setOpenUrlHandler(fn: (url: string) => Promise<void>): void {
    this.openUrlHandler = fn;
  }

  public setInteractiveFallback(fn: (providerId: string) => Promise<{ success: boolean; error?: string }>): void {
    this.interactiveFallback = fn;
  }

  public hasActiveAuthLogin(): boolean {
    return this.activeAuthLogin !== null && !this.activeAuthLogin.isCancelled;
  }

  public getActiveAuthLoginProviderId(): string | null {
    return this.activeAuthLogin?.providerId ?? null;
  }

  public async getLoginProviders(): Promise<{ success: boolean; providers?: LoginProviderItem[]; error?: string }> {
    if (this.lifecycleState !== 'ready' || !this.process || !this.process.stdin?.writable) {
      return { success: false, error: 'OMP process is not ready or offline' };
    }
    try {
      const res = await this.sendCommand<GetLoginProvidersResponseData>({
        type: 'get_login_providers',
        id: this.generateId(),
      });
      if (res.success && res.data && Array.isArray(res.data.providers)) {
        return { success: true, providers: res.data.providers };
      }
      return { success: false, error: res.error || 'Failed to get login providers' };
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      return { success: false, error: msg || 'Error executing get_login_providers' };
    }
  }

  public async startAuthLogin(providerId: string): Promise<{ success: boolean; error?: string }> {
    if (this.lifecycleState !== 'ready' || !this.process || !this.process.stdin?.writable) {
      return { success: false, error: 'OMP process is not ready or offline' };
    }
    if (!providerId || typeof providerId !== 'string') {
      return { success: false, error: tm('electron.bridge.invalidProviderId') };
    }

    if (this.activeAuthLogin) {
      this.cancelAuthLogin();
    }

    const loginCommandId = this.generateId();
    this.activeAuthLogin = { providerId, loginCommandId };
    this.emitAuthLoginEvent({ providerId, status: 'started' });

    // Send login command via RPC in background with 5 minute timeout
    this.sendCommand<LoginResponseData>(
      {
        type: 'login',
        id: loginCommandId,
        providerId,
      },
      5 * 60 * 1000
    )
      .then((res) => {
        if (!this.activeAuthLogin || this.activeAuthLogin.loginCommandId !== loginCommandId) {
          return;
        }
        if (this.activeAuthLogin.isCancelled) {
          this.activeAuthLogin = null;
          return;
        }
        if (res.success) {
          this.activeAuthLogin = null;
          this.emitAuthLoginEvent({ providerId, status: 'success' });
        } else {
          const errorMsg = res.error || tm('electron.bridge.loginFailed');
          // If provider requires interactive prompts in terminal (like copilot) -> fallback
          if (errorMsg.includes('requires interactive prompts') && this.interactiveFallback) {
            this.activeAuthLogin = null;
            this.interactiveFallback(providerId).catch((fallbackErr) => {
              this.emitAuthLoginEvent({
                providerId,
                status: 'error',
                message: fallbackErr?.message || String(fallbackErr),
              });
            });
            return;
          }
          this.activeAuthLogin = null;
          this.emitAuthLoginEvent({ providerId, status: 'error', message: errorMsg });
        }
      })
      .catch((err: unknown) => {
        const errorMsg = err instanceof Error ? err.message : String(err);
        if (!this.activeAuthLogin || this.activeAuthLogin.loginCommandId !== loginCommandId) {
          return;
        }
        if (this.activeAuthLogin.isCancelled) {
          this.activeAuthLogin = null;
          return;
        }
        if (errorMsg.includes('requires interactive prompts') && this.interactiveFallback) {
          this.activeAuthLogin = null;
          this.interactiveFallback(providerId).catch((fallbackErr) => {
            this.emitAuthLoginEvent({
              providerId,
              status: 'error',
              message: fallbackErr?.message || String(fallbackErr),
            });
          });
          return;
        }
        this.activeAuthLogin = null;
        this.emitAuthLoginEvent({ providerId, status: 'error', message: errorMsg });
      });

    return { success: true };
  }

  public cancelAuthLogin(): { success: boolean } {
    if (!this.activeAuthLogin || this.activeAuthLogin.isCancelled) {
      return { success: true };
    }
    const { providerId, pendingInputReqId } = this.activeAuthLogin;
    this.activeAuthLogin.isCancelled = true;
    if (pendingInputReqId) {
      this.respondUiRequest(pendingInputReqId, { cancelled: true });
      this.activeAuthLogin.pendingInputReqId = undefined;
    }
    this.emitAuthLoginEvent({ providerId, status: 'cancelled' });
    return { success: true };
  }

  public submitAuthLoginInput(text: string): { success: boolean; error?: string } {
    if (!this.activeAuthLogin || !this.activeAuthLogin.pendingInputReqId || this.activeAuthLogin.isCancelled) {
      return { success: false, error: tm('electron.bridge.noPendingAuthSession') };
    }
    const reqId = this.activeAuthLogin.pendingInputReqId;
    this.respondUiRequest(reqId, { value: text.trim() });
    this.activeAuthLogin.pendingInputReqId = undefined;
    return { success: true };
  }

  private emitAuthLoginEvent(event: AuthLoginEvent): void {
    this.emit('omp:auth-login-event', event);
  }

  public async getState(): Promise<{ success: boolean; state?: OmpEngineState; error?: string }> {
    if (this.lifecycleState !== 'ready' || !this.process || !this.process.stdin?.writable) {
      return { success: false, error: 'OMP process is not ready or offline' };
    }
    try {
      const res = await this.sendCommand<OmpEngineState>({
        type: 'get_state',
        id: this.generateId(),
      });
      if (res.success && res.data) {
        if (res.data.sessionFile) {
          this.currentSessionFile = res.data.sessionFile;
        }
        if (res.data.sessionId) {
          this.currentSessionId = res.data.sessionId;
        }
        this.lastContextUsage = res.data.contextUsage ?? null;
        this.lastTokensPerSecond = res.data.tokensPerSecond ?? null;
        if (res.data.sessionName) {
          this.sessionName = res.data.sessionName;
        }
        this.emit('omp:context-usage', {
          contextUsage: res.data.contextUsage ?? null,
          tokensPerSecond: res.data.tokensPerSecond ?? null,
          sessionName: res.data.sessionName,
        });
        if (Array.isArray(res.data.todoPhases) || Array.isArray(res.data.todos)) {
          this.normalizeAndSetTodos(res.data.todoPhases, res.data.todos);
        }
        res.data.thinkingLevel = this.currentThinkingLevel;
        res.data.approvalMode = this.currentApprovalMode;
        res.data.profile = this.currentProfile;
        return { success: true, state: res.data };
      }
      return { success: false, error: res.error || 'Failed to get state' };
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      return { success: false, error: msg || 'Error executing get_state' };
    }
  }
  public async getSessionStats(): Promise<{ success: boolean; stats?: OmpSessionStats; error?: string }> {
    if (this.lifecycleState !== 'ready' || !this.process || !this.process.stdin?.writable) {
      return { success: false, error: 'OMP process is not ready or offline' };
    }
    if (this.status !== 'idle') {
      return { success: false, error: 'Engine is busy processing another request' };
    }
    try {
      const res = await this.sendCommand<OmpSessionStats>({
        type: 'get_session_stats',
        id: this.generateId(),
      });
      if (res.success && res.data) {
        return { success: true, stats: res.data };
      }
      return { success: false, error: res.error || 'Failed to get session stats' };
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      return { success: false, error: msg || 'Error executing get_session_stats' };
    }
  }
  public getApprovalMode(): { success: boolean; mode?: OmpApprovalMode; error?: string } {
    return { success: true, mode: this.currentApprovalMode };
  }

  public async setApprovalMode(
    mode: OmpApprovalMode
  ): Promise<{ success: boolean; mode?: OmpApprovalMode; error?: string }> {
    const oldMode = this.currentApprovalMode;
    if (this.process && this.lifecycleState !== 'idle') {
      const oldWs = this.workspacePath;
      const oldModel = this.currentModel;
      const oldProvider = this.currentProvider;
      const oldSessionFile = this.currentSessionFile;

      this.stopProcess();

      if (oldWs) {
        const startResult = await this.startProcess(oldWs, oldModel, {
          provider: oldProvider,
          approvalMode: mode,
        });

        if (startResult.success) {
          this.currentApprovalMode = mode;
          if (this.settingsStore) {
            this.settingsStore.set({ approvalMode: mode });
          }
          if (oldSessionFile) {
            try {
              await this.switchSession(oldSessionFile);
            } catch (err) {
              console.warn('[OmpBridge] Failed to switch back to session after approval mode restart:', err);
            }
          }
          await this.getState().catch(() => {});
          return { success: true, mode };
        } else {
          this.currentApprovalMode = oldMode;
          return {
            success: false,
            mode: oldMode,
            error: tm('electron.bridge.restartFailedApprovalMode'),
          };
        }
      }
    }

    this.currentApprovalMode = mode;
    if (this.settingsStore) {
      this.settingsStore.set({ approvalMode: mode });
    }
    return { success: true, mode };
  }

  public getProfile(): { success: boolean; profile: string } {
    return { success: true, profile: this.currentProfile || 'default' };
  }

  public async setProfile(
    profile: string
  ): Promise<{ success: boolean; profile: string; error?: string }> {
    const cleanProfile = profile?.trim() || 'default';
    if (cleanProfile === this.currentProfile) {
      return { success: true, profile: this.currentProfile };
    }

    const oldProfile = this.currentProfile;
    if (this.process && this.lifecycleState !== 'idle') {
      const oldWs = this.workspacePath;
      const oldModel = this.currentModel;
      const oldProvider = this.currentProvider;

      this.stopProcess();

      if (oldWs) {
        const startResult = await this.startProcess(oldWs, oldModel, {
          provider: oldProvider,
          approvalMode: this.currentApprovalMode,
          profile: cleanProfile,
        });

        if (startResult.success) {
          this.currentProfile = cleanProfile;
          if (this.settingsStore) {
            this.settingsStore.set({ profile: cleanProfile });
          }
          await this.getState().catch(() => {});
          return { success: true, profile: cleanProfile };
        } else {
          this.currentProfile = oldProfile;
          return {
            success: false,
            profile: oldProfile,
            error: tm('electron.bridge.restartFailedProfile'),
          };
        }
      }
    }

    this.currentProfile = cleanProfile;
    if (this.settingsStore) {
      this.settingsStore.set({ profile: cleanProfile });
    }
    return { success: true, profile: cleanProfile };
  }

  public async registerHostTools(): Promise<{ success: boolean; toolNames?: string[]; error?: string }> {
    if (this.lifecycleState !== 'ready' || !this.process || !this.process.stdin?.writable) {
      return { success: false, error: 'Engine offline' };
    }
    const settings = this.settingsStore?.get();
    if (settings && settings.hostToolsEnabled === false) {
      return { success: true, toolNames: [] };
    }
    const tools = this.hostToolRegistry.getDeclarations();
    const cmdId = this.generateId();
    const frame: SetHostToolsCommand = {
      type: 'set_host_tools',
      id: cmdId,
      tools,
    };
    try {
      const res = await this.sendCommand(frame);
      if (res.success && res.data && Array.isArray((res.data as any).toolNames)) {
        return { success: true, toolNames: (res.data as any).toolNames };
      }
      return { success: res.success, error: res.error };
    } catch (err: any) {
      return { success: false, error: err?.message || 'Error registering host tools' };
    }
  }

  public async setHostUriSchemes(schemes: string[]): Promise<{ success: boolean; schemes?: string[]; error?: string }> {
    const schemeEntries = schemes.map((scheme) => ({ scheme, immutable: true }));
    if (this.lifecycleState !== 'ready' || !this.process || !this.process.stdin?.writable) {
      return { success: false, error: 'Engine offline' };
    }
    const cmdId = this.generateId();
    const frame: SetHostUriSchemesCommand = {
      type: 'set_host_uri_schemes',
      id: cmdId,
      schemes: schemeEntries,
    };
    try {
      const res = await this.sendCommand(frame);
      if (res.success && res.data && Array.isArray((res.data as any).schemes)) {
        return { success: true, schemes: (res.data as any).schemes };
      }
      return { success: res.success, error: res.error };
    } catch (err: any) {
      return { success: false, error: err?.message || 'Error setting host URI schemes' };
    }
  }

  public async compact(
    customInstructions?: string
  ): Promise<{ success: boolean; error?: string }> {
    if (this.lifecycleState !== 'ready' || !this.process || !this.process.stdin?.writable) {
      return { success: false, error: 'OMP process is not ready or offline' };
    }
    if (this.status === 'streaming' || this.status === 'thinking' || this.status === 'executing_tool') {
      return { success: false, error: 'Engine is busy processing another request' };
    }
    try {
      const cmd: CompactCommand = {
        type: 'compact',
        id: this.generateId(),
      };
      if (customInstructions) {
        cmd.customInstructions = customInstructions;
      }
      const res = await this.sendCommand(cmd);
      if (res.success) {
        await this.getState().catch(() => {});
        return { success: true };
      }
      return { success: false, error: res.error || 'Failed to compact session context' };
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      return { success: false, error: msg || 'Error executing compact command' };
    }
  }

  public async setAutoCompaction(
    enabled: boolean
  ): Promise<{ success: boolean; error?: string }> {
    if (this.lifecycleState !== 'ready' || !this.process || !this.process.stdin?.writable) {
      return { success: false, error: 'OMP process is not ready or offline' };
    }
    try {
      const cmd: SetAutoCompactionCommand = {
        type: 'set_auto_compaction',
        id: this.generateId(),
        enabled,
      };
      const res = await this.sendCommand(cmd);
      if (res.success) {
        if (this.settingsStore) {
          this.settingsStore.set({ autoCompaction: enabled });
        }
        await this.getState().catch(() => {});
        return { success: true };
      }
      return { success: false, error: res.error || 'Failed to set auto-compaction' };
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      return { success: false, error: msg || 'Error executing set_auto_compaction' };
    }
  }

  public async setSteeringMode(
    mode: string
  ): Promise<{ success: boolean; error?: string }> {
    if (this.lifecycleState !== 'ready' || !this.process || !this.process.stdin?.writable) {
      if (this.settingsStore) {
        this.settingsStore.set({ steeringMode: mode });
      }
      return { success: true };
    }
    try {
      const cmd: SetSteeringModeCommand = {
        type: 'set_steering_mode',
        id: this.generateId(),
        mode,
      };
      const res = await this.sendCommand(cmd);
      if (res.success) {
        if (this.settingsStore) {
          this.settingsStore.set({ steeringMode: mode });
        }
        await this.getState().catch(() => {});
        return { success: true };
      }
      return { success: false, error: res.error || 'Failed to set steering mode' };
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      return { success: false, error: msg || 'Error executing set_steering_mode' };
    }
  }

  public async setFollowUpMode(
    mode: string
  ): Promise<{ success: boolean; error?: string }> {
    if (this.lifecycleState !== 'ready' || !this.process || !this.process.stdin?.writable) {
      if (this.settingsStore) {
        this.settingsStore.set({ followUpMode: mode });
      }
      return { success: true };
    }
    try {
      const cmd: SetFollowUpModeCommand = {
        type: 'set_follow_up_mode',
        id: this.generateId(),
        mode,
      };
      const res = await this.sendCommand(cmd);
      if (res.success) {
        if (this.settingsStore) {
          this.settingsStore.set({ followUpMode: mode });
        }
        await this.getState().catch(() => {});
        return { success: true };
      }
      return { success: false, error: res.error || 'Failed to set follow-up mode' };
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      return { success: false, error: msg || 'Error executing set_follow_up_mode' };
    }
  }

  public async setAutoRetry(
    enabled: boolean
  ): Promise<{ success: boolean; error?: string }> {
    if (this.lifecycleState !== 'ready' || !this.process || !this.process.stdin?.writable) {
      if (this.settingsStore) {
        this.settingsStore.set({ autoRetry: enabled });
      }
      return { success: true };
    }
    try {
      const cmd: SetAutoRetryCommand = {
        type: 'set_auto_retry',
        id: this.generateId(),
        enabled,
      };
      const res = await this.sendCommand(cmd);
      if (res.success) {
        if (this.settingsStore) {
          this.settingsStore.set({ autoRetry: enabled });
        }
        await this.getState().catch(() => {});
        return { success: true };
      }
      return { success: false, error: res.error || 'Failed to set auto-retry' };
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      return { success: false, error: msg || 'Error executing set_auto_retry' };
    }
  }

  public async abortRetry(): Promise<{ success: boolean; error?: string }> {
    if (this.lifecycleState !== 'ready' || !this.process || !this.process.stdin?.writable) {
      this.retryState = { isRetrying: false };
      this.emit('omp:retry-state', this.retryState);
      return { success: true };
    }
    try {
      const cmd: AbortRetryCommand = {
        type: 'abort_retry',
        id: this.generateId(),
      };
      const res = await this.sendCommand(cmd);
      if (res.success) {
        this.retryState = { isRetrying: false };
        this.emit('omp:retry-state', this.retryState);
        return { success: true };
      }
      return { success: false, error: res.error || 'Failed to abort retry' };
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      return { success: false, error: msg || 'Error executing abort_retry' };
    }
  }

  public async setFastMode(
    enabled: boolean
  ): Promise<{ success: boolean; data?: { enabled?: boolean }; error?: string }> {
    if (this.lifecycleState !== 'ready' || !this.process || !this.process.stdin?.writable) {
      if (this.settingsStore) {
        this.settingsStore.set({ fastMode: enabled });
      }
      return { success: true, data: { enabled } };
    }
    try {
      const cmd: SetFastModeCommand = {
        type: 'set_fast_mode',
        id: this.generateId(),
        enabled,
      };
      const res = await this.sendCommand<{ enabled?: boolean }>(cmd);
      if (res.success) {
        if (this.settingsStore) {
          this.settingsStore.set({ fastMode: enabled });
        }
        await this.getState().catch(() => {});
        return { success: true, data: res.data };
      }
      return { success: false, error: res.error || 'Failed to set fast mode' };
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      return { success: false, error: msg || 'Error executing set_fast_mode' };
    }
  }

  public async getLastAssistantText(): Promise<{ success: boolean; text?: string; error?: string }> {
    if (this.lifecycleState === 'ready' && this.process && this.process.stdin?.writable) {
      try {
        const cmd: GetLastAssistantTextCommand = {
          type: 'get_last_assistant_text',
          id: this.generateId(),
        };
        const res = await this.sendCommand<{ text?: string }>(cmd);
        if (res.success) {
          const text = typeof res.data?.text === 'string' ? res.data.text : (typeof (res.data as any) === 'string' ? (res.data as any) : '');
          return { success: true, text };
        }
      } catch (err) {
        console.warn('[OmpBridge] get_last_assistant_text RPC error, using local fallback:', err);
      }
    }
    return { success: true, text: undefined };
  }

  public async handoff(): Promise<{ success: boolean; data?: unknown; error?: string }> {
    if (this.lifecycleState !== 'ready' || !this.process || !this.process.stdin?.writable) {
      return { success: false, error: 'OMP process is not ready or offline' };
    }
    try {
      const cmd: HandoffCommand = {
        type: 'handoff',
        id: this.generateId(),
      };
      const res = await this.sendCommand(cmd);
      if (res.success) {
        return { success: true, data: res.data };
      }
      return { success: false, error: res.error || 'Failed to execute handoff' };
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      return { success: false, error: msg || 'Error executing handoff' };
    }
  }

  public async runBash(
    command: string
  ): Promise<{ success: boolean; data?: BashResultData; error?: string }> {
    if (this.lifecycleState !== 'ready' || !this.process || !this.process.stdin?.writable) {
      return { success: false, error: 'OMP process is not ready or offline' };
    }
    try {
      const reqId = this.generateId();
      const cmd: BashCommand = {
        type: 'bash',
        id: reqId,
        command,
      };
      const res = await this.sendCommand<BashResultData>(cmd);
      if (res.success) {
        const data = res.data || {};
        let output = typeof data.output === 'string' ? data.output : '';
        let truncated = Boolean(data.truncated);
        const MAX_OUTPUT_CHARS = 200_000;
        if (output.length > MAX_OUTPUT_CHARS) {
          output = '… [Output truncated to avoid flood] …\n' + output.slice(output.length - MAX_OUTPUT_CHARS);
          truncated = true;
        }
        return {
          success: true,
          data: {
            exitCode: typeof data.exitCode === 'number' ? data.exitCode : 0,
            output,
            outputBytes: data.outputBytes ?? output.length,
            totalLines: data.totalLines ?? (output ? output.split('\n').length : 0),
            truncated,
          },
        };
      }
      return { success: false, error: res.error || 'Failed to execute bash command' };
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      return { success: false, error: msg || 'Error executing bash' };
    }
  }

  public async abortBash(): Promise<{ success: boolean; error?: string }> {
    if (this.lifecycleState !== 'ready' || !this.process || !this.process.stdin?.writable) {
      return { success: false, error: 'OMP process is not ready or offline' };
    }
    try {
      const cmd: AbortBashCommand = {
        type: 'abort_bash',
        id: this.generateId(),
      };
      const res = await this.sendCommand(cmd);
      if (res.success) {
        return { success: true };
      }
      return { success: false, error: res.error || 'Failed to abort bash' };
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      return { success: false, error: msg || 'Error executing abort_bash' };
    }
  }

  public async setInterruptMode(
    mode: string
  ): Promise<{ success: boolean; error?: string }> {
    if (this.lifecycleState !== 'ready' || !this.process || !this.process.stdin?.writable) {
      if (this.settingsStore) {
        this.settingsStore.set({ interruptMode: mode });
      }
      return { success: true };
    }
    try {
      const cmd: SetInterruptModeCommand = {
        type: 'set_interrupt_mode',
        id: this.generateId(),
        mode,
      };
      const res = await this.sendCommand(cmd);
      if (res.success) {
        if (this.settingsStore) {
          this.settingsStore.set({ interruptMode: mode });
        }
        await this.getState().catch(() => {});
        return { success: true };
      }
      return { success: false, error: res.error || 'Failed to set interrupt mode' };
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      return { success: false, error: msg || 'Error executing set_interrupt_mode' };
    }
  }


  public async listSessions(
    customSessionDir?: string
  ): Promise<{ success: boolean; sessions?: OmpSessionInfo[]; error?: string }> {
    try {
      const sessionDir =
        customSessionDir ||
        (this.currentSessionFile ? path.dirname(this.currentSessionFile) : null);
      if (!sessionDir || !fs.existsSync(sessionDir)) {
        return { success: true, sessions: [] };
      }

      const entries = fs.readdirSync(sessionDir, { withFileTypes: true });
      const sessions: OmpSessionInfo[] = [];

      for (const entry of entries) {
        if (!entry.isFile() || !entry.name.endsWith('.jsonl')) {
          continue;
        }

        const fullPath = path.join(sessionDir, entry.name);
        try {
          const content = fs.readFileSync(fullPath, 'utf-8');
          const lines = content.split('\n');

          let title = '';
          let updatedAt: string | undefined;
          let sessionId = '';
          let timestamp = '';
          let hasValidHeader = false;

          for (let i = 0; i < Math.min(lines.length, 5); i++) {
            const line = lines[i].trim();
            if (!line) continue;
            try {
              const parsed = JSON.parse(line);
              if (parsed.type === 'title') {
                hasValidHeader = true;
                if (typeof parsed.title === 'string' && parsed.title.trim().length > 0) {
                  title = parsed.title.trim();
                }
                if (parsed.updatedAt) {
                  updatedAt = String(parsed.updatedAt);
                }
              } else if (parsed.type === 'session') {
                hasValidHeader = true;
                if (parsed.id) {
                  sessionId = String(parsed.id);
                }
                if (parsed.timestamp) {
                  timestamp = String(parsed.timestamp);
                }
                if (!title && typeof parsed.title === 'string' && parsed.title.trim().length > 0) {
                  title = parsed.title.trim();
                }
              }
            } catch {
              // Ignore malformed line
            }
          }

          if (!hasValidHeader) {
            continue;
          }

          if (!sessionId) {
            sessionId = path.basename(entry.name, '.jsonl');
          }
          if (!timestamp) {
            const stat = fs.statSync(fullPath);
            timestamp = stat.mtime.toISOString();
          }
          if (!title) {
            title = 'New Session';
          }

          const isActive = this.currentSessionFile
            ? path.resolve(fullPath) === path.resolve(this.currentSessionFile)
            : false;

          sessions.push({
            path: fullPath,
            id: sessionId,
            title,
            timestamp,
            updatedAt: updatedAt || timestamp,
            active: isActive,
          });
        } catch {
          // File unreadable / corrupted -> skip safely, do not throw
        }
      }

      sessions.sort((a, b) => {
        const tA = new Date(a.timestamp).getTime();
        const tB = new Date(b.timestamp).getTime();
        return (isNaN(tB) ? 0 : tB) - (isNaN(tA) ? 0 : tA);
      });

      return { success: true, sessions };
    } catch (err: any) {
      return { success: false, error: err.message || 'Failed to list sessions' };
    }
  }

  public async newSession(
    parentSession?: string
  ): Promise<{ success: boolean; error?: string }> {
    if (this.lifecycleState !== 'ready' || !this.process || !this.process.stdin?.writable) {
      return { success: false, error: 'OMP process is not ready or offline' };
    }
    if (this.status === 'thinking' || this.status === 'streaming' || this.status === 'executing_tool') {
      return { success: false, error: 'session_busy' };
    }
    try {
      const cmd: NewSessionCommand = {
        type: 'new_session',
        id: this.generateId(),
        ...(parentSession ? { parentSession } : {}),
      };
      const res = await this.sendCommand<SessionChangeResponseData>(cmd);
      if (res.success && !res.data?.cancelled) {
        this.resetSessionAccumulators();
        await this.getState().catch(() => {});
        return { success: true };
      }
      if (res.data?.cancelled) {
        return { success: false, error: 'cancelled' };
      }
      return { success: false, error: res.error || 'Failed to create new session' };
    } catch (err: any) {
      return { success: false, error: err.message || 'Error executing new_session' };
    }
  }

  public async switchSession(
    sessionPath: string
  ): Promise<{ success: boolean; error?: string }> {
    if (this.lifecycleState !== 'ready' || !this.process || !this.process.stdin?.writable) {
      return { success: false, error: 'OMP process is not ready or offline' };
    }
    if (this.status === 'thinking' || this.status === 'streaming' || this.status === 'executing_tool') {
      return { success: false, error: 'session_busy' };
    }
    try {
      const cmd: SwitchSessionCommand = {
        type: 'switch_session',
        id: this.generateId(),
        sessionPath,
      };
      const res = await this.sendCommand<SessionChangeResponseData>(cmd);
      if (res.success && !res.data?.cancelled) {
        this.resetSessionAccumulators();
        await this.getState().catch(() => {});
        return { success: true };
      }
      if (res.data?.cancelled) {
        return { success: false, error: 'cancelled' };
      }
      return { success: false, error: res.error || 'Failed to switch session' };
    } catch (err: any) {
      return { success: false, error: err.message || 'Error executing switch_session' };
    }
  }

  public async branchSession(
    entryId: string
  ): Promise<{ success: boolean; error?: string }> {
    if (this.lifecycleState !== 'ready' || !this.process || !this.process.stdin?.writable) {
      return { success: false, error: 'OMP process is not ready or offline' };
    }
    if (this.status === 'thinking' || this.status === 'streaming' || this.status === 'executing_tool') {
      return { success: false, error: 'session_busy' };
    }
    try {
      const cmd: BranchCommand = {
        type: 'branch',
        id: this.generateId(),
        entryId,
      };
      const res = await this.sendCommand<SessionChangeResponseData>(cmd);
      if (res.success && !res.data?.cancelled) {
        this.resetSessionAccumulators();
        await this.getState().catch(() => {});
        return { success: true };
      }
      if (res.data?.cancelled) {
        return { success: false, error: 'cancelled' };
      }
      return { success: false, error: res.error || 'Failed to branch session' };
    } catch (err: any) {
      return { success: false, error: err.message || 'Error executing branch' };
    }
  }
  public async renameSession(
    name: string
  ): Promise<{ success: boolean; error?: string }> {
    if (this.lifecycleState !== 'ready' || !this.process || !this.process.stdin?.writable) {
      return { success: false, error: 'OMP process is not ready or offline' };
    }
    if (this.status === 'thinking' || this.status === 'streaming' || this.status === 'executing_tool') {
      return { success: false, error: 'session_busy' };
    }
    const trimmed = (name || '').trim();
    if (!trimmed) {
      return { success: false, error: 'Session name cannot be empty' };
    }
    try {
      const cmd: SetSessionNameCommand = {
        type: 'set_session_name',
        id: this.generateId(),
        name: trimmed,
      };
      const res = await this.sendCommand(cmd);
      if (res.success) {
        await this.getState().catch(() => {});
        return { success: true };
      }
      return { success: false, error: res.error || 'Failed to rename session' };
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      return { success: false, error: msg || 'Error executing set_session_name' };
    }
  }

  public async deleteSession(
    targetPath: string
  ): Promise<{ success: boolean; error?: string }> {
    try {
      const sessionDir = this.currentSessionFile ? path.dirname(this.currentSessionFile) : null;
      if (!sessionDir) {
        return { success: false, error: 'No active session directory' };
      }

      // Guard 1: Must be inside session directory (no traversal ../, not absolute outside, no nested directories)
      const rel = path.relative(sessionDir, targetPath);
      if (rel.startsWith('..') || path.isAbsolute(rel) || rel === '' || rel.includes(path.sep)) {
        return { success: false, error: 'Target session path is outside the current session directory' };
      }

      // Guard 2: Must be a .jsonl file
      if (!targetPath.endsWith('.jsonl')) {
        return { success: false, error: 'Target file must be a .jsonl session file' };
      }

      // Guard 3: Must NOT be the currently active session file
      if (this.currentSessionFile && path.resolve(targetPath) === path.resolve(this.currentSessionFile)) {
        return { success: false, error: 'Cannot delete the currently active session' };
      }

      if (!fs.existsSync(targetPath)) {
        return { success: false, error: 'Session file not found' };
      }

      // Delete target .jsonl file
      fs.unlinkSync(targetPath);

      // Delete associated subagent directory if exists
      const baseName = path.basename(targetPath, '.jsonl');
      const subDir1 = path.join(sessionDir, baseName);
      if (fs.existsSync(subDir1) && fs.statSync(subDir1).isDirectory()) {
        fs.rmSync(subDir1, { recursive: true, force: true });
      }
      if (baseName.includes('_')) {
        const parts = baseName.split('_');
        const possibleUuid = parts.slice(1).join('_');
        if (possibleUuid) {
          const subDir2 = path.join(sessionDir, possibleUuid);
          if (fs.existsSync(subDir2) && fs.statSync(subDir2).isDirectory()) {
            fs.rmSync(subDir2, { recursive: true, force: true });
          }
        }
      }

      return { success: true };
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      return { success: false, error: msg || 'Failed to delete session' };
    }
  }

  public async repairSession(
    customSessionPath?: string
  ): Promise<{ success: boolean; repairedTurns?: number; error?: string }> {
    try {
      const targetFile = customSessionPath || this.currentSessionFile;
      if (!targetFile || !fs.existsSync(targetFile)) {
        return { success: false, error: 'No valid session file found to repair' };
      }
      if (!targetFile.endsWith('.jsonl')) {
        return { success: false, error: 'Target file must be a .jsonl session file' };
      }

      const content = fs.readFileSync(targetFile, 'utf-8');
      const lines = content.split('\n');
      let repairedCount = 0;
      const validRecords: Record<string, unknown>[] = [];

      for (const line of lines) {
        const trimmed = line.trim();
        if (!trimmed) continue;
        try {
          const parsed = JSON.parse(trimmed);
          // Normalize toolResult records if containing primitive content
          if (parsed && typeof parsed === 'object') {
            const rec = parsed as Record<string, unknown>;
            const msg = (rec.message && typeof rec.message === 'object' ? rec.message : rec) as Record<string, unknown>;
            if (msg.role === 'toolResult' || msg.type === 'toolResult' || rec.type === 'toolResult') {
              if (typeof msg.content === 'boolean' || msg.content === 'true' || msg.content === 'false') {
                const val = msg.content === true || msg.content === 'true';
                msg.content = [{ type: 'text', text: JSON.stringify({ result: val }) }];
                repairedCount++;
              } else if (Array.isArray(msg.content)) {
                for (let i = 0; i < msg.content.length; i++) {
                  const block = msg.content[i];
                  if (typeof block === 'boolean' || block === 'true' || block === 'false') {
                    const val = block === true || block === 'true';
                    msg.content[i] = { type: 'text', text: JSON.stringify({ result: val }) };
                    repairedCount++;
                  }
                }
              }
            }
          }
          validRecords.push(parsed);
        } catch {
          repairedCount++;
        }
      }

      // Prune trailing empty or error assistant turns
      while (validRecords.length > 0) {
        const last = validRecords[validRecords.length - 1];
        const rec = last as Record<string, unknown>;
        const msg = (rec.message && typeof rec.message === 'object' ? rec.message : rec) as Record<string, unknown>;
        if (
          msg &&
          (msg.role === 'assistant' || rec.type === 'assistant') &&
          (msg.stopReason === 'error' || msg.isError || (!msg.content || (Array.isArray(msg.content) && msg.content.length === 0)))
        ) {
          validRecords.pop();
          repairedCount++;
        } else {
          break;
        }
      }

      const newContent = validRecords.map((r) => JSON.stringify(r)).join('\n') + '\n';
      fs.writeFileSync(targetFile, newContent, 'utf-8');

      if (this.currentSessionFile && path.resolve(targetFile) === path.resolve(this.currentSessionFile)) {
        await this.loadHistory().catch(() => {});
      }

      return { success: true, repairedTurns: repairedCount };
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      return { success: false, error: msg || 'Failed to repair session' };
    }
  }

  public async exportHtml(
    outputPath: string
  ): Promise<{ success: boolean; path?: string; error?: string }> {
    if (this.lifecycleState !== 'ready' || !this.process || !this.process.stdin?.writable) {
      return { success: false, error: 'OMP process is not ready or offline' };
    }
    if (this.status === 'thinking' || this.status === 'streaming' || this.status === 'executing_tool') {
      return { success: false, error: 'session_busy' };
    }
    try {
      const cmd: ExportHtmlCommand = {
        type: 'export_html',
        id: this.generateId(),
        outputPath,
      };
      const res = await this.sendCommand<ExportHtmlResponseData>(cmd);
      if (res.success) {
        return { success: true, path: res.data?.path || outputPath };
      }
      return { success: false, error: res.error || 'Failed to export session to HTML' };
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      return { success: false, error: msg || 'Error executing export_html' };
    }
  }

  // Forward host open request from model to renderer, with source notification
  private emitHostOpenRequest(request: HostOpenRequest) {
    this.emit('omp:host-open-request', request);
    const label = request.kind === 'session' ? 'session' : 'file';
    this.emitNotification(tm('electron.bridge.modelRequestedOpen', { kind: label, target: request.target }), 'info');
  }

  private handleHostUriRequest(frame: HostUriRequestEvent) {
    const requestId = frame.id;
    const abortController = new AbortController();
    this.activeHostUriRequests.set(requestId, abortController);

    this.hostUriRouter
      .handle(frame.operation, String(frame.url || ''), frame.content, abortController.signal)
      .catch((err) => ({ isError: true, error: err?.message || String(err) }))
      .then((payload) => {
        this.activeHostUriRequests.delete(requestId);
        if (abortController.signal.aborted) return;
        if (!this.process || !this.process.stdin?.writable) return;
        const replyFrame: HostUriResultFrame = { type: 'host_uri_result', id: requestId, ...payload };
        this.writeFrame(replyFrame);
      })
      .catch((err) => {
        console.warn('[OmpBridge] host_uri_result write failed:', err?.message || err);
      });
  }

  public emitNotification(message: string, notifyType: string = 'info') {
    const notif: OmpNotification = {
      id: this.generateId(),
      message,
      notifyType,
      timestamp: Date.now(),
    };
    this.emit('omp:notification', notif);
  }
  public async loadHistory(): Promise<{
    success: boolean;
    messages?: ChatMessage[];
    error?: string;
  }> {
    if (this.lifecycleState !== 'ready' || !this.process || !this.process.stdin?.writable) {
      return { success: false, error: 'OMP process is not ready or offline' };
    }
    if (this.status === 'thinking' || this.status === 'streaming' || this.status === 'executing_tool') {
      return { success: false, error: 'session_busy' };
    }
    try {
      let allRawMessages: AgentMessage[] = [];
      const firstPage = await this.sendCommand<GetMessagesPageResponseData>({
        type: 'get_messages_page',
        id: this.generateId(),
      });
      if (!firstPage.success || !firstPage.data) {
        return { success: false, error: firstPage.error || 'Failed to load messages page' };
      }

      allRawMessages = Array.isArray(firstPage.data.messages) ? [...firstPage.data.messages] : [];
      const totalMessages = firstPage.data.totalMessages ?? allRawMessages.length;
      let cursor = firstPage.data.cursor;

      while (allRawMessages.length < totalMessages && typeof cursor === 'number') {
        const prevCursor = cursor;
        const nextPage = await this.sendCommand<GetMessagesPageResponseData>({
          type: 'get_messages_page',
          id: this.generateId(),
          cursor,
        });
        if (
          !nextPage.success ||
          !nextPage.data ||
          !Array.isArray(nextPage.data.messages) ||
          nextPage.data.messages.length === 0
        ) {
          break;
        }
        allRawMessages.push(...nextPage.data.messages);
        if (nextPage.data.cursor === prevCursor) {
          break;
        }
        cursor = nextPage.data.cursor;
      }

      const messages = this.translateHistoryMessages(allRawMessages);
      return { success: true, messages };
    } catch (err: any) {
      return { success: false, error: err.message || 'Error executing loadHistory' };
    }
  }

  public translateHistoryMessages(rawMessages: AgentMessage[]): ChatMessage[] {
    const result: ChatMessage[] = [];
    const toolCallsMap = new Map<string, ToolCall>();

    for (let i = 0; i < rawMessages.length; i++) {
      const msg = rawMessages[i];
      if (!msg || typeof msg !== 'object') continue;

      const role = msg.role;
      const timestamp =
        typeof msg.completedAt === 'number'
          ? msg.completedAt
          : typeof msg.timestamp === 'number'
          ? msg.timestamp
          : Date.now();

      if (role === 'user') {
        let userText = '';
        if (typeof msg.content === 'string') {
          userText = msg.content;
        } else if (Array.isArray(msg.content)) {
          const parts: string[] = [];
          for (const b of msg.content) {
            if (typeof b === 'string') {
              parts.push(b);
            } else if (b && typeof b === 'object') {
              const txt = (b as any).text || (b as any).content || (b as any).value;
              if (typeof txt === 'string') parts.push(txt);
            }
          }
          userText = parts.join('\n');
        } else if (typeof (msg as any).prompt === 'string') {
          userText = (msg as any).prompt;
        } else if (typeof (msg as any).text === 'string') {
          userText = (msg as any).text;
        }

        result.push({
          id: `msg-user-${timestamp}-${i}`,
          role: 'user',
          content: userText,
          timestamp,
          steering: Boolean(msg && typeof msg === 'object' && 'steering' in msg && msg.steering) || undefined,
        });
      } else if (role === 'system') {
        let systemText = '';
        if (typeof msg.content === 'string') {
          systemText = msg.content;
        } else if (Array.isArray(msg.content)) {
          const parts: string[] = [];
          for (const b of msg.content) {
            if (typeof b === 'string') {
              parts.push(b);
            } else if (b && typeof b === 'object') {
              const txt = (b as any).text || (b as any).content || (b as any).value;
              if (typeof txt === 'string') parts.push(txt);
            }
          }
          systemText = parts.join('\n');
        } else if (typeof (msg as any).text === 'string') {
          systemText = (msg as any).text;
        }

        if (systemText.trim()) {
          result.push({
            id: `msg-system-${timestamp}-${i}`,
            role: 'system',
            content: systemText,
            timestamp,
          });
        }
      } else if (role === 'assistant') {
        const textParts: string[] = [];
        let thinkingBlock: ThinkingBlock | undefined;
        const toolCalls: ToolCall[] = [];

        const rawContent = (msg as any).content;
        if (typeof rawContent === 'string') {
          if (rawContent.trim()) {
            textParts.push(rawContent);
          }
        } else if (Array.isArray(rawContent)) {
          for (const block of rawContent) {
            if (!block) continue;
            if (typeof block === 'string') {
              const strBlock = String(block).trim();
              if (strBlock) textParts.push(strBlock);
              continue;
            }
            if (typeof block !== 'object') continue;
            if (
              block.type === 'toolCall' ||
              block.type === 'tool_use' ||
              block.type === 'tool_call'
            ) {
              const tcBlock = block as any;
              const tcId = String(
                tcBlock.id ||
                tcBlock.toolCallId ||
                tcBlock.tool_use_id ||
                tcBlock.tool_call_id ||
                tcBlock.call_id ||
                `tc-${timestamp}-${toolCalls.length}`
              );
              const tc: ToolCall = {
                id: tcId,
                name: String(tcBlock.name || tcBlock.toolName || tcBlock.tool || 'tool'),
                params: (tcBlock.arguments || tcBlock.args || tcBlock.input || {}) as Record<string, any>,
                status: 'running',
                startTime: timestamp,
              };
              toolCalls.push(tc);
              toolCallsMap.set(tcId, tc);
            } else if (block.type === 'thinking' || (block as any).thought) {
              const thought =
                typeof (block as any).text === 'string'
                  ? (block as any).text
                  : String((block as any).thought || '');
              thinkingBlock = {
                id: `think-${timestamp}-${i}`,
                thought,
                timestamp,
                completed: true,
              };
            } else {
              const txt = (block as any).text || (block as any).content || (block as any).value;
              if (typeof txt === 'string' && txt.trim()) {
                textParts.push(txt);
              }
            }
          }
        } else if (typeof (msg as any).text === 'string') {
          textParts.push((msg as any).text);
        } else if (typeof (msg as any).output === 'string') {
          textParts.push((msg as any).output);
        }
        const hasErr = Boolean(msg && typeof msg === 'object' && 'error' in msg && msg.error);
        const hasErrMsg = Boolean(msg && typeof msg === 'object' && 'errorMessage' in msg && msg.errorMessage);
        const isError = msg.stopReason === 'error' || Boolean(msg.isError) || hasErr || hasErrMsg;
        let errorMessage: string | undefined;
        if (msg && typeof msg === 'object') {
          if ('errorMessage' in msg && typeof msg.errorMessage === 'string') {
            errorMessage = msg.errorMessage;
          } else if ('error' in msg) {
            if (typeof msg.error === 'string') {
              errorMessage = msg.error;
            } else if (msg.error && typeof msg.error === 'object' && 'message' in msg.error && typeof msg.error.message === 'string') {
              errorMessage = msg.error.message;
            }
          }
        }
        const stopReason = msg.stopReason || (isError ? 'error' : null);

        const lastMsg = result[result.length - 1];
        if (lastMsg && lastMsg.role === 'assistant') {
          const incomingText = textParts.join('\n').trim();
          if (incomingText) {
            lastMsg.content = lastMsg.content
              ? `${lastMsg.content}\n\n${incomingText}`
              : incomingText;
          }
          if (thinkingBlock) {
            if (!lastMsg.thinking) {
              lastMsg.thinking = thinkingBlock;
            } else if (thinkingBlock.thought) {
              lastMsg.thinking.thought = lastMsg.thinking.thought
                ? `${lastMsg.thinking.thought}\n\n${thinkingBlock.thought}`
                : thinkingBlock.thought;
            }
          }
          if (toolCalls.length > 0) {
            if (!lastMsg.toolCalls) {
              lastMsg.toolCalls = [];
            }
            lastMsg.toolCalls.push(...toolCalls);
          }
          if (isError) {
            lastMsg.isError = true;
            if (stopReason) lastMsg.stopReason = stopReason;
            if (errorMessage) lastMsg.errorMessage = errorMessage;
          }
          lastMsg.timestamp = timestamp;
        } else {
          result.push({
            id: `msg-assistant-${timestamp}-${i}`,
            role: 'assistant',
            content: textParts.join('\n'),
            timestamp,
            ...(thinkingBlock ? { thinking: thinkingBlock } : {}),
            ...(toolCalls.length > 0 ? { toolCalls } : {}),
            ...(isError ? { isError: true, stopReason, ...(errorMessage ? { errorMessage } : {}) } : {}),
          });
        }
      } else if (role === 'fileMention') {
        const rawFiles = Array.isArray((msg as any).files) ? (msg as any).files : [];
        const files = rawFiles.map((f: any) => {
          const filePath = String(f.path || f.relativePath || '');
          const fileName = f.name || (filePath ? filePath.split('/').pop() : '');
          const lineCount =
            typeof f.lineCount === 'number'
              ? f.lineCount
              : typeof f.content === 'string'
              ? f.content.split('\n').length
              : undefined;
          return {
            path: filePath,
            name: fileName,
            lineCount,
          };
        });

        result.push({
          id: `msg-fileMention-${timestamp}-${i}`,
          role: 'fileMention',
          content: '',
          files,
          timestamp,
        });
      } else if (role === 'toolResult') {
        const toolCallId = String(
          msg.toolCallId ||
          (msg as any).tool_call_id ||
          (msg as any).tool_use_id ||
          (msg as any).toolUseId ||
          (msg as any).call_id ||
          (msg as any).callId ||
          msg.id ||
          ''
        );
        let tc = toolCallId ? toolCallsMap.get(toolCallId) : undefined;
        if (!tc) {
          for (const item of toolCallsMap.values()) {
            if (item.status === 'running') {
              tc = item;
              break;
            }
          }
        }
        if (tc) {
          tc.status = msg.isError ? 'failed' : 'completed';
          tc.endTime = timestamp;

          let resultText = '';
          if (typeof msg.content === 'string') {
            resultText = msg.content;
          } else if (Array.isArray(msg.content)) {
            const parts: string[] = [];
            for (const b of msg.content) {
              if (typeof b === 'string') {
                parts.push(b);
              } else if (b && typeof b === 'object') {
                const txt = (b as any).text || (b as any).content || (b as any).value;
                if (typeof txt === 'string') parts.push(txt);
              }
            }
            resultText = parts.join('\n');
          } else if (typeof (msg as any).text === 'string') {
            resultText = (msg as any).text;
          } else if (typeof (msg as any).output === 'string') {
            resultText = (msg as any).output;
          }
          tc.result = resultText || msg.details || msg.content;
          if (msg.isError) {
            tc.error =
              resultText ||
              (typeof msg.details === 'string' ? msg.details : 'Tool execution failed');
          }
        }
      }
    }

    // Ensure no toolCall in session history remains stuck in running status
    for (const chatMsg of result) {
      if (chatMsg.toolCalls && chatMsg.toolCalls.length > 0) {
        for (const tc of chatMsg.toolCalls) {
          if (tc.status === 'running') {
            tc.status = tc.error ? 'failed' : 'completed';
            if (!tc.endTime) {
              tc.endTime = chatMsg.timestamp || Date.now();
            }
          }
        }
      }
    }

    return result;
  }

  public async getBranchEntries(
    customSessionFile?: string
  ): Promise<{ success: boolean; entries?: OmpBranchEntry[]; error?: string }> {
    // If bridge is ready and process is online, use live get_branch_messages RPC command
    if (this.lifecycleState === 'ready' && this.process && this.process.stdin?.writable) {
      try {
        const cmd: GetBranchMessagesCommand = {
          type: 'get_branch_messages',
          id: this.generateId(),
        };
        const res = await this.sendCommand<GetBranchMessagesResponseData>(cmd);
        if (res.success && res.data && Array.isArray(res.data.messages)) {
          const entries: OmpBranchEntry[] = res.data.messages.map((m) => ({
            entryId: m.entryId,
            text: m.text,
            role: 'user',
          }));
          return { success: true, entries };
        }
        return { success: false, error: res.error || 'Failed to get branch messages' };
      } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : String(err);
        return { success: false, error: msg || 'Error executing get_branch_messages' };
      }
    }

    // Fallback when unready/offline with optional custom file
    try {
      const targetFile = customSessionFile || this.currentSessionFile;
      if (!targetFile || !fs.existsSync(targetFile)) {
        return { success: true, entries: [] };
      }

      const content = fs.readFileSync(targetFile, 'utf-8');
      const lines = content.split('\n');
      const entries: OmpBranchEntry[] = [];

      for (const line of lines) {
        const trimmed = line.trim();
        if (!trimmed) continue;
        try {
          const parsed = JSON.parse(trimmed);
          if (parsed.type === 'message' && parsed.id && parsed.message) {
            entries.push({
              entryId: String(parsed.id),
              role: String(parsed.message.role || ''),
              timestamp:
                typeof parsed.message.timestamp === 'number'
                  ? parsed.message.timestamp
                  : undefined,
            });
          }
        } catch {
          // Skip malformed lines
        }
      }

      return { success: true, entries };
    } catch (err: any) {
      return { success: false, error: err.message || 'Failed to get branch entries' };
    }
  }

  private resetSessionAccumulators() {
    this.thinkingAccumulator.reset();
    this.activeToolCalls.clear();
    this.writeSnapshots.clear();
    for (const id of this.pendingUiRequests.keys()) {
      this.emit('omp:ui-request-cancel', id);
    }
    this.pendingUiRequests.clear();
    this.clearEngineStatusesAndWidgets();
    this.currentTodoPhases = [];
    this.currentTodos = [];
    this.emitTodosUpdate();
  }

  private clearEngineStatusesAndWidgets() {
    this.engineStatuses.clear();
    this.engineWidgets.clear();
    this.emit('omp:engine-status', []);
    this.emit('omp:widget-update', []);
  }

  private handleStdoutData(data: string) {
    const frames = this.framer.push(data);
    for (const frame of frames) {
      this.dispatchInboundFrame(frame as OmpInboundFrame);
    }
  }

  private dispatchInboundFrame(frame: OmpInboundFrame) {
    // 1. Always record inbound frame to disk logger
    this.frameLogger.log('in', frame);

    // 2. Handshake handling: ReadyFrame arrival
    if (this.lifecycleState === 'awaiting_ready' && frame.type === 'ready') {
      if (typeof frame.maxFrameBytes === 'number' && frame.maxFrameBytes > 0) {
        this.framer.setMaxFrameBytes(frame.maxFrameBytes);
      }

      this.lifecycleState = 'negotiating';

      const negotiateCmd: NegotiateProtocolCommand = {
        type: 'negotiate_protocol',
        id: this.generateId(),
        protocolVersion: 2,
      };

      this.sendCommand(negotiateCmd, 5000)
        .then((res) => {
          if (res.success) {
            this.lifecycleState = 'ready';
            this.setStatus('idle');
            this.handshakePromise?.resolve({ success: true, pid: this.process?.pid });
            this.getState().catch(() => {});
            this.getAvailableCommands().catch((err) => {
              console.warn('[OmpBridge] get_available_commands unavailable:', err.message);
            });
            this.setSubagentSubscription('progress').catch((err) => {
              console.warn('[OmpBridge] set_subagent_subscription unavailable:', err.message);
            });
            this.refreshSubagentsOnDemand().catch((err) => {
              console.warn('[OmpBridge] get_subagents sync unavailable:', err.message);
            });
            this.registerHostTools().catch((err) => {
              console.warn('[OmpBridge] set_host_tools unavailable:', err.message);
            });
            this.setHostUriSchemes(this.hostUriRouter.getSchemes()).catch((err) => {
              console.warn('[OmpBridge] set_host_uri_schemes unavailable:', err.message);
            });
            if (this.settingsStore) {
              const s = this.settingsStore.get();
              if (s.defaultThinkingLevel && s.defaultThinkingLevel !== 'off') {
                this.setThinkingLevel(s.defaultThinkingLevel).catch(() => {});
              }
              if (s.autoCompaction !== undefined && s.autoCompaction === true) {
                this.setAutoCompaction(s.autoCompaction).catch(() => {});
              }
              if (s.steeringMode) {
                this.setSteeringMode(s.steeringMode).catch(() => {});
              }
              if (s.followUpMode) {
                this.setFollowUpMode(s.followUpMode).catch(() => {});
              }
              if (s.interruptMode) {
                this.setInterruptMode(s.interruptMode).catch(() => {});
              }
              if (s.autoRetry !== undefined) {
                this.setAutoRetry(s.autoRetry).catch(() => {});
              }
              if (s.fastMode !== undefined) {
                this.setFastMode(s.fastMode).catch(() => {});
              }
            }
          } else {
            console.error('[OmpBridge] Protocol negotiation failed:', res.error);
            this.emitNotification(tm('electron.bridge.negotiationFailed'), 'error');
            this.cleanupProcess();
            this.handshakePromise?.resolve({ success: false });
          }
        })
        .catch((err) => {
          console.error('[OmpBridge] Protocol negotiation timeout or error:', err.message);
          this.emitNotification(tm('electron.bridge.negotiationTimeout'), 'error');
          this.cleanupProcess();
          this.handshakePromise?.resolve({ success: false });
        });
      return;
    }

    // 3. Correlated command response
    const frameId = typeof frame.id === 'string' ? frame.id : (typeof (frame as any).id === 'number' ? String((frame as any).id) : null);
    if (frame.type === 'response' && frameId && this.pendingCommands.has(frameId)) {
      const pending = this.pendingCommands.get(frameId)!;
      this.pendingCommands.delete(frameId);
      pending.resolve(frame as ResponseFrame);
      return;
    }


    // Host Tool Execution Inbound Frames (Phase 17 & 18)
    if (frame.type === 'host_tool_call') {
      const callFrame = frame as any;
      const callId = callFrame.id as string;
      const toolCallId = callFrame.toolCallId as string;
      const toolName = callFrame.toolName as string;
      const args = callFrame.arguments || {};

      const abortController = new AbortController();
      this.activeHostToolCalls.set(callId, abortController);

      this.hostToolRegistry
        .executeTool(toolName, args, {
          toolCallId,
          signal: abortController.signal,
        })
        .then((res) => {
          if (!this.process || !this.process.stdin?.writable) return;
          const rawContent = res.content;
          const safeContent = Array.isArray(rawContent)
            ? rawContent.map((c) => (c && typeof c === 'object' ? c : { type: 'text', text: String(c) }))
            : [{ type: 'text', text: String(rawContent ?? '') }];
          const replyFrame: HostToolResultFrame = {
            type: 'host_tool_result',
            id: callId,
            result: {
              content: safeContent,
              details: res.details || {},
            },
            isError: Boolean(res.isError),
          };
          this.writeFrame(replyFrame);
        })
        .catch((err) => {
          if (!this.process || !this.process.stdin?.writable) return;
          const replyFrame: HostToolResultFrame = {
            type: 'host_tool_result',
            id: callId,
            result: {
              content: [{ type: 'text', text: err?.message || String(err) }],
              details: {},
            },
            isError: true,
          };
          this.writeFrame(replyFrame);
        })
        .finally(() => {
          this.activeHostToolCalls.delete(callId);
        });

      return;
    }

    if (frame.type === 'host_tool_cancel') {
      const cancelFrame = frame as any;
      const targetId = cancelFrame.targetId as string;
      if (targetId && this.activeHostToolCalls.has(targetId)) {
        this.activeHostToolCalls.get(targetId)!.abort();
        this.activeHostToolCalls.delete(targetId);
      }
      return;
    }

    if (frame.type === 'host_uri_request') {
      this.handleHostUriRequest(frame as HostUriRequestEvent);
      return;
    }

    if (frame.type === 'host_uri_cancel') {
      const targetId = (frame as any).targetId as string;
      if (targetId && this.activeHostUriRequests.has(targetId)) {
        this.activeHostUriRequests.get(targetId)!.abort();
        this.activeHostUriRequests.delete(targetId);
      }
      return;
    }
    // 4. Extension UI Requests (Interactive, Cancel, Legacy, and Fire-and-forget)
    if (frame.type === 'extension_ui_request') {
      const reqEvent = frame as ExtensionUiRequestEvent;
      const reqId = (reqEvent.id || reqEvent.requestId || '') as string;
      const method = (reqEvent.method || '') as string;
      if (method === 'open_url') {
        const raw = reqEvent as Record<string, unknown>;
        const url = typeof reqEvent.url === 'string' ? reqEvent.url : typeof raw.url === 'string' ? (raw.url as string) : '';
        if (this.activeAuthLogin) {
          if (this.activeAuthLogin.isCancelled) {
            return;
          }
          if (url && this.openUrlHandler) {
            this.openUrlHandler(url)
              .then(() => {
                if (this.activeAuthLogin && !this.activeAuthLogin.isCancelled) {
                  this.emitAuthLoginEvent({
                    providerId: this.activeAuthLogin.providerId,
                    status: 'awaiting-browser',
                    url,
                  });
                }
              })
              .catch((err) => {
                const msg = err instanceof Error ? err.message : String(err);
                console.error('[OmpBridge] Error opening OAuth browser:', msg);
                if (this.activeAuthLogin && !this.activeAuthLogin.isCancelled) {
                  const provId = this.activeAuthLogin.providerId;
                  this.activeAuthLogin = null;
                  this.emitAuthLoginEvent({
                    providerId: provId,
                    status: 'error',
                    message: tm('electron.bridge.cannotOpenBrowser', { detail: msg }),
                  });
                }
              });
          } else {
            this.emitAuthLoginEvent({
              providerId: this.activeAuthLogin.providerId,
              status: 'awaiting-browser',
              url,
            });
          }
        } else if (url && this.openUrlHandler) {
          this.openUrlHandler(url).catch((err) => {
            console.error('[OmpBridge] Error opening browser:', err);
          });
        }
        return;
      }

      // A. Interactive Methods: select, confirm, input, editor
      if (method === 'select' || method === 'confirm' || method === 'input' || method === 'editor') {
        // If in OAuth login flow and engine asks for code input -> route separately
        if (this.activeAuthLogin && method === 'input') {
          if (this.activeAuthLogin.isCancelled) {
            this.respondUiRequest(reqId, { cancelled: true });
            return;
          }
          this.activeAuthLogin.pendingInputReqId = reqId;
          this.emitAuthLoginEvent({
            providerId: this.activeAuthLogin.providerId,
            status: 'awaiting-browser',
            message: reqEvent.title || reqEvent.message,
          });
          return;
        }
        const isToolApproval =
          method === 'select' &&
          Array.isArray(reqEvent.options) &&
          reqEvent.options.length === 2 &&
          reqEvent.options[0] === 'Approve' &&
          reqEvent.options[1] === 'Deny';


        const uiReq: OmpUiRequest = {
          id: reqId,
          method,
          title: reqEvent.title || '',
          message: reqEvent.message,
          options: reqEvent.options,
          optionDetails: reqEvent.optionDetails,
          placeholder: reqEvent.placeholder,
          prefill: reqEvent.prefill,
          timeout: reqEvent.timeout,
          isToolApproval,
        };

        this.pendingUiRequests.set(reqId, uiReq);
        this.setStatus('waiting_permission');

        this.emit('omp:ui-request', uiReq);
        return;
      }

      // B. Engine Cancel Request: cancel targetId
      if (method === 'cancel') {
        const targetId = (reqEvent.targetId || '') as string;
        if (this.pendingUiRequests.has(targetId)) {
          this.pendingUiRequests.delete(targetId);
        }
        if (this.activeAuthLogin && this.activeAuthLogin.pendingInputReqId === targetId) {
          this.activeAuthLogin.pendingInputReqId = undefined;
        }
        if (this.pendingUiRequests.size === 0 && this.status === 'waiting_permission') {
          this.setStatus(this.currentTurnId ? 'thinking' : 'idle');
        }
        this.emit('omp:ui-request-cancel', targetId);
        return;
      }

      // C. Legacy Permission Request fallback (warp/telemetry fallback)
      if (method === 'permission_request' || method === 'request_permission') {
        const params = (reqEvent.params || {}) as Record<string, any>;
        const req: PermissionRequest = {
          id: reqId,
          toolName: params.toolName || params.name || 'tool',
          description: params.description || '',
          command: params.command,
          targetFile: params.targetFile || params.path,
          dangerous: params.dangerous ?? true,
        };
        this.setStatus('waiting_permission');
        this.emit('omp:permission-request', req);
        return;
      }

      // D. Fire-and-forget forwarding (notify, setStatus, setWidget, setTitle, set_editor_text, etc.)
      // NO reply is sent to stdin (Decision E2), already logged to frameLogger.
      const raw = reqEvent as Record<string, unknown>;
      if (method === 'notify') {
        const notif: OmpNotification = {
          id: reqId || this.generateId(),
          message: typeof raw.message === 'string' ? raw.message : typeof raw.text === 'string' ? raw.text : '',
          notifyType: typeof raw.notifyType === 'string' ? raw.notifyType : typeof raw.level === 'string' ? raw.level : 'info',
          timestamp: Date.now(),
        };
        this.emit('omp:notification', notif);
        return;
      }

      if (method === 'setStatus') {
        const statusKey = typeof raw.statusKey === 'string' ? raw.statusKey : typeof raw.key === 'string' ? raw.key : 'default';
        const statusText = typeof raw.statusText === 'string' ? raw.statusText : typeof raw.text === 'string' ? raw.text : '';
        if (!statusText || !statusText.trim()) {
          this.engineStatuses.delete(statusKey);
        } else {
          this.engineStatuses.set(statusKey, statusText);
        }
        this.emit('omp:engine-status', this.getEngineStatuses());
        return;
      }

      if (method === 'setWidget') {
        const widgetKey = typeof raw.widgetKey === 'string' ? raw.widgetKey : typeof raw.key === 'string' ? raw.key : 'default';
        const widgetLines = Array.isArray(raw.widgetLines)
          ? (raw.widgetLines as string[])
          : Array.isArray(raw.lines)
            ? (raw.lines as string[])
            : [];
        const widgetPlacement = typeof raw.widgetPlacement === 'string' ? raw.widgetPlacement : typeof raw.placement === 'string' ? raw.placement : undefined;
        if (!widgetLines || widgetLines.length === 0) {
          this.engineWidgets.delete(widgetKey);
        } else {
          this.engineWidgets.set(widgetKey, { lines: widgetLines, placement: widgetPlacement });
        }
        this.emit('omp:widget-update', this.getEngineWidgets());
        return;
      }

      if (method === 'setTitle') {
        const title = typeof raw.title === 'string' ? raw.title : '';
        if (title) {
          this.getState().catch(() => {});
        }
        return;
      }

      return;
    }
    if ((frame as any).role === 'fileMention') {
      const rawFiles = Array.isArray((frame as any).files) ? (frame as any).files : [];
      const files = rawFiles.map((f: any) => {
        const filePath = String(f.path || f.relativePath || '');
        const fileName = f.name || (filePath ? filePath.split('/').pop() : '');
        const lineCount =
          typeof f.lineCount === 'number'
            ? f.lineCount
            : typeof f.content === 'string'
            ? f.content.split('\n').length
            : undefined;
        return {
          path: filePath,
          name: fileName,
          lineCount,
        };
      });

      const chatMessage: ChatMessage = {
        id: `msg-file-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
        role: 'fileMention',
        content: '',
        files,
        timestamp:
          typeof (frame as any).timestamp === 'number'
            ? (frame as any).timestamp
            : Date.now(),
      };
      this.emit('omp:message-complete', chatMessage);
      return;
    }

    // 5. Status mapping & Stream Translation events (maintaining stable contract with Renderer)
    switch (frame.type) {
      case 'agent_start':
        this.thinkingAccumulator.reset();
        this.activeToolCalls.clear();
        this.writeSnapshots.clear();
        break;

      case 'turn_start':
        this.currentTurnId = (frame as TurnStartEvent).turnId || String(Date.now());
        this.setStatus('thinking');
        if (this.retryState.isRetrying) {
          this.retryState = { isRetrying: false };
          this.emit('omp:retry-state', this.retryState);
        }
        break;

      case 'tool_execution_start': {
        const startFrame = frame as ToolExecutionStartEvent;
        const toolCallId = startFrame.toolCallId || String(startFrame.id || Date.now());
        const toolName = startFrame.toolName || 'tool';
        const params = (startFrame.args || {}) as Record<string, any>;

        const toolCall: ToolCall = {
          id: toolCallId,
          name: toolName,
          params,
          status: 'running',
          startTime: Date.now(),
        };

        this.activeToolCalls.set(toolCallId, toolCall);
        this.setStatus('executing_tool');

        // Capture snapshot before write tool execution (Decision D2)
        // Skip virtual URIs like xd:// when capturing file snapshot
        if (toolName === 'write' && params.path && typeof params.path === 'string' && !params.path.includes('://')) {
          const filePath = path.isAbsolute(params.path)
            ? params.path
            : path.resolve(this.workspacePath || process.cwd(), params.path);
          try {
            if (fs.existsSync(filePath) && fs.statSync(filePath).isFile()) {
              const snapshot = fs.readFileSync(filePath, 'utf-8');
              this.writeSnapshots.set(toolCallId, snapshot);
            } else {
              this.writeSnapshots.set(toolCallId, null);
            }
          } catch {
            this.writeSnapshots.set(toolCallId, null);
          }
        }

        this.emit('omp:tool-call', toolCall);
        break;
      }

      case 'tool_execution_update': {
        const updateFrame = frame as ToolExecutionUpdateEvent;
        const toolCallId = updateFrame.toolCallId || String(updateFrame.id || '');
        let toolCall = this.activeToolCalls.get(toolCallId);
        if (!toolCall) {
          toolCall = {
            id: toolCallId,
            name: updateFrame.toolName || 'tool',
            params: (updateFrame.args || {}) as Record<string, any>,
            status: 'running',
            startTime: Date.now(),
          };
          this.activeToolCalls.set(toolCallId, toolCall);
        }

        if (updateFrame.partialResult) {
          const partialText = updateFrame.partialResult.content?.[0]?.text;
          toolCall.result = {
            ...(typeof toolCall.result === 'object' && toolCall.result !== null ? toolCall.result : {}),
            partial: partialText,
            details: updateFrame.partialResult.details,
          };
          this.applyTodosFromToolResult(updateFrame.toolName || toolCall.name, {
            details: updateFrame.partialResult.details,
          });
          this.emit('omp:tool-call', toolCall);
        }
        break;
      }

      case 'tool_execution_end': {
        const endFrame = frame as ToolExecutionEndEvent;
        const toolCallId = endFrame.toolCallId || String(endFrame.id || '');
        let toolCall = this.activeToolCalls.get(toolCallId);
        if (!toolCall) {
          toolCall = {
            id: toolCallId,
            name: endFrame.toolName || 'tool',
            params: {},
            status: 'running',
            startTime: Date.now(),
          };
          this.activeToolCalls.set(toolCallId, toolCall);
        }

        toolCall.status = endFrame.isError ? 'failed' : 'completed';
        toolCall.endTime = Date.now();
        if (endFrame.isError) {
          const resultContent = (endFrame.result as any)?.content?.[0]?.text;
          toolCall.error =
            typeof endFrame.error === 'string'
              ? endFrame.error
              : (resultContent || (endFrame.error ? JSON.stringify(endFrame.error) : 'Tool execution failed'));
        }
        toolCall.result = endFrame.result;

        if (!endFrame.isError) {
          this.applyTodosFromToolResult(endFrame.toolName || toolCall.name, endFrame.result);
        }

        this.emit('omp:tool-call', toolCall);

        this.setStatus('thinking');

        if (!endFrame.isError) {
          const diffItems = this.extractFileDiffs(endFrame, toolCall);
          for (const diffItem of diffItems) {
            this.emit('omp:diff-generated', diffItem);
          }
        }

        this.writeSnapshots.delete(toolCallId);
        break;
      }

      case 'message_start':
        if ((frame as any).role === 'assistant' || (frame as any).message?.role === 'assistant') {
          this.setStatus('streaming');
        }
        break;

      case 'message_update': {
        const updateFrame = frame as MessageUpdateEvent;
        const ame = updateFrame.assistantMessageEvent;
        if (ame) {
          if (ame.type === 'text_start' || ame.type === 'text_delta' || ame.type === 'text_end') {
            if (this.status !== 'streaming') {
              this.setStatus('streaming');
            }
            if (ame.type === 'text_delta' && typeof ame.delta === 'string') {
              this.emit('omp:stream-token', ame.delta);
            }
          } else if (
            ame.type === 'thinking_start' ||
            ame.type === 'thinking_delta' ||
            ame.type === 'thinking_end'
          ) {
            if (this.status !== 'thinking') {
              this.setStatus('thinking');
            }
            const res = this.thinkingAccumulator.handleEvent(
              ame,
              this.currentTurnId || String(Date.now())
            );
            if (res) {
              this.emit('omp:thinking', res.block);
            }
          }
        }
        break;
      }

      case 'message_end': {
        const endFrame = frame as MessageEndEvent;
        const msg = endFrame.message as AgentMessage | undefined;
        if (msg && msg.role === 'fileMention') {
          const rawFiles = Array.isArray((msg as any).files) ? (msg as any).files : [];
          const files = rawFiles.map((f: any) => {
            const filePath = String(f.path || f.relativePath || '');
            const fileName = f.name || (filePath ? filePath.split('/').pop() : '');
            const lineCount =
              typeof f.lineCount === 'number'
                ? f.lineCount
                : typeof f.content === 'string'
                ? f.content.split('\n').length
                : undefined;
            return {
              path: filePath,
              name: fileName,
              lineCount,
            };
          });
          const chatMessage: ChatMessage = {
            id: `msg-file-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
            role: 'fileMention',
            content: '',
            files,
            timestamp:
              typeof msg.completedAt === 'number'
                ? msg.completedAt
                : typeof msg.timestamp === 'number'
                ? msg.timestamp
                : Date.now(),
          };
          this.emit('omp:message-complete', chatMessage);
        } else
        if (msg && msg.role === 'assistant') {
          const textParts: string[] = [];
          if (Array.isArray(msg.content)) {
            for (const block of msg.content) {
              if (block && typeof block === 'object' && 'text' in block) {
                const textVal = block.text;
                if (typeof textVal === 'string' && textVal.length > 0) {
                  textParts.push(textVal);
                }
              }
            }
          } else if (msg && typeof msg === 'object' && 'content' in msg && typeof msg.content === 'string') {
            textParts.push(msg.content);
          }

          const hasErrorProp = Boolean(msg && typeof msg === 'object' && 'error' in msg && msg.error);
          const hasErrMsgProp = Boolean(msg && typeof msg === 'object' && 'errorMessage' in msg && msg.errorMessage);
          const isError = msg.stopReason === 'error' || Boolean(msg.isError) || hasErrorProp || hasErrMsgProp;
          let errorMessage: string | undefined;
          if (msg && typeof msg === 'object') {
            if ('errorMessage' in msg && typeof msg.errorMessage === 'string') {
              errorMessage = msg.errorMessage;
            } else if ('error' in msg) {
              if (typeof msg.error === 'string') {
                errorMessage = msg.error;
              } else if (msg.error && typeof msg.error === 'object' && 'message' in msg.error && typeof msg.error.message === 'string') {
                errorMessage = msg.error.message;
              }
            }
          }
          if (!errorMessage && isError) {
            errorMessage = 'API error occurred';
          }
          const stopReason = msg.stopReason || (isError ? 'error' : null);
          if (textParts.length > 0 || isError) {
            const fullText = textParts.join('\n');
            const chatMessage: ChatMessage = {
              id: `msg-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
              role: 'assistant',
              content: fullText,
              timestamp: typeof msg.completedAt === 'number'
                ? msg.completedAt
                : (typeof msg.timestamp === 'number' ? msg.timestamp : Date.now()),
              stopReason,
              errorMessage,
              isError: Boolean(isError),
            };
            this.emit('omp:message-complete', chatMessage);
          }
        }
        break;
      }
      case 'fileMention': {
        const rawFiles = Array.isArray((frame as any).files) ? (frame as any).files : [];
        const files = rawFiles.map((f: any) => {
          const filePath = String(f.path || f.relativePath || '');
          const fileName = f.name || (filePath ? filePath.split('/').pop() : '');
          const lineCount =
            typeof f.lineCount === 'number'
              ? f.lineCount
              : typeof f.content === 'string'
              ? f.content.split('\n').length
              : undefined;
          return {
            path: filePath,
            name: fileName,
            lineCount,
          };
        });

        const chatMessage: ChatMessage = {
          id: `msg-file-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
          role: 'fileMention',
          content: '',
          files,
          timestamp:
            typeof (frame as any).timestamp === 'number'
              ? (frame as any).timestamp
              : Date.now(),
        };

        this.emit('omp:message-complete', chatMessage);
        break;
      }

      case 'turn_end':
        this.setStatus('idle');
        for (const tc of this.activeToolCalls.values()) {
          if (tc.status === 'running') {
            tc.status = tc.error ? 'failed' : 'completed';
            tc.endTime = Date.now();
            this.emit('omp:tool-call', tc);
          }
        }
        if (this.retryState.isRetrying) {
          this.retryState = { isRetrying: false };
            this.emit('omp:retry-state', this.retryState);
        }
        break;

      case 'agent_end':
        this.setStatus('idle');
        this.thinkingAccumulator.reset();
        for (const tc of this.activeToolCalls.values()) {
          if (tc.status === 'running') {
            tc.status = tc.error ? 'failed' : 'completed';
            tc.endTime = Date.now();
            this.emit('omp:tool-call', tc);
          }
        }
        this.activeToolCalls.clear();
        this.writeSnapshots.clear();
        for (const id of this.pendingUiRequests.keys()) {
            this.emit('omp:ui-request-cancel', id);
        }
        this.pendingUiRequests.clear();
        this.getState().catch(() => {});
        break;

      case 'abort':
        this.setStatus('idle');
        this.thinkingAccumulator.reset();
        this.activeToolCalls.clear();
        this.writeSnapshots.clear();
        for (const id of this.pendingUiRequests.keys()) {
          this.emit('omp:ui-request-cancel', id);
        }
        this.pendingUiRequests.clear();
        break;

      case 'subagent_lifecycle': {
        const lifecycleFrame = frame as SubagentLifecycleEvent;
        const payload = (lifecycleFrame.payload || lifecycleFrame) as any;
        const subagentId = payload.id || lifecycleFrame.subagentId || payload.subagentId;
        if (!subagentId) break;

        const status = String(payload.status || payload.state || '').toLowerCase();
        const isTerminal = status !== 'started' && status !== 'running';

        if (isTerminal) {
          if (this.activeSubagents.has(subagentId)) {
            this.activeSubagents.delete(subagentId);
            this.emitSubagentUpdate();
          }
        } else {
          const existing = this.activeSubagents.get(subagentId);
          const entry: OmpSubagentInfo = {
            id: subagentId,
            index: typeof payload.index === 'number' ? payload.index : existing?.index,
            agent: payload.agent || existing?.agent || 'task',
            description: payload.description || existing?.description,
            status: payload.status || 'started',
            task: payload.task || existing?.task,
            sessionFile: payload.sessionFile || existing?.sessionFile,
            progressText: existing?.progressText,
            lastUpdate: Date.now(),
          };
          this.activeSubagents.set(subagentId, entry);
          this.emitSubagentUpdate();
        }
        break;
      }

      case 'subagent_progress': {
        const progressFrame = frame as SubagentProgressEvent;
        const payload = (progressFrame.payload || progressFrame) as any;
        const progressObj = payload.progress || {};
        const subagentId = progressObj.id || payload.id || progressFrame.subagentId || payload.subagentId;
        if (!subagentId) break;

        const status = String(progressObj.status || payload.status || payload.state || 'running').toLowerCase();
        const isTerminal = status !== 'started' && status !== 'running';

        if (isTerminal) {
          if (this.activeSubagents.has(subagentId)) {
            this.activeSubagents.delete(subagentId);
            this.emitSubagentUpdate();
          }
        } else {
          const existing = this.activeSubagents.get(subagentId);
          const progressText =
            progressObj.description ||
            progressObj.lastIntent ||
            progressObj.status ||
            payload.task ||
            existing?.progressText ||
            'running';

          const entry: OmpSubagentInfo = {
            id: subagentId,
            index: typeof progressObj.index === 'number' ? progressObj.index : (typeof payload.index === 'number' ? payload.index : existing?.index),
            agent: progressObj.agent || payload.agent || existing?.agent || 'task',
            description: progressObj.description || payload.task || existing?.description,
            status: progressObj.status || payload.status || existing?.status || 'running',
            task: progressObj.task || payload.task || existing?.task,
            sessionFile: payload.sessionFile || progressObj.sessionFile || existing?.sessionFile,
            progressText,
            lastUpdate: Date.now(),
          };
          this.activeSubagents.set(subagentId, entry);
          this.emitSubagentUpdate();
        }
        break;
      }

      case 'available_commands_update': {
        const cmdFrame = frame as AvailableCommandsUpdateEvent;
        const rawCommands = (cmdFrame.commands || (cmdFrame as any).data?.commands) as OmpCommandInfo[];
        if (Array.isArray(rawCommands)) {
          this.availableCommands = rawCommands;
          this.emitCommandsUpdate();
        }
        break;
      }

      case 'command_output': {
        const outFrame = frame as CommandOutputEvent;
        const text = typeof outFrame.text === 'string' ? outFrame.text : (typeof (outFrame as any).output === 'string' ? (outFrame as any).output : '');
        const id = typeof outFrame.id === 'string' ? outFrame.id : (typeof (outFrame as any).commandId === 'string' ? (outFrame as any).commandId : undefined);
        this.emit('omp:command-output', { text, id });
        this.emit('omp:bash-output', { text, id });
        break;
      }

      case 'session_info_update': {
        const sessFrame = frame as SessionInfoUpdateEvent;
        const title = typeof sessFrame.title === 'string' ? sessFrame.title : undefined;
        const sessionId = typeof sessFrame.sessionId === 'string' ? sessFrame.sessionId : undefined;
        if (title) {
          this.sessionName = title;
        }
        if (sessionId) {
          this.currentSessionId = sessionId;
        }
        this.emit('omp:context-usage', {
          contextUsage: this.lastContextUsage,
          tokensPerSecond: this.lastTokensPerSecond,
          sessionName: this.sessionName,
        });
        this.getState().catch(() => {});
        break;
      }

      case 'config_update': {
        this.getState().catch(() => {});
        break;
      }

      case 'todos': {
        const todosFrame = frame as TodosEvent;
        const dataRecord = typeof todosFrame.data === 'object' && todosFrame.data !== null ? (todosFrame.data as Record<string, unknown>) : undefined;
        const rawPhases = (todosFrame.phases || todosFrame.todoPhases || (dataRecord?.phases as OmpTodoPhase[] | undefined) || (dataRecord?.todoPhases as OmpTodoPhase[] | undefined)) as OmpTodoPhase[] | undefined;
        const rawTodos = (todosFrame.todos || todosFrame.items || (dataRecord?.todos as OmpTodoItem[] | undefined) || (dataRecord?.items as OmpTodoItem[] | undefined)) as OmpTodoItem[] | undefined;
        this.normalizeAndSetTodos(rawPhases, rawTodos);
        break;
      }

      case 'todo_reminder': {
        const reminderFrame = frame as TodoReminderEvent;
        const rawTodos = reminderFrame.todos;
        if (Array.isArray(rawTodos) && !this.mergeTodoStatuses(rawTodos)) {
          this.normalizeAndSetTodos(undefined, rawTodos);
        }
        break;
      }
      case 'auto_retry_start': {
        const retryFrame = frame as AutoRetryStartEvent;
        const attempt = typeof retryFrame.attempt === 'number' ? retryFrame.attempt : 1;
        const maxAttempts = typeof retryFrame.maxAttempts === 'number' ? retryFrame.maxAttempts : undefined;
        const delayMs = typeof retryFrame.delayMs === 'number' ? retryFrame.delayMs : undefined;
        const error = typeof retryFrame.error === 'string' ? retryFrame.error : undefined;
        this.retryState = {
          isRetrying: true,
          attempt,
          maxAttempts,
          delayMs,
          error,
        };
        this.emit('omp:retry-state', this.retryState);
        break;
      }

      case 'auto_retry_end': {
        const retryEndFrame = frame as AutoRetryEndEvent;
        this.retryState = {
          isRetrying: false,
          success: retryEndFrame.success,
          attempt: retryEndFrame.attempt,
          error: retryEndFrame.error,
        };
        this.emit('omp:retry-state', this.retryState);
        break;
      }
    }
  }

  private countDiffStats(
    diffText?: string,
    originalContent?: string,
    modifiedContent?: string
  ): { additions: number; deletions: number } {
    if (typeof diffText === 'string' && diffText.trim().length > 0) {
      let additions = 0;
      let deletions = 0;
      const lines = diffText.split('\n');
      for (const line of lines) {
        if (line.startsWith('+') && !line.startsWith('+++')) {
          additions++;
        } else if (line.startsWith('-') && !line.startsWith('---')) {
          deletions++;
        }
      }
      return { additions, deletions };
    }

    const origLines = originalContent && originalContent.length > 0 ? originalContent.split('\n').length : 0;
    const modLines = modifiedContent && modifiedContent.length > 0 ? modifiedContent.split('\n').length : 0;
    return {
      additions: modLines,
      deletions: origLines,
    };
  }

  private extractFileDiffs(frame: ToolExecutionEndEvent, toolCall?: ToolCall): FileDiffItem[] {
    if (frame.isError) {
      return [];
    }

    const toolName = frame.toolName || toolCall?.name;
    const toolCallId = frame.toolCallId || toolCall?.id || String(Date.now());
    const baseDir = this.workspacePath || process.cwd();

    // 1. Tool: 'edit'
    if (toolName === 'edit') {
      const details = (frame.result as any)?.details as EditToolResultDetails | undefined;
      if (!details) {
        return [];
      }

      const diffItems: FileDiffItem[] = [];

      // Multi-file results (perFileResults)
      if (Array.isArray(details.perFileResults) && details.perFileResults.length > 0) {
        details.perFileResults.forEach((entry, idx) => {
          if (!entry || entry.snapshotsPruned) {
            if (entry?.snapshotsPruned) {
              console.log(`[OmpBridge] Edit snapshots pruned (>32KB), skipping diff item for ${entry.path}`);
            }
            return;
          }

          const rawPath = entry.path;
          if (!rawPath || (typeof rawPath === 'string' && rawPath.includes('://'))) return;

          const isDelete = entry.op === 'delete';
          if (!isDelete && !entry.diff && entry.oldText == null && entry.newText == null) {
            // Noop edit
            return;
          }

          const originalContent = entry.oldText ?? '';
          const modifiedContent = isDelete ? '' : (entry.newText ?? '');
          if (!isDelete && entry.oldText == null && entry.newText == null) {
            return;
          }

          const filePath = path.isAbsolute(rawPath) ? rawPath : path.resolve(baseDir, rawPath);
          const relativePath = this.workspacePath ? path.relative(this.workspacePath, filePath) : rawPath;
          const stats = this.countDiffStats(entry.diff, originalContent, modifiedContent);

          diffItems.push({
            id: `diff-${toolCallId}-${idx}-${Date.now()}`,
            filePath,
            relativePath,
            originalContent,
            modifiedContent,
            status: 'pending',
            additions: stats.additions,
            deletions: stats.deletions,
            op: (entry.op as any) || (isDelete ? 'delete' : 'update'),
          });
        });

        return diffItems;
      }

      // Single file edit
      if (details.snapshotsPruned) {
        console.log(`[OmpBridge] Edit snapshots pruned (>32KB), skipping diff item for ${details.path}`);
        return [];
      }

      const rawPath = details.path || (toolCall?.params?.path as string) || ((frame as any).args?.path as string);
      if (!rawPath || (typeof rawPath === 'string' && rawPath.includes('://'))) return [];

      const isDelete = details.op === 'delete';
      if (!isDelete && !details.diff && details.oldText == null && details.newText == null) {
        // Noop edit
        return [];
      }

      const originalContent = details.oldText ?? '';
      const modifiedContent = isDelete ? '' : (details.newText ?? '');
      if (!isDelete && details.oldText == null && details.newText == null) {
        return [];
      }

      const filePath = path.isAbsolute(rawPath) ? rawPath : path.resolve(baseDir, rawPath);
      const relativePath = this.workspacePath ? path.relative(this.workspacePath, filePath) : rawPath;
      const stats = this.countDiffStats(details.diff, originalContent, modifiedContent);

      return [
        {
          id: `diff-${toolCallId}-${Date.now()}`,
          filePath,
          relativePath,
          originalContent,
          modifiedContent,
          status: 'pending',
          additions: stats.additions,
          deletions: stats.deletions,
          op: (details.op as any) || (isDelete ? 'delete' : 'update'),
        },
      ];
    }

    // 2. Tool: 'write'
    if (toolName === 'write') {
      const args = (toolCall?.params || (frame as any).args || {}) as Record<string, any>;
      const details = (frame.result as any)?.details as Record<string, any> | undefined;
      const rawPath = (details?.resolvedPath as string) || (args?.path as string);
      if (!rawPath || (typeof rawPath === 'string' && rawPath.includes('://'))) return [];

      const filePath = path.isAbsolute(rawPath) ? rawPath : path.resolve(baseDir, rawPath);
      const relativePath = this.workspacePath ? path.relative(this.workspacePath, filePath) : (args?.path || rawPath);

      const snapshot = this.writeSnapshots.has(toolCallId) ? this.writeSnapshots.get(toolCallId) : null;
      const newContent = typeof args.content === 'string' ? args.content : '';

      let originalContent = snapshot ?? '';
      let op: 'update' | 'create' = snapshot != null ? 'update' : 'create';

      // Race check (D2): if snapshot === newContent, snapshot was captured after engine write, treat as create
      if (snapshot !== null && snapshot === newContent) {
        originalContent = '';
        op = 'create';
      }

      const stats = this.countDiffStats('', originalContent, newContent);

      const diffItem: FileDiffItem = {
        id: `diff-${toolCallId}-${Date.now()}`,
        filePath,
        relativePath,
        originalContent,
        modifiedContent: newContent,
        status: 'pending',
        additions: stats.additions,
        deletions: stats.deletions,
        op,
      };

      return [diffItem];
    }

    // 3. ast_edit, read, etc. -> No diff
    return [];
  }

  private writeFrame(frame: OmpOutboundFrame) {
    if (this.process && this.process.stdin?.writable) {
      this.frameLogger.log('out', frame);
      const encoded = this.framer.encode(frame);
      this.process.stdin.write(encoded);
    }
  }

  private handleProcessExit(code: number | null) {
    this.cleanupProcess();
    if (this.handshakePromise) {
      this.handshakePromise.resolve({ success: false });
    }
  }

  // Wait for process to exit; force SIGKILL on timeout
  private waitForProcessExit(proc: ChildProcess, timeoutMs: number): Promise<void> {
    return new Promise((resolve) => {
      if (proc.exitCode !== null || proc.signalCode !== null) {
        resolve();
        return;
      }
      const timer = setTimeout(() => {
        try {
          proc.kill('SIGKILL');
        } catch {
          // Ignored
        }
        resolve();
      }, timeoutMs);
      proc.once('close', () => {
        clearTimeout(timer);
        resolve();
      });
    });
  }

  private cleanupProcess() {
    if (this.process) {
      try {
        if (!this.process.killed) {
          this.process.kill('SIGTERM');
        }
      } catch {
        // Ignored
      }
      this.process = null;
    }
    this.lifecycleState = 'idle';
    this.setStatus('idle');
    this.rejectAllPending('OMP process terminated');
    this.thinkingAccumulator.reset();
    this.activeToolCalls.clear();
    for (const controller of this.activeHostToolCalls.values()) controller.abort();
    this.activeHostToolCalls.clear();
    for (const controller of this.activeHostUriRequests.values()) controller.abort();
    this.activeHostUriRequests.clear();
    this.writeSnapshots.clear();
    for (const id of this.pendingUiRequests.keys()) {
      this.emit('omp:ui-request-cancel', id);
    }
    this.pendingUiRequests.clear();
    if (this.activeAuthLogin) {
      const { providerId } = this.activeAuthLogin;
      this.activeAuthLogin = null;
      this.emitAuthLoginEvent({ providerId, status: 'error', message: tm('electron.bridge.processStopped') });
    }
    this.activeSubagents.clear();
    this.emitSubagentUpdate();
    this.availableCommands = [];
    this.emitCommandsUpdate();
    this.currentTodoPhases = [];
    this.currentTodos = [];
    this.emitTodosUpdate();
    this.sessionName = undefined;
    this.lastContextUsage = null;
    this.lastTokensPerSecond = null;
    this.clearEngineStatusesAndWidgets();
    this.emit('omp:context-usage', {
      contextUsage: null,
      tokensPerSecond: null,
      sessionName: undefined,
    });
    this.currentSessionFile = null;
    this.currentSessionId = null;
    this.workspacePath = null;
    this.currentTurnId = null;
    this.framer.reset();
    this.retryState = { isRetrying: false };
    this.emit('omp:retry-state', this.retryState);
  }

  private rejectAllPending(reason: string) {
    for (const [id, pending] of this.pendingCommands.entries()) {
      clearTimeout(pending.timer);
      pending.reject(new Error(`${reason} (command: ${pending.command}, id: ${id})`));
    }
    this.pendingCommands.clear();
  }

  private generateId(): string {
    this.commandCounter = (this.commandCounter + 1) % 1000000;
    return `req_${Date.now()}_${this.commandCounter}`;
  }

  // Simulated agent responses fallback
  private simulateAgentFlow(prompt: string, context?: { files?: string[] }) {
    this.setStatus('thinking');

    setTimeout(() => {
      const thinking: ThinkingBlock = {
        id: 'think-' + Date.now(),
        thought: tm('electron.bridge.mockThought', { prompt }),
        timestamp: Date.now(),
        completed: true,
      };
      this.emit('omp:thinking', thinking);

      this.setStatus('executing_tool');
      const tool1: ToolCall = {
        id: 'tool-1',
        name: 'tree_sitter_ast_query',
        params: { file: context?.files?.[0] || 'src/auth/service.ts', query: '(function_declaration)' },
        status: 'running',
        startTime: Date.now(),
      };
      this.emit('omp:tool-call', tool1);

      setTimeout(() => {
        tool1.status = 'completed';
        tool1.result = { matchedNodes: 3, rootSymbol: 'AuthService' };
        tool1.endTime = Date.now();
        this.emit('omp:tool-call', tool1);

        const mockOriginal = `export class AuthService {
  private secret: string;

  constructor() {
    this.secret = process.env.JWT_SECRET || 'dev_secret';
  }

  async validateUser(token: string) {
    // TODO: implement validation
    return null;
  }
}`;

        const mockModified = `export class AuthService {
  private secret: string;
  private tokenExpiry: number = 3600;

  constructor() {
    this.secret = process.env.JWT_SECRET || 'dev_secret';
  }

  /**
   * Validates JWT token and checks expiry
   */
  async validateUser(token: string) {
    if (!token) throw new Error('Token is required');
    try {
      const decoded = await jwt.verify(token, this.secret);
      return { valid: true, user: decoded };
    } catch (err) {
      return { valid: false, error: 'Invalid or expired token' };
    }
  }
}`;

        const diff: FileDiffItem = {
          id: 'diff-' + Date.now(),
          filePath: '/Users/nguyenkhoi/Project/src/auth/service.ts',
          relativePath: 'src/auth/service.ts',
          originalContent: mockOriginal,
          modifiedContent: mockModified,
          status: 'pending',
          additions: 12,
          deletions: 2,
        };
        this.emit('omp:diff-generated', diff);

        this.setStatus('streaming');
        const text = tm('electron.bridge.mockText');
        
        let index = 0;
        const interval = setInterval(() => {
          if (index < text.length) {
            this.emit('omp:stream-token', text.slice(index, index + 4));
            index += 4;
          } else {
            clearInterval(interval);
            this.setStatus('idle');
            this.emit('omp:message-complete', {
              id: 'msg-' + Date.now(),
              role: 'assistant',
              content: text,
              timestamp: Date.now(),
            });
          }
        }, 30);
      }, 900);
    }, 800);
  }
}
