import type { BrowserWindow, IpcMain } from 'electron';
import { IPC_CHANNELS } from '../../shared/constants';
import type { TeamUser, SharedSessionInfo, InsightsMessage } from '../../shared/types';
import { getGitHubIdentity } from '../team/identity';
import { getRepoIdentifier } from '../team/git-remote';
import {
  initTeamClient, connect, disconnect, sendChatMessage, sendTyping,
  shareSession, unshareSession, joinSession, leaveSession, sendSessionMessage,
} from '../team/team-client';
import { startRelayServer, stopRelayServer, isRelayServerRunning } from '../team/relay-server';

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
  ipcMain.handle(IPC_CHANNELS.TEAM_SEND_MESSAGE, async (_event, content: string) => {
    try {
      sendChatMessage(content);
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
}

export function cleanupTeam(): void {
  disconnect();
  stopRelayServer();
}
