import { tm } from '../shared/i18n/index.ts';
import { spawn, type ChildProcess } from 'node:child_process';
import { buildExtendedPath } from './models-config.ts';
import { extractJsonSubstring } from './usage-stats.ts';
import type {
  ImageBackendsAction,
  ImageBackendsOptions,
  ImageBackendsResponse,
  ImageRunResultData,
} from './types.ts';

// Build CLI argument list for omp images
export function buildImagesArgs(
  action: ImageBackendsAction = 'status',
  opts: ImageBackendsOptions = {}
): string[] {
  const args: string[] = [];

  if (opts.profile) {
    args.push(`--profile=${opts.profile}`);
  }

  args.push('images', action, '--json');

  if (opts.dir) {
    args.push(`--dir=${opts.dir}`);
  }

  if (typeof opts.timeout === 'number' && !Number.isNaN(opts.timeout) && opts.timeout > 0) {
    args.push(`--timeout=${opts.timeout}`);
  }

  if (action === 'purge') {
    if (opts.all) {
      args.push('--all');
    }
    if (opts.apply) {
      args.push('--apply');
    }
  }

  return args;
}

// Run image publication backends management task
export function runImages(
  binaryPath: string,
  action: ImageBackendsAction = 'status',
  opts: ImageBackendsOptions = {}
): Promise<ImageBackendsResponse> {
  return new Promise<ImageBackendsResponse>((resolve) => {
    const args = buildImagesArgs(action, opts);
    let resolved = false;
    let stdoutBuffer = '';
    let stderrBuffer = '';

    const executionTimeoutMs = Math.max(
      20_000,
      opts.timeout ? (opts.timeout + 5) * 1000 : 20_000
    );

    let timer: NodeJS.Timeout | null = null;

    const finalize = (res: ImageBackendsResponse) => {
      if (resolved) return;
      resolved = true;
      if (timer) {
        clearTimeout(timer);
        timer = null;
      }
      resolve(res);
    };

    let child: ChildProcess;
    try {
      child = spawn(binaryPath, args, {
        env: {
          ...process.env,
          ...(opts.profile ? { OMP_PROFILE: opts.profile } : {}),
          PATH: buildExtendedPath(),
          FORCE_COLOR: '0',
        },
      });
    } catch (err: unknown) {
      const errMsg = err instanceof Error ? err.message : String(err);
      finalize({
        success: false,
        action,
        error: tm('electron.images.spawnFailed', { detail: errMsg }),
      });
      return;
    }

    timer = setTimeout(() => {
      try {
        child.kill('SIGKILL');
      } catch {}

      // Try to extract JSON before timeout
      const jsonStr = extractJsonSubstring(stdoutBuffer);
      if (jsonStr) {
        try {
          const data = JSON.parse(jsonStr) as ImageRunResultData;
          finalize({
            success: true,
            action,
            data,
          });
          return;
        } catch {}
      }

      finalize({
        success: false,
        action,
        error: tm('electron.images.timeout', { action, timeout: String(executionTimeoutMs) }),
        raw: stdoutBuffer,
      });
    }, executionTimeoutMs);

    child.stdout?.on('data', (chunk: Buffer) => {
      stdoutBuffer += chunk.toString('utf-8');

      // Optimize: extract and parse JSON as soon as received without waiting for hanging process
      const jsonStr = extractJsonSubstring(stdoutBuffer);
      if (jsonStr) {
        try {
          const data = JSON.parse(jsonStr) as ImageRunResultData;
          // Complete valid JSON received -> release child process
          try {
            child.kill('SIGTERM');
          } catch {}

          finalize({
            success: true,
            action,
            data,
          });
        } catch {
          // Incomplete JSON in stream -> wait for next chunk
        }
      }
    });

    child.stderr?.on('data', (chunk: Buffer) => {
      stderrBuffer += chunk.toString('utf-8');
    });

    child.on('error', (err: Error) => {
      finalize({
        success: false,
        action,
        error: err?.message || tm('electron.images.executeFailed'),
        raw: stdoutBuffer,
      });
    });

    child.on('close', (code: number | null) => {
      if (resolved) return;

      const jsonStr = extractJsonSubstring(stdoutBuffer);
      if (jsonStr) {
        try {
          const data = JSON.parse(jsonStr) as ImageRunResultData;
          finalize({
            success: true,
            action,
            data,
          });
          return;
        } catch (parseErr: unknown) {
          const msg = parseErr instanceof Error ? parseErr.message : String(parseErr);
          finalize({
            success: false,
            action,
            error: tm('electron.images.jsonParseFailed', { detail: msg }),
            raw: stdoutBuffer,
          });
          return;
        }
      }

      const errText = stderrBuffer.trim();
      finalize({
        success: false,
        action,
        error: errText || tm('electron.images.noJsonReturned', { code: String(code) }),
        raw: stdoutBuffer,
      });
    });
  });
}
