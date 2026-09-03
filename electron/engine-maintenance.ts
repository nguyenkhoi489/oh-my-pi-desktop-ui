import { tm } from '../shared/i18n/index.ts';
import { execFile } from 'node:child_process';
import { StreamingTaskRunner } from './streaming-task-runner.ts';
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

// Parse update check output from `omp update --check`
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

// Parse tiny models list from `omp tiny-models list`
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

// Manage and execute engine maintenance tasks (single slot)
export class EngineMaintenanceManager {
  private runner = new StreamingTaskRunner('omp:maintenance-output');

  // Check current version and new updates
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
        error: err?.message || tm('electron.maintenance.checkUpdateFailed'),
      };
    }
  }

  // Check optional components status (Python, Speech)
  async checkComponents(binaryPath: string): Promise<{ success: boolean; components?: EngineComponentStatus[]; error?: string }> {
    const components: EngineComponentStatus[] = [];

    // Check Python
    try {
      const { stdout } = await execFileAsync(binaryPath, ['setup', 'python', '--check', '--json'], {
        env: { ...process.env, PATH: buildExtendedPath() },
      });
      const parsed = JSON.parse(stdout);
      components.push({
        id: 'python',
        name: 'Python Environment',
        description: tm('electron.maintenance.pythonDesc'),
        isInstalled: Boolean(parsed.available),
        details: parsed.pythonPath ? tm('electron.maintenance.pathPrefix', { path: parsed.pythonPath }) : undefined,
      });
    } catch {
      components.push({
        id: 'python',
        name: 'Python Environment',
        description: tm('electron.maintenance.pythonDesc'),
        isInstalled: false,
      });
    }

    // Check Speech
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
        description: tm('electron.maintenance.speechDesc'),
        isInstalled: Boolean(sttReady && ttsReady),
        details: `${parsed['Speech-to-Text model']?.status || ''} | ${parsed['Text-to-Speech model']?.status || ''}`,
      });
    } catch {
      components.push({
        id: 'speech',
        name: 'Speech (STT / TTS)',
        description: tm('electron.maintenance.speechDesc'),
        isInstalled: false,
      });
    }

    return { success: true, components };
  }

  // List tiny models
  async listTinyModels(binaryPath: string): Promise<{ success: boolean; models?: TinyModelItem[]; error?: string }> {
    try {
      const { stdout, stderr } = await execFileAsync(binaryPath, ['tiny-models', 'list'], {
        env: { ...process.env, PATH: buildExtendedPath() },
      });
      const models = parseTinyModelsOutput(`${stdout}\n${stderr}`);
      return { success: true, models };
    } catch (err: any) {
      return { success: false, error: err?.message || tm('electron.maintenance.listTinyModelsFailed') };
    }
  }

  // Run maintenance task (stream log to renderer)
  startTask(
    taskId: string,
    binaryPath: string,
    args: string[],
    window: BrowserWindow
  ): { success: boolean; error?: string } {
    return this.runner.startTask(taskId, binaryPath, args, window, {
      busyError: tm('electron.maintenance.alreadyRunning'),
      startText: tm('electron.maintenance.running', { command: `omp ${args.join(' ')}` }),
    });
  }

  // Cancel running maintenance task
  cancelTask(): { success: boolean } {
    return this.runner.cancelTask();
  }

  dispose(): void {
    this.runner.dispose();
  }
}
