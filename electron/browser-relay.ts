import { tm } from '../shared/i18n/index.ts';
import { spawn, execFile, type ChildProcess } from 'node:child_process';
import { promisify } from 'node:util';
import path from 'node:path';
import os from 'node:os';
import type { BrowserWindow } from 'electron';
import { buildExtendedPath } from './models-config.ts';
import { fetchEngineConfig } from './engine-config.ts';
import { StreamingTaskRunner, type TaskOutputEvent } from './streaming-task-runner.ts';
import { OpsManager } from './ops-manager.ts';

const execFileAsync = promisify(execFile);

export interface BrowserRelayInstallOptions {
  dir?: string;
}
declare global {
  interface PromiseConstructor {
    withResolvers<T>(): {
      promise: Promise<T>;
      resolve: (value: T | PromiseLike<T>) => void;
      reject: (reason?: any) => void;
    };
  }
}


export interface BrowserRelayStartOptions {
  port?: number;
  token?: string;
  noGroup?: boolean;
  verbose?: boolean;
}

export interface BrowserRelayStatus {
  running: boolean;
  source: 'app' | 'daemon' | 'none';
  pid?: number;
  port?: number;
  url?: string;
  command?: string;
  detail?: string;
}

export interface BrowserRelayInstallResult {
  success: boolean;
  output?: string;
  instructions?: string;
  extensionDir?: string;
  error?: string;
}

// Return default directory containing Chrome extension
export function getDefaultExtensionDir(): string {
  return path.join(os.homedir(), '.omp', 'browser-relay', 'extension');
}

// Build argv list when installing extension
export function buildBrowserRelayInstallArgs(options?: BrowserRelayInstallOptions): string[] {
  const args = ['browser-relay', 'install'];
  if (options?.dir && options.dir.trim()) {
    args.push(`--dir=${options.dir.trim()}`);
  }
  return args;
}

// Build argv list when running relay server
export function buildBrowserRelayStartArgs(options?: BrowserRelayStartOptions): string[] {
  const args = ['browser-relay', 'serve'];
  if (options?.port !== undefined && options.port !== null) {
    args.push(`--port=${options.port}`);
  }
  if (options?.token && options.token.trim()) {
    args.push(`--token=${options.token.trim()}`);
  }
  if (options?.noGroup) {
    args.push('--no-group');
  }
  if (options?.verbose) {
    args.push('--verbose');
  }
  return args;
}

// Extract install instructions from install command output
export function parseInstallInstructions(output: string): string {
  if (!output || !output.trim()) return '';
  const marker = 'Finish setup in Chrome:';
  const idx = output.indexOf(marker);
  if (idx !== -1) {
    return output.slice(idx).trim();
  }
  return output.trim();
}

// Check global daemon status of browser-relay via omp ps
export async function checkDaemonRelayStatus(binaryPath = 'omp'): Promise<{
  running: boolean;
  pid?: number;
  port?: number;
  url?: string;
  command?: string;
}> {
  try {
    const { stdout } = await execFileAsync(binaryPath, ['ps', 'list', '--json', '--all'], {
      env: {
        ...process.env,
        PATH: buildExtendedPath(),
      },
      timeout: 10000,
      encoding: 'utf-8',
    });

    const scopes = JSON.parse(stdout || '[]');
    if (!Array.isArray(scopes)) {
      return { running: false };
    }

    const relayScope = scopes.find(
      (s: any) => s && s.kind === 'global' && s.service === 'browser-relay'
    );
    if (!relayScope || !Array.isArray(relayScope.daemons)) {
      return { running: false };
    }

    const relayDaemon = relayScope.daemons.find(
      (d: any) => d && typeof d.name === 'string' && (d.name === 'omp.browser.relay' || d.name.includes('relay'))
    );

    if (!relayDaemon) {
      return { running: false };
    }

    const isRunning = relayDaemon.state === 'running';
    let port: number | undefined = undefined;

    // Find port in command or readyMatch
    const cmdStr = String(relayDaemon.command || '');
    const matchPort = cmdStr.match(/--port[=\s]+(\d+)/i) || cmdStr.match(/-p[=\s]+(\d+)/i);
    if (matchPort && matchPort[1]) {
      port = parseInt(matchPort[1], 10);
    }

    const readyStr = String(relayDaemon.readyMatch || '');
    const matchUrl = readyStr.match(/listening on (https?:\/\/[^\s]+)/i);
    const url = matchUrl ? matchUrl[1] : (port ? `http://127.0.0.1:${port}` : undefined);

    if (!port && matchUrl && matchUrl[1]) {
      try {
        const u = new URL(matchUrl[1]);
        if (u.port) port = parseInt(u.port, 10);
      } catch {}
    }

    return {
      running: isRunning,
      pid: typeof relayDaemon.pid === 'number' ? relayDaemon.pid : undefined,
      port,
      url,
      command: relayDaemon.command,
    };
  } catch {
    return { running: false };
  }
}

// Server managing browser relay process spawned by application
export class RelayServer {
  private child: ChildProcess | null = null;
  private port?: number;
  private token?: string;
  private url?: string;
  private startedAt?: number;
  private outputBuffer: string[] = [];

  public get isRunning(): boolean {
    return this.child !== null && !this.child.killed && this.child.exitCode === null;
  }

  public get currentProcess(): ChildProcess | null {
    return this.child;
  }

  public get currentPort(): number | undefined {
    return this.port;
  }

  public get currentUrl(): string | undefined {
    return this.url;
  }

  // Start relay server
  public async start(
    binaryPath: string,
    options: BrowserRelayStartOptions = {},
    profile?: string
  ): Promise<{ success: boolean; port?: number; url?: string; error?: string }> {
    if (this.isRunning) {
      return {
        success: false,
        error: tm('electron.browserRelay.alreadyRunning'),
        port: this.port,
        url: this.url,
      };
    }

    this.url = undefined;
    let targetPort = options.port;
    // If port not specified, read from browser.relayUrl config by profile if available
    if (targetPort === undefined) {
      try {
        const configRes = await fetchEngineConfig(binaryPath, { profile });
        if (configRes.success && configRes.entries) {
          const entry = configRes.entries.find((e) => e.key === 'browser.relayUrl');
          if (entry && typeof entry.value === 'string' && entry.value.trim()) {
            const parsedUrl = new URL(entry.value.trim());
            if (parsedUrl.port) {
              targetPort = parseInt(parsedUrl.port, 10);
            }
          }
        }
      } catch {
        // ignore if cannot read
      }
    }

    this.port = targetPort;
    const args = buildBrowserRelayStartArgs({
      ...options,
      port: targetPort,
    });

    const { promise: readyPromise, resolve: resolveReady } = Promise.withResolvers<{
      success: boolean;
      port?: number;
      url?: string;
      error?: string;
    }>();

    let isSettled = false;
    let readyTimer: NodeJS.Timeout | null = null;
    const markSettled = (res: { success: boolean; port?: number; url?: string; error?: string }) => {
      if (!isSettled) {
        isSettled = true;
        if (readyTimer) {
          clearTimeout(readyTimer);
          readyTimer = null;
        }
        resolveReady(res);
      }
    };

    try {
      const child = spawn(binaryPath, args, {
        env: {
          ...process.env,
          PATH: buildExtendedPath(),
        },
        stdio: ['ignore', 'pipe', 'pipe'],
      });

      this.child = child;
      this.token = options.token;
      this.startedAt = Date.now();
      this.outputBuffer = [];

      child.stdout?.on('data', (chunk) => {
        const text = chunk.toString();
        this.outputBuffer.push(text);
        if (this.outputBuffer.length > 200) {
          this.outputBuffer.shift();
        }
        const match = text.match(/listening on (https?:\/\/[^\s]+)/i);
        if (match && match[1]) {
          this.url = match[1];
          try {
            const u = new URL(match[1]);
            if (u.port) this.port = parseInt(u.port, 10);
          } catch {}
          markSettled({
            success: true,
            port: this.port,
            url: this.url,
          });
        }
      });

      child.stderr?.on('data', (chunk) => {
        const text = chunk.toString();
        this.outputBuffer.push(text);
        if (this.outputBuffer.length > 200) {
          this.outputBuffer.shift();
        }
      });

      child.on('exit', (code) => {
        this.child = null;
        markSettled({
          success: false,
          error: this.outputBuffer.join('\n').trim() || tm('electron.browserRelay.processExitedEarly', { code: String(code) }),
        });
      });

      child.on('error', (err) => {
        this.child = null;
        markSettled({
          success: false,
          error: err?.message || tm('electron.browserRelay.cannotSpawn'),
        });
      });

      // Fallback timer: if process still running after 3000ms without emit listening on
      readyTimer = setTimeout(() => {
        if (this.isRunning) {
          markSettled({
            success: true,
            port: this.port,
            url: this.url || (this.port ? `http://127.0.0.1:${this.port}` : undefined),
          });
        } else {
          markSettled({
            success: false,
            error: tm('electron.browserRelay.cannotConfirmReady'),
          });
        }
      }, 3000);

      return await readyPromise;
    } catch (err: any) {
      this.child = null;
      if (readyTimer) clearTimeout(readyTimer);
      return {
        success: false,
        error: err?.message || tm('electron.browserRelay.cannotStart'),
      };
    }
  }

  // Stop relay server spawned by app
  public async stop(): Promise<{ success: boolean; error?: string }> {
    if (!this.child || this.child.exitCode !== null) {
      this.child = null;
      return { success: true };
    }

    const proc = this.child;
    const { promise, resolve } = Promise.withResolvers<{ success: boolean; error?: string }>();
    try {
      proc.kill('SIGTERM');
      const killTimer = setTimeout(() => {
        try {
          if (proc.exitCode === null) {
            proc.kill('SIGKILL');
          }
        } catch {}
        this.child = null;
        resolve({ success: true });
      }, 2000);

      proc.once('exit', () => {
        this.child = null;
        clearTimeout(killTimer);
        resolve({ success: true });
      });
    } catch (err: any) {
      this.child = null;
      resolve({ success: false, error: err?.message || tm('electron.browserRelay.errorStopping') });
    }
    return promise;
  }

  // Get current status of relay
  public async status(binaryPath = 'omp'): Promise<BrowserRelayStatus> {
    if (this.isRunning && this.child) {
      return {
        running: true,
        source: 'app',
        pid: this.child.pid,
        port: this.port,
        url: this.url || (this.port ? `http://127.0.0.1:${this.port}` : undefined),
        detail: tm('electron.browserRelay.runningApp'),
      };
    }

    const daemonStatus = await checkDaemonRelayStatus(binaryPath);
    if (daemonStatus.running) {
      return {
        running: true,
        source: 'daemon',
        pid: daemonStatus.pid,
        port: daemonStatus.port,
        url: daemonStatus.url,
        command: daemonStatus.command,
        detail: tm('electron.browserRelay.runningDaemon'),
      };
    }

    return {
      running: false,
      source: 'none',
      detail: tm('electron.browserRelay.inactive'),
    };
  }
}

// Manage entire Browser Relay service (install extension + control relay server)
export class BrowserRelayManager {
  private server: RelayServer;
  private installRunner: StreamingTaskRunner;
  private opsManager: OpsManager;

  constructor(server?: RelayServer, runner?: StreamingTaskRunner, opsManager?: OpsManager) {
    this.server = server || new RelayServer();
    this.installRunner = runner || new StreamingTaskRunner('omp:browser-relay-output');
    this.opsManager = opsManager || new OpsManager();
  }

  public get relayServer(): RelayServer {
    return this.server;
  }

  public get isRelayRunning(): boolean {
    return this.server.isRunning;
  }

  public get isInstallRunning(): boolean {
    return this.installRunner.isRunning;
  }

  // Install Chrome extension with streaming task
  public async installRelay(
    binaryPath: string,
    window: BrowserWindow,
    options?: BrowserRelayInstallOptions
  ): Promise<BrowserRelayInstallResult> {
    if (this.installRunner.isRunning) {
      return {
        success: false,
        error: tm('electron.browserRelay.installRunning'),
      };
    }

    const targetDir = options?.dir?.trim() || getDefaultExtensionDir();
    const args = buildBrowserRelayInstallArgs({ dir: targetDir });

    const { promise, resolve } = Promise.withResolvers<BrowserRelayInstallResult>();
    let accumulatedOutput = '';

    const startResult = this.installRunner.startTask(
      'browser-relay-install',
      binaryPath,
      args,
      window,
      {
        stripAnsi: true,
        startText: tm('electron.browserRelay.installingBanner', { command: `${binaryPath} ${args.join(' ')}` }),
        onOutput: (ev: TaskOutputEvent) => {
          if (ev.type === 'stdout' || ev.type === 'stderr') {
            accumulatedOutput += ev.text + '\n';
          }
          if (ev.type === 'status') {
            if (ev.status === 'done') {
              resolve({
                success: true,
                output: accumulatedOutput.trim(),
                instructions: parseInstallInstructions(accumulatedOutput),
                extensionDir: targetDir,
              });
            } else if (ev.status === 'error') {
              resolve({
                success: false,
                output: accumulatedOutput.trim(),
                error: ev.text || tm('electron.browserRelay.installFailed'),
                extensionDir: targetDir,
              });
            }
          }
        },
      }
    );

    if (!startResult.success) {
      resolve({
        success: false,
        error: startResult.error || tm('electron.browserRelay.cannotStartTask'),
      });
    }

    return promise;
  }

  // Start relay server
  public async startRelay(
    binaryPath: string,
    options?: BrowserRelayStartOptions,
    profile?: string
  ): Promise<{ success: boolean; port?: number; url?: string; error?: string }> {
    return this.server.start(binaryPath, options, profile);
  }

  // Stop relay server (both app spawn and global daemon if needed)
  public async stopRelay(binaryPath = 'omp'): Promise<{ success: boolean; error?: string }> {
    const appStopRes = await this.server.stop();

    // Check and stop daemon if running
    try {
      const daemonStatus = await checkDaemonRelayStatus(binaryPath);
      if (daemonStatus.running) {
        const daemonRes = await this.opsManager.controlProcess(binaryPath, 'stop', 'omp.browser.relay', {
          global: 'browser-relay',
        });
        if (!daemonRes.success) {
          return { success: false, error: daemonRes.error || tm('electron.browserRelay.cannotStopDaemon') };
        }
      }
    } catch (err: any) {
      if (!appStopRes.success) return appStopRes;
      return { success: false, error: err?.message || tm('electron.browserRelay.errorStoppingDaemon') };
    }

    return appStopRes;
  }

  // Get relay status
  public async getStatus(binaryPath = 'omp'): Promise<BrowserRelayStatus> {
    return this.server.status(binaryPath);
  }

  // Dispose resources
  public dispose(): void {
    this.installRunner.dispose();
    if (this.server.isRunning) {
      this.server.stop().catch(() => {});
    }
  }
}
