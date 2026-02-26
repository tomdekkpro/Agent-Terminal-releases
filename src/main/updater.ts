import { autoUpdater } from 'electron-updater';
import { BrowserWindow, ipcMain } from 'electron';
import { IPC_CHANNELS } from '../shared/constants';
import { debugLog, debugError } from '../shared/utils';
import { getSettings } from './ipc/settings-handlers';

let getWindowRef: (() => BrowserWindow | null) | null = null;

function sendToRenderer(channel: string, ...args: any[]) {
  getWindowRef?.()?.webContents?.send(channel, ...args);
}

export function initAutoUpdater(getWindow: () => BrowserWindow | null) {
  getWindowRef = getWindow;

  autoUpdater.autoDownload = false;
  autoUpdater.autoInstallOnAppQuit = true;

  autoUpdater.on('checking-for-update', () => {
    debugLog('[Updater] Checking for updates...');
    sendToRenderer(IPC_CHANNELS.UPDATE_STATUS, { status: 'checking' });
  });

  autoUpdater.on('update-available', (info) => {
    debugLog('[Updater] Update available:', info.version);
    sendToRenderer(IPC_CHANNELS.UPDATE_STATUS, {
      status: 'available',
      version: info.version,
      releaseNotes: info.releaseNotes,
      releaseDate: info.releaseDate,
    });
  });

  autoUpdater.on('update-not-available', () => {
    debugLog('[Updater] No updates available');
    sendToRenderer(IPC_CHANNELS.UPDATE_STATUS, { status: 'up-to-date' });
  });

  autoUpdater.on('download-progress', (progress) => {
    sendToRenderer(IPC_CHANNELS.UPDATE_STATUS, {
      status: 'downloading',
      percent: Math.round(progress.percent),
      transferred: progress.transferred,
      total: progress.total,
    });
  });

  autoUpdater.on('update-downloaded', (info) => {
    debugLog('[Updater] Update downloaded:', info.version);
    sendToRenderer(IPC_CHANNELS.UPDATE_STATUS, {
      status: 'ready',
      version: info.version,
    });
  });

  autoUpdater.on('error', (err) => {
    debugError('[Updater] Error:', err.message);
    sendToRenderer(IPC_CHANNELS.UPDATE_STATUS, {
      status: 'error',
      error: err.message,
    });
  });

  // IPC handlers
  ipcMain.handle(IPC_CHANNELS.UPDATE_CHECK, async () => {
    try {
      const result = await autoUpdater.checkForUpdates();
      return { success: true, version: result?.updateInfo?.version };
    } catch (err: any) {
      return { success: false, error: err.message };
    }
  });

  ipcMain.handle(IPC_CHANNELS.UPDATE_DOWNLOAD, async () => {
    try {
      await autoUpdater.downloadUpdate();
      return { success: true };
    } catch (err: any) {
      return { success: false, error: err.message };
    }
  });

  ipcMain.handle(IPC_CHANNELS.UPDATE_INSTALL, () => {
    autoUpdater.quitAndInstall(false, true);
  });

  // Check for updates after a short delay on startup (if enabled)
  setTimeout(() => {
    const settings = getSettings();
    if (settings.autoUpdate) {
      autoUpdater.checkForUpdates().catch(() => {});
    }
  }, 5000);
}
