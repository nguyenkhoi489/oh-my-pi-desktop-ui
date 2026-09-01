import { spawn, execSync, type ChildProcess } from 'child_process';
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
  OmpInstallStatus,
} from './types.ts';
import { NdjsonFramer } from './ndjson-framer.ts';
import { RpcFrameLogger } from './rpc-frame-logger.ts';
import type {
  OmpFrame,
  OmpInboundFrame,
  OmpOutboundFrame,
  OmpCommandFrame,
  ResponseFrame,
  NegotiateProtocolCommand,
  PromptCommand,
  ExtensionUiResponseCommand,
  ExtensionUiRequestEvent,
  GetAvailableModelsCommand,
  SetModelCommand,
  SetThinkingLevelCommand,
  GetStateCommand,
  OmpThinkingLevel,
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

export class OmpBridge {
  private process: ChildProcess | null = null;
  private window: BrowserWindow;
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
  
  private handshakePromise: {
    resolve: (val: { success: boolean; pid?: number }) => void;
    reject: (err: any) => void;
    timer: NodeJS.Timeout;
  } | null = null;

  private detectedPath: string | null = null;
  private customPath: string | null = null;
  private commandCounter: number = 0;

  constructor(window: BrowserWindow) {
    this.window = window;
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

  public getWorkspacePath(): string | null {
    return this.workspacePath;
  }

  public getLifecycleState(): BridgeLifecycleState {
    return this.lifecycleState;
  }

  public setCustomBinaryPath(rawPath: string) {
    let resolved = rawPath.trim();
    if (resolved.startsWith('~')) {
      resolved = path.join(os.homedir(), resolved.slice(1));
    }
    this.customPath = resolved;
    this.detectedPath = resolved;
  }

  public detectBinaryPath(): string | null {
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

    // 4. Query user's interactive login shell (loads .zshrc, .zprofile, PATH)
    for (const name of binaryNames) {
      try {
        const shellOutput = execSync(`/bin/zsh -l -c 'which ${name}' 2>/dev/null`, {
          encoding: 'utf-8',
          timeout: 2500,
        }).trim();

        if (shellOutput && fs.existsSync(shellOutput)) {
          this.detectedPath = shellOutput;
          return shellOutput;
        }
      } catch {}
    }

    return null;
  }

  public async checkInstallation(): Promise<OmpInstallStatus> {
    const binaryPath = this.detectBinaryPath();

    if (!binaryPath || !fs.existsSync(binaryPath)) {
      return {
        installed: false,
        error: 'Chưa tìm thấy file nhị phân OMP trên máy (quét qua ~/.local/bin, /opt/homebrew, ~/.bun, ~/.nvm, zsh).',
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

    let versionOutput = '';
    try {
      versionOutput = execSync(`"${binaryPath}" --version 2>/dev/null || "${binaryPath}" -v 2>/dev/null`, {
        env: { ...process.env, PATH: extendedPath },
        encoding: 'utf-8',
        timeout: 3000,
      }).trim();
    } catch {}

    return {
      installed: true,
      version: versionOutput || 'v0.1.0',
      binaryPath,
    };
  }

  public setStatus(newStatus: OmpAgentStatus) {
    this.status = newStatus;
    if (this.window && !this.window.isDestroyed()) {
      this.window.webContents.send('omp:status-change', newStatus);
    }
  }

  public async startProcess(
    workspacePath: string,
    model?: string,
    options?: { provider?: string; extraArgs?: string[] }
  ): Promise<{ success: boolean; pid?: number }> {
    if (this.process) {
      this.stopProcess();
    }

    this.rejectAllPending('Khởi động tiến trình OMP mới');
    this.frameLogger.truncate();
    this.framer.reset();
    this.thinkingAccumulator.reset();
    this.activeToolCalls.clear();
    this.writeSnapshots.clear();
    this.pendingUiRequests.clear();
    this.currentTurnId = null;
    this.workspacePath = workspacePath;

    const binaryPath = this.detectBinaryPath();
    if (!binaryPath || !fs.existsSync(binaryPath)) {
      console.warn('[OmpBridge] Binary not found. Live process start aborted; fallback mode available.');
      this.lifecycleState = 'idle';
      this.setStatus('idle');
      return { success: false };
    }

    const args = ['--mode', 'rpc', '--cwd', workspacePath];
    if (options?.provider) {
      args.push('--provider', options.provider);
    }
    if (model) {
      args.push('--model', model);
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
        const handshakeTimeoutMs = 10000;
        const handshakeTimer = setTimeout(() => {
          console.warn(`[OmpBridge] Handshake timed out after ${handshakeTimeoutMs}ms`);
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
        return { success: true };
      }
      return { success: false, error: res.error || 'Failed to set thinking level' };
    } catch (err: any) {
      return { success: false, error: err.message || 'Error executing set_thinking_level' };
    }
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
        return { success: true, state: res.data };
      }
      return { success: false, error: res.error || 'Failed to get state' };
    } catch (err: any) {
      return { success: false, error: err.message || 'Error executing get_state' };
    }
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
          } else {
            console.error('[OmpBridge] Protocol negotiation failed:', res.error);
            this.cleanupProcess();
            this.handshakePromise?.resolve({ success: false });
          }
        })
        .catch((err) => {
          console.error('[OmpBridge] Protocol negotiation timeout or error:', err.message);
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

    // 4. Extension UI Requests (Interactive, Cancel, Legacy, and Fire-and-forget)
    if (frame.type === 'extension_ui_request') {
      const reqEvent = frame as ExtensionUiRequestEvent;
      const reqId = (reqEvent.id || reqEvent.requestId || '') as string;
      const method = (reqEvent.method || '') as string;

      // A. Interactive Methods: select, confirm, input, editor
      if (method === 'select' || method === 'confirm' || method === 'input' || method === 'editor') {
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

        if (this.window && !this.window.isDestroyed()) {
          this.window.webContents.send('omp:ui-request', uiReq);
        }
        return;
      }

      // B. Engine Cancel Request: cancel targetId
      if (method === 'cancel') {
        const targetId = (reqEvent.targetId || '') as string;
        if (this.pendingUiRequests.has(targetId)) {
          this.pendingUiRequests.delete(targetId);
        }
        if (this.pendingUiRequests.size === 0 && this.status === 'waiting_permission') {
          this.setStatus(this.currentTurnId ? 'thinking' : 'idle');
        }
        if (this.window && !this.window.isDestroyed()) {
          this.window.webContents.send('omp:ui-request-cancel', targetId);
        }
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
        if (this.window && !this.window.isDestroyed()) {
          this.window.webContents.send('omp:permission-request', req);
        }
        return;
      }

      // D. Fire-and-forget (notify, setStatus, setWidget, setTitle, set_editor_text, and unknown methods):
      // NO reply is sent (Decision E2), already logged to frameLogger.
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
        if (toolName === 'write' && params.path) {
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

        if (this.window && !this.window.isDestroyed()) {
          this.window.webContents.send('omp:tool-call', toolCall);
        }
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
          if (this.window && !this.window.isDestroyed()) {
            this.window.webContents.send('omp:tool-call', toolCall);
          }
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

        if (this.window && !this.window.isDestroyed()) {
          this.window.webContents.send('omp:tool-call', toolCall);
        }

        this.setStatus('thinking');

        if (!endFrame.isError) {
          const diffItems = this.extractFileDiffs(endFrame, toolCall);
          for (const diffItem of diffItems) {
            if (this.window && !this.window.isDestroyed()) {
              this.window.webContents.send('omp:diff-generated', diffItem);
            }
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
              if (this.window && !this.window.isDestroyed()) {
                this.window.webContents.send('omp:stream-token', ame.delta);
              }
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
            if (res && this.window && !this.window.isDestroyed()) {
              this.window.webContents.send('omp:thinking', res.block);
            }
          }
        }
        break;
      }

      case 'message_end': {
        const endFrame = frame as MessageEndEvent;
        const msg = endFrame.message as AgentMessage | undefined;
        if (msg && msg.role === 'assistant' && Array.isArray(msg.content)) {
          const textParts: string[] = [];
          for (const block of msg.content) {
            if (block && block.type === 'text' && typeof (block as any).text === 'string') {
              const textContent = (block as any).text;
              if (textContent.length > 0) {
                textParts.push(textContent);
              }
            }
          }

          if (textParts.length > 0) {
            const fullText = textParts.join('\n');
            const chatMessage: ChatMessage = {
              id: `msg-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
              role: 'assistant',
              content: fullText,
              timestamp: typeof msg.completedAt === 'number'
                ? msg.completedAt
                : (typeof msg.timestamp === 'number' ? msg.timestamp : Date.now()),
            };
            if (this.window && !this.window.isDestroyed()) {
              this.window.webContents.send('omp:message-complete', chatMessage);
            }
          }
        }
        break;
      }

      case 'turn_end':
        this.setStatus('idle');
        break;

      case 'agent_end':
        this.setStatus('idle');
        this.thinkingAccumulator.reset();
        this.activeToolCalls.clear();
        this.writeSnapshots.clear();
        for (const id of this.pendingUiRequests.keys()) {
          if (this.window && !this.window.isDestroyed()) {
            this.window.webContents.send('omp:ui-request-cancel', id);
          }
        }
        this.pendingUiRequests.clear();
        break;

      case 'abort':
        this.setStatus('idle');
        this.thinkingAccumulator.reset();
        this.activeToolCalls.clear();
        this.writeSnapshots.clear();
        for (const id of this.pendingUiRequests.keys()) {
          if (this.window && !this.window.isDestroyed()) {
            this.window.webContents.send('omp:ui-request-cancel', id);
          }
        }
        this.pendingUiRequests.clear();
        break;
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
          if (!rawPath) return;

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
      if (!rawPath) return [];

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
      if (!rawPath) return [];

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
    this.writeSnapshots.clear();
    for (const id of this.pendingUiRequests.keys()) {
      if (this.window && !this.window.isDestroyed()) {
        this.window.webContents.send('omp:ui-request-cancel', id);
      }
    }
    this.pendingUiRequests.clear();
    this.workspacePath = null;
    this.currentTurnId = null;
    this.framer.reset();
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
        thought: `Đang phân tích yêu cầu: "${prompt}".\nĐọc cấu trúc AST, kiểm tra các symbols liên quan qua Language Server Protocol (LSP) và lên kế hoạch patch...`,
        timestamp: Date.now(),
        completed: true,
      };
      if (this.window && !this.window.isDestroyed()) {
        this.window.webContents.send('omp:thinking', thinking);
      }

      this.setStatus('executing_tool');
      const tool1: ToolCall = {
        id: 'tool-1',
        name: 'tree_sitter_ast_query',
        params: { file: context?.files?.[0] || 'src/auth/service.ts', query: '(function_declaration)' },
        status: 'running',
        startTime: Date.now(),
      };
      if (this.window && !this.window.isDestroyed()) {
        this.window.webContents.send('omp:tool-call', tool1);
      }

      setTimeout(() => {
        tool1.status = 'completed';
        tool1.result = { matchedNodes: 3, rootSymbol: 'AuthService' };
        tool1.endTime = Date.now();
        if (this.window && !this.window.isDestroyed()) {
          this.window.webContents.send('omp:tool-call', tool1);
        }

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
        if (this.window && !this.window.isDestroyed()) {
          this.window.webContents.send('omp:diff-generated', diff);
        }

        this.setStatus('streaming');
        const text = `Tôi đã phân tích AST của \`src/auth/service.ts\` và hoàn thiện hàm \`validateUser\` với việc kiểm tra Token và giải mã JWT an toàn.\n\nBạn có thể xem **Visual Diff** ở khung Canvas ở giữa và nhấn **Accept Changes** (⌘↵) để ghi đè code.`;
        
        let index = 0;
        const interval = setInterval(() => {
          if (index < text.length) {
            if (this.window && !this.window.isDestroyed()) {
              this.window.webContents.send('omp:stream-token', text.slice(index, index + 4));
            }
            index += 4;
          } else {
            clearInterval(interval);
            this.setStatus('idle');
            if (this.window && !this.window.isDestroyed()) {
              this.window.webContents.send('omp:message-complete', {
                id: 'msg-' + Date.now(),
                role: 'assistant',
                content: text,
                timestamp: Date.now(),
              });
            }
          }
        }, 30);
      }, 900);
    }, 800);
  }
}
