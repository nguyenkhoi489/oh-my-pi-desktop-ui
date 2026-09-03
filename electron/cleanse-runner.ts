import { tm } from '../shared/i18n/index.ts';
import type { BrowserWindow } from 'electron';
import { StreamingTaskRunner, type TaskOutputEvent } from './streaming-task-runner.ts';
import {
  stripAnsi,
  buildCleanseArgs,
  type CleanseRunOptions,
} from '../src/utils/cleanseArgs.ts';
export { stripAnsi, buildCleanseArgs, type CleanseRunOptions };

// Manage Cleanse Runner task (Phase 15)
export class CleanseRunnerManager {
  private runner = new StreamingTaskRunner('omp:cleanse-output');

  get isRunning(): boolean {
    return this.runner.isRunning;
  }

  get currentTaskId(): string | null {
    return this.runner.currentTaskId;
  }

  async runCleanse(
    binaryPath: string,
    opts: CleanseRunOptions,
    window: BrowserWindow
  ): Promise<{ success: boolean; error?: string }> {
    if (this.runner.isRunning) {
      return { success: false, error: tm('electron.cleanse.alreadyRunning') };
    }

    const cwd = opts.cwd || process.cwd();
    const args = buildCleanseArgs(opts);

    return this.runner.startTask(
      'cleanse-task',
      binaryPath,
      args,
      window,
      {
        cwd,
        stripAnsi: true,
        startText: tm('electron.cleanse.starting', { args: args.join(' ') }),
      }
    );
  }

  cancelCleanse(): { success: boolean } {
    return this.runner.cancelTask();
  }

  dispose(): void {
    this.runner.dispose();
  }
}
