/**
 * Embeddable WebSocket relay server for team chat.
 * One team member can "host" — others connect to their address.
 * Groups connections into rooms by owner/repo.
 * Chat history is persisted to disk so it survives server restarts.
 */
import { WebSocketServer, WebSocket } from 'ws';
import { v4 as uuid } from 'uuid';
import { exec } from 'child_process';
import type { TeamUser, TeamMessage, TeamWireMessage, SharedSessionInfo } from '../../shared/types';
import { debugLog, debugError } from '../../shared/utils';
import { loadChatHistory, saveChatHistory } from './chat-history';

const FIREWALL_RULE_NAME = 'Agent Terminal Relay';

function addFirewallRule(port: number): void {
  if (process.platform !== 'win32') return;
  const remove = `netsh advfirewall firewall delete rule name="${FIREWALL_RULE_NAME}"`;
  const add = `netsh advfirewall firewall add rule name="${FIREWALL_RULE_NAME}" dir=in action=allow protocol=TCP localport=${port}`;
  exec(remove, { timeout: 5000 }, () => {
    exec(add, { timeout: 5000 }, (err) => {
      if (err) {
        debugError('[RelayServer] Failed to add firewall rule (may need admin):', err.message);
      } else {
        debugLog(`[RelayServer] Firewall rule added for port ${port}`);
      }
    });
  });
}

function removeFirewallRule(): void {
  if (process.platform !== 'win32') return;
  exec(`netsh advfirewall firewall delete rule name="${FIREWALL_RULE_NAME}"`, { timeout: 5000 }, (err) => {
    if (err) {
      debugError('[RelayServer] Failed to remove firewall rule:', err.message);
    } else {
      debugLog('[RelayServer] Firewall rule removed');
    }
  });
}

interface Client {
  ws: WebSocket;
  user: TeamUser | null;
}

// Shared sessions per room: repo → sessionId → info
const sharedSessions = new Map<string, Map<string, SharedSessionInfo>>();

// Chat history per room: repo → messages (authoritative, persisted)
const MAX_HISTORY = 500;
const chatHistory = new Map<string, TeamMessage[]>();
// Track which repos have unsaved changes
const dirtyRepos = new Set<string>();
let persistTimer: ReturnType<typeof setInterval> | null = null;

let wss: WebSocketServer | null = null;
const clients = new Map<string, Client>();

// Room = repo (owner/repo), value = set of client IDs
const rooms = new Map<string, Set<string>>();

function broadcastToRoom(repo: string, message: TeamWireMessage, excludeClientId?: string): void {
  const room = rooms.get(repo);
  if (!room) return;

  const payload = JSON.stringify(message);
  for (const clientId of room) {
    if (clientId === excludeClientId) continue;
    const client = clients.get(clientId);
    if (client?.ws.readyState === WebSocket.OPEN) {
      client.ws.send(payload);
    }
  }
}

function getRoomUsers(repo: string): TeamUser[] {
  const room = rooms.get(repo);
  if (!room) return [];
  const users: TeamUser[] = [];
  for (const clientId of room) {
    const client = clients.get(clientId);
    if (client?.user) users.push(client.user);
  }
  return users;
}

function removeClientFromRoom(clientId: string, repo: string): void {
  const room = rooms.get(repo);
  if (room) {
    room.delete(clientId);
    if (room.size === 0) rooms.delete(repo);
  }
}

/** Persist dirty repos to disk */
async function flushHistory(): Promise<void> {
  for (const repo of dirtyRepos) {
    const msgs = chatHistory.get(repo);
    if (msgs) {
      await saveChatHistory(repo, msgs);
    }
  }
  dirtyRepos.clear();
}

export function startRelayServer(port: number = 9877): { port: number } | null {
  if (wss) {
    debugLog('[RelayServer] Already running');
    return { port };
  }

  try {
    wss = new WebSocketServer({ port });

    wss.on('connection', (ws) => {
      const clientId = uuid();
      clients.set(clientId, { ws, user: null });
      debugLog(`[RelayServer] Client connected: ${clientId}`);

      ws.on('message', (raw) => {
        try {
          const msg: TeamWireMessage = JSON.parse(raw.toString());
          handleMessage(clientId, msg);
        } catch {
          // ignore malformed messages
        }
      });

      ws.on('close', () => {
        const client = clients.get(clientId);
        if (client?.user) {
          const { repo, username } = client.user;
          removeClientFromRoom(clientId, repo);
          broadcastToRoom(repo, { type: 'leave', username, repo });
          broadcastToRoom(repo, { type: 'presence', users: getRoomUsers(repo) });
        }
        clients.delete(clientId);
        debugLog(`[RelayServer] Client disconnected: ${clientId}`);
      });
    });

    wss.on('error', (err) => {
      debugError('[RelayServer] Error:', err);
    });

    // Periodically flush dirty history to disk (every 5 seconds)
    persistTimer = setInterval(() => {
      if (dirtyRepos.size > 0) flushHistory().catch(() => {});
    }, 5000);

    // Open Windows Firewall for incoming connections
    addFirewallRule(port);

    debugLog(`[RelayServer] Started on port ${port}`);
    return { port };
  } catch (err) {
    debugError('[RelayServer] Failed to start:', err);
    return null;
  }
}

async function handleMessage(clientId: string, msg: TeamWireMessage): Promise<void> {
  const client = clients.get(clientId);
  if (!client) return;

  switch (msg.type) {
    case 'join': {
      client.user = msg.user;
      const { repo } = msg.user;
      if (!rooms.has(repo)) rooms.set(repo, new Set());
      rooms.get(repo)!.add(clientId);
      broadcastToRoom(repo, { type: 'presence', users: getRoomUsers(repo) });

      // Load history from memory, or from disk if first time seeing this repo
      if (!chatHistory.has(repo)) {
        const diskHistory = await loadChatHistory(repo);
        chatHistory.set(repo, diskHistory);
      }

      // Send chat history to the newly joined client
      const history = chatHistory.get(repo);
      if (history && history.length > 0) {
        const histPayload = JSON.stringify({ type: 'history', messages: history });
        if (client.ws.readyState === WebSocket.OPEN) client.ws.send(histPayload);
      }

      // Send existing shared sessions to the newly joined client
      const roomSessions = sharedSessions.get(repo);
      if (roomSessions && roomSessions.size > 0) {
        const payload = JSON.stringify({ type: 'session-list', sessions: [...roomSessions.values()] });
        if (client.ws.readyState === WebSocket.OPEN) client.ws.send(payload);
      }
      debugLog(`[RelayServer] ${msg.user.username} joined ${repo}`);
      break;
    }
    case 'message': {
      if (!client.user) return;
      const msgRepo = msg.message.repo;
      // Store in history (dedup by ID)
      if (!chatHistory.has(msgRepo)) chatHistory.set(msgRepo, []);
      const hist = chatHistory.get(msgRepo)!;
      // Only add if not already present (prevents duplicates on reconnect races)
      if (!hist.some(m => m.id === msg.message.id)) {
        hist.push(msg.message);
        if (hist.length > MAX_HISTORY) hist.splice(0, hist.length - MAX_HISTORY);
        dirtyRepos.add(msgRepo);
      }
      broadcastToRoom(msgRepo, msg, clientId);
      break;
    }
    case 'typing': {
      if (!client.user) return;
      broadcastToRoom(msg.repo, msg, clientId);
      break;
    }

    // ─── Session sharing ──────────────────────────────────
    case 'session-share': {
      if (!client.user) return;
      const { session } = msg;
      if (!sharedSessions.has(session.repo)) sharedSessions.set(session.repo, new Map());
      sharedSessions.get(session.repo)!.set(session.id, session);
      broadcastToRoom(session.repo, msg, clientId);
      debugLog(`[RelayServer] Session shared: ${session.id} in ${session.repo}`);
      break;
    }
    case 'session-unshare': {
      if (!client.user) return;
      sharedSessions.get(msg.repo)?.delete(msg.sessionId);
      broadcastToRoom(msg.repo, msg, clientId);
      break;
    }
    case 'session-join':
    case 'session-leave':
    case 'session-participants': {
      if (!client.user) return;
      broadcastToRoom(msg.repo, msg, clientId);
      break;
    }
    case 'session-message': {
      if (!client.user) return;
      broadcastToRoom(msg.repo, msg, clientId);
      break;
    }
    default:
      break;
  }
}

export function stopRelayServer(): void {
  if (!wss) return;

  // Flush history before stopping
  flushHistory().catch(() => {});

  if (persistTimer) {
    clearInterval(persistTimer);
    persistTimer = null;
  }

  for (const client of clients.values()) {
    client.ws.close();
  }
  clients.clear();
  rooms.clear();
  chatHistory.clear();
  wss.close();
  wss = null;
  // Clean up Windows Firewall rule
  removeFirewallRule();
  debugLog('[RelayServer] Stopped');
}

export function isRelayServerRunning(): boolean {
  return wss !== null;
}
