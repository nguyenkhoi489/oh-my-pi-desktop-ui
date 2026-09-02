import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { buildExtendedPath } from './models-config.ts';

const execFileAsync = promisify(execFile);

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

// Quản lý các daemon background processes và git worktrees
export class OpsManager {
  // 1. Danh sách background processes
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
        error: err?.message || 'Lỗi khi liệt kê background processes',
      };
    }
  }

  // 2. Điều khiển process (stop / kill / restart)
  public async controlProcess(
    binaryPath: string,
    action: 'stop' | 'kill' | 'restart',
    name: string,
    options?: { global?: string; timeout?: number }
  ): Promise<{ success: boolean; message?: string; error?: string }> {
    const cleanName = String(name || '').trim();
    if (!cleanName) {
      return { success: false, error: 'Tên process không được để trống' };
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
      return { success: true, message: output || `Đã thực hiện ${action} thành công cho ${cleanName}` };
    } catch (err: any) {
      return {
        success: false,
        error: err?.message || `Lỗi khi thực hiện ${action} process ${cleanName}`,
      };
    }
  }

  // 3. Đọc logs của process
  public async getProcessLogs(
    binaryPath: string,
    name: string,
    options?: { lines?: number; head?: boolean; grep?: string; global?: string }
  ): Promise<{ success: boolean; logs?: string; error?: string }> {
    const cleanName = String(name || '').trim();
    if (!cleanName) {
      return { success: false, error: 'Tên process không được để trống' };
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
        error: err?.message || `Lỗi khi lấy logs cho process ${cleanName}`,
      };
    }
  }

  // 4. Danh sách worktrees
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
        error: err?.message || 'Lỗi khi liệt kê worktrees',
      };
    }
  }

  // 5. Dọn dẹp worktrees
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
        error: err?.message || 'Lỗi khi dọn dẹp worktrees',
      };
    }
  }
}
