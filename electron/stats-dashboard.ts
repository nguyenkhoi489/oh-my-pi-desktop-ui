import { tm } from '../shared/i18n/index.ts';
import { spawn, type ChildProcess } from 'node:child_process';
import http from 'node:http';
import net from 'node:net';
import { buildExtendedPath } from './models-config.ts';
import type {
  StatsDashboardStatus,
  StatsDashboardResult,
  StartStatsDashboardOptions,
} from './types.ts';

// Check if TCP port is in use
function checkPortAvailable(port: number, host = '127.0.0.1'): Promise<boolean> {
  return new Promise((resolve) => {
    const server = net.createServer();
    server.once('error', () => {
      resolve(false);
    });
    server.once('listening', () => {
      server.close(() => resolve(true));
    });
    server.listen(port, host);
  });
}

// Manage stats dashboard server process `omp stats -p <port>`
export class StatsDashboardManager {
  private process: ChildProcess | null = null;
  private currentStatus: StatsDashboardStatus = {
    running: false,
    status: 'stopped',
  };
  private startingPromise: Promise<StatsDashboardResult> | null = null;

  // Get current status of dashboard
  public status(): StatsDashboardStatus {
    return { ...this.currentStatus };
  }

  // Start stats dashboard server
  public async start(
    binaryPath?: string,
    options?: StartStatsDashboardOptions | number
  ): Promise<StatsDashboardResult> {
    if (!binaryPath) {
      return {
        success: false,
        status: this.currentStatus,
        error: tm('electron.stats.binaryNotFound'),
      };
    }

    const opts: StartStatsDashboardOptions =
      typeof options === 'number' ? { port: options } : options || {};
    const port = opts.port && opts.port > 0 ? opts.port : 3457;
    const host = opts.host || '127.0.0.1';
    const timeoutMs = opts.timeoutMs ?? 10_000;

    // If already running on same port and process alive
    if (this.currentStatus.running && this.process && this.currentStatus.port === port) {
      return {
        success: true,
        status: { ...this.currentStatus },
      };
    }

    // If starting in progress, return pending promise
    if (this.startingPromise) {
      return this.startingPromise;
    }

    // If running on different port, stop first
    if (this.process) {
      await this.stop();
    }

    this.startingPromise = this.doStart(binaryPath, port, host, timeoutMs);
    try {
      return await this.startingPromise;
    } finally {
      this.startingPromise = null;
    }
  }

  // Spawn and monitor readiness
  private async doStart(
    binaryPath: string,
    port: number,
    host: string,
    timeoutMs: number
  ): Promise<StatsDashboardResult> {
    const url = `http://${host}:${port}`;

    // Check port before spawn
    const isPortFree = await checkPortAvailable(port, host);
    if (!isPortFree) {
      this.currentStatus = {
        running: false,
        status: 'error',
        error: tm('electron.stats.portInUse', { port: String(port) }),
      };
      return { success: false, status: this.currentStatus, error: this.currentStatus.error };
    }

    this.currentStatus = {
      running: false,
      status: 'starting',
      port,
      url,
    };

    return new Promise<StatsDashboardResult>((resolve) => {
      let resolved = false;
      let checkInterval: NodeJS.Timeout | null = null;
      let timeoutTimer: NodeJS.Timeout | null = null;

      const finish = (result: StatsDashboardResult) => {
        if (resolved) return;
        resolved = true;
        if (checkInterval) clearInterval(checkInterval);
        if (timeoutTimer) clearTimeout(timeoutTimer);
        resolve(result);
      };

      const args = ['stats', '-p', String(port)];
      if (host && host !== '127.0.0.1') {
        args.push('--host', host);
      }

      let child: ChildProcess;
      try {
        child = spawn(binaryPath, args, {
          env: { ...process.env, PATH: buildExtendedPath(), NO_COLOR: '1' },
          stdio: ['ignore', 'pipe', 'pipe'],
        });
      } catch (err: any) {
        this.currentStatus = {
          running: false,
          status: 'error',
          error: err?.message || tm('electron.stats.cannotSpawnDashboard'),
        };
        finish({ success: false, status: this.currentStatus, error: this.currentStatus.error });
        return;
      }

      this.process = child;
      const pid = child.pid;
      this.currentStatus.pid = pid;

      let stdoutAccum = '';
      let stderrAccum = '';

      const onStdoutData = (chunk: Buffer) => {
        if (resolved) return;
        const str = chunk.toString();
        if (stdoutAccum.length < 16384) stdoutAccum += str;
        if (
          stdoutAccum.includes('Dashboard available at:') ||
          stdoutAccum.includes(url)
        ) {
          this.currentStatus = {
            running: true,
            status: 'running',
            port,
            url,
            pid,
          };
          finish({ success: true, status: this.currentStatus });
        }
      };

      const onStderrData = (chunk: Buffer) => {
        if (resolved) return;
        const str = chunk.toString();
        if (stderrAccum.length < 16384) stderrAccum += str;
        if (
          stderrAccum.includes('Dashboard available at:') ||
          stderrAccum.includes(url)
        ) {
          this.currentStatus = {
            running: true,
            status: 'running',
            port,
            url,
            pid,
          };
          finish({ success: true, status: this.currentStatus });
        }
      };

      child.stdout?.on('data', onStdoutData);
      child.stderr?.on('data', onStderrData);

      child.on('error', (err) => {
        if (!resolved) {
          this.currentStatus = {
            running: false,
            status: 'error',
            error: err.message,
          };
          if (this.process === child) {
            this.process = null;
          }
          finish({ success: false, status: this.currentStatus, error: err.message });
        } else if (this.process === child) {
          this.currentStatus = {
            running: false,
            status: 'error',
            error: err.message,
          };
          this.process = null;
        }
      });

      child.on('exit', (code, signal) => {
        const exitMsg = tm('electron.stats.dashboardExited', { code: String(code), signal: String(signal) });
        if (!resolved) {
          const detail = (stderrAccum || stdoutAccum).trim();
          const err = detail ? `${exitMsg}: ${detail}` : exitMsg;
          this.currentStatus = {
            running: false,
            status: 'error',
            error: err,
          };
          if (this.process === child) {
            this.process = null;
          }
          finish({ success: false, status: this.currentStatus, error: err });
        } else if (this.process === child) {
          this.currentStatus = {
            running: false,
            status: 'stopped',
          };
          this.process = null;
        }
      });

      // Probe HTTP endpoint periodically
      const probeHttp = () => {
        if (resolved) return;
        const req = http.get(url, (res) => {
          if (res.statusCode && res.statusCode >= 200 && res.statusCode < 400) {
            this.currentStatus = {
              running: true,
              status: 'running',
              port,
              url,
              pid,
            };
            finish({ success: true, status: this.currentStatus });
          }
        });
        req.on('error', () => {
          // Ignore connection errors while server is booting up
        });
        req.setTimeout(1000, () => {
          req.destroy();
        });
      };

      checkInterval = setInterval(probeHttp, 300);

      timeoutTimer = setTimeout(() => {
        if (!resolved) {
          this.currentStatus = {
            running: false,
            status: 'error',
            error: tm('electron.stats.startupTimeout', { seconds: String(timeoutMs / 1000) }),
          };
          this.stop();
          finish({ success: false, status: this.currentStatus, error: this.currentStatus.error });
        }
      }, timeoutMs);
    });
  }

  // Stop stats dashboard server
  public async stop(): Promise<StatsDashboardResult> {
    const child = this.process;
    if (!child) {
      this.currentStatus = {
        running: false,
        status: 'stopped',
      };
      return { success: true, status: this.currentStatus };
    }

    this.process = null;

    return new Promise<StatsDashboardResult>((resolve) => {
      let resolved = false;

      const finish = () => {
        if (resolved) return;
        resolved = true;
        this.currentStatus = {
          running: false,
          status: 'stopped',
        };
        resolve({ success: true, status: this.currentStatus });
      };

      const forceKillTimer = setTimeout(() => {
        try {
          child.kill('SIGKILL');
        } catch {
          // Ignore
        }
        finish();
      }, 3000);

      child.once('exit', () => {
        clearTimeout(forceKillTimer);
        finish();
      });

      try {
        child.kill('SIGTERM');
      } catch {
        clearTimeout(forceKillTimer);
        finish();
      }
    });
  }

  // Dispose all resources when app closes
  public dispose(): void {
    if (this.process) {
      try {
        this.process.kill('SIGKILL');
      } catch {
        // Ignore
      }
      this.process = null;
      this.currentStatus = {
        running: false,
        status: 'stopped',
      };
    }
  }
}
