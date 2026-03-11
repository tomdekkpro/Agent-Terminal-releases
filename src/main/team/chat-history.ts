/**
 * Persists team chat messages to disk, keyed by repo (owner/repo).
 * Used by both the relay server (authoritative) and clients (local cache).
 * Images are stripped to keep file size manageable.
 */
import { app } from 'electron';
import { join } from 'path';
import { readFile, writeFile, mkdir } from 'fs/promises';
import type { TeamMessage } from '../../shared/types';

const MAX_PERSISTED = 500;

function getDir(): string {
  return join(app.getPath('userData'), 'team');
}

function getFilePath(repo: string): string {
  const safe = repo.replace(/[/\\:*?"<>|]/g, '_');
  return join(getDir(), `${safe}.json`);
}

export async function loadChatHistory(repo: string): Promise<TeamMessage[]> {
  try {
    const data = await readFile(getFilePath(repo), 'utf-8');
    return JSON.parse(data) as TeamMessage[];
  } catch {
    return [];
  }
}

export async function saveChatHistory(repo: string, messages: TeamMessage[]): Promise<void> {
  try {
    await mkdir(getDir(), { recursive: true });
    // Strip large images to keep file small, keep last N messages
    const trimmed = messages.slice(-MAX_PERSISTED).map(m => {
      if (m.image && m.image !== '[image]') {
        const { image: _, ...rest } = m;
        return { ...rest, image: '[image]' } as TeamMessage;
      }
      return m;
    });
    await writeFile(getFilePath(repo), JSON.stringify(trimmed), 'utf-8');
  } catch {
    // Non-critical
  }
}

/**
 * Merge two arrays of messages, dedup by ID, sort by timestamp.
 */
export function mergeMessages(a: TeamMessage[], b: TeamMessage[]): TeamMessage[] {
  const map = new Map<string, TeamMessage>();
  // Add a first, then b overwrites (b is typically newer/authoritative)
  for (const m of a) map.set(m.id, m);
  for (const m of b) map.set(m.id, m);
  return [...map.values()].sort(
    (x, y) => new Date(x.timestamp).getTime() - new Date(y.timestamp).getTime(),
  );
}
