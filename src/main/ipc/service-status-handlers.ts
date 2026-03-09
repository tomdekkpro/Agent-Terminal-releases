/**
 * Service Status IPC Handlers
 *
 * Fetches live status from multiple AI provider status pages.
 * Polls every 5 minutes and pushes updates to the renderer.
 */

import type { IpcMain, BrowserWindow } from 'electron';
import { net } from 'electron';
import { IPC_CHANNELS } from '../../shared/constants';
import type {
  ServiceStatusLevel,
  ServiceStatusIncident,
  ProviderStatus,
  ServiceStatusSummary,
  AgentProviderId,
} from '../../shared/types';
import { debugError } from '../../shared/utils';

const POLL_INTERVAL = 5 * 60_000; // 5 minutes
const MIN_FETCH_INTERVAL = 60_000; // 60s cache per provider

let pollingInterval: NodeJS.Timeout | null = null;

// Per-provider cache
const cache: Record<string, { data: ProviderStatus; fetchedAt: number }> = {};

/** Helper: fetch JSON via Electron's net module (avoids CORS) with timeout */
async function fetchJSON(url: string, timeoutMs = 15000): Promise<any> {
  return new Promise((resolve, reject) => {
    const request = net.request(url);
    let body = '';
    let settled = false;

    const timer = setTimeout(() => {
      if (!settled) {
        settled = true;
        request.abort();
        reject(new Error(`Request to ${url} timed out after ${timeoutMs}ms`));
      }
    }, timeoutMs);

    request.on('response', (response) => {
      response.on('data', (chunk) => {
        body += chunk.toString();
      });
      response.on('end', () => {
        if (settled) return;
        settled = true;
        clearTimeout(timer);
        try {
          resolve(JSON.parse(body));
        } catch (e) {
          reject(new Error(`Failed to parse JSON from ${url}`));
        }
      });
      response.on('error', (err) => {
        if (settled) return;
        settled = true;
        clearTimeout(timer);
        reject(err);
      });
    });
    request.on('error', (err) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      reject(err);
    });
    request.end();
  });
}

/** Map Statuspage.io indicator to our level */
function mapStatuspageIndicator(indicator: string): ServiceStatusLevel {
  switch (indicator) {
    case 'none':
      return 'operational';
    case 'minor':
      return 'degraded';
    case 'major':
      return 'major';
    case 'critical':
      return 'critical';
    default:
      return 'unknown';
  }
}

/** Map Statuspage.io component status to our level */
function mapComponentStatus(status: string): ServiceStatusLevel {
  switch (status) {
    case 'operational':
      return 'operational';
    case 'degraded_performance':
      return 'degraded';
    case 'partial_outage':
      return 'major';
    case 'major_outage':
      return 'critical';
    default:
      return 'unknown';
  }
}

/** Fetch Claude status from Statuspage.io */
async function fetchClaudeStatus(): Promise<ProviderStatus> {
  const now = Date.now();
  const cached = cache['claude'];
  if (cached && now - cached.fetchedAt < MIN_FETCH_INTERVAL) {
    return cached.data;
  }

  try {
    const data = await fetchJSON('https://status.claude.com/api/v2/summary.json');

    const level = mapStatuspageIndicator(data.status?.indicator || 'none');
    const description = data.status?.description || 'All Systems Operational';

    const components = (data.components || []).map((c: any) => ({
      name: c.name,
      status: c.status,
    }));

    const incidents: ServiceStatusIncident[] = (data.incidents || []).map((inc: any) => ({
      name: inc.name,
      impact: inc.impact || 'none',
      status: inc.status || 'investigating',
      url: inc.shortlink,
      updatedAt: inc.updated_at || inc.created_at,
    }));

    const result: ProviderStatus = {
      provider: 'claude' as AgentProviderId,
      level,
      description,
      incidents,
      components,
      lastChecked: now,
    };

    cache['claude'] = { data: result, fetchedAt: now };
    return result;
  } catch (err) {
    debugError('[ServiceStatus] Failed to fetch Claude status:', err);
    return {
      provider: 'claude' as AgentProviderId,
      level: 'unknown',
      description: 'Unable to fetch status',
      incidents: [],
      lastChecked: now,
    };
  }
}

/** Fetch GitHub Copilot status (filter to Copilot component) */
async function fetchGitHubCopilotStatus(): Promise<ProviderStatus> {
  const now = Date.now();
  const cached = cache['copilot'];
  if (cached && now - cached.fetchedAt < MIN_FETCH_INTERVAL) {
    return cached.data;
  }

  try {
    const data = await fetchJSON('https://www.githubstatus.com/api/v2/summary.json');

    // Find Copilot-related components
    const copilotComponents = (data.components || []).filter(
      (c: any) => c.name?.toLowerCase().includes('copilot')
    );

    // Determine worst level from Copilot components
    let level: ServiceStatusLevel = 'operational';
    const components = copilotComponents.map((c: any) => {
      const compLevel = mapComponentStatus(c.status);
      if (severityRank(compLevel) > severityRank(level)) {
        level = compLevel;
      }
      return { name: c.name, status: c.status };
    });

    // If no Copilot-specific components found, use overall indicator
    if (copilotComponents.length === 0) {
      level = mapStatuspageIndicator(data.status?.indicator || 'none');
    }

    const description =
      level === 'operational'
        ? 'All Systems Operational'
        : `${copilotComponents.find((c: any) => c.status !== 'operational')?.name || 'Copilot'}: ${level}`;

    // Filter incidents that mention Copilot
    const incidents: ServiceStatusIncident[] = (data.incidents || [])
      .filter(
        (inc: any) =>
          inc.name?.toLowerCase().includes('copilot') ||
          inc.components?.some((c: any) => c.name?.toLowerCase().includes('copilot'))
      )
      .map((inc: any) => ({
        name: inc.name,
        impact: inc.impact || 'none',
        status: inc.status || 'investigating',
        url: inc.shortlink,
        updatedAt: inc.updated_at || inc.created_at,
      }));

    const result: ProviderStatus = {
      provider: 'copilot' as AgentProviderId,
      level,
      description,
      incidents,
      components,
      lastChecked: now,
    };

    cache['copilot'] = { data: result, fetchedAt: now };
    return result;
  } catch (err) {
    debugError('[ServiceStatus] Failed to fetch GitHub Copilot status:', err);
    return {
      provider: 'copilot' as AgentProviderId,
      level: 'unknown',
      description: 'Unable to fetch status',
      incidents: [],
      lastChecked: now,
    };
  }
}

/** Fetch Gemini status from Google Cloud incidents.json */
async function fetchGeminiStatus(): Promise<ProviderStatus> {
  const now = Date.now();
  const cached = cache['gemini'];
  if (cached && now - cached.fetchedAt < MIN_FETCH_INTERVAL) {
    return cached.data;
  }

  try {
    const data = await fetchJSON('https://status.cloud.google.com/incidents.json');
    const cutoff = now - 24 * 60 * 60_000; // 24 hours ago

    // Filter for recent incidents affecting Gemini/Vertex AI
    const geminiIncidents = (Array.isArray(data) ? data : []).filter((inc: any) => {
      const modified = new Date(inc.modified || inc.begin || 0).getTime();
      if (modified < cutoff) return false;

      // Check if any affected product mentions Gemini or Vertex AI
      const products = inc.affected_products || [];
      return products.some(
        (p: any) =>
          p.title?.toLowerCase().includes('gemini') ||
          p.title?.toLowerCase().includes('vertex ai')
      );
    });

    let level: ServiceStatusLevel = 'operational';
    const incidents: ServiceStatusIncident[] = geminiIncidents.map((inc: any) => {
      const severity = inc.severity?.toLowerCase() || '';
      let incidentLevel: ServiceStatusLevel = 'degraded';
      if (severity === 'high' || severity === 'critical') {
        incidentLevel = 'major';
      }

      // Check if incident is still active (no end time)
      const isActive = !inc.end;
      if (isActive && severityRank(incidentLevel) > severityRank(level)) {
        level = incidentLevel;
      }

      return {
        name: inc.external_desc || inc.service_name || 'Gemini API Incident',
        impact: severity || 'unknown',
        status: isActive ? 'active' : 'resolved',
        url: inc.uri ? `https://status.cloud.google.com${inc.uri}` : undefined,
        updatedAt: inc.modified || inc.begin || '',
      };
    });

    const description =
      level === 'operational'
        ? 'No Recent Incidents'
        : `${incidents.filter((i) => i.status === 'active').length} active incident(s)`;

    const result: ProviderStatus = {
      provider: 'gemini' as AgentProviderId,
      level,
      description,
      incidents,
      lastChecked: now,
    };

    cache['gemini'] = { data: result, fetchedAt: now };
    return result;
  } catch (err) {
    debugError('[ServiceStatus] Failed to fetch Gemini status:', err);
    return {
      provider: 'gemini' as AgentProviderId,
      level: 'unknown',
      description: 'Unable to fetch status',
      incidents: [],
      lastChecked: now,
    };
  }
}

/** Numeric rank for comparing severity */
function severityRank(level: ServiceStatusLevel): number {
  switch (level) {
    case 'operational':
      return 0;
    case 'degraded':
      return 1;
    case 'major':
      return 2;
    case 'critical':
      return 3;
    case 'unknown':
      return -1;
    default:
      return -1;
  }
}

/** Race a promise against a timeout */
function withTimeout<T>(promise: Promise<T>, ms: number, fallback: T): Promise<T> {
  return Promise.race([
    promise,
    new Promise<T>((resolve) => setTimeout(() => resolve(fallback), ms)),
  ]);
}

/** Fetch all providers and build summary */
async function fetchAllStatuses(): Promise<ServiceStatusSummary> {
  const now = Date.now();
  const fallbackStatus = (provider: AgentProviderId): ProviderStatus => ({
    provider,
    level: 'unknown',
    description: 'Status check timed out',
    incidents: [],
    lastChecked: now,
  });

  const [claude, copilot, gemini] = await Promise.all([
    withTimeout(fetchClaudeStatus(), 20000, fallbackStatus('claude' as AgentProviderId)),
    withTimeout(fetchGitHubCopilotStatus(), 20000, fallbackStatus('copilot' as AgentProviderId)),
    withTimeout(fetchGeminiStatus(), 20000, fallbackStatus('gemini' as AgentProviderId)),
  ]);

  const providers: Record<string, ProviderStatus> = {
    claude,
    copilot,
    gemini,
  };

  // Determine worst level across all providers
  let worstLevel: ServiceStatusLevel = 'operational';
  for (const status of Object.values(providers)) {
    if (severityRank(status.level) > severityRank(worstLevel)) {
      worstLevel = status.level;
    }
  }

  return { providers, worstLevel };
}

/** Push status update to renderer window */
function pushToRenderer(
  getWindow: () => BrowserWindow | null,
  summary: ServiceStatusSummary
): void {
  const win = getWindow();
  if (win && !win.isDestroyed()) {
    win.webContents.send(IPC_CHANNELS.SERVICE_STATUS_UPDATED, summary);
  }
}

export function registerServiceStatusHandlers(
  ipcMain: IpcMain,
  getWindow: () => BrowserWindow | null
): void {
  // Handle on-demand request from renderer
  ipcMain.handle(IPC_CHANNELS.SERVICE_STATUS_REQUEST, async () => {
    try {
      const summary = await fetchAllStatuses();
      pushToRenderer(getWindow, summary);
      return { success: true, data: summary };
    } catch (err) {
      debugError('[ServiceStatus] Failed to fetch statuses:', err);
      return {
        success: false,
        error: err instanceof Error ? err.message : 'Unknown error',
      };
    }
  });

  // Start background polling
  startPolling(getWindow);
}

function startPolling(getWindow: () => BrowserWindow | null): void {
  if (pollingInterval) clearInterval(pollingInterval);

  pollingInterval = setInterval(async () => {
    try {
      const summary = await fetchAllStatuses();
      pushToRenderer(getWindow, summary);
    } catch (err) {
      debugError('[ServiceStatus] Background poll failed:', err);
    }
  }, POLL_INTERVAL);
}

export function stopServiceStatusPolling(): void {
  if (pollingInterval) {
    clearInterval(pollingInterval);
    pollingInterval = null;
  }
}
