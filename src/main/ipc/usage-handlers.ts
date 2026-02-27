/**
 * Usage IPC Handlers
 *
 * Handles usage data requests between renderer and main process.
 * Provides periodic polling and on-demand refresh.
 */

import type { IpcMain, BrowserWindow } from 'electron';
import { IPC_CHANNELS } from '../../shared/constants';
import { fetchUsageData, isClaudeAvailable } from '../usage/usage-service';
import type { UsageSnapshot } from '../../shared/types';
import { debugError } from '../../shared/utils';

let pollingInterval: NodeJS.Timeout | null = null;
let cachedUsage: UsageSnapshot | null = null;
let lastFetchTime = 0;
const MIN_FETCH_INTERVAL = 30_000; // Minimum 30s between fetches

export function registerUsageHandlers(
  ipcMain: IpcMain,
  getWindow: () => BrowserWindow | null
): void {
  // Handle usage request from renderer
  ipcMain.handle(IPC_CHANNELS.USAGE_REQUEST, async () => {
    const now = Date.now();

    // Return cached data if recent enough
    if (cachedUsage && now - lastFetchTime < MIN_FETCH_INTERVAL) {
      return { success: true, data: cachedUsage };
    }

    try {
      const available = await isClaudeAvailable();
      if (!available) {
        return { success: false, error: 'Claude CLI not found' };
      }

      const usage = await fetchUsageData();
      cachedUsage = usage;
      lastFetchTime = now;

      // Also push to renderer via event
      const win = getWindow();
      if (win && !win.isDestroyed()) {
        win.webContents.send(IPC_CHANNELS.USAGE_UPDATED, usage);
      }

      return { success: true, data: usage };
    } catch (err) {
      debugError('[UsageHandlers] Failed to fetch usage:', err);
      return {
        success: false,
        error: err instanceof Error ? err.message : 'Unknown error',
      };
    }
  });

  // Start background polling (every 60s)
  startPolling(getWindow);
}

function startPolling(getWindow: () => BrowserWindow | null): void {
  if (pollingInterval) clearInterval(pollingInterval);

  pollingInterval = setInterval(async () => {
    try {
      const available = await isClaudeAvailable();
      if (!available) return;

      const usage = await fetchUsageData();
      cachedUsage = usage;
      lastFetchTime = Date.now();

      const win = getWindow();
      if (win && !win.isDestroyed()) {
        win.webContents.send(IPC_CHANNELS.USAGE_UPDATED, usage);
      }
    } catch (err) {
      // Silently fail on background polls
      debugError('[UsageHandlers] Background poll failed:', err);
    }
  }, 60_000);
}

export function stopUsagePolling(): void {
  if (pollingInterval) {
    clearInterval(pollingInterval);
    pollingInterval = null;
  }
}

/**
 * Send a cost update event to the renderer
 */
export function sendCostUpdate(
  getWindow: () => BrowserWindow | null,
  terminalId: string,
  cost?: number,
  inputTokens?: number,
  outputTokens?: number
): void {
  const win = getWindow();
  if (win && !win.isDestroyed()) {
    win.webContents.send(IPC_CHANNELS.USAGE_COST_UPDATE, {
      terminalId,
      cost,
      inputTokens,
      outputTokens,
      timestamp: new Date(),
    });
  }
}
