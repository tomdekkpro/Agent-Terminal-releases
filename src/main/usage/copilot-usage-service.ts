/**
 * Copilot Usage Service - Parses ~/.copilot/session-state/*.jsonl
 *
 * Extracts turn counts, model info, and context window data
 * from GitHub Copilot session state files.
 */

import { readdirSync, readFileSync, statSync, existsSync } from 'fs';
import { join } from 'path';
import * as os from 'os';
import type { CopilotUsageData } from '../../shared/types';
import { debugLog } from '../../shared/utils';

const SESSION_STATE_DIR = join(os.homedir(), '.copilot', 'session-state');
const CACHE_TTL = 30_000; // 30 seconds

let cachedData: CopilotUsageData | null = null;
let lastFetchTime = 0;

/**
 * Find the latest .jsonl file in the session-state directory by mtime
 */
function findLatestSessionFile(): string | null {
  try {
    if (!existsSync(SESSION_STATE_DIR)) return null;

    const files = readdirSync(SESSION_STATE_DIR).filter((f) => f.endsWith('.jsonl'));
    if (files.length === 0) return null;

    let latest: string | null = null;
    let latestMtime = 0;

    for (const file of files) {
      const fullPath = join(SESSION_STATE_DIR, file);
      const mtime = statSync(fullPath).mtimeMs;
      if (mtime > latestMtime) {
        latestMtime = mtime;
        latest = fullPath;
      }
    }

    return latest;
  } catch (err) {
    debugLog('[CopilotUsageService] Error finding session files:', err instanceof Error ? err.message : String(err));
    return null;
  }
}

/**
 * Parse a JSONL session-state file for usage data
 */
function parseSessionFile(filePath: string): CopilotUsageData {
  const data: CopilotUsageData = {
    totalTurns: 0,
    models: [],
  };

  try {
    const content = readFileSync(filePath, 'utf-8');
    const lines = content.split('\n').filter((l) => l.trim());
    const modelsSet = new Set<string>();

    for (const line of lines) {
      try {
        const event = JSON.parse(line);
        const eventType = event.type || event.event;

        // Count assistant turns
        if (eventType === 'assistant.turn_start') {
          data.totalTurns++;
        }

        // Extract context window / truncation data
        if (eventType === 'session.truncation') {
          if (event.tokenLimit != null) data.tokenLimit = event.tokenLimit;
          if (event.preTruncationTokensInMessages != null) {
            data.tokensUsed = event.preTruncationTokensInMessages;
          }
          if (event.tokensUsed != null) data.tokensUsed = event.tokensUsed;
        }

        // Track models used
        if (eventType === 'session.model_change' && event.model) {
          modelsSet.add(event.model);
        }

        // Also pick up model from assistant messages
        if (event.model && typeof event.model === 'string') {
          modelsSet.add(event.model);
        }
      } catch {
        // Skip malformed lines
      }
    }

    data.models = Array.from(modelsSet);
  } catch (err) {
    debugLog('[CopilotUsageService] Error parsing session file:', err instanceof Error ? err.message : String(err));
  }

  return data;
}

/**
 * Get Copilot session data from JSONL files.
 * Results are cached for 30 seconds.
 */
export async function getCopilotSessionData(): Promise<CopilotUsageData> {
  const now = Date.now();

  if (cachedData && now - lastFetchTime < CACHE_TTL) {
    return cachedData;
  }

  const filePath = findLatestSessionFile();
  if (!filePath) {
    return { totalTurns: 0, models: [] };
  }

  const data = parseSessionFile(filePath);
  cachedData = data;
  lastFetchTime = now;

  debugLog(`[CopilotUsageService] Parsed: turns=${data.totalTurns}, models=${data.models.join(',')}`);
  return data;
}
