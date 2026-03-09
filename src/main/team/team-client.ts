/**
 * WebSocket client for connecting to the team relay server.
 * Runs in the Electron main process, forwards events to renderer via IPC.
 */
import WebSocket from 'ws';
import { v4 as uuid } from 'uuid';
import type { BrowserWindow } from 'electron';
import type { TeamUser, TeamMessage, TeamWireMessage, SharedSessionInfo, InsightsMessage } from '../../shared/types';
import { IPC_CHANNELS } from '../../shared/constants';
import { debugLog, debugError } from '../../shared/utils';

let ws: WebSocket | null = null;
let currentUser: TeamUser | null = null;
let reconnectTimer: ReturnType<typeof setTimeout> | null = null;
let serverUrl: string = '';
let getWindowFn: (() => BrowserWindow | null) | null = null;

const RECONNECT_INTERVAL = 5000;

function sendToRenderer(event: TeamWireMessage): void {
  const win = getWindowFn?.();
  if (win && !win.isDestroyed()) {
    win.webContents.send(IPC_CHANNELS.TEAM_EVENT, event);
  }
}

function sendToServer(msg: TeamWireMessage): void {
  if (ws?.readyState === WebSocket.OPEN) {
    ws.send(JSON.stringify(msg));
  }
}

export function initTeamClient(getWindow: () => BrowserWindow | null): void {
  getWindowFn = getWindow;
}

export function connect(url: string, user: TeamUser): void {
  // Clean up previous connection
  disconnect();

  serverUrl = url;
  currentUser = user;

  try {
    ws = new WebSocket(url);

    ws.on('open', () => {
      debugLog(`[TeamClient] Connected to ${url}`);
      // Join the room
      sendToServer({ type: 'join', user });
      // Notify renderer
      sendToRenderer({ type: 'presence', users: [user] });
    });

    ws.on('message', (raw) => {
      try {
        const msg: TeamWireMessage = JSON.parse(raw.toString());
        sendToRenderer(msg);
      } catch {
        // ignore malformed
      }
    });

    ws.on('close', () => {
      debugLog('[TeamClient] Disconnected');
      sendToRenderer({ type: 'presence', users: [] });
      // Auto-reconnect
      if (currentUser && serverUrl) {
        reconnectTimer = setTimeout(() => {
          if (currentUser && serverUrl) {
            debugLog('[TeamClient] Reconnecting...');
            connect(serverUrl, currentUser);
          }
        }, RECONNECT_INTERVAL);
      }
    });

    ws.on('error', (err) => {
      debugError('[TeamClient] Error:', err.message);
      sendToRenderer({ type: 'error', error: err.message });
    });
  } catch (err) {
    debugError('[TeamClient] Connection failed:', err);
  }
}

export function disconnect(): void {
  if (reconnectTimer) {
    clearTimeout(reconnectTimer);
    reconnectTimer = null;
  }
  if (ws) {
    // Prevent auto-reconnect
    const old = ws;
    ws = null;
    currentUser = null;
    serverUrl = '';
    old.removeAllListeners();
    if (old.readyState === WebSocket.OPEN || old.readyState === WebSocket.CONNECTING) {
      old.close();
    }
  }
  sendToRenderer({ type: 'presence', users: [] });
}

export function sendChatMessage(content: string): void {
  if (!currentUser) return;
  const message: TeamMessage = {
    id: uuid(),
    from: currentUser.username,
    content,
    timestamp: new Date().toISOString(),
    repo: currentUser.repo,
  };
  sendToServer({ type: 'message', message });
  // Also echo to local renderer (server doesn't echo back to sender)
  sendToRenderer({ type: 'message', message });
}

export function sendTyping(): void {
  if (!currentUser) return;
  sendToServer({ type: 'typing', username: currentUser.username, repo: currentUser.repo });
}

// ─── Session sharing ──────────────────────────────────────────

export function shareSession(session: SharedSessionInfo): void {
  sendToServer({ type: 'session-share', session });
}

export function unshareSession(sessionId: string): void {
  if (!currentUser) return;
  sendToServer({ type: 'session-unshare', sessionId, repo: currentUser.repo });
}

export function joinSession(sessionId: string): void {
  if (!currentUser) return;
  sendToServer({ type: 'session-join', sessionId, username: currentUser.username, repo: currentUser.repo });
}

export function leaveSession(sessionId: string): void {
  if (!currentUser) return;
  sendToServer({ type: 'session-leave', sessionId, username: currentUser.username, repo: currentUser.repo });
}

export function sendSessionMessage(sessionId: string, message: InsightsMessage): void {
  if (!currentUser) return;
  sendToServer({ type: 'session-message', sessionId, message, repo: currentUser.repo });
  // Echo locally
  sendToRenderer({ type: 'session-message', sessionId, message, repo: currentUser.repo });
}

export function broadcastSessionParticipants(sessionId: string, participants: string[]): void {
  if (!currentUser) return;
  sendToServer({ type: 'session-participants', sessionId, participants, repo: currentUser.repo });
}

export function isConnected(): boolean {
  return ws?.readyState === WebSocket.OPEN;
}

export function getCurrentUser(): TeamUser | null {
  return currentUser;
}
