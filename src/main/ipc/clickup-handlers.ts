import type { IpcMain } from 'electron';
import { IPC_CHANNELS } from '../../shared/constants';
import { getSettings } from './settings-handlers';

const CLICKUP_API_BASE = 'https://api.clickup.com/api/v2';

// 30-second cache
const taskCache = new Map<string, { data: any; timestamp: number }>();
const CACHE_TTL = 30000;

async function clickUpFetch(endpoint: string, options: RequestInit = {}) {
  const settings = getSettings();
  const apiKey = settings.clickupApiKey;
  if (!apiKey) throw new Error('ClickUp API key not configured');

  const response = await fetch(`${CLICKUP_API_BASE}${endpoint}`, {
    ...options,
    headers: {
      Authorization: apiKey,
      'Content-Type': 'application/json',
      ...options.headers,
    },
  });

  if (!response.ok) {
    throw new Error(`ClickUp API error: ${response.status} ${response.statusText}`);
  }

  return response.json();
}

export function registerClickUpHandlers(ipcMain: IpcMain): void {
  ipcMain.handle(IPC_CHANNELS.CLICKUP_CHECK_CONNECTION, async () => {
    try {
      const data = await clickUpFetch('/user');
      const teams = await clickUpFetch('/team');
      return {
        success: true,
        data: {
          user: data.user,
          workspaces: teams.teams,
        },
      };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Connection failed',
      };
    }
  });

  ipcMain.handle(IPC_CHANNELS.CLICKUP_GET_TASKS, async (_event, listId?: string) => {
    try {
      const settings = getSettings();
      const targetListId = listId || settings.clickupListId;
      if (!targetListId) throw new Error('No list ID configured');

      const cacheKey = `tasks-${targetListId}`;
      const cached = taskCache.get(cacheKey);
      if (cached && Date.now() - cached.timestamp < CACHE_TTL) {
        return { success: true, data: cached.data };
      }

      const data = await clickUpFetch(
        `/list/${targetListId}/task?include_closed=true&subtasks=true`
      );
      taskCache.set(cacheKey, { data: data.tasks, timestamp: Date.now() });
      return { success: true, data: data.tasks };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Failed to fetch tasks',
      };
    }
  });

  ipcMain.handle(IPC_CHANNELS.CLICKUP_GET_TASK, async (_event, taskId: string) => {
    try {
      const data = await clickUpFetch(`/task/${taskId}`);
      return { success: true, data };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Failed to fetch task',
      };
    }
  });

  ipcMain.handle(
    IPC_CHANNELS.CLICKUP_CREATE_TASK,
    async (_event, listId: string, taskData: any) => {
      try {
        const data = await clickUpFetch(`/list/${listId}/task`, {
          method: 'POST',
          body: JSON.stringify(taskData),
        });
        return { success: true, data };
      } catch (error) {
        return {
          success: false,
          error: error instanceof Error ? error.message : 'Failed to create task',
        };
      }
    }
  );

  ipcMain.handle(
    IPC_CHANNELS.CLICKUP_POST_COMMENT,
    async (_event, taskId: string, comment: string) => {
      try {
        const data = await clickUpFetch(`/task/${taskId}/comment`, {
          method: 'POST',
          body: JSON.stringify({ comment_text: comment }),
        });
        return { success: true, data };
      } catch (error) {
        return {
          success: false,
          error: error instanceof Error ? error.message : 'Failed to post comment',
        };
      }
    }
  );

  ipcMain.handle(
    IPC_CHANNELS.CLICKUP_UPDATE_STATUS,
    async (_event, taskId: string, status: string) => {
      try {
        const data = await clickUpFetch(`/task/${taskId}`, {
          method: 'PUT',
          body: JSON.stringify({ status }),
        });
        return { success: true, data };
      } catch (error) {
        return {
          success: false,
          error: error instanceof Error ? error.message : 'Failed to update status',
        };
      }
    }
  );

  ipcMain.handle(
    IPC_CHANNELS.CLICKUP_POST_TIME_ENTRY,
    async (_event, taskId: string, startMs: number, durationMs: number, description?: string) => {
      try {
        const settings = getSettings();
        const teamId = settings.clickupWorkspaceId;
        if (!teamId) throw new Error('Workspace ID not configured');

        const body: any = {
          tid: taskId,
          start: startMs,
          duration: durationMs,
        };
        if (description) body.description = description;

        const data = await clickUpFetch(`/team/${teamId}/time_entries`, {
          method: 'POST',
          body: JSON.stringify(body),
        });
        return { success: true, data };
      } catch (error) {
        return {
          success: false,
          error: error instanceof Error ? error.message : 'Failed to post time entry',
        };
      }
    }
  );

  ipcMain.handle(
    IPC_CHANNELS.CLICKUP_GET_TIME_ENTRIES,
    async (_event, taskId: string) => {
      try {
        const settings = getSettings();
        const teamId = settings.clickupWorkspaceId;
        if (!teamId) throw new Error('Workspace ID not configured');

        const data = await clickUpFetch(`/team/${teamId}/time_entries?task_id=${taskId}`);
        // Sum all durations
        const entries = data.data || [];
        const totalMs = entries.reduce((sum: number, e: any) => sum + Number(e.duration || 0), 0);
        return { success: true, totalMs, entries };
      } catch (error) {
        return {
          success: false,
          error: error instanceof Error ? error.message : 'Failed to get time entries',
        };
      }
    }
  );
}
