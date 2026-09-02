import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import electronPkg from 'electron';
import type { OmpThinkingLevel, OmpApprovalMode } from './types.ts';

export interface AppSettings {
  theme?: 'light' | 'dark';
  customBinaryPath?: string;
  defaultProvider?: string;
  defaultModel?: string;
  defaultThinkingLevel?: OmpThinkingLevel;
  approvalMode?: OmpApprovalMode;
  autoCompaction?: boolean;
  autoRetry?: boolean;
  fastMode?: boolean;
  steeringMode?: string;
  followUpMode?: string;
  interruptMode?: string;
  profile?: string;
  hostToolsEnabled?: boolean;
}

export const DEFAULT_SETTINGS: AppSettings = {
  theme: 'light',
  approvalMode: 'always-ask',
  defaultThinkingLevel: 'off',
  autoCompaction: false,
};

const VALID_THINKING_LEVELS = new Set<string>([
  'off',
  'minimal',
  'low',
  'medium',
  'high',
  'xhigh',
  'max',
  'auto',
]);

const VALID_APPROVAL_MODES = new Set<string>(['always-ask', 'write', 'yolo']);

export class SettingsStore {
  private filePath: string;
  private settings: AppSettings;

  constructor(customFilePath?: string) {
    if (customFilePath) {
      this.filePath = customFilePath;
    } else {
      try {
        const electronApp =
          typeof electronPkg === 'object' && electronPkg !== null
            ? (electronPkg as any).app || (electronPkg as any).default?.app
            : undefined;
        if (electronApp && typeof electronApp.getPath === 'function') {
          this.filePath = path.join(electronApp.getPath('userData'), 'settings.json');
        } else {
          this.filePath = path.join(os.homedir(), '.omp', 'settings.json');
        }
      } catch {
        this.filePath = path.join(os.homedir(), '.omp', 'settings.json');
      }
    }
    this.settings = { ...DEFAULT_SETTINGS };
    this.load();
  }

  private sanitize(raw: any): AppSettings {
    const clean: AppSettings = { ...DEFAULT_SETTINGS };
    if (!raw || typeof raw !== 'object') {
      return clean;
    }
    if (raw.theme === 'light' || raw.theme === 'dark') {
      clean.theme = raw.theme;
    }
    if (typeof raw.customBinaryPath === 'string' && raw.customBinaryPath.trim()) {
      clean.customBinaryPath = raw.customBinaryPath.trim();
    }
    if (typeof raw.defaultProvider === 'string' && raw.defaultProvider.trim()) {
      clean.defaultProvider = raw.defaultProvider.trim();
    }
    if (typeof raw.defaultModel === 'string' && raw.defaultModel.trim()) {
      clean.defaultModel = raw.defaultModel.trim();
    }
    if (raw.defaultThinkingLevel && VALID_THINKING_LEVELS.has(raw.defaultThinkingLevel)) {
      clean.defaultThinkingLevel = raw.defaultThinkingLevel;
    }
    if (raw.approvalMode && VALID_APPROVAL_MODES.has(raw.approvalMode)) {
      clean.approvalMode = raw.approvalMode;
    }
    if (typeof raw.autoRetry === 'boolean') {
      clean.autoRetry = raw.autoRetry;
    }
    if (typeof raw.fastMode === 'boolean') {
      clean.fastMode = raw.fastMode;
    }
    if (typeof raw.autoCompaction === 'boolean') {
      clean.autoCompaction = raw.autoCompaction;
    }
    if (typeof raw.steeringMode === 'string' && raw.steeringMode.trim()) {
      clean.steeringMode = raw.steeringMode.trim();
    }
    if (typeof raw.followUpMode === 'string' && raw.followUpMode.trim()) {
      clean.followUpMode = raw.followUpMode.trim();
    }
    if (typeof raw.interruptMode === 'string' && raw.interruptMode.trim()) {
      clean.interruptMode = raw.interruptMode.trim();
    }
    return clean;
  }

  public get(): AppSettings {
    return { ...this.settings };
  }

  public set(partial: Partial<AppSettings>): AppSettings {
    if (!partial || typeof partial !== 'object') {
      return { ...this.settings };
    }
    const next: AppSettings = { ...this.settings };

    if ('theme' in partial && (partial.theme === 'light' || partial.theme === 'dark')) {
      next.theme = partial.theme;
    }
    if ('customBinaryPath' in partial) {
      next.customBinaryPath =
        typeof partial.customBinaryPath === 'string' && partial.customBinaryPath.trim()
          ? partial.customBinaryPath.trim()
          : undefined;
    }
    if ('defaultProvider' in partial) {
      next.defaultProvider =
        typeof partial.defaultProvider === 'string' && partial.defaultProvider.trim()
          ? partial.defaultProvider.trim()
          : undefined;
    }
    if ('defaultModel' in partial) {
      next.defaultModel =
        typeof partial.defaultModel === 'string' && partial.defaultModel.trim()
          ? partial.defaultModel.trim()
          : undefined;
    }
    if (
      'defaultThinkingLevel' in partial &&
      partial.defaultThinkingLevel &&
      VALID_THINKING_LEVELS.has(partial.defaultThinkingLevel)
    ) {
      next.defaultThinkingLevel = partial.defaultThinkingLevel;
    }
    if ('approvalMode' in partial && partial.approvalMode && VALID_APPROVAL_MODES.has(partial.approvalMode)) {
      next.approvalMode = partial.approvalMode;
    }
    if ('autoCompaction' in partial && typeof partial.autoCompaction === 'boolean') {
      next.autoCompaction = partial.autoCompaction;
    }
    if ('autoRetry' in partial && typeof partial.autoRetry === 'boolean') {
      next.autoRetry = partial.autoRetry;
    }
    if ('fastMode' in partial && typeof partial.fastMode === 'boolean') {
      next.fastMode = partial.fastMode;
    }
    if ('steeringMode' in partial) {
      next.steeringMode =
        typeof partial.steeringMode === 'string' && partial.steeringMode.trim()
          ? partial.steeringMode.trim()
          : undefined;
    }
    if ('followUpMode' in partial) {
      next.followUpMode =
        typeof partial.followUpMode === 'string' && partial.followUpMode.trim()
          ? partial.followUpMode.trim()
          : undefined;
    }
    if ('interruptMode' in partial) {
      next.interruptMode =
        typeof partial.interruptMode === 'string' && partial.interruptMode.trim()
          ? partial.interruptMode.trim()
          : undefined;
    }

    this.settings = next;
    this.save();
    return { ...this.settings };
  }

  public load(): AppSettings {
    try {
      if (fs.existsSync(this.filePath)) {
        const raw = fs.readFileSync(this.filePath, 'utf-8');
        const parsed = JSON.parse(raw);
        if (parsed && typeof parsed === 'object') {
          this.settings = this.sanitize(parsed);
          return { ...this.settings };
        }
      }
    } catch (err) {
      console.warn('[SettingsStore] Không thể đọc settings.json, dùng giá trị mặc định:', err);
    }
    this.settings = { ...DEFAULT_SETTINGS };
    return { ...this.settings };
  }

  public save(): boolean {
    try {
      const dir = path.dirname(this.filePath);
      if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true });
      }
      fs.writeFileSync(this.filePath, JSON.stringify(this.settings, null, 2), 'utf-8');
      return true;
    } catch (err) {
      console.error('[SettingsStore] Không thể ghi settings.json:', err);
      return false;
    }
  }

  public getFilePath(): string {
    return this.filePath;
  }
}

let defaultStoreInstance: SettingsStore | null = null;

export function getSettingsStore(customFilePath?: string): SettingsStore {
  if (customFilePath) {
    return new SettingsStore(customFilePath);
  }
  if (!defaultStoreInstance) {
    defaultStoreInstance = new SettingsStore();
  }
  return defaultStoreInstance;
}
