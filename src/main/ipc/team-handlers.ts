import type { BrowserWindow, IpcMain } from 'electron';
import WebSocket from 'ws';
import { v4 as uuid } from 'uuid';
import { IPC_CHANNELS } from '../../shared/constants';
import type { TeamUser, SharedSessionInfo, InsightsMessage, Persona, InsightsModel } from '../../shared/types';
import { getGitHubIdentity } from '../team/identity';
import { getRepoIdentifier } from '../team/git-remote';
import {
  initTeamClient, connect, disconnect, sendChatMessage, sendTyping,
  shareSession, unshareSession, joinSession, leaveSession, sendSessionMessage,
} from '../team/team-client';
import { startRelayServer, stopRelayServer, isRelayServerRunning } from '../team/relay-server';
import { sendMessage as sendInsightsMessage } from '../insights/chat-executor';
import { loadChatHistory, saveChatHistory } from '../team/chat-history';

export function registerTeamHandlers(
  ipcMain: IpcMain,
  getWindow: () => BrowserWindow | null,
): void {
  // Initialize the team client with window reference
  initTeamClient(getWindow);

  // Get current user's GitHub identity
  ipcMain.handle(IPC_CHANNELS.TEAM_GET_IDENTITY, async () => {
    try {
      const identity = await getGitHubIdentity();
      if (!identity) return { success: false, error: 'GitHub CLI not authenticated. Run: gh auth login' };
      return { success: true, data: identity };
    } catch (error) {
      return { success: false, error: error instanceof Error ? error.message : 'Failed to get identity' };
    }
  });

  // Get repo identifier from project path
  ipcMain.handle(IPC_CHANNELS.TEAM_GET_REPO, async (_event, projectPath: string) => {
    try {
      const repo = await getRepoIdentifier(projectPath);
      if (!repo) return { success: false, error: 'Not a GitHub repository' };
      return { success: true, data: repo };
    } catch (error) {
      return { success: false, error: error instanceof Error ? error.message : 'Failed to get repo' };
    }
  });

  // Connect to a relay server
  ipcMain.handle(IPC_CHANNELS.TEAM_CONNECT, async (_event, serverUrl: string, user: TeamUser) => {
    try {
      connect(serverUrl, user);
      return { success: true };
    } catch (error) {
      return { success: false, error: error instanceof Error ? error.message : 'Failed to connect' };
    }
  });

  // Disconnect from relay server
  ipcMain.handle(IPC_CHANNELS.TEAM_DISCONNECT, async () => {
    disconnect();
    return { success: true };
  });

  // Send a chat message
  ipcMain.handle(IPC_CHANNELS.TEAM_SEND_MESSAGE, async (_event, content: string, meta?: Record<string, string>) => {
    try {
      sendChatMessage(content, meta);
      return { success: true };
    } catch (error) {
      return { success: false, error: error instanceof Error ? error.message : 'Failed to send' };
    }
  });

  // Send typing indicator
  ipcMain.handle(IPC_CHANNELS.TEAM_SEND_TYPING, async () => {
    sendTyping();
    return { success: true };
  });

  // Start embedded relay server
  ipcMain.handle(IPC_CHANNELS.TEAM_START_SERVER, async (_event, port?: number) => {
    try {
      if (isRelayServerRunning()) return { success: true, data: { port: port || 9877, alreadyRunning: true } };
      const result = startRelayServer(port || 9877);
      if (!result) return { success: false, error: 'Failed to start server' };
      return { success: true, data: result };
    } catch (error) {
      return { success: false, error: error instanceof Error ? error.message : 'Failed to start server' };
    }
  });

  // Stop embedded relay server
  ipcMain.handle(IPC_CHANNELS.TEAM_STOP_SERVER, async () => {
    stopRelayServer();
    return { success: true };
  });

  // Test connection to a relay server
  ipcMain.handle(IPC_CHANNELS.TEAM_TEST_CONNECTION, async (_event, url: string) => {
    const tryConnect = (targetUrl: string): Promise<{ success: boolean; error?: string }> => {
      return new Promise((resolve) => {
        let testWs: WebSocket;
        const timeout = setTimeout(() => {
          testWs?.removeAllListeners();
          testWs?.close();
          resolve({ success: false, error: 'Connection timed out (5s)' });
        }, 5000);

        try {
          testWs = new WebSocket(targetUrl);
        } catch (err: any) {
          clearTimeout(timeout);
          resolve({ success: false, error: err.message || 'Invalid URL' });
          return;
        }

        testWs.on('open', () => {
          clearTimeout(timeout);
          testWs.close();
          resolve({ success: true });
        });

        testWs.on('error', (err) => {
          clearTimeout(timeout);
          testWs.removeAllListeners();
          resolve({ success: false, error: err.message || 'Connection failed' });
        });
      });
    };

    // First try the URL as-is
    const result = await tryConnect(url);
    if (result.success) return result;

    // If the relay server is running locally, the URL might be our own public IP.
    // NAT hairpinning often fails, so try localhost with the same port as fallback.
    if (isRelayServerRunning()) {
      try {
        const parsed = new URL(url);
        const localhostUrl = `ws://localhost:${parsed.port || '9877'}`;
        if (localhostUrl !== url) {
          const localResult = await tryConnect(localhostUrl);
          if (localResult.success) {
            return { success: true, note: 'Server reachable locally (your router may not support NAT hairpinning — external peers can still connect)' };
          }
        }
      } catch { /* ignore parse errors */ }
    }

    return result;
  });

  // ─── Session sharing ──────────────────────────────────────

  ipcMain.handle(IPC_CHANNELS.TEAM_SHARE_SESSION, async (_event, session: SharedSessionInfo) => {
    shareSession(session);
    return { success: true };
  });

  ipcMain.handle(IPC_CHANNELS.TEAM_UNSHARE_SESSION, async (_event, sessionId: string) => {
    unshareSession(sessionId);
    return { success: true };
  });

  ipcMain.handle(IPC_CHANNELS.TEAM_JOIN_SESSION, async (_event, sessionId: string) => {
    joinSession(sessionId);
    return { success: true };
  });

  ipcMain.handle(IPC_CHANNELS.TEAM_LEAVE_SESSION, async (_event, sessionId: string) => {
    leaveSession(sessionId);
    return { success: true };
  });

  ipcMain.handle(IPC_CHANNELS.TEAM_SEND_SESSION_MESSAGE, async (_event, sessionId: string, message: InsightsMessage) => {
    sendSessionMessage(sessionId, message);
    return { success: true };
  });

  // ─── Persona AI reply (lightweight — no session required) ───

  ipcMain.handle(
    IPC_CHANNELS.TEAM_PERSONA_REPLY,
    async (_event, content: string, persona: Persona, model?: InsightsModel, projectPath?: string) => {
      try {
        // Use a transient session ID — no data is saved to disk
        const transientId = `__team_persona_${uuid()}`;
        const responseText = await sendInsightsMessage(
          transientId,
          [],          // no history — one-shot reply
          content,
          model || 'sonnet',
          projectPath, // project context for file access and integrations
          getWindow,
          undefined,   // default provider (claude)
          undefined,   // no copilotModel
          persona,
        );
        return { success: true, data: responseText };
      } catch (error) {
        return { success: false, error: error instanceof Error ? error.message : 'Persona reply failed' };
      }
    },
  );

  // ─── Chat history persistence ──────────────────────────────

  ipcMain.handle(IPC_CHANNELS.TEAM_LOAD_HISTORY, async (_event, repo: string) => {
    try {
      const messages = await loadChatHistory(repo);
      return { success: true, data: messages };
    } catch {
      return { success: true, data: [] };
    }
  });

  ipcMain.handle(IPC_CHANNELS.TEAM_SAVE_HISTORY, async (_event, repo: string, messages: any[]) => {
    try {
      await saveChatHistory(repo, messages);
      return { success: true };
    } catch {
      return { success: false };
    }
  });
}

export function cleanupTeam(): void {
  disconnect();
  stopRelayServer();
}
