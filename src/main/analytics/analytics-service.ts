import { app } from 'electron';
import { initialize, trackEvent } from '@aptabase/electron/main';
import { getSettings } from '../ipc/settings-handlers';
import { debugLog, debugError } from '../../shared/utils';

const APTABASE_APP_KEY = 'A-US-0345101138';

let initialized = false;

/**
 * Initialize Aptabase SDK. Must be called BEFORE app.whenReady().
 */
export function initAnalytics(): void {
  try {
    const settings = getSettings();
    if (settings.telemetryEnabled === false) {
      debugLog('[Analytics] Telemetry disabled by user');
      return;
    }

    initialize(APTABASE_APP_KEY);
    initialized = true;
    debugLog('[Analytics] Initialized');
  } catch (error) {
    debugError('[Analytics] Failed to initialize:', error);
  }
}

/**
 * Track an analytics event. No-op if telemetry is disabled or not initialized.
 * Only strings and numbers are allowed as property values.
 */
export function track(
  eventName: string,
  props?: Record<string, string | number>,
): void {
  if (!initialized) return;

  try {
    const settings = getSettings();
    if (settings.telemetryEnabled === false) return;

    trackEvent(eventName, props);
  } catch {
    // Silently ignore tracking failures — never break the app for analytics
  }
}

/**
 * Track app launch — call after app.whenReady().
 */
export function trackAppStarted(): void {
  track('app_started', {
    version: app.getVersion(),
    platform: process.platform,
    arch: process.arch,
  });
}

/**
 * Track app shutdown.
 */
export function trackShutdown(): void {
  track('app_closed');
}
