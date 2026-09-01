import { app, BrowserWindow, ipcMain, dialog } from 'electron';
import path from 'path';
import fs from 'fs/promises';
import { fileURLToPath } from 'url';
import { OmpBridge } from './omp-bridge.ts';
import type { WorkspaceFile, OmpThinkingLevel } from './types.ts';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

let mainWindow: BrowserWindow | null = null;
let ompBridge: OmpBridge | null = null;

const isDev = process.env.NODE_ENV === 'development' || !app.isPackaged;

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1440,
    height: 900,
    minWidth: 1024,
    minHeight: 700,
    title: 'OMP Agent',
    titleBarStyle: 'hiddenInset', // Native macOS Traffic Lights
    trafficLightPosition: { x: 16, y: 14 },
    vibrancy: 'under-window',
    visualEffectState: 'active',
    backgroundColor: '#f8fafc',
    webPreferences: {
      preload: path.join(__dirname, 'preload.cjs'),
      nodeIntegration: false,
      contextIsolation: true,
    },
  });

  ompBridge = new OmpBridge(mainWindow);

  if (isDev) {
    mainWindow.loadURL('http://localhost:5173');
    // mainWindow.webContents.openDevTools({ mode: 'detach' });
  } else {
    mainWindow.loadFile(path.join(__dirname, '../dist/index.html'));
  }

  mainWindow.on('closed', () => {
    mainWindow = null;
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

ipcMain.handle('omp:start-process', async (_, workspacePath: string, model?: string) => {
  if (!ompBridge) return { success: false };
  return ompBridge.startProcess(workspacePath, model);
});

ipcMain.handle('omp:stop-process', async () => {
  if (!ompBridge) return { success: false };
  return ompBridge.stopProcess();
});

ipcMain.handle('omp:send-message', async (_, prompt: string, context?: { files?: string[] }) => {
  if (!ompBridge) return { success: false };
  return ompBridge.sendMessage(prompt, context);
});

ipcMain.handle('omp:respond-permission', async (_, requestId: string, approved: boolean) => {
  if (!ompBridge) return;
  ompBridge.respondPermission(requestId, approved);
});

ipcMain.handle('omp:ui-respond', async (_, id: string, payload: { value?: unknown; confirmed?: boolean; cancelled?: boolean }) => {
  if (!ompBridge) return;
  ompBridge.respondUiRequest(id, payload);
});

// IPC Handlers: Model Catalog & Engine State (Phase 2 Additions)
ipcMain.handle('omp:get-models', async () => {
  if (!ompBridge) return { success: false, error: 'Bridge uninitialized' };
  return ompBridge.getAvailableModels();
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

ipcMain.handle('omp:get-subagents', async () => {
  if (!ompBridge) return { success: false, error: 'Bridge uninitialized' };
  return { success: true, subagents: ompBridge.getSubagents() };
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
