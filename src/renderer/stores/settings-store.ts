import { create } from 'zustand';
import type { AppSettings } from '../../shared/types';
import { DEFAULT_SETTINGS } from '../../shared/types';

interface SettingsState {
  settings: AppSettings;
  isLoading: boolean;
  loadSettings: () => Promise<void>;
  updateSettings: (updates: Partial<AppSettings>) => Promise<void>;
}

export const useSettingsStore = create<SettingsState>((set, _get) => ({
  settings: DEFAULT_SETTINGS,
  isLoading: true,

  loadSettings: async () => {
    try {
      const result = await window.electronAPI.getSettings();
      if (result.success && result.data) {
        set({ settings: result.data, isLoading: false });
      }
    } catch {
      set({ isLoading: false });
    }
  },

  updateSettings: async (updates: Partial<AppSettings>) => {
    try {
      const result = await window.electronAPI.setSettings(updates);
      if (result.success && result.data) {
        set({ settings: result.data });
      }
    } catch (error) {
      console.error('Failed to save settings:', error);
    }
  },
}));
