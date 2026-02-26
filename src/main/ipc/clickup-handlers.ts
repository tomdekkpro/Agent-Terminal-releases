import type { IpcMain } from 'electron';
import { IPC_CHANNELS } from '../../shared/constants';
import { getSettings } from './settings-handlers';

const CLICKUP_API_BASE = 'https://api.clickup.com/api/v2';

// 30-second cache for initial load, 2-minute cache for full paginated fetch
const taskCache = new Map<string, { data: any; timestamp: number }>();
const CACHE_TTL = 30000;
const FULL_CACHE_TTL = 120000;

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

  ipcMain.handle(
    IPC_CHANNELS.CLICKUP_SEARCH_TASKS,
    async (_event, query: string, listId?: string) => {
      try {
        const settings = getSettings();
        const targetListId = listId || settings.clickupListId;
        if (!targetListId) throw new Error('No list ID configured');

        // Check if we have a full cache of all tasks
        const fullCacheKey = `all-tasks-${targetListId}`;
        let allTasks: any[];
        const cached = taskCache.get(fullCacheKey);

        if (cached && Date.now() - cached.timestamp < FULL_CACHE_TTL) {
          allTasks = cached.data;
        } else {
          // Fetch ALL pages from the list
          allTasks = [];
          let page = 0;
          let hasMore = true;

          while (hasMore) {
            const data = await clickUpFetch(
              `/list/${targetListId}/task?include_closed=true&subtasks=true&page=${page}`
            );
            const tasks = data.tasks || [];
            allTasks.push(...tasks);
            // ClickUp returns 100 per page; if less, we've reached the end
            hasMore = tasks.length === 100;
            page++;
            // Safety limit to avoid infinite loops
            if (page > 20) break;
          }

          taskCache.set(fullCacheKey, { data: allTasks, timestamp: Date.now() });
          // Also update the regular cache so initial load benefits
          taskCache.set(`tasks-${targetListId}`, { data: allTasks, timestamp: Date.now() });
        }

        // Filter by query
        if (!query.trim()) {
          return { success: true, data: allTasks };
        }

        const q = query.toLowerCase();
        const filtered = allTasks.filter(
          (t: any) =>
            t.name?.toLowerCase().includes(q) ||
            t.custom_id?.toLowerCase().includes(q) ||
            t.text_content?.toLowerCase().includes(q) ||
            t.status?.status?.toLowerCase().includes(q)
        );

        return { success: true, data: filtered };
      } catch (error) {
        return {
          success: false,
          error: error instanceof Error ? error.message : 'Failed to search tasks',
        };
      }
    }
  );

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
