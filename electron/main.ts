import { app, BrowserWindow, ipcMain, dialog, shell } from 'electron';
import path from 'path';
import fs from 'fs/promises';
import { existsSync } from 'fs';
import { fileURLToPath } from 'url';
import { OmpBridge } from './omp-bridge.ts';
import type {
  WorkspaceFile,
  OmpThinkingLevel,
  OmpApprovalMode,
  OmpTodoPhase,
  FetchEngineConfigOptions,
  SetEngineConfigOptions,
  ResetEngineConfigOptions,
  EngineConfigPathOptions,
} from './types.ts';
import { getSettingsStore, type AppSettings } from './settings-store.ts';
import {
  readModelsConfig,
  writeModelsConfig,
  fetchLoginProviders,
} from './models-config.ts';
import { AuthLoginManager, fetchAuthenticatedProviders } from './auth-login.ts';
import { readModelRolesConfig, writeModelRolesConfig } from './roles-config.ts';
import { fetchGlobalUsage, fetchGlobalStats } from './usage-stats.ts';
import { listImportCandidates, importForeignSession } from './session-import.ts';
import { EngineMaintenanceManager } from './engine-maintenance.ts';
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
import { setCurrentLocale } from '../shared/i18n/index.ts';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

let mainWindow: BrowserWindow | null = null;
let ompBridge: OmpBridge | null = null;
const authLoginManager = new AuthLoginManager((url) => shell.openExternal(url));
const engineMaintenanceManager = new EngineMaintenanceManager();
const opsManager = new OpsManager();
const extensionManager = new ExtensionManager();

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
    },
  });

  // Chặn phím tắt DevTools khi chạy production
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
  ompBridge = new OmpBridge(mainWindow, settingsStore);
  const initialSettings = settingsStore.get();
  if (initialSettings.language) {
    setCurrentLocale(initialSettings.language);
  }
  if (initialSettings.customBinaryPath) {
    ompBridge.setCustomBinaryPath(initialSettings.customBinaryPath);
  }
  if (isDev) {
    mainWindow.loadURL('http://localhost:5173');
    // mainWindow.webContents.openDevTools({ mode: 'detach' });
  } else {
    mainWindow.loadFile(path.join(__dirname, '../dist/index.html'));
  }

  mainWindow.on('closed', () => {
    mainWindow = null;
    authLoginManager.dispose();
    engineMaintenanceManager.dispose();
    if (ompBridge) {
      ompBridge.stopProcess();
    }
  });
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
    title: 'Chọn file nhị phân OMP (omp / pi / oh-my-pi)',
  });
  if (result.canceled || result.filePaths.length === 0) return null;
  return result.filePaths[0];
});

ipcMain.handle('omp:start-process', async (_, workspacePath: string, model?: string, options?: { provider?: string; extraArgs?: string[]; approvalMode?: OmpApprovalMode }) => {
  if (!ompBridge) return { success: false };
  return ompBridge.startProcess(workspacePath, model, options);
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
  if (ompBridge) {
    if ('customBinaryPath' in partial) {
      ompBridge.setCustomBinaryPath(updated.customBinaryPath);
    }
    if ('defaultThinkingLevel' in partial && partial.defaultThinkingLevel) {
      ompBridge.setThinkingLevel(partial.defaultThinkingLevel).catch(() => {});
    }
    if ('steeringMode' in partial && partial.steeringMode) {
      ompBridge.setSteeringMode(partial.steeringMode).catch(() => {});
    }
    if ('followUpMode' in partial && partial.followUpMode) {
      ompBridge.setFollowUpMode(partial.followUpMode).catch(() => {});
    }
    if ('interruptMode' in partial && partial.interruptMode) {
      ompBridge.setInterruptMode(partial.interruptMode).catch(() => {});
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
  const binaryPath = await resolveOmpBinaryPath();
  return fetchLoginProviders(binaryPath);
});

// IPC Handlers: OAuth Login qua auth-broker
ipcMain.handle('omp:auth-login-start', async (_, providerId: string) => {
  const binaryPath = await resolveOmpBinaryPath();
  if (!binaryPath) {
    return { success: false, error: 'Không tìm thấy file nhị phân omp để đăng nhập.' };
  }
  if (!mainWindow) {
    return { success: false, error: 'Cửa sổ ứng dụng chưa sẵn sàng.' };
  }
  return authLoginManager.start(binaryPath, providerId, mainWindow);
});

ipcMain.handle('omp:auth-status', async () => {
  const binaryPath = await resolveOmpBinaryPath();
  if (!binaryPath) {
    return { success: false, providers: [], error: 'Không tìm thấy file nhị phân omp.' };
  }
  return fetchAuthenticatedProviders(binaryPath);
});

ipcMain.handle('omp:auth-login-cancel', async () => {
  return authLoginManager.cancel();
});

ipcMain.handle('omp:auth-login-input', async (_, text: string) => {
  return authLoginManager.submitInput(String(text ?? ''));
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
ipcMain.handle('omp:global-usage', async (_, forceRefresh?: boolean) => {
  const binaryPath = await resolveOmpBinaryPath();
  return fetchGlobalUsage(binaryPath, { forceRefresh: Boolean(forceRefresh) });
});

ipcMain.handle('omp:global-stats', async (_, forceRefresh?: boolean) => {
  const binaryPath = await resolveOmpBinaryPath();
  return fetchGlobalStats(binaryPath, { forceRefresh: Boolean(forceRefresh) });
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

ipcMain.handle('omp:export-session', async () => {
  if (!ompBridge) return { success: false, error: 'Bridge uninitialized' };
  const win = mainWindow || BrowserWindow.getFocusedWindow();
  const state = await ompBridge.getState().catch(() => ({ success: false, state: undefined }));
  const defaultTitle = state.state?.sessionName || 'session';
  const cleanTitle = defaultTitle.replace(/[/\\?%*:|"<>]/g, '-').trim() || 'session';
  const result = await dialog.showSaveDialog(win || (undefined as any), {
    title: 'Xuất phiên làm việc ra HTML',
    defaultPath: `${cleanTitle}.html`,
    filters: [{ name: 'HTML Files', extensions: ['html'] }],
  });
  if (result.canceled || !result.filePath) {
    return { success: false, cancelled: true };
  }
  const filePath = result.filePath;
  const res = await ompBridge.exportHtml(filePath);
  if (res.success) {
    ompBridge.emitNotification(`Đã xuất phiên làm việc ra: ${path.basename(filePath)}`, 'info');
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
    return { success: false, error: err.message || 'Lỗi quét session' };
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
    return { success: false, error: err.message || 'Lỗi import session' };
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
  if (!win) return { success: false, error: 'Không tìm thấy cửa sổ ứng dụng' };
  const binary = (await getSettingsStore().get()).customBinaryPath || 'omp';
  return engineMaintenanceManager.startTask(taskId, binary, args, win);
});

ipcMain.handle('omp:maintenance-cancel-task', async () => {
  return engineMaintenanceManager.cancelTask();
});

// IPC Handlers: Background Process & Worktree Managers (Phase 13)
ipcMain.handle('omp:ps-list', async (_, options?: { all?: boolean; global?: string }) => {
  const binary = (await getSettingsStore().get()).customBinaryPath || 'omp';
  return opsManager.listProcesses(binary, options);
});

ipcMain.handle('omp:ps-control', async (_, action: 'stop' | 'kill' | 'restart', name: string, options?: { global?: string; timeout?: number }) => {
  const binary = (await getSettingsStore().get()).customBinaryPath || 'omp';
  return opsManager.controlProcess(binary, action, name, options);
});

ipcMain.handle('omp:ps-logs', async (_, name: string, options?: { lines?: number; head?: boolean; grep?: string; global?: string }) => {
  const binary = (await getSettingsStore().get()).customBinaryPath || 'omp';
  return opsManager.getProcessLogs(binary, name, options);
});

ipcMain.handle('omp:worktree-list', async () => {
  const binary = (await getSettingsStore().get()).customBinaryPath || 'omp';
  return opsManager.listWorktrees(binary);
});

ipcMain.handle('omp:worktree-clear', async (_, options?: { all?: boolean; dryRun?: boolean }) => {
  const binary = (await getSettingsStore().get()).customBinaryPath || 'omp';
  return opsManager.clearWorktrees(binary, options);
});

// IPC Handlers: Plugin & Agents Managers (Phase 14 & 15)
ipcMain.handle('omp:plugin-list', async () => {
  const binary = (await getSettingsStore().get()).customBinaryPath || 'omp';
  return extensionManager.listPlugins(binary);
});

ipcMain.handle('omp:plugin-install', async (_, target: string, options?: { scope?: 'user' | 'project'; force?: boolean }) => {
  const binary = (await getSettingsStore().get()).customBinaryPath || 'omp';
  return extensionManager.installPlugin(binary, target, options);
});

ipcMain.handle('omp:plugin-uninstall', async (_, target: string, options?: { scope?: 'user' | 'project' }) => {
  const binary = (await getSettingsStore().get()).customBinaryPath || 'omp';
  return extensionManager.uninstallPlugin(binary, target, options);
});

ipcMain.handle('omp:plugin-link', async (_, localPath: string) => {
  const binary = (await getSettingsStore().get()).customBinaryPath || 'omp';
  return extensionManager.linkPlugin(binary, localPath);
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
    return { success: false, error: err?.message || 'Lỗi khi lấy danh sách profiles' };
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
    title: 'Chọn Thư Mục Dự Án cho OMP Agent',
  });
  if (result.canceled || result.filePaths.length === 0) return null;
  return result.filePaths[0];
});

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

// Hiện file/thư mục trong Finder
ipcMain.handle('fs:reveal-in-finder', async (_, filePath: string) => {
  try {
    shell.showItemInFolder(path.resolve(filePath));
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
      return { success: false, filePath: '', error: err?.message || 'Không thể lưu file đính kèm' };
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

// Đọc file ảnh trên đĩa thành data URL để renderer hiển thị thumbnail
ipcMain.handle('fs:read-image-base64', async (_, filePath: string) => {
  try {
    if (!filePath) {
      return { success: false, error: 'Thiếu đường dẫn file ảnh' };
    }
    const wsPath = ompBridge?.getWorkspacePath();
    if (!path.isAbsolute(filePath) && !wsPath) {
      return { success: false, error: 'Chưa mở workspace để phân giải đường dẫn tương đối' };
    }
    const absPath = path.isAbsolute(filePath) ? filePath : path.join(wsPath!, filePath);
    const ext = path.extname(absPath).replace(/^\./, '').toLowerCase();
    const mime = IMAGE_MIME_BY_EXTENSION[ext];
    if (!mime) {
      return { success: false, error: `Định dạng ảnh không được hỗ trợ: .${ext}` };
    }
    const data = await fs.readFile(absPath);
    return { success: true, dataUrl: `data:${mime};base64,${data.toString('base64')}` };
  } catch (err: any) {
    return { success: false, error: err?.message || 'Không thể đọc file ảnh' };
  }
});

app.whenReady().then(() => {
  createWindow();

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow();
    }
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});
