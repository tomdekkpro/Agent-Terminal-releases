import { create } from 'zustand';
import type { TeamUser, TeamMessage, TeamWireMessage, SharedSessionInfo, InsightsMessage } from '../../shared/types';

interface TeamState {
  connected: boolean;
  connecting: boolean;
  currentUser: TeamUser | null;
  onlineUsers: TeamUser[];
  messages: TeamMessage[];
  typingUsers: string[];
  error: string | null;
  serverUrl: string;
  hosting: boolean;
  repo: string | null;

  /** Shared sessions available from teammates */
  sharedSessions: SharedSessionInfo[];
  /** Session IDs we've joined */
  joinedSessionIds: Set<string>;

  // Actions
  connect: (serverUrl: string, projectPath: string) => Promise<void>;
  disconnect: () => Promise<void>;
  sendMessage: (content: string, meta?: { personaId?: string; personaName?: string; personaColor?: string; replyTo?: string; image?: string }) => Promise<void>;
  sendTyping: () => void;
  startServer: (port?: number) => Promise<{ port: number } | null>;
  stopServer: () => Promise<void>;
  handleEvent: (event: TeamWireMessage) => void;
  clearError: () => void;
  detectRepo: (projectPath: string) => Promise<string | null>;

  // Session sharing
  shareSession: (session: SharedSessionInfo) => Promise<void>;
  unshareSession: (sessionId: string) => Promise<void>;
  joinSession: (sessionId: string) => Promise<void>;
  leaveSession: (sessionId: string) => Promise<void>;
  sendSessionMessage: (sessionId: string, message: InsightsMessage) => Promise<void>;
}

// Debounce typing indicator cleanup
const typingTimers = new Map<string, ReturnType<typeof setTimeout>>();

// Debounced save of chat history to disk
let saveTimer: ReturnType<typeof setTimeout> | null = null;
function debouncedSave(repo: string, messages: TeamMessage[]): void {
  if (saveTimer) clearTimeout(saveTimer);
  saveTimer = setTimeout(() => {
    window.electronAPI.teamSaveHistory(repo, messages).catch(() => {});
    saveTimer = null;
  }, 2000);
}

/** Merge two arrays of messages: dedup by ID, sort by timestamp */
function mergeMessages(existing: TeamMessage[], incoming: TeamMessage[]): TeamMessage[] {
  const map = new Map<string, TeamMessage>();
  for (const m of existing) map.set(m.id, m);
  for (const m of incoming) {
    // Incoming (from server) wins, but preserve local image data if server stripped it
    const prev = map.get(m.id);
    if (prev && prev.image && prev.image !== '[image]' && (!m.image || m.image === '[image]')) {
      map.set(m.id, { ...m, image: prev.image });
    } else {
      map.set(m.id, m);
    }
  }
  return [...map.values()].sort(
    (a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime(),
  );
}

// Listeners for session messages (insights store subscribes to these)
type SessionMessageListener = (sessionId: string, message: InsightsMessage) => void;
const sessionMessageListeners = new Set<SessionMessageListener>();

type SessionParticipantsListener = (sessionId: string, participants: string[]) => void;
const sessionParticipantsListeners = new Set<SessionParticipantsListener>();

export function onSessionMessage(listener: SessionMessageListener): () => void {
  sessionMessageListeners.add(listener);
  return () => sessionMessageListeners.delete(listener);
}

export function onSessionParticipants(listener: SessionParticipantsListener): () => void {
  sessionParticipantsListeners.add(listener);
  return () => sessionParticipantsListeners.delete(listener);
}

export const useTeamStore = create<TeamState>((set, get) => ({
  connected: false,
  connecting: false,
  currentUser: null,
  onlineUsers: [],
  messages: [],
  typingUsers: [],
  error: null,
  serverUrl: '',
  hosting: false,
  repo: null,
  sharedSessions: [],
  joinedSessionIds: new Set(),

  connect: async (serverUrl, projectPath) => {
    set({ connecting: true, error: null });

    try {
      const identityResult = await window.electronAPI.teamGetIdentity();
      if (!identityResult.success) {
        set({ connecting: false, error: identityResult.error });
        return;
      }

      const repoResult = await window.electronAPI.teamGetRepo(projectPath);
      if (!repoResult.success) {
        set({ connecting: false, error: repoResult.error });
        return;
      }

      const user: TeamUser = {
        username: identityResult.data.username,
        avatarUrl: identityResult.data.avatarUrl,
        repo: repoResult.data,
        status: 'online',
        connectedAt: new Date().toISOString(),
      };

      // Load persisted chat history before connecting
      let savedMessages: TeamMessage[] = [];
      try {
        const histResult = await window.electronAPI.teamLoadHistory(repoResult.data);
        if (histResult.success && histResult.data) savedMessages = histResult.data;
      } catch { /* non-critical */ }

      await window.electronAPI.teamConnect(serverUrl, user);
      set({
        connected: true,
        connecting: false,
        currentUser: user,
        serverUrl,
        repo: repoResult.data,
        messages: savedMessages,
        sharedSessions: [],
      });
    } catch (err) {
      set({
        connecting: false,
        error: err instanceof Error ? err.message : 'Failed to connect',
      });
    }
  },

  disconnect: async () => {
    const { hosting, repo, messages } = get();

    // Save current messages to disk before clearing
    if (repo && messages.length > 0) {
      try {
        await window.electronAPI.teamSaveHistory(repo, messages);
      } catch { /* non-critical */ }
    }

    await window.electronAPI.teamDisconnect();
    if (hosting) {
      await window.electronAPI.teamStopServer();
    }
    set({
      connected: false,
      connecting: false,
      hosting: false,
      currentUser: null,
      onlineUsers: [],
      // Keep messages — they're persisted and will be reloaded on next connect
      messages: [],
      typingUsers: [],
      repo: null,
      sharedSessions: [],
      joinedSessionIds: new Set(),
    });
  },

  sendMessage: async (content, meta?) => {
    await window.electronAPI.teamSendMessage(content, meta);
  },

  sendTyping: () => {
    window.electronAPI.teamSendTyping();
  },

  startServer: async (port) => {
    try {
      const result = await window.electronAPI.teamStartServer(port);
      if (result.success) {
        set({ hosting: true });
        return result.data;
      }
      set({ error: result.error });
      return null;
    } catch {
      return null;
    }
  },

  stopServer: async () => {
    await window.electronAPI.teamStopServer();
    set({ hosting: false });
  },

  handleEvent: (event) => {
    switch (event.type) {
      case 'presence':
        set({ onlineUsers: event.users, connected: true });
        break;

      case 'message': {
        // Dedup: skip if we already have this message (e.g., local echo)
        const existing = get().messages;
        if (existing.some(m => m.id === event.message.id)) break;
        set((s) => ({
          messages: [...s.messages, event.message],
          typingUsers: s.typingUsers.filter((u) => u !== event.message.from),
        }));
        const { repo: msgRepo, messages: msgs } = get();
        if (msgRepo) debouncedSave(msgRepo, msgs);
        break;
      }

      case 'typing': {
        const { username } = event;
        const { currentUser } = get();
        if (username === currentUser?.username) break;
        set((s) => ({
          typingUsers: s.typingUsers.includes(username) ? s.typingUsers : [...s.typingUsers, username],
        }));
        if (typingTimers.has(username)) clearTimeout(typingTimers.get(username)!);
        typingTimers.set(username, setTimeout(() => {
          set((s) => ({ typingUsers: s.typingUsers.filter((u) => u !== username) }));
          typingTimers.delete(username);
        }, 3000));
        break;
      }

      case 'leave':
        set((s) => ({
          onlineUsers: s.onlineUsers.filter((u) => u.username !== event.username),
          typingUsers: s.typingUsers.filter((u) => u !== event.username),
        }));
        break;

      case 'error':
        set({ error: event.error });
        break;

      case 'history': {
        // Server sends authoritative history — merge with local (dedup + sort)
        set((s) => ({
          messages: mergeMessages(s.messages, event.messages),
        }));
        const { repo: histRepo, messages: histMsgs } = get();
        if (histRepo) debouncedSave(histRepo, histMsgs);
        break;
      }

      // ─── Session events ──────────────────────────────────
      case 'session-share':
        set((s) => {
          const existingSessions = s.sharedSessions.filter((ss) => ss.id !== event.session.id);
          return { sharedSessions: [...existingSessions, event.session] };
        });
        break;

      case 'session-unshare':
        set((s) => ({
          sharedSessions: s.sharedSessions.filter((ss) => ss.id !== event.sessionId),
        }));
        break;

      case 'session-list':
        set({ sharedSessions: event.sessions });
        break;

      case 'session-message': {
        // Forward to listeners (insights store)
        for (const listener of sessionMessageListeners) {
          listener(event.sessionId, event.message);
        }
        break;
      }

      case 'session-join':
      case 'session-leave':
        // Update participant count in shared sessions
        break;

      case 'session-participants': {
        for (const listener of sessionParticipantsListeners) {
          listener(event.sessionId, event.participants);
        }
        break;
      }
    }
  },

  clearError: () => set({ error: null }),

  detectRepo: async (projectPath) => {
    try {
      const result = await window.electronAPI.teamGetRepo(projectPath);
      if (result.success) {
        set({ repo: result.data });
        return result.data;
      }
      return null;
    } catch {
      return null;
    }
  },

  // ─── Session sharing actions ────────────────────────────────

  shareSession: async (session) => {
    await window.electronAPI.teamShareSession(session);
  },

  unshareSession: async (sessionId) => {
    await window.electronAPI.teamUnshareSession(sessionId);
  },

  joinSession: async (sessionId) => {
    await window.electronAPI.teamJoinSession(sessionId);
    set((s) => {
      const newSet = new Set(s.joinedSessionIds);
      newSet.add(sessionId);
      return { joinedSessionIds: newSet };
    });
  },

  leaveSession: async (sessionId) => {
    await window.electronAPI.teamLeaveSession(sessionId);
    set((s) => {
      const newSet = new Set(s.joinedSessionIds);
      newSet.delete(sessionId);
      return { joinedSessionIds: newSet };
    });
  },

  sendSessionMessage: async (sessionId, message) => {
    await window.electronAPI.teamSendSessionMessage(sessionId, message);
  },
}));
