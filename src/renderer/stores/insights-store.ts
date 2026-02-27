import { create } from 'zustand';
import type {
  InsightsModel,
  InsightsSession,
  InsightsSessionMeta,
  InsightsStreamEvent,
} from '../../shared/types';

interface InsightsState {
  sessions: InsightsSessionMeta[];
  activeSession: InsightsSession | null;
  isStreaming: boolean;
  streamingText: string;
  sidebarOpen: boolean;
  error: string | null;
  selectedProjectPath: string | null;

  loadSessions: () => Promise<void>;
  selectSession: (id: string) => Promise<void>;
  createSession: (model: InsightsModel, projectPath?: string) => Promise<InsightsSession | null>;
  deleteSession: (id: string) => Promise<void>;
  renameSession: (id: string, title: string) => Promise<void>;
  sendMessage: (content: string, model?: InsightsModel) => Promise<void>;
  abortStream: () => void;
  toggleSidebar: () => void;
  handleStreamEvent: (event: InsightsStreamEvent) => void;
  clearError: () => void;
  setSelectedProjectPath: (path: string | null) => void;
}

export const useInsightsStore = create<InsightsState>((set, get) => ({
  sessions: [],
  activeSession: null,
  isStreaming: false,
  streamingText: '',
  sidebarOpen: true,
  error: null,
  selectedProjectPath: null,

  loadSessions: async () => {
    try {
      const result = await window.electronAPI.insightsListSessions();
      if (result.success) {
        set({ sessions: result.data });
      }
    } catch (err) {
      console.error('Failed to load sessions:', err);
    }
  },

  selectSession: async (id: string) => {
    try {
      const result = await window.electronAPI.insightsGetSession(id);
      if (result.success) {
        set({
          activeSession: result.data,
          streamingText: '',
          error: null,
          selectedProjectPath: result.data.projectPath ?? null,
        });
      }
    } catch (err) {
      console.error('Failed to select session:', err);
    }
  },

  createSession: async (model: InsightsModel, projectPath?: string) => {
    try {
      const result = await window.electronAPI.insightsCreateSession(model, projectPath);
      if (result.success) {
        set({ activeSession: result.data, streamingText: '', error: null });
        await get().loadSessions();
        return result.data;
      }
      return null;
    } catch {
      return null;
    }
  },

  deleteSession: async (id: string) => {
    try {
      await window.electronAPI.insightsDeleteSession(id);
      const { activeSession } = get();
      if (activeSession?.id === id) {
        set({ activeSession: null, streamingText: '' });
      }
      await get().loadSessions();
    } catch (err) {
      console.error('Failed to delete session:', err);
    }
  },

  renameSession: async (id: string, title: string) => {
    try {
      await window.electronAPI.insightsRenameSession(id, title);
      // Update locally
      const { activeSession } = get();
      if (activeSession?.id === id) {
        set({ activeSession: { ...activeSession, title } });
      }
      await get().loadSessions();
    } catch (err) {
      console.error('Failed to rename session:', err);
    }
  },

  sendMessage: async (content: string, model?: InsightsModel) => {
    const { activeSession, selectedProjectPath } = get();
    if (!activeSession) return;

    // Optimistically add user message to UI immediately
    const optimisticMsg = {
      id: `temp-${Date.now()}`,
      role: 'user' as const,
      content,
      timestamp: new Date().toISOString(),
    };
    set({
      activeSession: {
        ...activeSession,
        messages: [...activeSession.messages, optimisticMsg],
      },
      isStreaming: true,
      streamingText: '',
      error: null,
    });

    try {
      const result = await window.electronAPI.insightsSendMessage(
        activeSession.id,
        content,
        model,
        selectedProjectPath ?? undefined,
      );
      if (result.success) {
        set({ activeSession: result.data, isStreaming: false, streamingText: '' });
        await get().loadSessions();
      } else {
        set({ isStreaming: false, error: result.error || 'Failed to send message' });
      }
    } catch (err) {
      set({
        isStreaming: false,
        error: err instanceof Error ? err.message : 'Failed to send message',
      });
    }
  },

  abortStream: () => {
    const { activeSession } = get();
    if (activeSession) {
      window.electronAPI.insightsAbortStream(activeSession.id);
      set({ isStreaming: false });
    }
  },

  toggleSidebar: () => set((s) => ({ sidebarOpen: !s.sidebarOpen })),

  handleStreamEvent: (event: InsightsStreamEvent) => {
    const { activeSession } = get();
    if (!activeSession || event.sessionId !== activeSession.id) return;

    if (event.type === 'text' && event.text) {
      set((s) => ({ streamingText: s.streamingText + event.text }));
    } else if (event.type === 'error') {
      set({ error: event.error || 'Stream error', isStreaming: false });
    }
    // 'done' is handled by sendMessage resolving
  },

  clearError: () => set({ error: null }),

  setSelectedProjectPath: (path: string | null) => set({ selectedProjectPath: path }),
}));
