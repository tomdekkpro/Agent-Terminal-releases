import { app } from 'electron';
import { join } from 'path';
import { readdir, readFile, writeFile, unlink, mkdir } from 'fs/promises';
import type { InsightsSession, InsightsSessionMeta } from '../../shared/types';

function getSessionsDir(): string {
  return join(app.getPath('userData'), 'insights', 'sessions');
}

async function ensureDir(): Promise<void> {
  await mkdir(getSessionsDir(), { recursive: true });
}

export async function listSessions(): Promise<InsightsSessionMeta[]> {
  await ensureDir();
  const dir = getSessionsDir();
  let files: string[];
  try {
    files = (await readdir(dir)).filter((f) => f.endsWith('.json'));
  } catch {
    return [];
  }

  const metas: InsightsSessionMeta[] = [];
  for (const file of files) {
    try {
      const raw = await readFile(join(dir, file), 'utf-8');
      const session: InsightsSession = JSON.parse(raw);
      metas.push({
        id: session.id,
        title: session.title,
        messageCount: session.messages.length,
        model: session.model,
        projectPath: session.projectPath,
        createdAt: session.createdAt,
        updatedAt: session.updatedAt,
      });
    } catch {
      // skip corrupt files
    }
  }

  return metas.sort((a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime());
}

export async function getSession(id: string): Promise<InsightsSession | null> {
  try {
    const raw = await readFile(join(getSessionsDir(), `${id}.json`), 'utf-8');
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

export async function saveSession(session: InsightsSession): Promise<void> {
  await ensureDir();
  await writeFile(join(getSessionsDir(), `${session.id}.json`), JSON.stringify(session, null, 2));
}

export async function deleteSession(id: string): Promise<void> {
  try {
    await unlink(join(getSessionsDir(), `${id}.json`));
  } catch {
    // already gone
  }
}

export async function renameSession(id: string, title: string): Promise<void> {
  const session = await getSession(id);
  if (!session) return;
  session.title = title;
  session.updatedAt = new Date().toISOString();
  await saveSession(session);
}
