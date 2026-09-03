import { tm } from '../shared/i18n/index.ts';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import type { BrowserWindow } from 'electron';
import { StreamingTaskRunner, type TaskOutputEvent } from './streaming-task-runner.ts';
import { buildExtendedPath } from './models-config.ts';
import {
  stripAnsi,
  buildCommitArgs,
  parseCommitMessage,
} from '../src/utils/commitMessage.ts';
export { stripAnsi, buildCommitArgs, parseCommitMessage };

const execFileAsync = promisify(execFile);

export interface CommitRunOptions {
  dryRun?: boolean;
  context?: string;
  model?: string;
  push?: boolean;
  noChangelog?: boolean;
  legacy?: boolean;
  editedMessage?: string;
  cwd?: string;
}

export interface GitStatusResult {
  isGit: boolean;
  isDirty: boolean;
  branch?: string;
  filesCount?: number;
  files?: string[];
  error?: string;
}

// Check if folder is a git repository and whether working tree is dirty
export async function isGitDirty(cwd?: string): Promise<GitStatusResult> {
  if (!cwd) {
    return { isGit: false, isDirty: false, error: tm('electron.commit.noWorkspace') };
  }
  try {
    const { stdout } = await execFileAsync('git', ['status', '--porcelain', '-b'], {
      cwd,
      maxBuffer: 10 * 1024 * 1024,
      env: {
        ...process.env,
        PATH: buildExtendedPath(),
      },
    });

    const lines = stdout.split('\n').map((l) => l.trimEnd()).filter(Boolean);
    let branch = 'unknown';
    const changedFiles: string[] = [];

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      if (i === 0 && line.startsWith('## ')) {
        const branchPart = line.slice(3).split('...')[0].trim();
        branch = branchPart;
      } else if (!line.startsWith('## ')) {
        changedFiles.push(line);
      }
    }

    return {
      isGit: true,
      isDirty: changedFiles.length > 0,
      branch,
      filesCount: changedFiles.length,
      files: changedFiles.slice(0, 100),
    };
  } catch (err: any) {
    return {
      isGit: false,
      isDirty: false,
      error: err?.message || tm('electron.commit.notGitRepo'),
    };
  }
}

// Manage Commit Assistant task
export class CommitAssistantManager {
  private runner = new StreamingTaskRunner('omp:commit-output');
  private stagingAbortController: AbortController | null = null;
  private isCancelled = false;

  get isRunning(): boolean {
    return this.runner.isRunning || this.stagingAbortController !== null;
  }

  async runCommit(
    binaryPath: string,
    opts: CommitRunOptions,
    window: BrowserWindow
  ): Promise<{ success: boolean; error?: string }> {
    if (this.isRunning) {
      return { success: false, error: tm('electron.commit.alreadyRunning') };
    }

    const cwd = opts.cwd || process.cwd();

    // Dry-run mode: generate suggested commit message
    if (opts.dryRun) {
      return this.runner.startTask(
        'commit-dry-run',
        binaryPath,
        buildCommitArgs(opts, true),
        window,
        {
          cwd,
          startText: tm('electron.commit.generatingDryRun'),
        }
      );
    }

    // If user edited commit message: commit directly via git
    if (opts.editedMessage && opts.editedMessage.trim()) {
      return this.runGitCommitCustom(opts.editedMessage.trim(), Boolean(opts.push), cwd, window);
    }

    // Default: run omp commit directly
    return this.runner.startTask(
      'commit-real',
      binaryPath,
      buildCommitArgs(opts, false),
      window,
      {
        cwd,
        startText: tm('electron.commit.committingEngine'),
      }
    );
  }

  // Commit with git using user-specified message
  private async runGitCommitCustom(
    message: string,
    push: boolean,
    cwd: string,
    window: BrowserWindow
  ): Promise<{ success: boolean; error?: string }> {
    this.isCancelled = false;
    this.stagingAbortController = new AbortController();
    const { signal } = this.stagingAbortController;

    try {
      try {
        await execFileAsync('git', ['diff', '--cached', '--quiet'], {
          cwd,
          signal,
          env: { ...process.env, PATH: buildExtendedPath() },
        });
        if (this.isCancelled) return { success: false, error: tm('electron.commit.taskCancelled') };
        // Exit code 0 means nothing staged -> auto-stage all
        await execFileAsync('git', ['add', '-A'], {
          cwd,
          signal,
          env: { ...process.env, PATH: buildExtendedPath() },
        });
      } catch (diffErr: any) {
        if (this.isCancelled || diffErr?.name === 'AbortError') {
          return { success: false, error: tm('electron.commit.taskCancelled') };
        }
        if (diffErr?.code === 1) {
          // Staged changes exist -> keep intact
        } else {
          // Empty repo without initial commit
          await execFileAsync('git', ['add', '-A'], {
            cwd,
            signal,
            env: { ...process.env, PATH: buildExtendedPath() },
          });
        }
      }
    } catch (stageErr: any) {
      this.stagingAbortController = null;
      if (this.isCancelled || stageErr?.name === 'AbortError') {
        return { success: false, error: tm('electron.commit.taskCancelled') };
      }
      return { success: false, error: tm('electron.commit.prepareStagedFailed', { detail: stageErr?.message || String(stageErr) }) };
    } finally {
      this.stagingAbortController = null;
    }

    if (this.isCancelled) {
      return { success: false, error: tm('electron.commit.taskCancelled') };
    }

    const args = ['commit', '-m', message];
    return this.runner.startTask('commit-custom', 'git', args, window, {
      cwd,
      startText: tm('electron.commit.committingGit'),
      onOutput: (ev: TaskOutputEvent) => {
        if (ev.type === 'status' && ev.status === 'done' && ev.exitCode === 0 && push) {
          setTimeout(() => {
            this.runner.startTask('commit-push', 'git', ['push'], window, {
              cwd,
              startText: tm('electron.commit.pushingRemote'),
            });
          }, 100);
        }
      },
    });
  }

  cancelCommit(): { success: boolean } {
    this.isCancelled = true;
    if (this.stagingAbortController) {
      try {
        this.stagingAbortController.abort();
      } catch {}
      this.stagingAbortController = null;
    }
    return this.runner.cancelTask();
  }

  dispose(): void {
    this.isCancelled = true;
    if (this.stagingAbortController) {
      try {
        this.stagingAbortController.abort();
      } catch {}
      this.stagingAbortController = null;
    }
    this.runner.dispose();
  }
}
