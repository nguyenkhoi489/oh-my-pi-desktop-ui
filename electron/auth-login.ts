import { spawn, execFile, type ChildProcess } from 'node:child_process';
import { promisify } from 'node:util';
import type { BrowserWindow } from 'electron';
import { buildExtendedPath } from './models-config.ts';
import type { AuthLoginEvent } from './types.ts';

const execFileAsync = promisify(execFile);

// Trích danh sách provider đã xác thực từ output `omp usage --json`
export function parseAuthenticatedProviders(jsonString: string): string[] {
  try {
    const parsed = JSON.parse(jsonString);
    if (!Array.isArray(parsed?.reports)) return [];
    const ids = parsed.reports
      .map((r: any) => r?.provider)
      .filter((p: any): p is string => typeof p === 'string' && p.length > 0);
    return [...new Set<string>(ids)];
  } catch {
    return [];
  }
}

export async function fetchAuthenticatedProviders(
  binaryPath: string
): Promise<{ success: boolean; providers?: string[]; error?: string }> {
  try {
    const { stdout } = await execFileAsync(binaryPath, ['usage', '--json'], {
      env: { ...process.env, PATH: buildExtendedPath(), NO_COLOR: '1' },
      encoding: 'utf-8',
      timeout: 20000,
      maxBuffer: 10 * 1024 * 1024,
    });
    return { success: true, providers: parseAuthenticatedProviders(stdout) };
  } catch (err: any) {
    return {
      success: false,
      providers: [],
      error: `Lỗi khi lấy trạng thái đăng nhập: ${err?.message || String(err)}`,
    };
  }
}

const LOGIN_TIMEOUT_MS = 5 * 60 * 1000;
const URL_REGEX = /https?:\/\/[^\s"'<>]+/;

// Quản lý một phiên đăng nhập OAuth qua `omp auth-broker login <provider>`
export class AuthLoginManager {
  private process: ChildProcess | null = null;
  private window: BrowserWindow | null = null;
  private readonly openUrl: (url: string) => Promise<void>;

  constructor(openUrl: (url: string) => Promise<void>) {
    this.openUrl = openUrl;
  }
  private providerId: string | null = null;
  private timeout: NodeJS.Timeout | null = null;
  private stdoutBuffer = '';
  private stderrBuffer = '';
  private urlOpened = false;

  start(
    binaryPath: string,
    providerId: string,
    window: BrowserWindow
  ): { success: boolean; error?: string } {
    if (!providerId || typeof providerId !== 'string') {
      return { success: false, error: 'Provider id không hợp lệ.' };
    }

    this.cancel();

    this.window = window;
    this.providerId = providerId;
    this.stdoutBuffer = '';
    this.stderrBuffer = '';
    this.urlOpened = false;

    let child: ChildProcess;
    try {
      child = spawn(binaryPath, ['auth-broker', 'login', providerId], {
        env: { ...process.env, PATH: buildExtendedPath(), NO_COLOR: '1' },
        stdio: ['pipe', 'pipe', 'pipe'],
      });
    } catch (err: any) {
      return { success: false, error: `Không thể khởi chạy omp: ${err?.message || String(err)}` };
    }

    this.process = child;
    this.emit({ providerId, status: 'started' });

    this.timeout = setTimeout(() => {
      if (this.process === child) {
        this.stderrBuffer = 'Hết thời gian chờ xác thực (5 phút).';
        child.kill('SIGTERM');
      }
    }, LOGIN_TIMEOUT_MS);

    child.stdout?.on('data', (chunk: Buffer) => {
      this.stdoutBuffer += chunk.toString('utf-8');
      this.tryOpenOauthUrl();
    });

    child.stderr?.on('data', (chunk: Buffer) => {
      this.stderrBuffer += chunk.toString('utf-8');
    });

    child.on('error', (err) => {
      if (this.process !== child) return;
      this.finish({ providerId, status: 'error', message: err.message });
    });

    child.on('close', (code) => {
      if (this.process !== child) return;
      if (code === 0) {
        this.finish({ providerId, status: 'success' });
      } else {
        this.finish({
          providerId,
          status: 'error',
          message: this.buildErrorMessage(code),
        });
      }
    });

    return { success: true };
  }

  // Emit cancelled ngay và tách tiến trình cũ để close handler của nó bị bỏ qua
  cancel(): { success: boolean } {
    const child = this.process;
    if (child && this.providerId) {
      this.finish({ providerId: this.providerId, status: 'cancelled' });
      child.kill('SIGTERM');
    }
    return { success: true };
  }

  // Chuyển redirect URL / authorization code người dùng dán vào stdin của CLI
  submitInput(text: string): { success: boolean; error?: string } {
    if (!this.process || !this.process.stdin?.writable) {
      return { success: false, error: 'Không có phiên đăng nhập nào đang chờ.' };
    }
    this.process.stdin.write(`${text.trim()}\n`);
    return { success: true };
  }

  dispose(): void {
    this.cancel();
    this.window = null;
  }

  private tryOpenOauthUrl(): void {
    if (this.urlOpened || !this.providerId) return;
    const match = this.stdoutBuffer.match(URL_REGEX);
    if (!match) return;
    this.urlOpened = true;
    const url = match[0];
    this.openUrl(url).catch((err) => {
      console.error('[AuthLogin] Không mở được trình duyệt:', err);
    });
    this.emit({ providerId: this.providerId, status: 'awaiting-browser', url });
  }

  private buildErrorMessage(code: number | null): string {
    const stderrTail = this.stderrBuffer.trim().split('\n').slice(-3).join('\n').trim();
    if (stderrTail) return stderrTail;
    return `Đăng nhập thất bại (exit code ${code ?? 'unknown'}).`;
  }

  private finish(event: AuthLoginEvent): void {
    if (this.timeout) {
      clearTimeout(this.timeout);
      this.timeout = null;
    }
    this.process = null;
    this.providerId = null;
    this.emit(event);
  }

  private emit(event: AuthLoginEvent): void {
    if (this.window && !this.window.isDestroyed()) {
      this.window.webContents.send('omp:auth-login-event', event);
    }
  }
}
