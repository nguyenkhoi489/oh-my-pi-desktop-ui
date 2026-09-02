import { spawn, execFile, type ChildProcess } from 'node:child_process';
import { promisify } from 'node:util';
import type { BrowserWindow } from 'electron';
import { buildExtendedPath } from './models-config.ts';
import type {
  EngineUpdateCheckResult,
  EngineComponentStatus,
  TinyModelItem,
  MaintenanceEvent,
} from './types.ts';

const execFileAsync = promisify(execFile);

// Parse kết quả kiểm tra cập nhật từ `omp update --check`
export function parseUpdateCheckOutput(output: string): EngineUpdateCheckResult {
  let currentVersion = 'unknown';
  let hasUpdate = false;
  let latestVersion: string | undefined;

  const vMatch = output.match(/Current version:\s*([0-9a-zA-Z.-]+)/i) || output.match(/omp\/([0-9a-zA-Z.-]+)/i);
  if (vMatch) {
    currentVersion = vMatch[1];
  }

  if (output.includes('Update available') || output.includes('New version') || output.includes('→')) {
    hasUpdate = true;
    const lMatch = output.match(/(?:to|version|→)\s*([0-9a-zA-Z.-]+)/i);
    if (lMatch) {
      latestVersion = lMatch[1];
    }
  } else if (output.includes('Already up to date') || output.includes('is up to date')) {
    hasUpdate = false;
    latestVersion = currentVersion;
  }

  return {
    success: true,
    currentVersion,
    hasUpdate,
    latestVersion,
    rawOutput: output.trim(),
  };
}

// Parse danh sách tiny models từ `omp tiny-models list`
export function parseTinyModelsOutput(output: string): TinyModelItem[] {
  const lines = output.split('\n');
  const items: TinyModelItem[] = [];
  let currentKey = '';
  let currentIsDefault = false;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i].trim();
    if (!line || line.startsWith('Tiny local models')) continue;

    if (!line.startsWith(' ') && !line.includes('—') && !line.includes(':')) {
      const parts = line.split(/\s+/);
      currentKey = parts[0];
      currentIsDefault = line.includes('default');
    } else if (currentKey) {
      const desc = line.replace(/^\s+/, '');
      items.push({
        key: currentKey,
        isDefault: currentIsDefault,
        description: desc,
      });
      currentKey = '';
      currentIsDefault = false;
    }
  }

  return items;
}

// Quản lý kiểm tra và thực thi các tác vụ bảo trì engine (1 slot duy nhất)
export class EngineMaintenanceManager {
  private activeProcess: ChildProcess | null = null;
  private activeTaskId: string | null = null;
  private window: BrowserWindow | null = null;

  // Kiểm tra phiên bản hiện tại và cập nhật mới
  async checkUpdate(binaryPath: string): Promise<EngineUpdateCheckResult> {
    try {
      const { stdout, stderr } = await execFileAsync(binaryPath, ['update', '--check'], {
        env: {
          ...process.env,
          PATH: buildExtendedPath(),
        },
        timeout: 20000,
      });
      return parseUpdateCheckOutput(`${stdout}\n${stderr}`);
    } catch (err: any) {
      const combined = `${err?.stdout || ''}\n${err?.stderr || ''}`.trim();
      if (combined) {
        return parseUpdateCheckOutput(combined);
      }
      return {
        success: false,
        currentVersion: 'unknown',
        hasUpdate: false,
        error: err?.message || 'Lỗi kiểm tra cập nhật',
      };
    }
  }

  // Kiểm tra trạng thái các component tuỳ chọn (Python, Speech)
  async checkComponents(binaryPath: string): Promise<{ success: boolean; components?: EngineComponentStatus[]; error?: string }> {
    const components: EngineComponentStatus[] = [];

    // Kiểm tra Python
    try {
      const { stdout } = await execFileAsync(binaryPath, ['setup', 'python', '--check', '--json'], {
        env: { ...process.env, PATH: buildExtendedPath() },
      });
      const parsed = JSON.parse(stdout);
      components.push({
        id: 'python',
        name: 'Python Environment',
        description: 'Môi trường thực thi code Python và Jupyter Notebooks',
        isInstalled: Boolean(parsed.available),
        details: parsed.pythonPath ? `Đường dẫn: ${parsed.pythonPath}` : undefined,
      });
    } catch {
      components.push({
        id: 'python',
        name: 'Python Environment',
        description: 'Môi trường thực thi code Python và Jupyter Notebooks',
        isInstalled: false,
      });
    }

    // Kiểm tra Speech
    try {
      const { stdout } = await execFileAsync(binaryPath, ['setup', 'speech', '--check', '--json'], {
        env: { ...process.env, PATH: buildExtendedPath() },
      });
      const parsed = JSON.parse(stdout);
      const sttReady = parsed['Speech-to-Text model']?.ready;
      const ttsReady = parsed['Text-to-Speech model']?.ready;
      components.push({
        id: 'speech',
        name: 'Speech (STT / TTS)',
        description: 'Mô hình chuyển giọng nói thành văn bản và đọc văn bản',
        isInstalled: Boolean(sttReady && ttsReady),
        details: `${parsed['Speech-to-Text model']?.status || ''} | ${parsed['Text-to-Speech model']?.status || ''}`,
      });
    } catch {
      components.push({
        id: 'speech',
        name: 'Speech (STT / TTS)',
        description: 'Mô hình chuyển giọng nói thành văn bản và đọc văn bản',
        isInstalled: false,
      });
    }

    return { success: true, components };
  }

  // Lấy danh sách tiny models
  async listTinyModels(binaryPath: string): Promise<{ success: boolean; models?: TinyModelItem[]; error?: string }> {
    try {
      const { stdout, stderr } = await execFileAsync(binaryPath, ['tiny-models', 'list'], {
        env: { ...process.env, PATH: buildExtendedPath() },
      });
      const models = parseTinyModelsOutput(`${stdout}\n${stderr}`);
      return { success: true, models };
    } catch (err: any) {
      return { success: false, error: err?.message || 'Không thể lấy danh sách tiny models' };
    }
  }

  // Chạy một tác vụ bảo trì (stream log ra renderer)
  startTask(
    taskId: string,
    binaryPath: string,
    args: string[],
    window: BrowserWindow
  ): { success: boolean; error?: string } {
    if (this.activeProcess) {
      return { success: false, error: 'Đang có một tác vụ bảo trì khác đang chạy' };
    }

    this.activeTaskId = taskId;
    this.window = window;

    try {
      const child = spawn(binaryPath, args, {
        env: {
          ...process.env,
          PATH: buildExtendedPath(),
        },
        stdio: ['ignore', 'pipe', 'pipe'],
      });

      this.activeProcess = child;

      this.emit({
        taskId,
        type: 'status',
        status: 'running',
        text: `Đang chạy: omp ${args.join(' ')}`,
      });

      child.stdout?.on('data', (chunk) => {
        const text = chunk.toString();
        this.emit({
          taskId,
          type: 'stdout',
          text,
        });
      });

      child.stderr?.on('data', (chunk) => {
        const text = chunk.toString();
        this.emit({
          taskId,
          type: 'stderr',
          text,
        });
      });

      child.on('close', (code) => {
        const isSuccess = code === 0;
        this.emit({
          taskId,
          type: 'status',
          status: isSuccess ? 'done' : 'error',
          exitCode: code ?? undefined,
          text: isSuccess ? 'Tác vụ hoàn thành thành công.' : `Tác vụ kết thúc với mã lỗi: ${code}`,
        });
        this.activeProcess = null;
        this.activeTaskId = null;
      });

      child.on('error', (err) => {
        this.emit({
          taskId,
          type: 'status',
          status: 'error',
          text: `Lỗi khởi chạy tiến trình: ${err.message}`,
        });
        this.activeProcess = null;
        this.activeTaskId = null;
      });

      return { success: true };
    } catch (err: any) {
      this.activeProcess = null;
      this.activeTaskId = null;
      return { success: false, error: err?.message || 'Không thể khởi chạy tiến trình' };
    }
  }

  // Hủy tác vụ bảo trì đang chạy
  cancelTask(): { success: boolean } {
    if (!this.activeProcess) {
      return { success: true };
    }

    const taskId = this.activeTaskId || 'unknown';
    try {
      this.activeProcess.kill('SIGTERM');
      setTimeout(() => {
        if (this.activeProcess) {
          try {
            this.activeProcess.kill('SIGKILL');
          } catch {}
          this.activeProcess = null;
          this.activeTaskId = null;
        }
      }, 3000);

      this.emit({
        taskId,
        type: 'status',
        status: 'error',
        text: 'Tác vụ đã bị người dùng hủy.',
      });

      return { success: true };
    } catch {
      return { success: false };
    }
  }

  dispose(): void {
    if (this.activeProcess) {
      try {
        this.activeProcess.kill('SIGKILL');
      } catch {}
      this.activeProcess = null;
      this.activeTaskId = null;
    }
  }

  private emit(event: MaintenanceEvent): void {
    if (this.window && !this.window.isDestroyed()) {
      this.window.webContents.send('omp:maintenance-output', event);
    }
  }
}
