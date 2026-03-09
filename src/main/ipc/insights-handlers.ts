import type { BrowserWindow, IpcMain } from 'electron';
import { v4 as uuidv4 } from 'uuid';
import { IPC_CHANNELS } from '../../shared/constants';
import type { CopilotProvider, InsightsMessage, InsightsModel, InsightsSession, Persona } from '../../shared/types';
import { sendMessage, abortStream, abortAllStreams } from '../insights/chat-executor';
import { track } from '../analytics/analytics-service';
import {
  listSessions,
  getSession,
  saveSession,
  deleteSession,
  renameSession,
  togglePinSession,
  deleteMessageAndAfter,
  exportSessionAsMarkdown,
} from '../insights/session-storage';
import {
  loadPersonas,
  savePersonas,
  addPersona,
  updatePersona,
  deletePersona,
  resetPersonas,
} from '../insights/persona-storage';

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
    async (_event, model: InsightsModel, projectPath?: string, provider?: CopilotProvider, copilotModel?: string) => {
      try {
        const now = new Date().toISOString();
        const session: InsightsSession = {
          id: uuidv4(),
          title: 'New Chat',
          messages: [],
          model,
          provider: provider || 'claude',
          copilotModel: provider === 'copilot' ? copilotModel : undefined,
          projectPath,
          createdAt: now,
          updatedAt: now,
        };
        await saveSession(session);
        track('insights_session_created', { provider: session.provider || 'claude', model });
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
    async (_event, sessionId: string, content: string, model?: InsightsModel, projectPath?: string, copilotModel?: string) => {
      try {
        let session = await getSession(sessionId);
        if (!session) return { success: false, error: 'Session not found' };

        // Update model if changed
        if (model) session.model = model;
        if (copilotModel) session.copilotModel = copilotModel;

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

        // Send to AI provider and get response
        const responseText = await sendMessage(
          sessionId,
          session.messages.slice(0, -1),
          content,
          session.model,
          session.projectPath,
          getWindow,
          session.provider,
          session.copilotModel,
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

  // ─── Round Table: send message as a specific persona ─────────
  ipcMain.handle(
    IPC_CHANNELS.INSIGHTS_SEND_PERSONA_MESSAGE,
    async (_event, sessionId: string, content: string, persona: Persona, model?: InsightsModel, projectPath?: string, copilotModel?: string, userMessage?: string) => {
      try {
        let session = await getSession(sessionId);
        if (!session) return { success: false, error: 'Session not found' };

        if (model) session.model = model;
        if (copilotModel) session.copilotModel = copilotModel;
        if (projectPath !== undefined) session.projectPath = projectPath || undefined;

        // If a user message is provided, add it to the session first
        if (userMessage) {
          const userMsg: InsightsMessage = {
            id: uuidv4(),
            role: 'user',
            content: userMessage,
            timestamp: new Date().toISOString(),
          };
          session.messages.push(userMsg);
        }

        session.updatedAt = new Date().toISOString();
        await saveSession(session);

        // Send message with persona context
        const responseText = await sendMessage(
          sessionId,
          session.messages,
          content,
          session.model,
          session.projectPath,
          getWindow,
          session.provider,
          session.copilotModel,
          persona,
        );

        // Reload and add persona's response
        session = (await getSession(sessionId))!;
        const assistantMsg: InsightsMessage = {
          id: uuidv4(),
          role: 'assistant',
          content: responseText,
          timestamp: new Date().toISOString(),
          model: session.model,
          personaId: persona.id,
        };
        session.messages.push(assistantMsg);

        // Advance persona index
        if (session.mode === 'roundtable' && session.personas && session.personas.length > 0) {
          session.activePersonaIndex = ((session.activePersonaIndex ?? 0) + 1) % session.personas.length;
        }

        session.updatedAt = new Date().toISOString();
        await saveSession(session);

        return { success: true, data: session };
      } catch (error) {
        return { success: false, error: error instanceof Error ? error.message : 'Failed to send persona message' };
      }
    },
  );

  // ─── Update session fields (status, linked terminal, etc.) ───
  ipcMain.handle(
    IPC_CHANNELS.INSIGHTS_UPDATE_SESSION,
    async (_event, sessionId: string, updates: Partial<InsightsSession>) => {
      try {
        const session = await getSession(sessionId);
        if (!session) return { success: false, error: 'Session not found' };

        // Apply safe updates (not messages/id)
        if (updates.mode !== undefined) session.mode = updates.mode;
        if (updates.personas !== undefined) session.personas = updates.personas;
        if (updates.activePersonaIndex !== undefined) session.activePersonaIndex = updates.activePersonaIndex;
        if (updates.linkedTerminalId !== undefined) session.linkedTerminalId = updates.linkedTerminalId;
        if (updates.discussionStatus !== undefined) session.discussionStatus = updates.discussionStatus;
        if (updates.title !== undefined) session.title = updates.title;
        if (updates.shared !== undefined) session.shared = updates.shared;
        if (updates.participants !== undefined) session.participants = updates.participants;

        // If messages are provided (for adding status/spec cards), append them
        if (updates.messages && updates.messages.length > session.messages.length) {
          const newMessages = updates.messages.slice(session.messages.length);
          session.messages.push(...newMessages);
        }

        session.updatedAt = new Date().toISOString();
        await saveSession(session);

        return { success: true, data: session };
      } catch (error) {
        return { success: false, error: error instanceof Error ? error.message : 'Failed to update session' };
      }
    },
  );

  ipcMain.handle(IPC_CHANNELS.INSIGHTS_ABORT_STREAM, async (_event, sessionId: string) => {
    abortStream(sessionId);
    return { success: true };
  });

  ipcMain.handle(IPC_CHANNELS.INSIGHTS_PIN_SESSION, async (_event, id: string) => {
    try {
      const pinned = await togglePinSession(id);
      return { success: true, data: pinned };
    } catch (error) {
      return { success: false, error: error instanceof Error ? error.message : 'Failed to toggle pin' };
    }
  });

  ipcMain.handle(IPC_CHANNELS.INSIGHTS_DELETE_MESSAGE, async (_event, sessionId: string, messageId: string) => {
    try {
      const session = await deleteMessageAndAfter(sessionId, messageId);
      if (!session) return { success: false, error: 'Session not found' };
      return { success: true, data: session };
    } catch (error) {
      return { success: false, error: error instanceof Error ? error.message : 'Failed to delete message' };
    }
  });

  ipcMain.handle(IPC_CHANNELS.INSIGHTS_EXPORT_SESSION, async (_event, id: string) => {
    try {
      const md = await exportSessionAsMarkdown(id);
      if (!md) return { success: false, error: 'Session not found' };
      return { success: true, data: md };
    } catch (error) {
      return { success: false, error: error instanceof Error ? error.message : 'Failed to export session' };
    }
  });

  // ─── Persona CRUD ────────────────────────────────────────────
  ipcMain.handle(IPC_CHANNELS.PERSONAS_LIST, async () => {
    try {
      const personas = await loadPersonas();
      return { success: true, data: personas };
    } catch (error) {
      return { success: false, error: error instanceof Error ? error.message : 'Failed to load personas' };
    }
  });

  ipcMain.handle(IPC_CHANNELS.PERSONAS_SAVE, async (_event, personas: Persona[]) => {
    try {
      await savePersonas(personas);
      return { success: true };
    } catch (error) {
      return { success: false, error: error instanceof Error ? error.message : 'Failed to save personas' };
    }
  });

  ipcMain.handle(IPC_CHANNELS.PERSONAS_ADD, async (_event, persona: Persona) => {
    try {
      const personas = await addPersona(persona);
      return { success: true, data: personas };
    } catch (error) {
      return { success: false, error: error instanceof Error ? error.message : 'Failed to add persona' };
    }
  });

  ipcMain.handle(IPC_CHANNELS.PERSONAS_UPDATE, async (_event, id: string, updates: Partial<Persona>) => {
    try {
      const personas = await updatePersona(id, updates);
      return { success: true, data: personas };
    } catch (error) {
      return { success: false, error: error instanceof Error ? error.message : 'Failed to update persona' };
    }
  });

  ipcMain.handle(IPC_CHANNELS.PERSONAS_DELETE, async (_event, id: string) => {
    try {
      const personas = await deletePersona(id);
      return { success: true, data: personas };
    } catch (error) {
      return { success: false, error: error instanceof Error ? error.message : 'Failed to delete persona' };
    }
  });

  ipcMain.handle(IPC_CHANNELS.PERSONAS_RESET, async () => {
    try {
      const personas = await resetPersonas();
      return { success: true, data: personas };
    } catch (error) {
      return { success: false, error: error instanceof Error ? error.message : 'Failed to reset personas' };
    }
  });
}

export function cleanupInsights(): void {
  abortAllStreams();
}
