import type { BrowserWindow, IpcMain } from 'electron';
import { v4 as uuidv4 } from 'uuid';
import { IPC_CHANNELS } from '../../shared/constants';
import type { InsightsMessage, InsightsModel, InsightsSession } from '../../shared/types';
import { sendMessage, abortStream, abortAllStreams } from '../insights/chat-executor';
import {
  listSessions,
  getSession,
  saveSession,
  deleteSession,
  renameSession,
} from '../insights/session-storage';

export function registerInsightsHandlers(
  ipcMain: IpcMain,
  getWindow: () => BrowserWindow | null,
): void {
  ipcMain.handle(IPC_CHANNELS.INSIGHTS_LIST_SESSIONS, async () => {
    try {
      const sessions = await listSessions();
      return { success: true, data: sessions };
    } catch (error) {
      return { success: false, error: error instanceof Error ? error.message : 'Failed to list sessions' };
    }
  });

  ipcMain.handle(IPC_CHANNELS.INSIGHTS_GET_SESSION, async (_event, id: string) => {
    try {
      const session = await getSession(id);
      if (!session) return { success: false, error: 'Session not found' };
      return { success: true, data: session };
    } catch (error) {
      return { success: false, error: error instanceof Error ? error.message : 'Failed to get session' };
    }
  });

  ipcMain.handle(
    IPC_CHANNELS.INSIGHTS_CREATE_SESSION,
    async (_event, model: InsightsModel, projectPath?: string) => {
      try {
        const now = new Date().toISOString();
        const session: InsightsSession = {
          id: uuidv4(),
          title: 'New Chat',
          messages: [],
          model,
          projectPath,
          createdAt: now,
          updatedAt: now,
        };
        await saveSession(session);
        return { success: true, data: session };
      } catch (error) {
        return { success: false, error: error instanceof Error ? error.message : 'Failed to create session' };
      }
    },
  );

  ipcMain.handle(IPC_CHANNELS.INSIGHTS_DELETE_SESSION, async (_event, id: string) => {
    try {
      abortStream(id);
      await deleteSession(id);
      return { success: true };
    } catch (error) {
      return { success: false, error: error instanceof Error ? error.message : 'Failed to delete session' };
    }
  });

  ipcMain.handle(IPC_CHANNELS.INSIGHTS_RENAME_SESSION, async (_event, id: string, title: string) => {
    try {
      await renameSession(id, title);
      return { success: true };
    } catch (error) {
      return { success: false, error: error instanceof Error ? error.message : 'Failed to rename session' };
    }
  });

  ipcMain.handle(
    IPC_CHANNELS.INSIGHTS_SEND_MESSAGE,
    async (_event, sessionId: string, content: string, model?: InsightsModel, projectPath?: string) => {
      try {
        let session = await getSession(sessionId);
        if (!session) return { success: false, error: 'Session not found' };

        // Update model if changed
        if (model) session.model = model;

        // Update project path if changed
        if (projectPath !== undefined) session.projectPath = projectPath || undefined;

        // Add user message
        const userMsg: InsightsMessage = {
          id: uuidv4(),
          role: 'user',
          content,
          timestamp: new Date().toISOString(),
        };
        session.messages.push(userMsg);

        // Auto-title from first message
        if (session.messages.length === 1) {
          session.title = content.slice(0, 60) + (content.length > 60 ? '...' : '');
        }

        session.updatedAt = new Date().toISOString();
        await saveSession(session);

        // Send to Claude and get response
        const responseText = await sendMessage(
          sessionId,
          session.messages.slice(0, -1), // history without current message
          content,
          session.model,
          session.projectPath,
          getWindow,
        );

        // Reload session (may have been modified), add assistant message
        session = (await getSession(sessionId))!;
        const assistantMsg: InsightsMessage = {
          id: uuidv4(),
          role: 'assistant',
          content: responseText,
          timestamp: new Date().toISOString(),
          model: session.model,
        };
        session.messages.push(assistantMsg);
        session.updatedAt = new Date().toISOString();
        await saveSession(session);

        return { success: true, data: session };
      } catch (error) {
        return { success: false, error: error instanceof Error ? error.message : 'Failed to send message' };
      }
    },
  );

  ipcMain.handle(IPC_CHANNELS.INSIGHTS_ABORT_STREAM, async (_event, sessionId: string) => {
    abortStream(sessionId);
    return { success: true };
  });
}

export function cleanupInsights(): void {
  abortAllStreams();
}
