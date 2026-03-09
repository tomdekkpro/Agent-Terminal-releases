/**
 * Detect the GitHub owner/repo from a local git project path.
 */
import { exec } from 'child_process';
import { debugLog, debugError } from '../../shared/utils';

function run(command: string, cwd: string): Promise<string> {
  return new Promise((resolve, reject) => {
    exec(command, { cwd, encoding: 'utf-8', timeout: 5000 }, (error, stdout) => {
      if (error) reject(error);
      else resolve(stdout.trim());
    });
  });
}

/**
 * Parse a git remote URL into "owner/repo" format.
 * Supports: git@github.com:owner/repo.git, https://github.com/owner/repo.git, etc.
 */
function parseOwnerRepo(remoteUrl: string): string | null {
  // SSH: git@github.com:owner/repo.git
  let match = remoteUrl.match(/github\.com[:/]([^/]+)\/([^/.]+)/);
  if (match) return `${match[1]}/${match[2]}`;

  // HTTPS: https://github.com/owner/repo
  match = remoteUrl.match(/github\.com\/([^/]+)\/([^/.]+)/);
  if (match) return `${match[1]}/${match[2]}`;

  return null;
}

/**
 * Get the owner/repo for a given project path.
 * Returns null if not a GitHub repo or cannot determine.
 */
export async function getRepoIdentifier(projectPath: string): Promise<string | null> {
  try {
    const remoteUrl = await run('git remote get-url origin', projectPath);
    const ownerRepo = parseOwnerRepo(remoteUrl);
    if (ownerRepo) {
      debugLog(`[Team] Repo: ${ownerRepo} (from ${projectPath})`);
    }
    return ownerRepo;
  } catch (err) {
    debugError('[Team] Failed to get git remote:', err);
    return null;
  }
}
