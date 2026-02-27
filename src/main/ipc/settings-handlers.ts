import { app, type IpcMain } from 'electron';
import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'fs';
import { join } from 'path';
import { IPC_CHANNELS } from '../../shared/constants';
import { DEFAULT_SETTINGS, type AppSettings } from '../../shared/types';

const SETTINGS_DIR = join(app.getPath('userData'), 'config');
const SETTINGS_FILE = join(SETTINGS_DIR, 'settings.json');

let settingsCache: AppSettings | null = null;

export function getSettings(): AppSettings {
  if (settingsCache) return settingsCache;

  try {
    if (existsSync(SETTINGS_FILE)) {
      const data = readFileSync(SETTINGS_FILE, 'utf-8');
      settingsCache = { ...DEFAULT_SETTINGS, ...JSON.parse(data) };
    } else {
      settingsCache = { ...DEFAULT_SETTINGS };
    }
  } catch {
    settingsCache = { ...DEFAULT_SETTINGS };
  }

  return settingsCache!;
}

function saveSettings(settings: AppSettings): void {
  try {
    if (!existsSync(SETTINGS_DIR)) {
      mkdirSync(SETTINGS_DIR, { recursive: true });
    }
    writeFileSync(SETTINGS_FILE, JSON.stringify(settings, null, 2));
    settingsCache = settings;
  } catch (error) {
    console.error('Failed to save settings:', error);
  }
}

export function registerSettingsHandlers(ipcMain: IpcMain): void {
  ipcMain.handle(IPC_CHANNELS.SETTINGS_GET_ALL, async () => {
    return { success: true, data: getSettings() };
  });

  ipcMain.handle(IPC_CHANNELS.SETTINGS_GET, async (_event, key: string) => {
    const settings = getSettings();
    return { success: true, data: settings[key as keyof AppSettings] };
  });

  ipcMain.handle(IPC_CHANNELS.SETTINGS_SET, async (_event, updates: Partial<AppSettings>) => {
    const settings = getSettings();
    const updated = { ...settings, ...updates };
    saveSettings(updated);
    return { success: true, data: updated };
  });
}
