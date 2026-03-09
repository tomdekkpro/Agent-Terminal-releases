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
  sendMessage: (content: string) => Promise<void>;
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

      await window.electronAPI.teamConnect(serverUrl, user);
      set({
        connected: true,
        connecting: false,
        currentUser: user,
        serverUrl,
        repo: repoResult.data,
        messages: [],
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
    await window.electronAPI.teamDisconnect();
    set({
      connected: false,
      currentUser: null,
      onlineUsers: [],
      messages: [],
      typingUsers: [],
      repo: null,
      sharedSessions: [],
      joinedSessionIds: new Set(),
    });
  },

  sendMessage: async (content) => {
    await window.electronAPI.teamSendMessage(content);
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

      case 'message':
        set((s) => ({
          messages: [...s.messages, event.message],
          typingUsers: s.typingUsers.filter((u) => u !== event.message.from),
        }));
        break;

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

      // ─── Session events ──────────────────────────────────
      case 'session-share':
        set((s) => {
          const existing = s.sharedSessions.filter((ss) => ss.id !== event.session.id);
          return { sharedSessions: [...existing, event.session] };
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
