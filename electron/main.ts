import { app, BrowserWindow, ipcMain, dialog } from 'electron';
import path from 'path';
import fs from 'fs/promises';
import { fileURLToPath } from 'url';
import { OmpBridge } from './omp-bridge';
import { WorkspaceFile } from './types';

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

ipcMain.handle('fs:read-dir', async (_, dirPath: string) => {
  try {
    const entries = await fs.readdir(dirPath, { withFileTypes: true });
    const files: WorkspaceFile[] = [];

    for (const entry of entries) {
      if (entry.name.startsWith('.') || entry.name === 'node_modules' || entry.name === 'dist') {
        continue;
      }
      const fullPath = path.join(dirPath, entry.name);
      files.push({
        name: entry.name,
        path: fullPath,
        relativePath: entry.name,
        isDirectory: entry.isDirectory(),
      });
    }

    return files.sort((a, b) => {
      if (a.isDirectory && !b.isDirectory) return -1;
      if (!a.isDirectory && b.isDirectory) return 1;
      return a.name.localeCompare(b.name);
    });
  } catch (err) {
    console.error('Error reading directory:', err);
    return [];
  }
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
