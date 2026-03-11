/**
 * Detect the current user's GitHub identity via `gh auth status`.
 */
import { exec } from 'child_process';
import { debugLog, debugError } from '../../shared/utils';

interface GitHubIdentity {
  username: string;
  avatarUrl?: string;
}

let cachedIdentity: GitHubIdentity | null = null;

function run(command: string): Promise<string> {
  return new Promise((resolve) => {
    exec(command, { encoding: 'utf-8', timeout: 10000 }, (_error, stdout, stderr) => {
      // gh auth status writes to stderr
      resolve((stdout || '') + (stderr || ''));
    });
  });
}

export async function getGitHubIdentity(): Promise<GitHubIdentity | null> {
  if (cachedIdentity) return cachedIdentity;

  try {
    const output = await run('gh auth status');
    // Parse "Logged in to github.com account USERNAME (..."
    const match = output.match(/Logged in to github\.com\s+account\s+(\S+)/i)
      || output.match(/account\s+(\S+)/i)
      || output.match(/Logged in to github\.com as (\S+)/i);
    if (!match) {
      debugError('[Team] Could not parse GitHub identity from:', output);
      return null;
    }

    const username = match[1].replace(/[()]/g, '');

    // Try to get the actual avatar URL via GitHub API for reliable loading
    let avatarUrl = `https://github.com/${username}.png?size=64`;
    try {
      const apiOutput = await run(`gh api users/${username} --jq .avatar_url`);
      const trimmed = apiOutput.trim();
      if (trimmed.startsWith('https://')) {
        avatarUrl = `${trimmed}&s=64`;
      }
    } catch { /* fallback to github.com/{user}.png */ }

    cachedIdentity = { username, avatarUrl };

    debugLog(`[Team] GitHub identity: ${username}`);
    return cachedIdentity;
  } catch (err) {
    debugError('[Team] Failed to get GitHub identity:', err);
    return null;
  }
}

export function clearIdentityCache(): void {
  cachedIdentity = null;
}
