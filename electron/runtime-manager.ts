import { randomUUID } from 'node:crypto';
import * as fs from 'node:fs/promises';
import path from 'node:path';
import type { BrowserWindow } from 'electron';
import { tm } from '../shared/i18n/index.ts';
import { OmpBridge } from './omp-bridge.ts';
import type { SettingsStore } from './settings-store.ts';
import type {
  ManagedRuntimeSnapshot,
  OmpEventEnvelope,
  OmpThinkingLevel,
} from './types.ts';

export interface ManagedRuntime {
  runtimeId: string;
  projectId: string;
  cwd: string;
  canonicalCwd: string;
  sessionPath?: string;
  bridge: OmpBridge;
  lastActiveAt: number;
}

export class RuntimeManager {
  private window: BrowserWindow | null = null;
  private settingsStore?: SettingsStore | null = null;
  private runtimes: Map<string, ManagedRuntime> = new Map();
  private activeRuntimeId: string | null = null;
  private defaultBridge: OmpBridge;
  private openUrlHandler?: (url: string) => Promise<void>;
  private interactiveFallback?: (providerId: string) => Promise<{ success: boolean; error?: string }>;
  private customBinaryPath: string | null = null;

  public static readonly MAX_CONCURRENT_RUNTIMES = 4;

  constructor(window?: BrowserWindow | null, settingsStore?: SettingsStore | null) {
    this.window = window ?? null;
    this.settingsStore = settingsStore ?? null;
    this.defaultBridge = new OmpBridge(this.window, this.settingsStore, (channel, payload) => {
      if (this.activeRuntimeId === null) {
        this.emitEnvelope('default', 'default', undefined, channel, payload);
      }
    });
  }

  public setWindow(window: BrowserWindow | null): void {
    this.window = window;
    this.defaultBridge.setWindow(window);
    for (const runtime of this.runtimes.values()) {
      runtime.bridge.setWindow(window);
    }
  }

  public setSettingsStore(settingsStore: SettingsStore): void {
    this.settingsStore = settingsStore;
    this.defaultBridge.setSettingsStore(settingsStore);
    for (const runtime of this.runtimes.values()) {
      runtime.bridge.setSettingsStore(settingsStore);
    }
  }

  public setOpenUrlHandler(handler: (url: string) => Promise<void>): void {
    this.openUrlHandler = handler;
    this.defaultBridge.setOpenUrlHandler(handler);
    for (const runtime of this.runtimes.values()) {
      runtime.bridge.setOpenUrlHandler(handler);
    }
  }

  public setInteractiveFallback(
    fallback: (providerId: string) => Promise<{ success: boolean; error?: string }>
  ): void {
    this.interactiveFallback = fallback;
    this.defaultBridge.setInteractiveFallback(fallback);
    for (const runtime of this.runtimes.values()) {
      runtime.bridge.setInteractiveFallback(fallback);
    }
  }

  public setCustomBinaryPath(rawPath?: string | null): void {
    this.customBinaryPath = rawPath ?? null;
    this.defaultBridge.setCustomBinaryPath(rawPath);
    for (const runtime of this.runtimes.values()) {
      runtime.bridge.setCustomBinaryPath(rawPath);
    }
  }

  public setThinkingLevel(level: OmpThinkingLevel): void {
    for (const runtime of this.runtimes.values()) {
      runtime.bridge.setThinkingLevel(level).catch(() => {});
    }
    this.defaultBridge.setThinkingLevel(level).catch(() => {});
  }

  public setSteeringMode(mode: string): void {
    for (const runtime of this.runtimes.values()) {
      runtime.bridge.setSteeringMode(mode).catch(() => {});
    }
    this.defaultBridge.setSteeringMode(mode).catch(() => {});
  }

  public setFollowUpMode(mode: string): void {
    for (const runtime of this.runtimes.values()) {
      runtime.bridge.setFollowUpMode(mode).catch(() => {});
    }
    this.defaultBridge.setFollowUpMode(mode).catch(() => {});
  }

  public setInterruptMode(mode: string): void {
    for (const runtime of this.runtimes.values()) {
      runtime.bridge.setInterruptMode(mode).catch(() => {});
    }
    this.defaultBridge.setInterruptMode(mode).catch(() => {});
  }

  private emitEnvelope(
    runtimeId: string,
    projectId: string,
    sessionPath: string | undefined,
    channel: string,
    payload: unknown
  ): void {
    const runtime = this.runtimes.get(runtimeId);
    const currentSession = runtime ? (runtime.bridge.getCurrentSessionFile() || runtime.sessionPath) : sessionPath;
    if (runtime && currentSession && runtime.sessionPath !== currentSession) {
      runtime.sessionPath = currentSession;
    }
    const envelope: OmpEventEnvelope = {
      runtimeId,
      projectId,
      sessionPath: currentSession,
      channel,
      payload,
    };

    if (this.window && !this.window.isDestroyed()) {
      this.window.webContents.send('omp:event', envelope);
    }

    const isActive = runtimeId === this.activeRuntimeId || (this.activeRuntimeId === null && runtimeId === 'default');
    if (isActive && this.window && !this.window.isDestroyed()) {
      this.window.webContents.send(channel, payload);
    }
  }

  private toSnapshot(runtime: ManagedRuntime): ManagedRuntimeSnapshot {
    return {
      runtimeId: runtime.runtimeId,
      projectId: runtime.projectId,
      sessionPath: runtime.sessionPath,
      cwd: runtime.cwd,
      status: runtime.bridge.getStatus(),
      lastActiveAt: runtime.lastActiveAt,
      isActive: runtime.runtimeId === this.activeRuntimeId,
    };
  }

  public async admitRuntime(
    projectId: string,
    cwd: string,
    sessionPath?: string
  ): Promise<{ success: boolean; runtime?: ManagedRuntimeSnapshot; isNew?: boolean; error?: string }> {
    let canonicalCwd: string;
    try {
      canonicalCwd = await fs.realpath(cwd);
    } catch {
      canonicalCwd = path.resolve(cwd);
    }

    // Reuse existing runtime if same project and cwd (and sessionPath if specified)
    for (const runtime of this.runtimes.values()) {
      const matchProject = runtime.projectId === projectId;
      const matchCwd = runtime.canonicalCwd === canonicalCwd;
      const matchSession = sessionPath ? runtime.sessionPath === sessionPath : true;
      if (matchProject && matchCwd && matchSession) {
        runtime.lastActiveAt = Date.now();
        this.activeRuntimeId = runtime.runtimeId;
        return { success: true, runtime: this.toSnapshot(runtime), isNew: false };
      }
    }

    // Admission control: check limit of 4 concurrent runtimes
    if (this.runtimes.size >= RuntimeManager.MAX_CONCURRENT_RUNTIMES) {
      let candidate: ManagedRuntime | null = null;
      for (const runtime of this.runtimes.values()) {
        const status = runtime.bridge.getStatus();
        const lifecycle = runtime.bridge.getLifecycleState();
        const isBusyStatus = status === 'thinking' || status === 'streaming' || status === 'executing_tool' || status === 'waiting_permission';
        const isBusyLifecycle = lifecycle !== 'idle';
        const isBusy = isBusyStatus || isBusyLifecycle;
        if (!isBusy) {
          if (!candidate || runtime.lastActiveAt < candidate.lastActiveAt) {
            candidate = runtime;
          }
        }
      }

      if (candidate) {
        candidate.bridge.stopProcess();
        this.runtimes.delete(candidate.runtimeId);
      } else {
        return { success: false, error: tm('electron.runtime.maxConcurrencyReached') };
      }
    }

    const runtimeId = 'rt-' + randomUUID().slice(0, 12);
    const bridge = new OmpBridge(this.window, this.settingsStore, (channel, payload) => {
      this.emitEnvelope(runtimeId, projectId, sessionPath, channel, payload);
    });

    if (this.openUrlHandler) bridge.setOpenUrlHandler(this.openUrlHandler);
    if (this.interactiveFallback) bridge.setInteractiveFallback(this.interactiveFallback);
    if (this.customBinaryPath) bridge.setCustomBinaryPath(this.customBinaryPath);

    const managed: ManagedRuntime = {
      runtimeId,
      projectId,
      cwd,
      canonicalCwd,
      sessionPath,
      bridge,
      lastActiveAt: Date.now(),
    };

    this.runtimes.set(runtimeId, managed);
    this.activeRuntimeId = runtimeId;

    return { success: true, runtime: this.toSnapshot(managed), isNew: true };
  }

  public setActiveRuntime(runtimeId: string | null): boolean {
    if (!runtimeId) {
      this.activeRuntimeId = null;
      return true;
    }
    const runtime = this.runtimes.get(runtimeId);
    if (!runtime) {
      return false;
    }
    this.activeRuntimeId = runtimeId;
    runtime.lastActiveAt = Date.now();
    return true;
  }

  public getActiveRuntimeId(): string | null {
    return this.activeRuntimeId;
  }

  public getActiveBridge(): OmpBridge {
    if (this.activeRuntimeId) {
      const runtime = this.runtimes.get(this.activeRuntimeId);
      if (runtime) {
        return runtime.bridge;
      }
    }
    return this.defaultBridge;
  }

  public getBridge(runtimeId?: string): OmpBridge | null {
    if (!runtimeId) {
      return this.getActiveBridge();
    }
    const runtime = this.runtimes.get(runtimeId);
    return runtime ? runtime.bridge : null;
  }

  public getRuntime(runtimeId: string): ManagedRuntime | undefined {
    return this.runtimes.get(runtimeId);
  }

  public listRuntimes(): ManagedRuntimeSnapshot[] {
    return Array.from(this.runtimes.values()).map((r) => this.toSnapshot(r));
  }

  public async stopRuntime(runtimeId: string): Promise<boolean> {
    const runtime = this.runtimes.get(runtimeId);
    if (!runtime) {
      return false;
    }
    runtime.bridge.stopProcess();
    this.runtimes.delete(runtimeId);
    if (this.activeRuntimeId === runtimeId) {
      const remaining = Array.from(this.runtimes.keys());
      this.activeRuntimeId = remaining.length > 0 ? remaining[0] : null;
    }
    return true;
  }

  public async stopAll(): Promise<void> {
    for (const runtime of this.runtimes.values()) {
      runtime.bridge.stopProcess();
    }
    this.defaultBridge.stopProcess();
    this.runtimes.clear();
    this.activeRuntimeId = null;
  }
}
