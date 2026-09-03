import { tm } from '../shared/i18n/index.ts';
import { execFile, spawn, type ChildProcess } from 'node:child_process';
import { promisify } from 'node:util';
import readline from 'node:readline';
import { buildExtendedPath } from './models-config.ts';

const execFileAsync = promisify(execFile);

// child.killed flips as soon as kill() is called, so check exit state instead
function isChildAlive(child: ChildProcess): boolean {
  return child.exitCode === null && child.signalCode === null;
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

export interface OmpDaemonSpec {
  name?: string;
  application?: string;
  args?: string[];
  env?: Record<string, string>;
  cwd?: string;
  pty?: boolean;
  ready?: {
    log?: string;
    port?: number;
    timeoutMs?: number;
    timeout?: number;
  };
  restart?: string;
  persist?: boolean;
  detached?: boolean;
}

export interface OmpDaemonDetail extends OmpDaemonInfo {
  spec?: OmpDaemonSpec;
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


// Stream log realtime from daemon process via --follow flag
export class ProcessLogFollower {
  private child: ChildProcess | null = null;
  private rlStdout: readline.Interface | null = null;
  private rlStderr: readline.Interface | null = null;
  private idleTimer: NodeJS.Timeout | null = null;
  private runningName: string | null = null;

  public get currentProcessName(): string | null {
    return this.runningName;
  }

  public isRunning(): boolean {
    return this.child !== null && isChildAlive(this.child);
  }

  public start(
    binaryPath: string,
    name: string,
    options: { lines?: number; head?: boolean; grep?: string; global?: string } = {},
    onLine: (line: string) => void
  ): { success: boolean; error?: string } {
    this.stop();

    const cleanName = String(name || '').trim();
    if (!cleanName) {
      return { success: false, error: tm('electron.ops.processNameEmpty') };
    }

    const args = ['ps', 'logs', cleanName, '--follow'];
    if (options.lines !== undefined) {
      args.push(`--lines=${options.lines}`);
    }
    if (options.head) {
      args.push('--head');
    }
    if (options.grep) {
      args.push(`--grep=${options.grep}`);
    }
    if (options.global) {
      args.push(`--global=${options.global}`);
    }

    try {
      const child = spawn(binaryPath, args, {
        env: {
          ...process.env,
          PATH: buildExtendedPath(),
        },
        stdio: ['ignore', 'pipe', 'pipe'],
      });

      this.child = child;
      this.runningName = cleanName;

      // 10 minutes idle timeout to prevent orphan processes
      this.idleTimer = setTimeout(() => {
        this.stop();
      }, 10 * 60 * 1000);

      if (child.stdout) {
        this.rlStdout = readline.createInterface({ input: child.stdout });
        this.rlStdout.on('line', (line) => {
          onLine(line);
        });
      }

      if (child.stderr) {
        this.rlStderr = readline.createInterface({ input: child.stderr });
        this.rlStderr.on('line', (line) => {
          onLine(line);
        });
      }

      child.on('error', (err) => {
        if (this.child === child) {
          onLine(`[Process log error: ${err.message}]`);
          this.stop();
        }
      });

      child.on('close', () => {
        if (this.child === child) {
          this.stop();
        }
      });

      return { success: true };
    } catch (err: any) {
      this.stop();
      return { success: false, error: err?.message || tm('electron.ops.followLogsFailed', { name: cleanName }) };
    }
  }
  public stop(): void {
    if (this.idleTimer) {
      clearTimeout(this.idleTimer);
      this.idleTimer = null;
    }
    if (this.rlStdout) {
      this.rlStdout.close();
      this.rlStdout = null;
    }
    if (this.rlStderr) {
      this.rlStderr.close();
      this.rlStderr = null;
    }
    if (this.child) {
      const childToKill = this.child;
      this.child = null;
      try {
        if (isChildAlive(childToKill)) {
          childToKill.kill('SIGTERM');
          setTimeout(() => {
            try {
              if (isChildAlive(childToKill)) {
                childToKill.kill('SIGKILL');
              }
            } catch {}
          }, 1000).unref();
        }
      } catch {}
    }
    this.runningName = null;
  }
}
// Manage daemon background processes and git worktrees
export class OpsManager {
  private logFollower = new ProcessLogFollower();

  public getLogFollower(): ProcessLogFollower {
    return this.logFollower;
  }

  public startLogFollow(
    binaryPath: string,
    name: string,
    options: { lines?: number; head?: boolean; grep?: string; global?: string },
    onLine: (line: string) => void
  ): { success: boolean; error?: string } {
    return this.logFollower.start(binaryPath, name, options, onLine);
  }

  public stopLogFollow(): { success: boolean } {
    this.logFollower.stop();
    return { success: true };
  }

  public dispose(): void {
    this.logFollower.stop();
  }

  // Daemon details (ps info <name> --json [--global])
  public async info(
    binaryPath: string,
    name: string,
    options?: { global?: string }
  ): Promise<{ success: boolean; daemon?: OmpDaemonDetail; error?: string }> {
    const cleanName = String(name || '').trim();
    if (!cleanName) {
      return { success: false, error: tm('electron.ops.processNameEmpty') };
    }

    const args = ['ps', 'info', cleanName, '--json'];
    if (options?.global) {
      args.push(`--global=${options.global}`);
    }

    try {
      const { stdout } = await execFileAsync(binaryPath, args, {
        env: {
          ...process.env,
          PATH: buildExtendedPath(),
        },
        timeout: 15000,
        encoding: 'utf-8',
      });

      const daemon: OmpDaemonDetail = JSON.parse(stdout || '{}');
      return { success: true, daemon };
    } catch (err: any) {
      return {
        success: false,
        error: err?.message || tm('electron.ops.getInfoFailed', { name: cleanName }),
      };
    }
  }

  // 1. List background processes
  public async listProcesses(
    binaryPath: string,
    options?: { all?: boolean; global?: string }
  ): Promise<{ success: boolean; scopes?: OmpPsScope[]; error?: string }> {
    const args = ['ps', 'list', '--json'];
    if (options?.all !== false) {
      args.push('--all');
    }
    if (options?.global) {
      args.push(`--global=${options.global}`);
    }

    try {
      const { stdout } = await execFileAsync(binaryPath, args, {
        env: {
          ...process.env,
          PATH: buildExtendedPath(),
        },
        timeout: 15000,
        encoding: 'utf-8',
      });

      const parsed = JSON.parse(stdout || '[]');
      const scopes: OmpPsScope[] = Array.isArray(parsed) ? parsed : [];
      return { success: true, scopes };
    } catch (err: any) {
      return {
        success: false,
        scopes: [],
        error: err?.message || tm('electron.ops.listProcessesFailed'),
      };
    }
  }

  // 2. Control process (stop / kill / restart)
  public async controlProcess(
    binaryPath: string,
    action: 'stop' | 'kill' | 'restart',
    name: string,
    options?: { global?: string; timeout?: number }
  ): Promise<{ success: boolean; message?: string; error?: string }> {
    const cleanName = String(name || '').trim();
    if (!cleanName) {
      return { success: false, error: tm('electron.ops.processNameEmpty') };
    }

    const args = ['ps', action, cleanName];
    if (options?.global) {
      args.push(`--global=${options.global}`);
    }
    if (options?.timeout !== undefined) {
      args.push(`--timeout=${options.timeout}`);
    }

    try {
      const { stdout, stderr } = await execFileAsync(binaryPath, args, {
        env: {
          ...process.env,
          PATH: buildExtendedPath(),
        },
        timeout: 20000,
        encoding: 'utf-8',
      });

      const output = `${stdout}\n${stderr}`.trim();
      return { success: true, message: output || tm('electron.ops.controlProcessSuccess', { action, name: cleanName }) };
    } catch (err: any) {
      return {
        success: false,
        error: err?.message || tm('electron.ops.controlProcessFailed', { action, name: cleanName }),
      };
    }
  }

  // 3. Read process logs
  public async getProcessLogs(
    binaryPath: string,
    name: string,
    options?: { lines?: number; head?: boolean; grep?: string; global?: string }
  ): Promise<{ success: boolean; logs?: string; error?: string }> {
    const cleanName = String(name || '').trim();
    if (!cleanName) {
      return { success: false, error: tm('electron.ops.processNameEmpty') };
    }

    const args = ['ps', 'logs', cleanName];
    const lines = options?.lines ?? 100;
    args.push(`--lines=${lines}`);

    if (options?.head) {
      args.push('--head');
    }
    if (options?.grep) {
      args.push(`--grep=${options.grep}`);
    }
    if (options?.global) {
      args.push(`--global=${options.global}`);
    }

    try {
      const { stdout, stderr } = await execFileAsync(binaryPath, args, {
        env: {
          ...process.env,
          PATH: buildExtendedPath(),
        },
        timeout: 15000,
        encoding: 'utf-8',
      });

      const logs = `${stdout}\n${stderr}`.trim();
      return { success: true, logs };
    } catch (err: any) {
      return {
        success: false,
        error: err?.message || tm('electron.ops.getLogsFailed', { name: cleanName }),
      };
    }
  }

  // 4. List worktrees
  public async listWorktrees(
    binaryPath: string
  ): Promise<{ success: boolean; worktrees?: OmpWorktreeInfo[]; error?: string }> {
    try {
      const { stdout } = await execFileAsync(binaryPath, ['worktree', 'list', '--json'], {
        env: {
          ...process.env,
          PATH: buildExtendedPath(),
        },
        timeout: 15000,
        encoding: 'utf-8',
      });

      const parsed = JSON.parse(stdout || '[]');
      const worktrees: OmpWorktreeInfo[] = Array.isArray(parsed) ? parsed : [];
      return { success: true, worktrees };
    } catch (err: any) {
      return {
        success: false,
        worktrees: [],
        error: err?.message || tm('electron.ops.listWorktreesFailed'),
      };
    }
  }

  // 5. Clean worktrees
  public async clearWorktrees(
    binaryPath: string,
    options?: { all?: boolean; dryRun?: boolean }
  ): Promise<{ success: boolean; rawOutput?: string; error?: string }> {
    const args = ['worktree', 'clear'];
    if (options?.all) {
      args.push('--all');
    }
    if (options?.dryRun) {
      args.push('--dry-run');
    }

    try {
      const { stdout, stderr } = await execFileAsync(binaryPath, args, {
        env: {
          ...process.env,
          PATH: buildExtendedPath(),
        },
        timeout: 20000,
        encoding: 'utf-8',
      });

      const rawOutput = `${stdout}\n${stderr}`.trim();
      return { success: true, rawOutput };
    } catch (err: any) {
      return {
        success: false,
        error: err?.message || tm('electron.ops.clearWorktreesFailed'),
      };
    }
  }
}
