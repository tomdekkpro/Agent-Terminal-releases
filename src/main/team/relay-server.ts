/**
 * Embeddable WebSocket relay server for team chat.
 * One team member can "host" — others connect to their address.
 * Groups connections into rooms by owner/repo.
 */
import { WebSocketServer, WebSocket } from 'ws';
import { v4 as uuid } from 'uuid';
import type { TeamUser, TeamWireMessage, SharedSessionInfo } from '../../shared/types';
import { debugLog, debugError } from '../../shared/utils';

interface Client {
  ws: WebSocket;
  user: TeamUser | null;
}

// Shared sessions per room: repo → sessionId → info
const sharedSessions = new Map<string, Map<string, SharedSessionInfo>>();

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

    debugLog(`[RelayServer] Started on port ${port}`);
    return { port };
  } catch (err) {
    debugError('[RelayServer] Failed to start:', err);
    return null;
  }
}

function handleMessage(clientId: string, msg: TeamWireMessage): void {
  const client = clients.get(clientId);
  if (!client) return;

  switch (msg.type) {
    case 'join': {
      client.user = msg.user;
      const { repo } = msg.user;
      if (!rooms.has(repo)) rooms.set(repo, new Set());
      rooms.get(repo)!.add(clientId);
      broadcastToRoom(repo, { type: 'presence', users: getRoomUsers(repo) });
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
      broadcastToRoom(msg.message.repo, msg, clientId);
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
  for (const client of clients.values()) {
    client.ws.close();
  }
  clients.clear();
  rooms.clear();
  wss.close();
  wss = null;
  debugLog('[RelayServer] Stopped');
}

export function isRelayServerRunning(): boolean {
  return wss !== null;
}
