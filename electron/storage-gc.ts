import { tm } from '../shared/i18n/index.ts';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import path from 'node:path';
import { buildExtendedPath } from './models-config.ts';
import { getOmpBaseDir } from './profile-paths.ts';
import type { StorageGcOptions, StorageGcResponse, StorageGcReport } from './types.ts';

const execFileAsync = promisify(execFile);

// Build CLI argument list for omp gc
export function buildGcArgs(opts: StorageGcOptions = {}): string[] {
  const args = ['gc', '--json'];

  if (opts.apply) {
    args.push('--apply');
  }

  const agentDir = opts.agentDir || path.join(getOmpBaseDir(opts.profile), 'agent');
  args.push(`--agent-dir=${agentDir}`);

  if (opts.blobs) {
    args.push('--blobs');
  }
  if (opts.archive) {
    args.push('--archive');
  }
  if (opts.wal) {
    args.push('--wal');
  }
  if (typeof opts.coldArchiveAfterDays === 'number' && !Number.isNaN(opts.coldArchiveAfterDays)) {
    args.push(`--cold-archive-after-days=${opts.coldArchiveAfterDays}`);
  }
  if (typeof opts.retainNewestGlobal === 'number' && !Number.isNaN(opts.retainNewestGlobal)) {
    args.push(`--retain-newest-global=${opts.retainNewestGlobal}`);
  }
  if (typeof opts.retainNewestPerCwd === 'number' && !Number.isNaN(opts.retainNewestPerCwd)) {
    args.push(`--retain-newest-per-cwd=${opts.retainNewestPerCwd}`);
  }

  return args;
}

// Run OMP storage garbage collection task
export async function runGc(binaryPath: string, opts: StorageGcOptions = {}): Promise<StorageGcResponse> {
  const args = buildGcArgs(opts);
  try {
    const { stdout, stderr } = await execFileAsync(binaryPath, args, {
      env: {
        ...process.env,
        PATH: buildExtendedPath(),
      },
      timeout: 60000,
      maxBuffer: 10 * 1024 * 1024,
    });

    const trimmed = (stdout || '').trim();
    if (!trimmed) {
      if (stderr && stderr.includes('gc.lock')) {
        return {
          success: false,
          error: tm('electron.storageGc.lockError'),
        };
      }
      return {
        success: false,
        error: stderr || tm('electron.storageGc.noDataReturned'),
      };
    }

    try {
      const report: StorageGcReport = JSON.parse(trimmed);
      return {
        success: true,
        report,
      };
    } catch (parseErr: any) {
      return {
        success: false,
        error: tm('electron.storageGc.cannotParseJson', { detail: parseErr?.message || String(parseErr) }),
      };
    }
  } catch (err: any) {
    const errMsg = err?.stderr || err?.message || String(err);
    if (errMsg.includes('gc.lock')) {
      return {
        success: false,
        error: tm('electron.storageGc.lockError'),
      };
    }
    return {
      success: false,
      error: errMsg,
    };
  }
}
