import { app, BrowserWindow, ipcMain, shell, Menu, Tray, nativeImage } from 'electron';
import { join } from 'path';
import { TerminalManager } from './terminal/terminal-manager';
import { saveOutputBuffers } from './terminal/terminal-state-store';
import { registerTerminalHandlers } from './ipc/terminal-handlers';
import { registerTaskManagerHandlers } from './ipc/task-manager-handlers';
import { registerSettingsHandlers } from './ipc/settings-handlers';
import { registerUsageHandlers, stopUsagePolling } from './ipc/usage-handlers';
import { registerProjectHandlers } from './ipc/project-handlers';
import { registerGitHandlers } from './ipc/git-handlers';
import { registerInsightsHandlers, cleanupInsights } from './ipc/insights-handlers';
import { initAutoUpdater } from './updater';
import { IPC_CHANNELS } from '../shared/constants';
import { registerAllAgents } from './ipc/providers/agents';

let mainWindow: BrowserWindow | null = null;
let terminalManager: TerminalManager | null = null;
let tray: Tray | null = null;

/** Resolve path to a resource file (works in both dev and packaged) */
function getResourcePath(filename: string): string {
  if (app.isPackaged) {
    return join(process.resourcesPath, filename);
  }
  return join(__dirname, '../../resources', filename);
}

function createWindow() {
  // Remove default menu bar
  Menu.setApplicationMenu(null);

  const iconPath = getResourcePath('icon.png');

  mainWindow = new BrowserWindow({
    width: 1200,
    height: 800,
    minWidth: 800,
    minHeight: 600,
    backgroundColor: '#1a1a2e',
    icon: iconPath,
    titleBarStyle: 'hiddenInset',
    frame: process.platform === 'darwin' ? false : true,
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      nodeIntegration: false,
      contextIsolation: true,
      sandbox: false,
    },
  });

  // Load renderer
  if (process.env.ELECTRON_RENDERER_URL) {
    mainWindow.loadURL(process.env.ELECTRON_RENDERER_URL);
  } else {
    mainWindow.loadFile(join(__dirname, '../renderer/index.html'));
  }

  if (process.env.NODE_ENV === 'development') {
    mainWindow.webContents.openDevTools();
  }

  mainWindow.on('closed', () => {
    mainWindow = null;
  });

  // Create tray icon
  const trayIconPath = getResourcePath('tray-icon.png');
  const trayIcon = nativeImage.createFromPath(trayIconPath);
  tray = new Tray(trayIcon);
  tray.setToolTip('Agent Terminal');
  tray.on('click', () => {
    if (mainWindow) {
      if (mainWindow.isMinimized()) mainWindow.restore();
      mainWindow.show();
      mainWindow.focus();
    }
  });
  tray.setContextMenu(Menu.buildFromTemplate([
    { label: 'Show', click: () => { mainWindow?.show(); mainWindow?.focus(); } },
    { type: 'separator' },
    { label: 'Quit', click: () => app.quit() },
  ]));
}

function getWindow(): BrowserWindow | null {
  return mainWindow;
}

app.whenReady().then(() => {
  // Register all agent providers before anything else
  registerAllAgents();

  terminalManager = new TerminalManager(getWindow);

  registerTerminalHandlers(ipcMain, terminalManager, getWindow);
  registerTaskManagerHandlers(ipcMain);
  registerSettingsHandlers(ipcMain);
  registerUsageHandlers(ipcMain, getWindow);
  registerProjectHandlers(ipcMain, getWindow);
  registerGitHandlers(ipcMain);
  registerInsightsHandlers(ipcMain, getWindow);
  initAutoUpdater(getWindow);

  // Open external links
  ipcMain.handle(IPC_CHANNELS.OPEN_EXTERNAL, async (_event, url: string) => {
    await shell.openExternal(url);
  });

  createWindow();
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});

app.on('before-quit', async () => {
  cleanupInsights();
  stopUsagePolling();
  if (terminalManager) {
    // Save output buffers before killing terminals so they can be restored
    saveOutputBuffers(terminalManager.getOutputBuffers());
    await terminalManager.killAll();
  }
});
