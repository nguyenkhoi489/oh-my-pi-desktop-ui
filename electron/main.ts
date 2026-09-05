import { app, BrowserWindow, ipcMain, dialog, shell } from 'electron';
import path from 'path';
import fs from 'fs/promises';
import { existsSync } from 'fs';
import os from 'os';
import { execFile } from 'child_process';
import { promisify } from 'util';

const execFileAsync = promisify(execFile);
import { fileURLToPath } from 'url';
import { OmpBridge } from './omp-bridge.ts';
import type {
  WorkspaceFile,
  GitCommitSummary,
  OmpThinkingLevel,
  OmpApprovalMode,
  OmpTodoPhase,
  FetchEngineConfigOptions,
  SetEngineConfigOptions,
  ResetEngineConfigOptions,
  EngineConfigPathOptions,
  FetchGlobalUsageOptions,
  FetchUsageHistoryOptions,
  FetchUsageClientsOptions,
  InvalidateUsageOptions,
  StartStatsDashboardOptions,
  StorageGcOptions,
} from './types.ts';
import { getSettingsStore, type AppSettings } from './settings-store.ts';
import {
  readModelsConfig,
  writeModelsConfig,
  fetchLoginProviders,
  findModels,
  buildExtendedPath,
} from './models-config.ts';
import { AuthLoginManager, fetchAuthenticatedProviders } from './auth-login.ts';
import { readModelRolesConfig, writeModelRolesConfig } from './roles-config.ts';
import {
  fetchGlobalUsage,
  fetchGlobalStats,
  fetchUsageHistory,
  fetchUsageClients,
  invalidateUsage,
} from './usage-stats.ts';
import { StatsDashboardManager } from './stats-dashboard.ts';
import { listImportCandidates, importForeignSession } from './session-import.ts';
import { EngineMaintenanceManager } from './engine-maintenance.ts';
import { CommitAssistantManager, isGitDirty, type CommitRunOptions } from './commit-assistant.ts';
import { CleanseRunnerManager, type CleanseRunOptions } from './cleanse-runner.ts';
import { BrowserRelayManager, type BrowserRelayInstallOptions, type BrowserRelayStartOptions } from './browser-relay.ts';
import { SayManager, type SayOptions } from './tts-say.ts';
import { shareSession, joinCollabSession, type ShareSessionOptions } from './collab-share.ts';
import { OpsManager } from './ops-manager.ts';
import { ExtensionManager } from './extension-manager.ts';
import { listProfiles, createProfile, deleteProfile } from './profile-paths.ts';
import {
  fetchEngineConfig,
  setEngineConfigValue,
  resetEngineConfigValue,
  getEngineConfigPath,
} from './engine-config.ts';
import { runGc } from './storage-gc.ts';
import { validateExternalUrl } from './external-url.ts';
import { runImages } from './image-backends.ts';
import { listSshHosts, addSshHost, removeSshHost } from './ssh-hosts.ts';
import type { SshHostAddInput } from './types.ts';
import { listGrievances, cleanGrievances, pushGrievances } from './grievances.ts';
import type { GrievancesListOptions, GrievancesCleanOptions } from './types.ts';
import type { ImageBackendsAction, ImageBackendsOptions } from './types.ts';
import { RuntimeManager } from './runtime-manager.ts';
import { ProjectsStore } from './projects-store.ts';
import { indexProjectSessions } from './session-indexer.ts';
import { configureWebviewSecurity } from './webview-security.ts';
import { setCurrentLocale, tm } from '../shared/i18n/index.ts';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

let mainWindow: BrowserWindow | null = null;
let runtimeManager: RuntimeManager | null = null;
const projectsStore = new ProjectsStore();

const ompBridge = new Proxy({} as unknown as OmpBridge, {
  get(_target, prop) {
    const active = runtimeManager ? runtimeManager.getActiveBridge() : null;
    if (!active) return undefined;
    const value = (active as unknown as Record<string, unknown>)[prop as string];
    if (typeof value === 'function') {
      return (value as Function).bind(active);
    }
    return value;
  },
  has(_target, prop) {
    const active = runtimeManager ? runtimeManager.getActiveBridge() : null;
    return active ? prop in active : false;
  },
});
const authLoginManager = new AuthLoginManager((url) => shell.openExternal(url));
const engineMaintenanceManager = new EngineMaintenanceManager();
const opsManager = new OpsManager();
const extensionManager = new ExtensionManager();
const statsDashboardManager = new StatsDashboardManager();
const commitAssistantManager = new CommitAssistantManager();
const cleanseRunnerManager = new CleanseRunnerManager();
const browserRelayManager = new BrowserRelayManager();
const sayManager = new SayManager((status) => {
  if (mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.webContents.send('omp:say-status', status);
  }
});
const isDev = process.env.NODE_ENV === 'development' || !app.isPackaged;

function createWindow() {
  const appIconPath = path.join(__dirname, '../assets/icons/icon-1024.png');
  if (process.platform === 'darwin' && app.dock && existsSync(appIconPath)) {
    app.dock.setIcon(appIconPath);
  }

  mainWindow = new BrowserWindow({
    width: 1440,
    height: 900,
    minWidth: 1024,
    minHeight: 700,
    title: 'OMP Agent',
    icon: existsSync(appIconPath) ? appIconPath : undefined,
    titleBarStyle: 'hiddenInset', // Native macOS Traffic Lights
    trafficLightPosition: { x: 16, y: 14 },
    vibrancy: 'under-window',
    visualEffectState: 'active',
    backgroundColor: '#f8fafc',
    webPreferences: {
      preload: path.join(__dirname, 'preload.cjs'),
      nodeIntegration: false,
      contextIsolation: true,
      devTools: isDev,
      webviewTag: true,
    },
  });

  // Block DevTools shortcuts in production
  if (!isDev) {
    mainWindow.webContents.on('before-input-event', (event, input) => {
      if (input.key === 'F12') {
        event.preventDefault();
      }
      if (
        (input.control || input.meta) &&
        (input.shift || input.alt) &&
        (input.key.toLowerCase() === 'i' || input.key.toLowerCase() === 'j')
      ) {
        event.preventDefault();
      }
    });
  }

  const settingsStore = getSettingsStore();
  runtimeManager = new RuntimeManager(mainWindow, settingsStore);
  runtimeManager.setOpenUrlHandler((url) => shell.openExternal(url));
  runtimeManager.setInteractiveFallback(async (providerId) => {
    const binPath = await resolveOmpBinaryPath();
    if (!binPath || !mainWindow) return { success: false, error: 'Cannot launch fallback CLI' };
    return authLoginManager.start(binPath, providerId, mainWindow);
  });
  const initialSettings = settingsStore.get();
  if (initialSettings.language) {
    setCurrentLocale(initialSettings.language);
  }
  if (initialSettings.customBinaryPath) {
    runtimeManager.setCustomBinaryPath(initialSettings.customBinaryPath);
  }
  if (isDev) {
    mainWindow.loadURL('http://localhost:5173');
    // mainWindow.webContents.openDevTools({ mode: 'detach' });
  } else {
    mainWindow.loadFile(path.join(__dirname, '../dist/index.html'));
  }

  mainWindow.on('closed', () => {
    mainWindow = null;
    disposeAll();
  });
}

function disposeAll() {
  authLoginManager.dispose();
  engineMaintenanceManager.dispose();
  opsManager.dispose();
  statsDashboardManager.dispose();
  commitAssistantManager.dispose();
  cleanseRunnerManager.dispose();
  browserRelayManager.dispose();
  sayManager.dispose();
  if (runtimeManager) {
    runtimeManager.stopAll().catch(() => {});
  }
}
// IPC Handlers: OMP Discovery & Process
ipcMain.handle('omp:check-installation', async () => {
  if (!ompBridge) return { installed: false, error: 'Bridge uninitialized' };
  return ompBridge.checkInstallation();
});

ipcMain.handle('omp:set-custom-path', async (_, customPath: string) => {
  if (!ompBridge) return { installed: false };
  const settingsStore = getSettingsStore();
  settingsStore.set({ customBinaryPath: customPath });
  ompBridge.setCustomBinaryPath(customPath);
  return ompBridge.checkInstallation();
});

ipcMain.handle('fs:select-binary', async () => {
  if (!mainWindow) return null;
  const result = await dialog.showOpenDialog(mainWindow, {
    properties: ['openFile'],
    title: tm('electron.main.selectBinaryTitle'),
  });
  if (result.canceled || result.filePaths.length === 0) return null;
  return result.filePaths[0];
});

ipcMain.handle('omp:start-process', async (_, workspacePath: string, model?: string, options?: { provider?: string; extraArgs?: string[]; approvalMode?: OmpApprovalMode }) => {
  if (!runtimeManager) return { success: false };
  const project = await projectsStore.addProject(workspacePath);
  const admitRes = await runtimeManager.admitRuntime(project.id, workspacePath);
  if (!admitRes.success) {
    return { success: false, error: admitRes.error };
  }
  const bridge = runtimeManager.getActiveBridge();
  if (!admitRes.isNew && bridge.isRunning()) {
    return { success: true };
  }
  return bridge.startProcess(workspacePath, model, options);
});

// IPC Handlers: Multi-Project & Runtime Management (Phase 1)
ipcMain.handle('projects:list', async () => {
  return { success: true, projects: await projectsStore.getProjects() };
});

ipcMain.handle('projects:add', async (_, projectPath: string, name?: string) => {
  if (!projectPath || typeof projectPath !== 'string' || !projectPath.trim()) {
    return { success: false, error: tm('electron.runtime.projectPathRequired') };
  }
  const project = await projectsStore.addProject(projectPath, name);
  return { success: true, project };
});

ipcMain.handle('projects:remove', async (_, id: string) => {
  const success = await projectsStore.removeProject(id);
  return { success };
});

ipcMain.handle('projects:pin', async (_, id: string) => {
  const success = await projectsStore.togglePin(id);
  return { success };
});

ipcMain.handle('runtime:list', async () => {
  return { success: true, runtimes: runtimeManager ? runtimeManager.listRuntimes() : [] };
});

ipcMain.handle('runtime:admit', async (_, projectId: string, cwd: string, sessionPath?: string) => {
  if (!runtimeManager) return { success: false, error: 'RuntimeManager uninitialized' };
  const res = await runtimeManager.admitRuntime(projectId, cwd, sessionPath);
  return {
    ...res,
    runtimeId: res.runtime?.runtimeId,
  };
});

ipcMain.handle('runtime:switch', async (_, runtimeId: string) => {
  if (!runtimeManager) return { success: false, error: 'RuntimeManager uninitialized' };
  const ok = runtimeManager.setActiveRuntime(runtimeId);
  return { success: ok };
});

ipcMain.handle('runtime:stop', async (_, runtimeId: string) => {
  if (!runtimeManager) return { success: false, error: 'RuntimeManager uninitialized' };
  const ok = await runtimeManager.stopRuntime(runtimeId);
  return { success: ok };
});

ipcMain.handle('runtime:index-sessions', async (_, projectId: string, projectPath: string, profile?: string) => {
  try {
    const sessions = await indexProjectSessions(projectId, projectPath, profile);
    return { success: true, sessions };
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    return { success: false, error: msg };
  }
});

ipcMain.handle('omp:stop-process', async () => {
  if (!ompBridge) return { success: false };
  return ompBridge.stopProcess();
});

ipcMain.handle('omp:send-message', async (_, prompt: string, context?: { files?: string[] }) => {
  if (!ompBridge) return { success: false };
  return ompBridge.sendMessage(prompt, context);
});

ipcMain.handle('omp:steer', async (_, message: string, context?: { files?: string[] }) => {
  if (!ompBridge) return { success: false };
  return ompBridge.steer(message, context);
});

ipcMain.handle('omp:abort-and-prompt', async (_, prompt: string, context?: { files?: string[] }) => {
  if (!ompBridge) return { success: false };
  return ompBridge.abortAndPrompt(prompt, context);
});

ipcMain.handle('omp:follow-up', async (_, message: string, context?: { files?: string[] }) => {
  if (!ompBridge) return { success: false };
  return ompBridge.followUp(message, context);
});

ipcMain.handle('omp:set-steering-mode', async (_, mode: string) => {
  if (!ompBridge) return { success: false };
  return ompBridge.setSteeringMode(mode);
});

ipcMain.handle('omp:set-follow-up-mode', async (_, mode: string) => {
  if (!ompBridge) return { success: false };
  return ompBridge.setFollowUpMode(mode);
});

ipcMain.handle('omp:set-interrupt-mode', async (_, mode: string) => {
  if (!ompBridge) return { success: false };
  return ompBridge.setInterruptMode(mode);
});

ipcMain.handle('omp:abort', async () => {
  if (!ompBridge) return { success: false };
  return ompBridge.abort();
});

ipcMain.handle('omp:respond-permission', async (_, requestId: string, approved: boolean) => {
  if (!ompBridge) return;
  ompBridge.respondPermission(requestId, approved);
});

ipcMain.handle('omp:ui-respond', async (_, id: string, payload: { value?: unknown; confirmed?: boolean; cancelled?: boolean }) => {
  if (!ompBridge) return;
  ompBridge.respondUiRequest(id, payload);
});

// IPC Handlers: Settings & Persistence (Phase 7)
ipcMain.handle('settings:get', async () => {
  const store = getSettingsStore();
  return store.get();
});

ipcMain.handle('settings:set', async (_, partial: Partial<AppSettings>) => {
  const store = getSettingsStore();
  const updated = store.set(partial);
  if (runtimeManager) {
    if ('customBinaryPath' in partial) {
      runtimeManager.setCustomBinaryPath(updated.customBinaryPath);
    }
    if ('defaultThinkingLevel' in partial && partial.defaultThinkingLevel) {
      runtimeManager.setThinkingLevel(partial.defaultThinkingLevel);
    }
    if ('steeringMode' in partial && partial.steeringMode) {
      runtimeManager.setSteeringMode(partial.steeringMode);
    }
    if ('followUpMode' in partial && partial.followUpMode) {
      runtimeManager.setFollowUpMode(partial.followUpMode);
    }
    if ('interruptMode' in partial && partial.interruptMode) {
      runtimeManager.setInterruptMode(partial.interruptMode);
    }
  }
  if ('language' in partial && updated.language) {
    setCurrentLocale(updated.language);
  }
  return updated;
});

// IPC Handlers: Provider & Custom LLM Management (Phase 8)
ipcMain.handle('omp:models-config-read', async () => {
  return readModelsConfig();
});

ipcMain.handle('omp:models-config-write', async (_, payload: { providers: any[] }) => {
  return writeModelsConfig(payload?.providers || []);
});

ipcMain.handle('omp:models-find', async (_, pattern: string) => {
  const binaryPath = await resolveOmpBinaryPath();
  const profile = getSettingsStore().get().profile;
  return findModels(binaryPath, pattern, { profile });
});

// IPC Handlers: Model Roles trong ~/.omp/agent/config.yml
ipcMain.handle('omp:model-roles-read', async () => {
  return readModelRolesConfig();
});

ipcMain.handle('omp:model-roles-write', async (_, payload: { roles: Record<string, string> }) => {
  return writeModelRolesConfig(payload?.roles || {});
});

async function resolveOmpBinaryPath(): Promise<string | undefined> {
  if (ompBridge) {
    const installStatus = await ompBridge.checkInstallation();
    if (installStatus.installed && installStatus.binaryPath) {
      return installStatus.binaryPath;
    }
  }
  return getSettingsStore().get().customBinaryPath;
}

ipcMain.handle('omp:login-providers', async () => {
  if (ompBridge && ompBridge.isRunning()) {
    const res = await ompBridge.getLoginProviders();
    if (res.success && res.providers) {
      return res;
    }
  }
  const binaryPath = await resolveOmpBinaryPath();
  const listRes = await fetchLoginProviders(binaryPath);
  if (!listRes.success || !listRes.providers) {
    return listRes;
  }
  if (binaryPath) {
    const authRes = await fetchAuthenticatedProviders(binaryPath);
    if (authRes.success && Array.isArray(authRes.providers)) {
      const authedSet = new Set(authRes.providers);
      return {
        success: true,
        providers: listRes.providers.map((p) => ({
          ...p,
          available: p.available ?? true,
          authenticated: authedSet.has(p.id),
        })),
      };
    }
  }
  return listRes;
});

// IPC Handlers: OAuth Login & Logout
ipcMain.handle('omp:auth-login-start', async (_, providerId: string) => {
  const binaryPath = await resolveOmpBinaryPath();
  if (!binaryPath) {
    return { success: false, error: tm('electron.main.binaryNotFoundForLogin') };
  }
  if (!mainWindow) {
    return { success: false, error: tm('electron.main.windowNotReady') };
  }

  if (ompBridge && ompBridge.isRunning()) {
    return ompBridge.startAuthLogin(providerId);
  }

  // Engine offline: fall back to auth-broker login through the CLI
  return authLoginManager.start(binaryPath, providerId, mainWindow);
});

ipcMain.handle('omp:auth-status', async () => {
  const binaryPath = await resolveOmpBinaryPath();
  if (!binaryPath) {
    return { success: false, providers: [], error: tm('electron.main.binaryNotFound') };
  }
  return fetchAuthenticatedProviders(binaryPath);
});

ipcMain.handle('omp:auth-login-cancel', async () => {
  if (ompBridge && ompBridge.hasActiveAuthLogin()) {
    return ompBridge.cancelAuthLogin();
  }
  return authLoginManager.cancel();
});

ipcMain.handle('omp:auth-login-input', async (_, text: string) => {
  if (ompBridge && ompBridge.hasActiveAuthLogin()) {
    return ompBridge.submitAuthLoginInput(String(text ?? ''));
  }
  return authLoginManager.submitInput(String(text ?? ''));
});

ipcMain.handle('omp:auth-logout', async (_, providerId: string) => {
  const binaryPath = await resolveOmpBinaryPath();
  if (!binaryPath) {
    return { success: false, error: tm('electron.main.binaryNotFound') };
  }
  if (!providerId || typeof providerId !== 'string') {
    return { success: false, error: tm('electron.main.invalidProviderId') };
  }
  try {
    await execFileAsync(binaryPath, ['auth-broker', 'logout', providerId.trim()], {
      env: { ...process.env, PATH: buildExtendedPath() },
      encoding: 'utf-8',
      timeout: 10000,
    });
    return { success: true };
  } catch (err: unknown) {
    const errorMsg = err instanceof Error ? err.message : String(err);
    return { success: false, error: tm('electron.main.logoutFailed', { detail: errorMsg }) };
  }
});

ipcMain.handle('omp:is-engine-running', () => {
  return ompBridge ? ompBridge.isRunning() : false;
});

// IPC Handlers: Model Catalog & Engine State (Phase 2 Additions)
ipcMain.handle('omp:get-models', async () => {
  if (!ompBridge) return { success: false, error: 'Bridge uninitialized' };
  return ompBridge.getAvailableModels();
});

ipcMain.handle('omp:get-commands', async () => {
  if (!ompBridge) return { success: false, error: 'Bridge uninitialized' };
  return ompBridge.getAvailableCommands();
});

ipcMain.handle('omp:set-model', async (_, provider: string, modelId: string) => {
  if (!ompBridge) return { success: false, error: 'Bridge uninitialized' };
  return ompBridge.setModel(provider, modelId);
});

ipcMain.handle('omp:set-thinking-level', async (_, level: OmpThinkingLevel) => {
  if (!ompBridge) return { success: false, error: 'Bridge uninitialized' };
  return ompBridge.setThinkingLevel(level);
});

ipcMain.handle('omp:get-state', async () => {
  if (!ompBridge) return { success: false, error: 'Bridge uninitialized' };
  return ompBridge.getState();
});

ipcMain.handle('omp:session-stats', async () => {
  if (!ompBridge) return { success: false, error: 'Bridge uninitialized' };
  return ompBridge.getSessionStats();
});

// IPC Handlers: Global Usage & Stats (Phase 7 Parity)
ipcMain.handle('omp:global-usage', async (_, options?: boolean | FetchGlobalUsageOptions) => {
  const binaryPath = await resolveOmpBinaryPath();
  return fetchGlobalUsage(binaryPath, options);
});

ipcMain.handle('omp:global-stats', async (_, forceRefresh?: boolean) => {
  const binaryPath = await resolveOmpBinaryPath();
  return fetchGlobalStats(binaryPath, { forceRefresh: Boolean(forceRefresh) });
});

ipcMain.handle('omp:usage-history', async (_, options?: FetchUsageHistoryOptions) => {
  const binaryPath = await resolveOmpBinaryPath();
  return fetchUsageHistory(binaryPath, options);
});

ipcMain.handle('omp:usage-clients', async (_, options?: FetchUsageClientsOptions) => {
  const binaryPath = await resolveOmpBinaryPath();
  return fetchUsageClients(binaryPath, options);
});

ipcMain.handle('omp:usage-invalidate', async (_, options?: InvalidateUsageOptions) => {
  const binaryPath = await resolveOmpBinaryPath();
  return invalidateUsage(binaryPath, options);
});

ipcMain.handle('omp:stats-dashboard-start', async (_, options?: StartStatsDashboardOptions) => {
  const binaryPath = await resolveOmpBinaryPath();
  const defaultPort = getSettingsStore().get().statsDashboardPort;
  const requestedPort = options?.port;
  const hasPort = requestedPort !== undefined && requestedPort !== null;
  const portValid = !hasPort || (Number.isInteger(requestedPort) && requestedPort >= 1 && requestedPort <= 65535);
  const hostValid = options?.host === undefined || /^[A-Za-z0-9.\-]+$/.test(options.host);
  if (!portValid || !hostValid) {
    return { success: false, error: tm('electron.main.invalidDashboardOptions') };
  }
  const port = hasPort ? requestedPort : defaultPort;
  return statsDashboardManager.start(binaryPath, { ...options, port });
});

ipcMain.handle('omp:stats-dashboard-stop', async () => {
  return statsDashboardManager.stop();
});

ipcMain.handle('omp:stats-dashboard-status', async () => {
  return statsDashboardManager.status();
});

ipcMain.handle('shell:open-external', async (_, url: string) => {
  const validated = validateExternalUrl(url);
  if (!validated.valid) {
    return { success: false, error: validated.error };
  }
  try {
    await shell.openExternal(validated.url);
    return { success: true };
  } catch (err: any) {
    return { success: false, error: err?.message || tm('electron.main.cannotOpenUrlExternal') };
  }
});

// IPC Handlers: Engine Configuration (Phase 2 Parity)
ipcMain.handle('omp:config-list', async (_, options?: FetchEngineConfigOptions) => {
  const binaryPath = await resolveOmpBinaryPath();
  return fetchEngineConfig(binaryPath, options);
});

ipcMain.handle('omp:config-set', async (_, key: string, value: string, options?: SetEngineConfigOptions) => {
  const binaryPath = await resolveOmpBinaryPath();
  return setEngineConfigValue(binaryPath, key, value, options);
});

ipcMain.handle('omp:config-reset', async (_, key: string, options?: ResetEngineConfigOptions) => {
  const binaryPath = await resolveOmpBinaryPath();
  return resetEngineConfigValue(binaryPath, key, options);
});

ipcMain.handle('omp:config-path', async (_, options?: EngineConfigPathOptions) => {
  const binaryPath = await resolveOmpBinaryPath();
  return getEngineConfigPath(binaryPath, options);
});

ipcMain.handle('omp:get-approval-mode', async () => {
  if (!ompBridge) return { success: false, error: 'Bridge uninitialized' };
  return ompBridge.getApprovalMode();
});

ipcMain.handle('omp:set-approval-mode', async (_, mode: OmpApprovalMode) => {
  if (!ompBridge) return { success: false, error: 'Bridge uninitialized' };
  return ompBridge.setApprovalMode(mode);
});

ipcMain.handle('omp:compact', async (_, customInstructions?: string) => {
  if (!ompBridge) return { success: false, error: 'Bridge uninitialized' };
  return ompBridge.compact(customInstructions);
});

ipcMain.handle('omp:set-auto-compaction', async (_, enabled: boolean) => {
  if (!ompBridge) return { success: false, error: 'Bridge uninitialized' };
  return ompBridge.setAutoCompaction(enabled);
});
ipcMain.handle('omp:set-auto-retry', async (_, enabled: boolean) => {
  if (!ompBridge) return { success: false, error: 'Bridge uninitialized' };
  return ompBridge.setAutoRetry(enabled);
});

ipcMain.handle('omp:abort-retry', async () => {
  if (!ompBridge) return { success: false, error: 'Bridge uninitialized' };
  return ompBridge.abortRetry();
});

ipcMain.handle('omp:set-fast-mode', async (_, enabled: boolean) => {
  if (!ompBridge) return { success: false, error: 'Bridge uninitialized' };
  return ompBridge.setFastMode(enabled);
});

ipcMain.handle('omp:get-last-assistant-text', async () => {
  if (!ompBridge) return { success: false, error: 'Bridge uninitialized' };
  return ompBridge.getLastAssistantText();
});

ipcMain.handle('omp:handoff', async () => {
  if (!ompBridge) return { success: false, error: 'Bridge uninitialized' };
  return ompBridge.handoff();
});

// IPC Handlers: Integrated Bash Bridge (Phase 10)
ipcMain.handle('omp:run-bash', async (_, command: string) => {
  if (!ompBridge) return { success: false, error: 'Bridge uninitialized' };
  return ompBridge.runBash(command);
});

ipcMain.handle('omp:abort-bash', async () => {
  if (!ompBridge) return { success: false, error: 'Bridge uninitialized' };
  return ompBridge.abortBash();
});


// IPC Handlers: Todos Management (Phase 4)
ipcMain.handle('omp:get-todos', async () => {
  if (!ompBridge) return { success: false, error: 'Bridge uninitialized' };
  const data = ompBridge.getTodos();
  return { success: true, phases: data.phases, todos: data.todos };
});

ipcMain.handle('omp:set-todos', async (_, phases: OmpTodoPhase[]) => {
  if (!ompBridge) return { success: false, error: 'Bridge uninitialized' };
  return ompBridge.setTodos(phases);
});
// IPC Handlers: Sessions & Subagent Hub (Phase 1 Additions)
ipcMain.handle('omp:list-sessions', async () => {
  if (!ompBridge) return { success: false, error: 'Bridge uninitialized' };
  return ompBridge.listSessions();
});

ipcMain.handle('omp:new-session', async (_, parentSession?: string) => {
  if (!ompBridge) return { success: false, error: 'Bridge uninitialized' };
  return ompBridge.newSession(parentSession);
});

ipcMain.handle('omp:switch-session', async (_, sessionPath: string) => {
  if (!ompBridge) return { success: false, error: 'Bridge uninitialized' };
  return ompBridge.switchSession(sessionPath);
});

ipcMain.handle('omp:branch-session', async (_, entryId: string) => {
  if (!ompBridge) return { success: false, error: 'Bridge uninitialized' };
  return ompBridge.branchSession(entryId);
});

ipcMain.handle('omp:load-history', async () => {
  if (!ompBridge) return { success: false, error: 'Bridge uninitialized' };
  return ompBridge.loadHistory();
});

ipcMain.handle('omp:branch-entries', async () => {
  if (!ompBridge) return { success: false, error: 'Bridge uninitialized' };
  return ompBridge.getBranchEntries();
});

ipcMain.handle('omp:rename-session', async (_, name: string) => {
  if (!ompBridge) return { success: false, error: 'Bridge uninitialized' };
  return ompBridge.renameSession(name);
});

ipcMain.handle('omp:delete-session', async (_, sessionPath: string) => {
  if (!ompBridge) return { success: false, error: 'Bridge uninitialized' };
  return ompBridge.deleteSession(sessionPath);
});

ipcMain.handle('omp:repair-session', async (_, sessionPath?: string) => {
  if (!ompBridge) return { success: false, error: 'Bridge uninitialized' };
  return ompBridge.repairSession(sessionPath);
});

ipcMain.handle('omp:export-session', async () => {
  if (!ompBridge) return { success: false, error: 'Bridge uninitialized' };
  const win = mainWindow || BrowserWindow.getFocusedWindow();
  const state = await ompBridge.getState().catch(() => ({ success: false, state: undefined }));
  const defaultTitle = state.state?.sessionName || 'session';
  const cleanTitle = defaultTitle.replace(/[/\\?%*:|"<>]/g, '-').trim() || 'session';
  const result = await dialog.showSaveDialog(win || (undefined as any), {
    title: tm('electron.main.exportHtmlTitle'),
    defaultPath: `${cleanTitle}.html`,
    filters: [{ name: 'HTML Files', extensions: ['html'] }],
  });
  if (result.canceled || !result.filePath) {
    return { success: false, cancelled: true };
  }
  const filePath = result.filePath;
  const res = await ompBridge.exportHtml(filePath);
  if (res.success) {
    ompBridge.emitNotification(tm('electron.main.exportedHtmlNotification', { file: path.basename(filePath) }), 'info');
    shell.showItemInFolder(filePath);
    return { success: true, path: filePath };
  }
  return { success: false, error: res.error };
});

ipcMain.handle('omp:list-import-candidates', async (_, source?: 'claude' | 'codex') => {
  try {
    const state = ompBridge ? await ompBridge.getState().catch(() => null) : null;
    const currentCwd = state?.state?.cwd as string | undefined;
    const candidates = await listImportCandidates(source, currentCwd);
    return { success: true, candidates };
  } catch (err: any) {
    return { success: false, error: err.message || tm('electron.main.scanSessionFailed') };
  }
});

ipcMain.handle('omp:import-session', async (_, candidate: any, targetCwd?: string) => {
  try {
    const state = ompBridge ? await ompBridge.getState().catch(() => null) : null;
    const cwd = targetCwd || (state?.state?.cwd as string) || process.cwd();
    const sessionDir = ompBridge?.getCurrentSessionFile()
      ? path.dirname(ompBridge.getCurrentSessionFile()!)
      : undefined;
    const result = await importForeignSession(candidate, cwd, sessionDir);
    return result;
  } catch (err: any) {
    return { success: false, error: err.message || tm('electron.main.importSessionFailed') };
  }
});

// IPC Handlers: Collab Share & Join (Phase 12)
ipcMain.handle('omp:share-session', async (_, sessionIdentifier: string, options?: ShareSessionOptions) => {
  const binary = (await getSettingsStore().get()).customBinaryPath || 'omp';
  return shareSession(binary, sessionIdentifier, options);
});

ipcMain.handle('omp:join-session', async (_, link: string) => {
  const binary = (await getSettingsStore().get()).customBinaryPath || 'omp';
  const result = await joinCollabSession(binary, link);
  if (result.success && ompBridge) {
    await ompBridge.listSessions().catch(() => {});
  }
  return result;
});

// IPC Handlers: Engine Maintenance (Phase 9)
ipcMain.handle('omp:maintenance-check-update', async () => {
  const binary = (await getSettingsStore().get()).customBinaryPath || 'omp';
  return engineMaintenanceManager.checkUpdate(binary);
});

ipcMain.handle('omp:maintenance-check-components', async () => {
  const binary = (await getSettingsStore().get()).customBinaryPath || 'omp';
  return engineMaintenanceManager.checkComponents(binary);
});

ipcMain.handle('omp:maintenance-list-tiny-models', async () => {
  const binary = (await getSettingsStore().get()).customBinaryPath || 'omp';
  return engineMaintenanceManager.listTinyModels(binary);
});

ipcMain.handle('omp:maintenance-run-task', async (_, taskId: string, args: string[]) => {
  const win = mainWindow || BrowserWindow.getFocusedWindow();
  if (!win) return { success: false, error: tm('electron.main.appWindowNotFound') };
  const binary = (await getSettingsStore().get()).customBinaryPath || 'omp';
  return engineMaintenanceManager.startTask(taskId, binary, args, win);
});

ipcMain.handle('omp:maintenance-cancel-task', async () => {
  return engineMaintenanceManager.cancelTask();
});

// IPC Handlers: Commit Assistant (Phase 14)
ipcMain.handle('omp:commit-run', async (_, opts: CommitRunOptions) => {
  const win = mainWindow || BrowserWindow.getFocusedWindow();
  if (!win) return { success: false, error: tm('electron.main.appWindowNotFound') };
  const binary = (await getSettingsStore().get()).customBinaryPath || 'omp';
  return commitAssistantManager.runCommit(binary, opts, win);
});

ipcMain.handle('omp:commit-cancel', async () => {
  return commitAssistantManager.cancelCommit();
});

ipcMain.handle('omp:commit-status', async (_, cwd?: string) => {
  const targetCwd = cwd || (ompBridge ? ompBridge.getWorkspacePath() : null) || undefined;
  return isGitDirty(targetCwd);
});

// IPC Handlers: Cleanse Runner (Phase 15)
ipcMain.handle('omp:cleanse-run', async (_, opts: CleanseRunOptions) => {
  const win = mainWindow || BrowserWindow.getFocusedWindow();
  if (!win) return { success: false, error: tm('electron.main.appWindowNotFound') };
  const binary = (await getSettingsStore().get()).customBinaryPath || 'omp';
  const targetCwd = opts?.cwd || (ompBridge ? ompBridge.getWorkspacePath() : null) || undefined;
  if (!targetCwd) return { success: false, error: tm('electron.commit.noWorkspace') };
  return cleanseRunnerManager.runCleanse(binary, { ...opts, cwd: targetCwd }, win);
});

ipcMain.handle('omp:cleanse-cancel', async () => {
  return cleanseRunnerManager.cancelCleanse();
});

// IPC Handlers: Browser Relay Service (Phase 16)
ipcMain.handle('omp:browser-relay-install', async (_, options?: BrowserRelayInstallOptions) => {
  const win = mainWindow || BrowserWindow.getFocusedWindow();
  if (!win) return { success: false, error: tm('electron.main.appWindowNotFound') };
  const binary = (await getSettingsStore().get()).customBinaryPath || 'omp';
  return browserRelayManager.installRelay(binary, win, options);
});

ipcMain.handle('omp:browser-relay-start', async (_, options?: BrowserRelayStartOptions) => {
  const settings = await getSettingsStore().get();
  const binary = settings.customBinaryPath || 'omp';
  return browserRelayManager.startRelay(binary, options, settings.profile);
});

ipcMain.handle('omp:browser-relay-stop', async () => {
  const binary = (await getSettingsStore().get()).customBinaryPath || 'omp';
  return browserRelayManager.stopRelay(binary);
});

ipcMain.handle('omp:browser-relay-status', async () => {
  const binary = (await getSettingsStore().get()).customBinaryPath || 'omp';
  return browserRelayManager.getStatus(binary);
});

// IPC Handlers: Text-to-Speech (Phase 17)
ipcMain.handle('omp:say-start', async (_, text: string, options?: SayOptions) => {
  const binary = (await getSettingsStore().get()).customBinaryPath || 'omp';
  return sayManager.speak(binary, text, options);
});

ipcMain.handle('omp:say-stop', async () => {
  sayManager.stop();
  return { success: true };
});

// IPC Handlers: Background Process & Worktree Managers (Phase 13)
ipcMain.handle('omp:ps-list', async (_, options?: { all?: boolean; global?: string }) => {
  const binary = (await getSettingsStore().get()).customBinaryPath || 'omp';
  return opsManager.listProcesses(binary, options);
});

ipcMain.handle('omp:ps-control', async (_, action: 'stop' | 'kill' | 'restart', name: string, options?: { global?: string; timeout?: number; dir?: string }) => {
  const binary = (await getSettingsStore().get()).customBinaryPath || 'omp';
  return opsManager.controlProcess(binary, action, name, options);
});

ipcMain.handle('omp:ps-remove', async (_, name: string, options?: { global?: string; dir?: string }) => {
  const binary = (await getSettingsStore().get()).customBinaryPath || 'omp';
  return opsManager.removeProcess(binary, name, options);
});

ipcMain.handle('omp:ps-logs', async (_, name: string, options?: { lines?: number; head?: boolean; grep?: string; global?: string; dir?: string }) => {
  const binary = (await getSettingsStore().get()).customBinaryPath || 'omp';
  return opsManager.getProcessLogs(binary, name, options);
});

ipcMain.handle('omp:ps-info', async (_, name: string, options?: { global?: string; dir?: string }) => {
  const binary = (await getSettingsStore().get()).customBinaryPath || 'omp';
  return opsManager.info(binary, name, options);
});

ipcMain.handle('omp:ps-logs-follow-start', async (_, name: string, options?: { lines?: number; head?: boolean; grep?: string; global?: string; dir?: string }) => {
  const binary = (await getSettingsStore().get()).customBinaryPath || 'omp';
  return opsManager.startLogFollow(binary, name, options || {}, (line) => {
    if (mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.webContents.send('omp:ps-log-line', { name, line });
    }
  });
});

ipcMain.handle('omp:ps-logs-follow-stop', async () => {
  return opsManager.stopLogFollow();
});

ipcMain.handle('omp:worktree-list', async () => {
  const binary = (await getSettingsStore().get()).customBinaryPath || 'omp';
  return opsManager.listWorktrees(binary);
});

ipcMain.handle('omp:worktree-clear', async (_, options?: { all?: boolean; dryRun?: boolean }) => {
  const binary = (await getSettingsStore().get()).customBinaryPath || 'omp';
  return opsManager.clearWorktrees(binary, options);
});

// IPC Handlers: Storage GC (Phase 10)
ipcMain.handle('omp:gc-run', async (_, options?: StorageGcOptions) => {
  if (options?.apply && ompBridge && ompBridge.isStreaming()) {
    return {
      success: false,
      error: tm('electron.main.gcStreamingBusy'),
    };
  }
  const binary = (await getSettingsStore().get()).customBinaryPath || 'omp';
  const settingsProfile = getSettingsStore().get().profile;
  const bridgeProfile = ompBridge && ompBridge.isRunning() ? ompBridge.getProfile().profile : undefined;
  const profile = options?.profile !== undefined ? options.profile : (bridgeProfile || settingsProfile || 'default');
  return runGc(binary, { ...options, profile });
});

// IPC Handlers: Image Backends (Phase 11)
ipcMain.handle('omp:images-run', async (_, action?: ImageBackendsAction, options?: ImageBackendsOptions) => {
  const act: ImageBackendsAction = action || 'status';
  if (act === 'purge' && options?.apply && ompBridge && ompBridge.isStreaming()) {
    return {
      success: false,
      action: act,
      error: tm('electron.main.imagesStreamingBusy'),
    };
  }
  const binary = (await getSettingsStore().get()).customBinaryPath || 'omp';
  const settingsProfile = getSettingsStore().get().profile;
  const bridgeProfile = ompBridge && ompBridge.isRunning() ? ompBridge.getProfile().profile : undefined;
  const profile = options?.profile !== undefined ? options.profile : (bridgeProfile || settingsProfile || 'default');
  const dir = options?.dir || (ompBridge ? ompBridge.getWorkspacePath() : null) || process.cwd();
  return runImages(binary, act, { ...options, dir, profile });
});

// IPC Handlers: SSH Hosts (Phase 12)
ipcMain.handle('omp:ssh-list', async () => {
  const binary = (await getSettingsStore().get()).customBinaryPath || 'omp';
  const settingsProfile = getSettingsStore().get().profile;
  const bridgeProfile = ompBridge && ompBridge.isRunning() ? ompBridge.getProfile().profile : undefined;
  const profile = bridgeProfile || settingsProfile || 'default';
  const dir = (ompBridge ? ompBridge.getWorkspacePath() : null) || process.cwd();
  return listSshHosts(binary, dir, profile);
});

ipcMain.handle('omp:ssh-add', async (_, input: SshHostAddInput) => {
  const binary = (await getSettingsStore().get()).customBinaryPath || 'omp';
  const settingsProfile = getSettingsStore().get().profile;
  const bridgeProfile = ompBridge && ompBridge.isRunning() ? ompBridge.getProfile().profile : undefined;
  const profile = bridgeProfile || settingsProfile || 'default';
  const dir = (ompBridge ? ompBridge.getWorkspacePath() : null) || process.cwd();
  return addSshHost(binary, dir, input, profile);
});

ipcMain.handle('omp:ssh-remove', async (_, name: string, scope: 'project' | 'user') => {
  const binary = (await getSettingsStore().get()).customBinaryPath || 'omp';
  const settingsProfile = getSettingsStore().get().profile;
  const bridgeProfile = ompBridge && ompBridge.isRunning() ? ompBridge.getProfile().profile : undefined;
  const profile = bridgeProfile || settingsProfile || 'default';
  const dir = (ompBridge ? ompBridge.getWorkspacePath() : null) || process.cwd();
  return removeSshHost(binary, dir, name, scope, profile);
});

// IPC Handlers: Grievances (Phase 13)
ipcMain.handle('omp:grievances-list', async (_, options?: GrievancesListOptions) => {
  const binary = (await getSettingsStore().get()).customBinaryPath || 'omp';
  const settingsProfile = getSettingsStore().get().profile;
  const bridgeProfile = ompBridge && ompBridge.isRunning() ? ompBridge.getProfile().profile : undefined;
  const profile = options?.profile !== undefined ? options.profile : (bridgeProfile || settingsProfile || 'default');
  const dir = (ompBridge ? ompBridge.getWorkspacePath() : null) || process.cwd();
  return listGrievances(binary, { ...options, profile }, dir);
});

ipcMain.handle('omp:grievances-clean', async (_, options: GrievancesCleanOptions) => {
  const binary = (await getSettingsStore().get()).customBinaryPath || 'omp';
  const settingsProfile = getSettingsStore().get().profile;
  const bridgeProfile = ompBridge && ompBridge.isRunning() ? ompBridge.getProfile().profile : undefined;
  const profile = options?.profile !== undefined ? options.profile : (bridgeProfile || settingsProfile || 'default');
  const dir = (ompBridge ? ompBridge.getWorkspacePath() : null) || process.cwd();
  return cleanGrievances(binary, { ...options, profile }, dir);
});

ipcMain.handle('omp:grievances-push', async (_, options?: { profile?: string | null }) => {
  const binary = (await getSettingsStore().get()).customBinaryPath || 'omp';
  const settingsProfile = getSettingsStore().get().profile;
  const bridgeProfile = ompBridge && ompBridge.isRunning() ? ompBridge.getProfile().profile : undefined;
  const profile = options?.profile !== undefined ? options.profile : (bridgeProfile || settingsProfile || 'default');
  const dir = (ompBridge ? ompBridge.getWorkspacePath() : null) || process.cwd();
  return pushGrievances(binary, { profile }, dir);
});

// IPC Handlers: Plugin & Agents Managers (Phase 14, 15 & Expansion)
ipcMain.handle('omp:plugin-list', async (_, options?: { local?: boolean }) => {
  const binary = (await getSettingsStore().get()).customBinaryPath || 'omp';
  return extensionManager.listPlugins(binary, options);
});

ipcMain.handle('omp:plugin-install', async (_, target: string, options?: { scope?: 'user' | 'project'; force?: boolean; local?: boolean; dryRun?: boolean }) => {
  const binary = (await getSettingsStore().get()).customBinaryPath || 'omp';
  return extensionManager.installPlugin(binary, target, options);
});

ipcMain.handle('omp:plugin-uninstall', async (_, target: string, options?: { scope?: 'user' | 'project'; local?: boolean; dryRun?: boolean }) => {
  const binary = (await getSettingsStore().get()).customBinaryPath || 'omp';
  return extensionManager.uninstallPlugin(binary, target, options);
});

ipcMain.handle('omp:plugin-link', async (_, localPath: string) => {
  const binary = (await getSettingsStore().get()).customBinaryPath || 'omp';
  return extensionManager.linkPlugin(binary, localPath);
});

ipcMain.handle('omp:plugin-doctor', async (_, options?: { fix?: boolean; local?: boolean }) => {
  const binary = (await getSettingsStore().get()).customBinaryPath || 'omp';
  return extensionManager.doctor(binary, options);
});

ipcMain.handle('omp:plugin-features', async (_, pluginName: string, options?: { local?: boolean }) => {
  const binary = (await getSettingsStore().get()).customBinaryPath || 'omp';
  return extensionManager.features(binary, pluginName, options);
});

ipcMain.handle('omp:plugin-feature-toggle', async (_, pluginName: string, feature: string, enabled: boolean, options?: { local?: boolean }) => {
  const binary = (await getSettingsStore().get()).customBinaryPath || 'omp';
  return extensionManager.toggleFeature(binary, pluginName, feature, enabled, options);
});

ipcMain.handle('omp:plugin-config-set', async (_, pluginName: string, pairs: Array<{ key: string; value: string }>, options?: { local?: boolean }) => {
  const binary = (await getSettingsStore().get()).customBinaryPath || 'omp';
  return extensionManager.setPluginConfig(binary, pluginName, pairs, options);
});

ipcMain.handle('omp:plugin-config-get', async (_, pluginName: string, options?: { local?: boolean }) => {
  const binary = (await getSettingsStore().get()).customBinaryPath || 'omp';
  return extensionManager.getPluginConfig(binary, pluginName, options);
});

ipcMain.handle('omp:plugin-toggle', async (_, name: string, enabled: boolean, options?: { local?: boolean }) => {
  const binary = (await getSettingsStore().get()).customBinaryPath || 'omp';
  return extensionManager.togglePlugin(binary, name, enabled, options);
});

ipcMain.handle('omp:plugin-upgrade', async (_, options?: { name?: string; dryRun?: boolean; local?: boolean }) => {
  const binary = (await getSettingsStore().get()).customBinaryPath || 'omp';
  return extensionManager.upgrade(binary, options);
});

ipcMain.handle('omp:plugin-discover', async (_, options?: { local?: boolean }) => {
  const binary = (await getSettingsStore().get()).customBinaryPath || 'omp';
  return extensionManager.discover(binary, options);
});

ipcMain.handle('omp:plugin-marketplace', async (_, action: 'list' | 'add' | 'remove', source?: string, options?: { local?: boolean }) => {
  const binary = (await getSettingsStore().get()).customBinaryPath || 'omp';
  return extensionManager.marketplace(binary, action, source, options);
});
ipcMain.handle('omp:agents-list', async () => {
  const binary = (await getSettingsStore().get()).customBinaryPath || 'omp';
  const state = ompBridge ? await ompBridge.getState().catch(() => null) : null;
  const currentCwd = state?.state?.cwd as string | undefined;
  return extensionManager.listAgents(binary, currentCwd);
});

ipcMain.handle('omp:agents-unpack', async (_, options?: { scope?: 'user' | 'project'; force?: boolean; dir?: string }) => {
  const binary = (await getSettingsStore().get()).customBinaryPath || 'omp';
  return extensionManager.unpackAgents(binary, options);
});

// IPC Handlers: Profiles Management (Phase 16)
ipcMain.handle('omp:get-profile', async () => {
  if (!ompBridge) return { success: false, profile: 'default', error: 'Bridge uninitialized' };
  return ompBridge.getProfile();
});

ipcMain.handle('omp:set-profile', async (_, profile: string) => {
  if (!ompBridge) return { success: false, profile: 'default', error: 'Bridge uninitialized' };
  return ompBridge.setProfile(profile);
});

ipcMain.handle('omp:profile-list', async () => {
  try {
    const profiles = await listProfiles();
    return { success: true, profiles };
  } catch (err: any) {
    return { success: false, error: err?.message || tm('electron.main.listProfilesFailed') };
  }
});

ipcMain.handle('omp:profile-create', async (_, name: string) => {
  return createProfile(name);
});

ipcMain.handle('omp:profile-delete', async (_, name: string) => {
  return deleteProfile(name);
});

// IPC Handlers: Host Tools Management (Phase 17 & 18)
ipcMain.handle('omp:register-host-tools', async () => {
  if (!ompBridge) return { success: false, error: 'Bridge uninitialized' };
  return ompBridge.registerHostTools();
});

ipcMain.handle('omp:set-host-uri-schemes', async (_, schemes: string[]) => {
  if (!ompBridge) return { success: false, error: 'Bridge uninitialized' };
  return ompBridge.setHostUriSchemes(schemes);
});

ipcMain.handle('omp:get-subagents', async () => {
  if (!ompBridge) return { success: false, error: 'Bridge uninitialized' };
  return { success: true, subagents: ompBridge.getSubagents() };
});
ipcMain.handle('omp:get-subagent-messages', async (_event, params: { subagentId?: string; sessionFile?: string; fromByte?: number }) => {
  if (!ompBridge) return { success: false, error: 'Bridge uninitialized' };
  return ompBridge.getSubagentMessages(params || {});
});
// IPC Handlers: File System & Workspace
ipcMain.handle('fs:select-folder', async () => {
  if (!mainWindow) return null;
  const result = await dialog.showOpenDialog(mainWindow, {
    properties: ['openDirectory', 'createDirectory'],
    title: tm('electron.main.selectProjectDirTitle'),
  });
  if (result.canceled || result.filePaths.length === 0) return null;
  return result.filePaths[0];
});

ipcMain.handle(
  'fs:select-file',
  async (_, options?: { title?: string; filters?: { name: string; extensions: string[] }[] }) => {
    if (!mainWindow) return null;
    const result = await dialog.showOpenDialog(mainWindow, {
      properties: ['openFile'],
      title: options?.title || tm('electron.main.selectFileTitle'),
      filters: options?.filters,
    });
    if (result.canceled || result.filePaths.length === 0) return null;
    return result.filePaths[0];
  }
);

const IGNORED_NAMES = new Set([
  '.git',
  '.github',
  'node_modules',
  'dist',
  'dist-electron',
  '.DS_Store',
  '.turbo',
  '.next',
  '.nuxt',
  '.output',
  '.vite-temp',
  'build',
  '.cache',
  '.omp',
]);

async function scanDirectoryRecursive(
  currentDir: string,
  rootWorkspaceDir: string,
  maxDepth = 8,
  currentDepth = 0
): Promise<WorkspaceFile[]> {
  if (currentDepth > maxDepth) return [];

  try {
    const entries = await fs.readdir(currentDir, { withFileTypes: true });
    const files: WorkspaceFile[] = [];

    for (const entry of entries) {
      if (IGNORED_NAMES.has(entry.name) || entry.name === '.DS_Store' || entry.name.startsWith('.git')) {
        continue;
      }

      const fullPath = path.join(currentDir, entry.name);
      const relativePath = path.relative(rootWorkspaceDir, fullPath);

      if (entry.isDirectory()) {
        const children = await scanDirectoryRecursive(
          fullPath,
          rootWorkspaceDir,
          maxDepth,
          currentDepth + 1
        );

        files.push({
          name: entry.name,
          path: fullPath,
          relativePath,
          isDirectory: true,
          children,
        });
      } else {
        files.push({
          name: entry.name,
          path: fullPath,
          relativePath,
          isDirectory: false,
        });
      }
    }

    return files.sort((a, b) => {
      if (a.isDirectory && !b.isDirectory) return -1;
      if (!a.isDirectory && b.isDirectory) return 1;
      return a.name.localeCompare(b.name, undefined, { sensitivity: 'base' });
    });
  } catch (err) {
    console.error(`Error scanning directory ${currentDir}:`, err);
    return [];
  }
}

ipcMain.handle('fs:read-dir', async (_, dirPath: string) => {
  return scanDirectoryRecursive(dirPath, dirPath);
});

ipcMain.handle('fs:read-file', async (_, filePath: string) => {
  try {
    return await fs.readFile(filePath, 'utf-8');
  } catch (err) {
    console.error('Error reading file:', err);
    return '';
  }
});

ipcMain.handle('fs:save-file', async (_, filePath: string, content: string) => {
  try {
    await fs.writeFile(filePath, content, 'utf-8');
    return true;
  } catch (err) {
    console.error('Error saving file:', err);
    return false;
  }
});

ipcMain.handle('fs:delete-file', async (_, filePath: string) => {
  try {
    const resolved = path.resolve(filePath);
    const wsPath = ompBridge?.getWorkspacePath();
    if (wsPath) {
      const resolvedWs = path.resolve(wsPath);
      const relative = path.relative(resolvedWs, resolved);
      if (relative.startsWith('..') || path.isAbsolute(relative)) {
        console.warn('[fs:delete-file] Refusing to delete file outside workspace:', resolved);
        return false;
      }
    }
    const stats = await fs.stat(resolved);
    if (stats.isDirectory()) {
      console.warn('[fs:delete-file] Refusing to delete directory:', resolved);
      return false;
    }
    await fs.rm(resolved, { force: true, recursive: false });
    return true;
  } catch (err) {
    console.error('Error deleting file:', err);
    return false;
  }
});

// Reveal file/directory in Finder
ipcMain.handle('fs:reveal-in-finder', async (_, filePath: string) => {
  try {
    let resolved = filePath;
    if (resolved.startsWith('~/')) {
      resolved = path.join(os.homedir(), resolved.slice(2));
    }
    shell.showItemInFolder(path.resolve(resolved));
    return true;
  } catch (err) {
    console.error('Error revealing in finder:', err);
    return false;
  }
});

ipcMain.handle(
  'fs:save-image-attachment',
  async (_, buffer: Uint8Array | ArrayBuffer, extension: string, originalName?: string) => {
    try {
      const wsPath = ompBridge?.getWorkspacePath();
      const targetDir = wsPath
        ? path.join(wsPath, '.omp', 'attachments')
        : path.join(app.getPath('temp'), 'omp-attachments');

      await fs.mkdir(targetDir, { recursive: true });

      const ext = (extension || 'png').replace(/^\./, '').toLowerCase();
      const safeBase = originalName
        ? path.basename(originalName, path.extname(originalName)).replace(/[^a-zA-Z0-9_-]/g, '_').slice(0, 32)
        : '';
      const prefix = safeBase ? `${safeBase}_` : 'img_';
      const fileName = `${prefix}${Date.now()}_${Math.random().toString(36).slice(2, 6)}.${ext}`;
      const targetPath = path.join(targetDir, fileName);

      const data =
        buffer instanceof Uint8Array
          ? Buffer.from(buffer.buffer, buffer.byteOffset, buffer.byteLength)
          : Buffer.from(buffer);
      await fs.writeFile(targetPath, data);
      const relativePath = wsPath ? path.relative(wsPath, targetPath) : targetPath;

      return { success: true, filePath: targetPath, relativePath };
    } catch (err: any) {
      console.error('Error saving image attachment:', err);
      return { success: false, filePath: '', error: err?.message || tm('electron.main.saveAttachmentFailed') };
    }
  }
);

const IMAGE_MIME_BY_EXTENSION: Record<string, string> = {
  png: 'image/png',
  jpg: 'image/jpeg',
  jpeg: 'image/jpeg',
  gif: 'image/gif',
  webp: 'image/webp',
  svg: 'image/svg+xml',
  bmp: 'image/bmp',
  ico: 'image/x-icon',
  avif: 'image/avif',
};

// Read image file from disk to data URL for renderer thumbnail display
ipcMain.handle('fs:read-image-base64', async (_, filePath: string) => {
  try {
    if (!filePath) {
      return { success: false, error: tm('electron.main.missingImagePath') };
    }
    const wsPath = ompBridge?.getWorkspacePath();
    if (!path.isAbsolute(filePath) && !wsPath) {
      return { success: false, error: tm('electron.main.workspaceNotOpenForRelativePath') };
    }
    const absPath = path.isAbsolute(filePath) ? filePath : path.join(wsPath!, filePath);
    const ext = path.extname(absPath).replace(/^\./, '').toLowerCase();
    const mime = IMAGE_MIME_BY_EXTENSION[ext];
    if (!mime) {
      return { success: false, error: tm('electron.main.unsupportedImageFormat', { ext }) };
    }
    const data = await fs.readFile(absPath);
    return { success: true, dataUrl: `data:${mime};base64,${data.toString('base64')}` };
  } catch (err: any) {
    return { success: false, error: err?.message || tm('electron.main.readImageFailed') };
  }
});

// Git File History: List commits affecting a specific file
ipcMain.handle('git:file-history', async (_, filePath: string) => {
  try {
    if (!filePath) {
      return { success: false, commits: [], error: 'Missing file path' };
    }
    const wsPath = ompBridge?.getWorkspacePath();
    const absPath = path.isAbsolute(filePath) ? filePath : wsPath ? path.join(wsPath, filePath) : path.resolve(filePath);
    const cwd = wsPath ? path.resolve(wsPath) : path.dirname(absPath);
    const relPath = path.relative(cwd, absPath).split(path.sep).join('/');

    const { stdout } = await execFileAsync(
      'git',
      ['log', '-n', '50', '--follow', '--format=%H%x1f%h%x1f%an%x1f%ad%x1f%s', '--date=relative', '--', relPath],
      {
        cwd,
        env: { ...process.env, PATH: buildExtendedPath() },
        encoding: 'utf-8',
        timeout: 15000,
        maxBuffer: 10 * 1024 * 1024,
      }
    );

    const lines = stdout.trim().split('\n').filter(Boolean);
    const commits: GitCommitSummary[] = [];

    for (const line of lines) {
      const parts = line.split('\x1f');
      if (parts.length >= 5) {
        commits.push({
          hash: parts[0],
          shortHash: parts[1],
          author: parts[2],
          date: parts[3],
          message: parts.slice(4).join('\x1f'),
        });
      }
    }

    return { success: true, commits };
  } catch (err: any) {
    // If not a git repo or file has no commits, return empty list gracefully
    return { success: true, commits: [], error: err?.message };
  }
});

// Git File at Commit: Get content of a file at a specific commit hash
ipcMain.handle('git:file-at-commit', async (_, commitHash: string, filePath: string) => {
  try {
    if (!commitHash || typeof commitHash !== 'string' || !/^[a-fA-F0-9]{4,40}$/.test(commitHash.trim())) {
      return { success: false, content: null, error: 'Invalid commit hash' };
    }
    if (!filePath) {
      return { success: false, content: null, error: 'Missing file path' };
    }

    const cleanHash = commitHash.trim();
    const wsPath = ompBridge?.getWorkspacePath();
    const absPath = path.isAbsolute(filePath) ? filePath : wsPath ? path.join(wsPath, filePath) : path.resolve(filePath);
    const cwd = wsPath ? path.resolve(wsPath) : path.dirname(absPath);
    const relPath = path.relative(cwd, absPath).split(path.sep).join('/');

    const { stdout } = await execFileAsync(
      'git',
      ['show', `${cleanHash}:${relPath}`],
      {
        cwd,
        env: { ...process.env, PATH: buildExtendedPath() },
        encoding: 'utf-8',
        timeout: 15000,
        maxBuffer: 10 * 1024 * 1024,
      }
    );

    return { success: true, content: stdout };
  } catch (err: any) {
    return { success: false, content: null, error: err?.message };
  }
});
configureWebviewSecurity(app, (url) => shell.openExternal(url));

app.whenReady().then(() => {
  createWindow();

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow();
    }
  });
});

app.on('before-quit', () => {
  disposeAll();
});

process.on('exit', () => {
  disposeAll();
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});
