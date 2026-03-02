import { app } from 'electron';
import { initialize, trackEvent } from '@aptabase/electron/main';
import { getSettings } from '../ipc/settings-handlers';
import { debugLog, debugError } from '../../shared/utils';

const APTABASE_APP_KEY = 'A-US-0345101138';

let initialized = false;

/**
 * Initialize Aptabase analytics.
 * Respects the user's telemetry opt-out setting.
 */
export async function initAnalytics(): Promise<void> {
  try {
    const settings = getSettings();
    if (settings.telemetryEnabled === false) {
      debugLog('[Analytics] Telemetry disabled by user');
      return;
    }

    await initialize(APTABASE_APP_KEY);
    initialized = true;
    debugLog('[Analytics] Initialized');

    // Track app launch
    await track('app_started', {
      version: app.getVersion(),
      platform: process.platform,
      arch: process.arch,
    });
  } catch (error) {
    debugError('[Analytics] Failed to initialize:', error);
  }
}

/**
 * Track an analytics event. No-op if telemetry is disabled or not initialized.
 */
export async function track(
  eventName: string,
  props?: Record<string, string | number | boolean>,
): Promise<void> {
  if (!initialized) return;

  try {
    const settings = getSettings();
    if (settings.telemetryEnabled === false) return;

    await trackEvent(eventName, props);
  } catch {
    // Silently ignore tracking failures — never break the app for analytics
  }
}

/**
 * Track app shutdown.
 */
export async function trackShutdown(): Promise<void> {
  await track('app_closed');
}
