/**
 * Usage Service - Fetches Claude usage data
 *
 * Two-layer approach (matching Auto-Claude):
 * 1. Primary: Direct OAuth API (https://api.anthropic.com/api/oauth/usage)
 *    - Fast, reliable, no PTY needed
 *    - Reads OAuth token from Windows Credential Manager / macOS Keychain
 * 2. Fallback: CLI /usage command via PTY
 *    - Used when OAuth token is unavailable
 *
 * Windows notes:
 * - ConPTY requires AttachConsole which fails in Electron (no console attached)
 * - Always uses winpty (useConpty: false) for Electron compatibility
 */

import { spawn, execFileSync } from 'child_process';
import { existsSync, readFileSync } from 'fs';
import { createHash } from 'crypto';
import * as os from 'os';
import { join } from 'path';
import * as pty from '@lydell/node-pty';
import type { UsageSnapshot } from '../../shared/types';
import { debugLog } from '../../shared/utils';

const TIMEOUT = 45000; // 45 seconds
const IS_WINDOWS = os.platform() === 'win32';
const IS_MAC = os.platform() === 'darwin';

// ─── OAuth API Usage Fetching ────────────────────────────────────────────────

/**
 * Get the keychain service name for Claude Code credentials.
 * Mirrors the naming convention used by Claude Code CLI.
 */
function getKeychainServiceName(configDir?: string): string {
  const defaultConfigDir = join(os.homedir(), '.claude');
  const targetDir = configDir || defaultConfigDir;

  // Default profile uses base service name
  if (targetDir === defaultConfigDir) {
    return 'Claude Code-credentials';
  }

  // Custom profiles use hashed config dir
  const hash = createHash('sha256').update(targetDir).digest('hex').substring(0, 8);
  return `Claude Code-credentials-${hash}`;
}

/**
 * Read OAuth token from Windows Credential Manager using PowerShell
 */
function getWindowsCredentials(configDir?: string): { token: string | null; email: string | null } {
  const targetName = getKeychainServiceName(configDir);

  // Try Credential Manager first via PowerShell
  const psPath = findPowerShellPath();
  if (psPath) {
    try {
      const targetBase64 = Buffer.from(targetName, 'utf-8').toString('base64');
      const psScript = `
        $ErrorActionPreference = 'Stop'
        Add-Type -TypeDefinition @'
using System;
using System.Runtime.InteropServices;
public class CredManager {
    [StructLayout(LayoutKind.Sequential)]
    public struct CREDENTIAL {
        public int Flags;
        public int Type;
        public IntPtr TargetName;
        public IntPtr Comment;
        public System.Runtime.InteropServices.ComTypes.FILETIME LastWritten;
        public int CredentialBlobSize;
        public IntPtr CredentialBlob;
        public int Persist;
        public int AttributeCount;
        public IntPtr Attributes;
        public IntPtr TargetAlias;
        public IntPtr UserName;
    }
    [DllImport("advapi32.dll", SetLastError=true, CharSet=CharSet.Unicode)]
    public static extern bool CredRead(string target, int type, int flags, out IntPtr credential);
    [DllImport("advapi32.dll")]
    public static extern void CredFree(IntPtr credential);
}
'@
        $target = [System.Text.Encoding]::UTF8.GetString([System.Convert]::FromBase64String("${targetBase64}"))
        $credPtr = [IntPtr]::Zero
        $result = [CredManager]::CredRead($target, 1, 0, [ref]$credPtr)
        if ($result) {
            $cred = [System.Runtime.InteropServices.Marshal]::PtrToStructure($credPtr, [Type][CredManager+CREDENTIAL])
            if ($cred.CredentialBlobSize -gt 0) {
                $bytes = New-Object byte[] $cred.CredentialBlobSize
                [System.Runtime.InteropServices.Marshal]::Copy($cred.CredentialBlob, $bytes, 0, $cred.CredentialBlobSize)
                $json = [System.Text.Encoding]::UTF8.GetString($bytes)
                Write-Output $json
            }
            [CredManager]::CredFree($credPtr)
        }
      `;

      const output = execFileSync(psPath, ['-NoProfile', '-NonInteractive', '-Command', psScript], {
        encoding: 'utf-8',
        timeout: 10000,
        windowsHide: true,
      }).trim();

      if (output) {
        return parseCredentialJson(output);
      }
    } catch (err) {
      debugLog('[UsageService] Windows Credential Manager read failed:', err instanceof Error ? err.message : String(err));
    }
  }

  // Fallback: read from credentials.json file
  return getCredentialsFromFile(configDir);
}

/**
 * Find PowerShell executable path
 */
function findPowerShellPath(): string | null {
  const candidates = [
    'C:\\Windows\\System32\\WindowsPowerShell\\v1.0\\powershell.exe',
    'C:\\Program Files\\PowerShell\\7\\pwsh.exe',
  ];
  for (const p of candidates) {
    if (existsSync(p)) return p;
  }
  return null;
}

/**
 * Read OAuth token from macOS Keychain
 */
function getMacOSCredentials(configDir?: string): { token: string | null; email: string | null } {
  const serviceName = getKeychainServiceName(configDir);

  const securityPaths = ['/usr/bin/security', '/bin/security'];
  let securityPath: string | null = null;
  for (const p of securityPaths) {
    if (existsSync(p)) { securityPath = p; break; }
  }
  if (!securityPath) return { token: null, email: null };

  try {
    const output = execFileSync(securityPath, [
      'find-generic-password', '-s', serviceName, '-w',
    ], { encoding: 'utf-8', timeout: 10000 }).trim();

    if (output) {
      return parseCredentialJson(output);
    }
  } catch {
    debugLog('[UsageService] macOS Keychain read failed');
  }

  return getCredentialsFromFile(configDir);
}

/**
 * Read credentials from .credentials.json file (fallback)
 */
function getCredentialsFromFile(configDir?: string): { token: string | null; email: string | null } {
  const dir = configDir || join(os.homedir(), '.claude');
  const credPath = join(dir, '.credentials.json');

  try {
    if (existsSync(credPath)) {
      const data = JSON.parse(readFileSync(credPath, 'utf-8'));
      return parseCredentialJson(JSON.stringify(data));
    }
  } catch {
    debugLog('[UsageService] Credential file read failed');
  }

  return { token: null, email: null };
}

/**
 * Parse credential JSON to extract OAuth token and email
 */
function parseCredentialJson(json: string): { token: string | null; email: string | null } {
  try {
    const data = JSON.parse(json);
    const token = data?.claudeAiOauth?.accessToken || null;
    const email = data?.claudeAiOauth?.email || data?.claudeAiOauth?.emailAddress || data?.email || null;
    return { token, email };
  } catch {
    return { token: null, email: null };
  }
}

/**
 * Get OAuth credentials from platform-specific secure storage
 */
function getOAuthCredentials(): { token: string | null; email: string | null } {
  if (IS_WINDOWS) return getWindowsCredentials();
  if (IS_MAC) return getMacOSCredentials();

  // Linux: try credentials file
  return getCredentialsFromFile();
}

/**
 * Fetch usage data via Anthropic OAuth API (primary method)
 * Uses: GET https://api.anthropic.com/api/oauth/usage
 */
async function fetchUsageViaAPI(): Promise<UsageSnapshot | null> {
  const { token } = getOAuthCredentials();
  if (!token) {
    debugLog('[UsageService] No OAuth token found, skipping API method');
    return null;
  }

  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 30000);

    const response = await fetch('https://api.anthropic.com/api/oauth/usage', {
      method: 'GET',
      signal: controller.signal,
      headers: {
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json',
        'anthropic-beta': 'oauth-2025-04-20',
        'anthropic-version': '2023-06-01',
      },
    }).finally(() => clearTimeout(timeoutId));

    if (!response.ok) {
      debugLog(`[UsageService] API returned ${response.status}: ${response.statusText}`);
      return null;
    }

    const data = await response.json();
    return parseAPIResponse(data);
  } catch (err) {
    debugLog('[UsageService] API fetch failed:', err instanceof Error ? err.message : String(err));
    return null;
  }
}

/**
 * Parse the Anthropic OAuth usage API response into a UsageSnapshot
 *
 * Actual API response format:
 * {
 *   "five_hour": {
 *     "utilization": 19,       // integer 0-100
 *     "resets_at": "2025-01-17T15:00:00Z"
 *   },
 *   "seven_day": {
 *     "utilization": 45,       // integer 0-100
 *     "resets_at": "2025-01-20T12:00:00Z"
 *   }
 * }
 *
 * Legacy format (older API versions):
 * {
 *   "five_hour_utilization": 0.19,   // float 0-1
 *   "five_hour_reset_at": "...",
 *   "seven_day_utilization": 0.45,
 *   "seven_day_reset_at": "..."
 * }
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function parseAPIResponse(data: any): UsageSnapshot | null {
  try {
    let sessionPercent: number;
    let weeklyPercent: number;
    let sessionResetTime: string | undefined;
    let weeklyResetTime: string | undefined;

    // New nested format: { five_hour: { utilization: 72, resets_at: "..." } }
    if (data.five_hour !== undefined || data.seven_day !== undefined) {
      sessionPercent = data.five_hour?.utilization ?? 0;
      weeklyPercent = data.seven_day?.utilization ?? 0;
      const sessionResetAt = data.five_hour?.resets_at;
      const weeklyResetAt = data.seven_day?.resets_at;
      sessionResetTime = sessionResetAt ? formatResetTimestamp(sessionResetAt) : undefined;
      weeklyResetTime = weeklyResetAt ? formatResetTimestamp(weeklyResetAt) : undefined;
    }
    // Legacy flat format: { five_hour_utilization: 0.72, five_hour_reset_at: "..." }
    else if (data.five_hour_utilization !== undefined || data.seven_day_utilization !== undefined) {
      sessionPercent = Math.round((data.five_hour_utilization ?? 0) * 100);
      weeklyPercent = Math.round((data.seven_day_utilization ?? 0) * 100);
      sessionResetTime = data.five_hour_reset_at ? formatResetTimestamp(data.five_hour_reset_at) : undefined;
      weeklyResetTime = data.seven_day_reset_at ? formatResetTimestamp(data.seven_day_reset_at) : undefined;
    }
    else {
      debugLog('[UsageService] API response has unrecognized format:', Object.keys(data));
      return null;
    }

    debugLog(`[UsageService] Parsed API: session=${sessionPercent}%, weekly=${weeklyPercent}%`);

    return {
      sessionPercent,
      weeklyPercent,
      sessionResetTime,
      weeklyResetTime,
      fetchedAt: new Date(),
    };
  } catch (err) {
    debugLog('[UsageService] Failed to parse API response:', err);
    return null;
  }
}

/**
 * Format an ISO timestamp into a human-readable reset time
 */
function formatResetTimestamp(isoTimestamp: string): string {
  try {
    const date = new Date(isoTimestamp);
    const now = new Date();
    const diffMs = date.getTime() - now.getTime();

    if (diffMs <= 0) return 'Expired';

    const diffMin = Math.floor(diffMs / 60000);
    const diffHours = Math.floor(diffMin / 60);
    const remainingMin = diffMin % 60;

    if (diffHours > 0) {
      return `Resets in ${diffHours}h ${remainingMin}m`;
    }
    return `Resets in ${diffMin}m`;
  } catch {
    return '';
  }
}


// ─── CLI PTY Usage Fetching (Fallback) ───────────────────────────────────────

/**
 * Check if Claude CLI is available
 */
export async function isClaudeAvailable(): Promise<boolean> {
  const checkCmd = IS_WINDOWS ? 'where' : 'which';
  return new Promise((resolve) => {
    const proc = spawn(checkCmd, ['claude'], {
      shell: IS_WINDOWS,
      windowsHide: true,
    });
    const timeout = setTimeout(() => {
      proc.kill();
      resolve(false);
    }, 5000);
    proc.on('close', (code) => { clearTimeout(timeout); resolve(code === 0); });
    proc.on('error', () => { clearTimeout(timeout); resolve(false); });
  });
}

/**
 * Strip ANSI escape codes from terminal output
 */
function stripAnsi(text: string): string {
  return text
    // eslint-disable-next-line no-control-regex
    .replace(/\x1B\[[0-9;]*[A-Za-z]/g, '')
    // eslint-disable-next-line no-control-regex
    .replace(/\x1B\[\?[0-9;]*[A-Za-z]/g, '')
    .replace(/\[\?[0-9]+[A-Za-z]/g, '')
    // eslint-disable-next-line no-control-regex
    .replace(/\x1B\][^\x07]*\x07/g, '')
    // eslint-disable-next-line no-control-regex
    .replace(/\x1B[PX^_][^\x1B]*\x1B\\/g, '')
    // eslint-disable-next-line no-control-regex
    .replace(/\x1B[NOcDEFGHIJKLMZ78=>]/g, '')
    .replace(/[█▓▒░▌▐▄▀■□▣▢]/g, '')
    .replace(/[┌┐└┘├┤┬┴┼─│]/g, '')
    .replace(/\s{2,}/g, ' ');
}

/**
 * Extract section text between markers
 */
function extractSection(output: string, marker: string, endMarkers: string[]): string {
  const lower = output.toLowerCase();
  const lowerMarker = marker.toLowerCase();
  const startIdx = lower.lastIndexOf(lowerMarker);
  if (startIdx === -1) return '';

  let endIdx = output.length;
  for (const end of endMarkers) {
    const idx = lower.indexOf(end.toLowerCase(), startIdx + lowerMarker.length);
    if (idx !== -1 && idx < endIdx) endIdx = idx;
  }
  return output.substring(startIdx, endIdx);
}

/**
 * Parse percentage from section text
 */
function parsePercent(sectionText: string): number {
  if (!sectionText) return 0;
  const match = sectionText.match(/(\d{1,3})\s*%\s*(left|used|remaining)/i);
  if (!match) return 0;
  const value = parseInt(match[1], 10);
  return match[2].toLowerCase() === 'used' ? value : 100 - value;
}

/**
 * Parse reset time text from section
 */
function parseResetText(sectionText: string): string {
  if (!sectionText) return '';

  // Duration: "Resets in 2h 15m"
  const dur = sectionText.match(/Resets?\s*in\s*(\d+\s*h(?:\s*\d+\s*m)?|\d+\s*m)/i);
  if (dur) return dur[0].replace(/\s+/g, ' ').trim();

  // Date+time: "Resets Jan 23, 10:59am"
  const dt = sectionText.match(/Resets?\s*([A-Za-z]{3}\s+\d{1,2}(?:,?\s*(?:at\s*)?\d{1,2}(?::\d{2})?\s*(?:am|pm))?)/i);
  if (dt) return dt[0].replace(/\s+/g, ' ').trim();

  // Time only: "Resets 12:59pm"
  const t = sectionText.match(/Resets?\s*(\d{1,2}:\d{2}\s*(?:am|pm))/i);
  if (t) return t[0].replace(/\s+/g, ' ').trim();

  // Hour only: "Resets 12pm"
  const h = sectionText.match(/Resets?\s*(\d{1,2}\s*(?:am|pm))/i);
  if (h) return h[0].replace(/\s+/g, ' ').trim();

  return '';
}

/**
 * Parse full CLI usage output into a UsageSnapshot
 */
function parseUsageOutput(rawOutput: string): UsageSnapshot {
  const output = stripAnsi(rawOutput);

  const sessionText = extractSection(output, 'Current session', ['Current week']);
  const weeklyText = extractSection(output, 'Current week (all models)', [
    'Current week (Sonnet', 'Current week (Opus', 'Current session',
  ]);

  return {
    sessionPercent: parsePercent(sessionText),
    weeklyPercent: parsePercent(weeklyText),
    sessionResetTime: parseResetText(sessionText) || undefined,
    weeklyResetTime: parseResetText(weeklyText) || undefined,
    fetchedAt: new Date(),
  };
}

/**
 * Fetch usage data via CLI /usage command (fallback method)
 */
async function fetchUsageViaCLI(): Promise<UsageSnapshot> {
  return new Promise((resolve, reject) => {
    let output = '';
    let settled = false;
    let hasSeenUsageData = false;
    let hasSentCommand = false;
    let hasApprovedTrust = false;
    let hasSeenTrustPrompt = false;

    const cwd = process.cwd();
    const shell = IS_WINDOWS ? 'cmd.exe' : '/bin/sh';
    const args = IS_WINDOWS
      ? ['/c', 'claude', '--add-dir', cwd]
      : ['-c', `claude --add-dir "${cwd}"`];

    const { DEBUG: _DEBUG, ...cleanEnv } = process.env;
    const ptyOptions: pty.IPtyForkOptions = {
      name: 'xterm-256color',
      cols: 120,
      rows: 30,
      cwd,
      env: {
        ...cleanEnv,
        TERM: 'xterm-256color',
        COLORTERM: 'truecolor',
      } as Record<string, string>,
    };

    // On Windows, ConPTY requires AttachConsole which fails in Electron
    // Note: useConpty exists at runtime but @lydell/node-pty types don't expose it
    if (IS_WINDOWS) {
      (ptyOptions as Record<string, unknown>).useConpty = false;
      debugLog('[UsageService] Windows - using winpty (ConPTY disabled)');
    }

    let ptyProcess: pty.IPty;
    try {
      ptyProcess = pty.spawn(shell, args, ptyOptions);
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : String(err);
      reject(new Error(`Failed to spawn PTY: ${errorMessage}`));
      return;
    }

    const killPty = () => {
      try {
        if (IS_WINDOWS) ptyProcess.kill();
        else ptyProcess.kill('SIGTERM');
      } catch {}
    };

    const timeout = setTimeout(() => {
      if (settled) return;
      settled = true;
      killPty();
      if (output.includes('Current session') || output.includes('% left')) {
        resolve(parseUsageOutput(output));
      } else if (hasSeenTrustPrompt) {
        reject(new Error('TRUST_PROMPT: Claude CLI is waiting for folder permission.'));
      } else {
        reject(new Error('Claude CLI timed out'));
      }
    }, TIMEOUT);

    ptyProcess.onData((data: string) => {
      output += data;

      // eslint-disable-next-line no-control-regex
      const clean = output.replace(/\x1B\[[0-9;]*[A-Za-z]/g, '');

      // Check for authentication errors
      const hasAuthError =
        clean.includes('OAuth token does not meet scope requirement') ||
        clean.includes('token_expired') ||
        clean.includes('"type":"authentication_error"') ||
        clean.includes('"type": "authentication_error"');

      if (hasAuthError) {
        if (!settled) {
          settled = true;
          clearTimeout(timeout);
          killPty();
          reject(new Error("AUTH_ERROR: Please run 'claude logout' then 'claude login'."));
        }
        return;
      }

      // Check for usage data
      const hasUsage =
        clean.includes('Current session') ||
        (clean.includes('Usage') && clean.includes('% left')) ||
        /\d+%\s*(left|used|remaining)/i.test(clean) ||
        clean.includes('Resets in') ||
        clean.includes('Current week');

      if (!hasSeenUsageData && hasUsage) {
        hasSeenUsageData = true;
        debugLog('[UsageService] Usage data detected');
        setTimeout(() => {
          if (!settled && ptyProcess) {
            ptyProcess.write('\x1b');
            setTimeout(() => { if (!settled) killPty(); }, 2000);
          }
        }, 3000);
      }

      // Handle trust prompt
      if (
        !hasApprovedTrust &&
        (clean.includes('Do you want to work in this folder?') ||
         clean.includes('Ready to code here') ||
         clean.includes('permission to work with your files'))
      ) {
        hasApprovedTrust = true;
        hasSeenTrustPrompt = true;
        setTimeout(() => {
          if (!settled && ptyProcess) ptyProcess.write('\r');
        }, 1000);
      }

      // Detect REPL ready and send /usage
      const isReady =
        clean.includes('❯') ||
        clean.includes('? for shortcuts') ||
        (clean.includes('Welcome back') && clean.includes('Claude')) ||
        (clean.includes('Tips for getting started') && clean.includes('Claude')) ||
        (clean.includes('Opus') && clean.includes('Claude API')) ||
        (clean.includes('Sonnet') && clean.includes('Claude API'));

      if (!hasSentCommand && isReady) {
        hasSentCommand = true;
        debugLog('[UsageService] REPL ready, sending /usage');
        setTimeout(() => {
          if (!settled && ptyProcess) {
            ptyProcess.write('/usage\r');
            setTimeout(() => {
              if (!settled && ptyProcess) ptyProcess.write('\r');
            }, 1200);
          }
        }, 1500);
      }
    });

    ptyProcess.onExit(({ exitCode }: { exitCode: number }) => {
      clearTimeout(timeout);
      if (settled) return;
      settled = true;

      if (output.includes('token_expired') || output.includes('"type":"authentication_error"')) {
        reject(new Error("AUTH_ERROR: Authentication required - please run 'claude login'"));
        return;
      }

      if (output.trim()) {
        try { resolve(parseUsageOutput(output)); }
        catch (err) { reject(err); }
      } else {
        reject(new Error(`Claude CLI exited with code ${exitCode}, no output`));
      }
    });
  });
}


// ─── Public API ──────────────────────────────────────────────────────────────

/**
 * Fetch usage data - tries OAuth API first, falls back to CLI
 */
export async function fetchUsageData(): Promise<UsageSnapshot> {
  // Method 1: OAuth API (fast, reliable)
  try {
    const apiResult = await fetchUsageViaAPI();
    if (apiResult) {
      debugLog('[UsageService] Got usage via OAuth API');
      return apiResult;
    }
  } catch (err) {
    debugLog('[UsageService] OAuth API failed, trying CLI fallback:', err instanceof Error ? err.message : String(err));
  }

  // Method 2: CLI /usage command (fallback)
  debugLog('[UsageService] Falling back to CLI /usage method');
  return fetchUsageViaCLI();
}


// ─── Cost Extraction (from terminal output) ──────────────────────────────────

const COST_PATTERN = /(?:Total )?Cost:?\s*\$([0-9.]+)/i;
const INPUT_TOKENS_PATTERN = /(?:Input tokens|Tokens in):?\s*([0-9,]+)/i;
const OUTPUT_TOKENS_PATTERN = /(?:Output tokens|Tokens out):?\s*([0-9,]+)/i;

// ─── Copilot Usage Extraction (from terminal output) ─────────────────────────

const COPILOT_PREMIUM_PATTERN = /Total usage est:\s*(\d+)\s*Premium requests/i;
const COPILOT_INPUT_PATTERN = /input:\s*([0-9,]+)\s*tokens/i;
const COPILOT_OUTPUT_PATTERN = /output:\s*([0-9,]+)\s*tokens/i;
const COPILOT_DURATION_API_PATTERN = /Total duration \(API\):\s*(.+)/i;
const COPILOT_DURATION_WALL_PATTERN = /Total duration \(wall\):\s*(.+)/i;
const COPILOT_CODE_CHANGES_PATTERN = /Total code changes:\s*(\d+)\s*lines?\s*added,?\s*(\d+)\s*lines?\s*removed/i;

export interface CopilotOutputUsage {
  premiumRequests?: number;
  inputTokens?: number;
  outputTokens?: number;
  durationApi?: string;
  durationWall?: string;
  linesAdded?: number;
  linesRemoved?: number;
}

/**
 * Extract Copilot usage data from terminal output (e.g. /usage command)
 */
export function extractCopilotUsageFromOutput(data: string): CopilotOutputUsage | null {
  const premiumMatch = data.match(COPILOT_PREMIUM_PATTERN);
  const inputMatch = data.match(COPILOT_INPUT_PATTERN);
  const outputMatch = data.match(COPILOT_OUTPUT_PATTERN);
  const durationApiMatch = data.match(COPILOT_DURATION_API_PATTERN);
  const durationWallMatch = data.match(COPILOT_DURATION_WALL_PATTERN);
  const codeChangesMatch = data.match(COPILOT_CODE_CHANGES_PATTERN);

  if (!premiumMatch && !inputMatch && !outputMatch && !durationApiMatch && !durationWallMatch && !codeChangesMatch) return null;

  const result: CopilotOutputUsage = {};
  if (premiumMatch) result.premiumRequests = parseInt(premiumMatch[1], 10);
  if (inputMatch) result.inputTokens = parseInt(inputMatch[1].replace(/,/g, ''), 10);
  if (outputMatch) result.outputTokens = parseInt(outputMatch[1].replace(/,/g, ''), 10);
  if (durationApiMatch) result.durationApi = durationApiMatch[1].trim();
  if (durationWallMatch) result.durationWall = durationWallMatch[1].trim();
  if (codeChangesMatch) {
    result.linesAdded = parseInt(codeChangesMatch[1], 10);
    result.linesRemoved = parseInt(codeChangesMatch[2], 10);
  }
  return result;
}

/**
 * Extract cost and token usage from Claude terminal output
 */
export function extractCostFromOutput(data: string): {
  cost?: number;
  inputTokens?: number;
  outputTokens?: number;
} | null {
  const costMatch = data.match(COST_PATTERN);
  const inputMatch = data.match(INPUT_TOKENS_PATTERN);
  const outputMatch = data.match(OUTPUT_TOKENS_PATTERN);

  if (!costMatch && !inputMatch && !outputMatch) return null;

  const result: { cost?: number; inputTokens?: number; outputTokens?: number } = {};
  if (costMatch) result.cost = parseFloat(costMatch[1]);
  if (inputMatch) result.inputTokens = parseInt(inputMatch[1].replace(/,/g, ''), 10);
  if (outputMatch) result.outputTokens = parseInt(outputMatch[1].replace(/,/g, ''), 10);
  return result;
}
