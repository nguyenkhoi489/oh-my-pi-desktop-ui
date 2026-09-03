import { tm } from '../shared/i18n/index.ts';
import { spawn, type ChildProcess } from 'node:child_process';
import type { BrowserWindow } from 'electron';
import { buildExtendedPath } from './models-config.ts';

export interface TaskOutputEvent {
  taskId: string;
  type: 'stdout' | 'stderr' | 'status';
  text: string;
  status?: 'running' | 'done' | 'error';
  exitCode?: number;
}

export interface StartTaskOptions {
  cwd?: string;
  env?: Record<string, string | undefined>;
  busyError?: string;
  startText?: string;
  onOutput?: (event: TaskOutputEvent) => void;
  stripAnsi?: boolean;
}

// Multi-purpose CLI streaming task runner, supports parallel instances
export class StreamingTaskRunner {
  private activeProcess: ChildProcess | null = null;
  private activeTaskId: string | null = null;
  private window: BrowserWindow | null = null;
  private channel: string;
  private killTimeoutTimer: NodeJS.Timeout | null = null;
  private cancelNotified = false;

  constructor(channel: string) {
    this.channel = channel;
  }

  get isRunning(): boolean {
    return this.activeProcess !== null;
  }

  get currentTaskId(): string | null {
    return this.activeTaskId;
  }

  startTask(
    taskId: string,
    binaryPath: string,
    args: string[],
    window: BrowserWindow,
    options?: StartTaskOptions
  ): { success: boolean; error?: string } {
    if (this.activeProcess) {
      return {
        success: false,
        error: options?.busyError || tm('electron.taskRunner.busyError'),
      };
    }

    this.activeTaskId = taskId;
    this.window = window;

    try {
      const child = spawn(binaryPath, args, {
        cwd: options?.cwd,
        env: {
          ...process.env,
          PATH: buildExtendedPath(),
          ...(options?.env || {}),
        },
        stdio: ['ignore', 'pipe', 'pipe'],
      });

      this.activeProcess = child;

      const startEv: TaskOutputEvent = {
        taskId,
        type: 'status',
        status: 'running',
        text: options?.startText || tm('electron.taskRunner.defaultStartText', { command: `${binaryPath} ${args.join(' ')}` }),
      };
      this.emit(startEv, options?.onOutput);

      child.stdout?.on('data', (chunk) => {
        const raw = chunk.toString();
        const text = options?.stripAnsi
          ? raw.replace(/\x1B(?:[@-Z\\-_]|\[[0-?]*[ -/]*[@-~])/g, '')
          : raw;
        this.emit(
          {
            taskId,
            type: 'stdout',
            text,
          },
          options?.onOutput
        );
      });
      child.stderr?.on('data', (chunk) => {
        const raw = chunk.toString();
        const text = options?.stripAnsi
          ? raw.replace(/\x1B(?:[@-Z\\-_]|\[[0-?]*[ -/]*[@-~])/g, '')
          : raw;
        this.emit(
          {
            taskId,
            type: 'stderr',
            text,
          },
          options?.onOutput
        );
      });

      child.on('close', (code) => {
        if (this.activeProcess !== child) {
          return;
        }
        if (this.killTimeoutTimer) {
          clearTimeout(this.killTimeoutTimer);
          this.killTimeoutTimer = null;
        }
        const isSuccess = code === 0;
        // cancelTask() already emitted the terminal status for this task
        if (!this.cancelNotified) {
          this.emit(
            {
              taskId,
              type: 'status',
              status: isSuccess ? 'done' : 'error',
              exitCode: code ?? undefined,
              text: isSuccess
                ? tm('electron.taskRunner.completedSuccess')
                : tm('electron.taskRunner.completedError', { code: String(code) }),
            },
            options?.onOutput
          );
        }
        this.cancelNotified = false;
        this.activeProcess = null;
        this.activeTaskId = null;
      });

      child.on('error', (err) => {
        if (this.activeProcess !== child) {
          return;
        }
        if (this.killTimeoutTimer) {
          clearTimeout(this.killTimeoutTimer);
          this.killTimeoutTimer = null;
        }
        this.emit(
          {
            taskId,
            type: 'status',
            status: 'error',
            text: tm('electron.taskRunner.spawnError', { detail: err.message }),
          },
          options?.onOutput
        );
        this.activeProcess = null;
        this.activeTaskId = null;
      });

      return { success: true };
    } catch (err: any) {
      this.activeProcess = null;
      this.activeTaskId = null;
      return {
        success: false,
        error: err?.message || tm('electron.taskRunner.cannotSpawn'),
      };
    }
  }

  cancelTask(): { success: boolean } {
    if (!this.activeProcess) {
      return { success: true };
    }

    const taskId = this.activeTaskId || 'unknown';
    try {
      const proc = this.activeProcess;
      proc.kill('SIGTERM');

      if (this.killTimeoutTimer) {
        clearTimeout(this.killTimeoutTimer);
      }
      this.killTimeoutTimer = setTimeout(() => {
        if (this.activeProcess === proc) {
          try {
            proc.kill('SIGKILL');
          } catch {}
          this.activeProcess = null;
          this.activeTaskId = null;
        }
      }, 3000);

      this.cancelNotified = true;
      this.emit({
        taskId,
        type: 'status',
        status: 'error',
        text: tm('electron.taskRunner.cancelledByUser'),
      });

      return { success: true };
    } catch {
      return { success: false };
    }
  }

  dispose(): void {
    if (this.killTimeoutTimer) {
      clearTimeout(this.killTimeoutTimer);
      this.killTimeoutTimer = null;
    }
    if (this.activeProcess) {
      try {
        this.activeProcess.kill('SIGKILL');
      } catch {}
      this.activeProcess = null;
      this.activeTaskId = null;
    }
  }

  private emit(
    event: TaskOutputEvent,
    onOutput?: (ev: TaskOutputEvent) => void
  ): void {
    if (onOutput) {
      try {
        onOutput(event);
      } catch {}
    }
    if (this.window && !this.window.isDestroyed()) {
      this.window.webContents.send(this.channel, event);
    }
  }
}
