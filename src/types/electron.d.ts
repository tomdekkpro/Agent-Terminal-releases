import type { ElectronAPI } from '../preload/index';

declare global {
  interface Window {
    electronAPI: ElectronAPI;
  }

  /** Injected by Vite define at build time from package.json */
  const __APP_VERSION__: string;
}
