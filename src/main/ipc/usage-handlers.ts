/**
 * Usage IPC Handlers
 *
 * Handles usage data requests between renderer and main process.
 * Provides periodic polling and on-demand refresh.
 */

import type { IpcMain, BrowserWindow } from 'electron';
import { IPC_CHANNELS } from '../../shared/constants';
import { fetchUsageData, isClaudeAvailable, getRateLimitedUntil } from '../usage/usage-service';
import { getCopilotSessionData } from '../usage/copilot-usage-service';
import type { UsageSnapshot } from '../../shared/types';
import { debugError } from '../../shared/utils';

let pollingInterval: NodeJS.Timeout | null = null;
let cachedUsage: UsageSnapshot | null = null;
let lastFetchTime = 0;
let isPollingInProgress = false;
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

  // Handle Copilot usage request from renderer
  ipcMain.handle(IPC_CHANNELS.COPILOT_USAGE_REQUEST, async () => {
    try {
      const data = await getCopilotSessionData();
      const win = getWindow();
      if (win && !win.isDestroyed()) {
        win.webContents.send(IPC_CHANNELS.COPILOT_USAGE_UPDATED, data);
      }
      return { success: true, data };
    } catch (err) {
      debugError('[UsageHandlers] Failed to fetch Copilot usage:', err);
      return {
        success: false,
        error: err instanceof Error ? err.message : 'Unknown error',
      };
    }
  });

  // Start background polling (every 1 minute — credentials are cached so this is lightweight)
  startPolling(getWindow);
}

function startPolling(getWindow: () => BrowserWindow | null): void {
  if (pollingInterval) clearInterval(pollingInterval);

  pollingInterval = setInterval(async () => {
    // Skip if previous poll is still running (prevents queue buildup)
    if (isPollingInProgress) return;

    // Skip if we're in a rate-limit backoff window
    if (getRateLimitedUntil() > Date.now()) return;

    // Skip if window is not focused (no need to poll in background)
    const win = getWindow();
    if (!win || win.isDestroyed() || win.isMinimized()) return;

    isPollingInProgress = true;

    try {
      const available = await isClaudeAvailable();
      if (!available) return;

      const usage = await fetchUsageData();
      cachedUsage = usage;
      lastFetchTime = Date.now();

      if (win && !win.isDestroyed()) {
        win.webContents.send(IPC_CHANNELS.USAGE_UPDATED, usage);
      }
    } catch (err) {
      // Silently fail on background polls
      debugError('[UsageHandlers] Background poll failed:', err);
    } finally {
      isPollingInProgress = false;
    }
  }, 180_000); // 3 minutes
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
