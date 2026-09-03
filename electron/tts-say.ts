import { tm } from '../shared/i18n/index.ts';
import { spawn, type ChildProcess } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import electronPkg from 'electron';
import { buildExtendedPath } from './models-config.ts';

function getTempDir(): string {
  const electronApp =
    typeof electronPkg === 'object' && electronPkg !== null
      ? (electronPkg as any).app || (electronPkg as any).default?.app
      : undefined;
  if (electronApp && typeof electronApp.getPath === 'function') {
    return electronApp.getPath('temp');
  }
  return os.tmpdir();
}

export interface SayOptions {
  voice?: string;
  model?: string;
}

export interface SayStatusEvent {
  speaking: boolean;
  error?: string;
  missingModel?: boolean;
}

// Manage Text-to-Speech tasks using omp say (Phase 17)
export class SayManager {
  private currentProcess: ChildProcess | null = null;
  private currentTempFile: string | null = null;
  private onStatusChange?: (status: SayStatusEvent) => void;
  private _isSpeaking = false;

  constructor(onStatusChange?: (status: SayStatusEvent) => void) {
    this.onStatusChange = onStatusChange;
  }

  setStatusListener(listener: (status: SayStatusEvent) => void): void {
    this.onStatusChange = listener;
  }

  get isSpeaking(): boolean {
    return this._isSpeaking;
  }

  async speak(
    binary: string,
    text: string,
    options?: SayOptions
  ): Promise<{ success: boolean; error?: string; missingModel?: boolean }> {
    // 1. Stop ongoing speech if any
    this.stop();

    const trimmed = text?.trim();
    if (!trimmed) {
      return { success: false, error: tm('electron.say.emptyContent') };
    }

    // 2. Create temp file containing speech text
    const tempDir = getTempDir();
    const tempFilePath = path.join(
      tempDir,
      `omp_say_${Date.now()}_${Math.random().toString(36).slice(2, 8)}.txt`
    );

    try {
      await fs.promises.writeFile(tempFilePath, trimmed, 'utf-8');
      this.currentTempFile = tempFilePath;
    } catch (err: any) {
      return {
        success: false,
        error: tm('electron.say.cannotWriteTempFile', { detail: err?.message || String(err) }),
      };
    }

    // 3. Build CLI arguments for omp say
    const args = ['say', '--file', tempFilePath];
    if (options?.voice && options.voice.trim()) {
      args.push('--voice', options.voice.trim());
    }
    if (options?.model && options.model.trim()) {
      args.push('--model', options.model.trim());
    }

    // 4. Spawn omp say process
    return new Promise((resolve) => {
      let stdoutData = '';
      let stderrData = '';
      let resolved = false;

      const finishResolve = (res: { success: boolean; error?: string; missingModel?: boolean }) => {
        if (!resolved) {
          resolved = true;
          resolve(res);
        }
      };

      const extendedPath = buildExtendedPath();

      const child = spawn(binary, args, {
        stdio: ['ignore', 'pipe', 'pipe'],
        env: {
          ...process.env,
          PATH: extendedPath,
        },
      });

      this.currentProcess = child;
      this._isSpeaking = true;
      this.emitStatus({ speaking: true });

      child.stdout?.on('data', (d) => {
        stdoutData += d.toString();
      });

      child.stderr?.on('data', (d) => {
        stderrData += d.toString();
      });

      const cleanup = async () => {
        if (this.currentProcess === child) {
          this.currentProcess = null;
          this._isSpeaking = false;
        }
        if (this.currentTempFile === tempFilePath) {
          this.currentTempFile = null;
          try {
            await fs.promises.unlink(tempFilePath);
          } catch {
            // File already deleted or does not exist
          }
        }
      };

      child.on('error', async (err) => {
        const isCurrent = this.currentProcess === child;
        await cleanup();
        const errMsg = err?.message || String(err);
        if (isCurrent) {
          this.emitStatus({ speaking: false, error: errMsg });
        }
        finishResolve({ success: false, error: errMsg });
      });

      child.on('close', async (code, signal) => {
        const isCurrent = this.currentProcess === child;
        await cleanup();

        if (signal === 'SIGTERM' || signal === 'SIGKILL') {
          // Process cancelled actively by user
          if (isCurrent) {
            this.emitStatus({ speaking: false });
          }
          finishResolve({ success: true });
          return;
        }

        const combinedOutput = `${stdoutData}\n${stderrData}`.trim();
        const isMissingModel =
          combinedOutput.includes('could not synthesize with local TTS model') ||
          combinedOutput.includes('omp setup speech') ||
          (combinedOutput.includes('TTS') && combinedOutput.includes('model') && code !== 0);

        if (code !== 0) {
          const errorMsg = isMissingModel
            ? tm('electron.say.missingModel')
            : (stderrData.trim() || tm('electron.say.speakFailed', { code: String(code) }));

          if (isCurrent) {
            this.emitStatus({
              speaking: false,
              error: errorMsg,
              missingModel: isMissingModel,
            });
          }
          finishResolve({
            success: false,
            error: errorMsg,
            missingModel: isMissingModel,
          });
        } else {
          if (isCurrent) {
            this.emitStatus({ speaking: false });
          }
          finishResolve({ success: true });
        }
      });
    });
  }

  stop(): void {
    if (this.currentProcess) {
      try {
        this.currentProcess.kill('SIGTERM');
      } catch {
        // Ignore error if process already stopped
      }
      this.currentProcess = null;
    }
    if (this.currentTempFile) {
      try {
        if (fs.existsSync(this.currentTempFile)) {
          fs.unlinkSync(this.currentTempFile);
        }
      } catch {
        // Ignore temp file cleanup error
      }
      this.currentTempFile = null;
    }
    if (this._isSpeaking) {
      this._isSpeaking = false;
      this.emitStatus({ speaking: false });
    }
  }

  dispose(): void {
    this.stop();
  }

  private emitStatus(status: SayStatusEvent): void {
    if (this.onStatusChange) {
      this.onStatusChange(status);
    }
  }
}
