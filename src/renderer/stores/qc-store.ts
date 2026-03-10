import { create } from 'zustand';
import type {
  AgentProviderId,
  InsightsModel,
  InsightsSession,
  InsightsSessionMeta,
  QCTask,
} from '../../shared/types';

interface QCState {
  sessions: InsightsSessionMeta[];
  activeSession: InsightsSession | null;
  sidebarOpen: boolean;
  error: string | null;
  selectedProjectPath: string | null;
  selectedProvider: AgentProviderId;
  searchQuery: string;

  loadSessions: () => Promise<void>;
  selectSession: (id: string) => Promise<void>;
  createQCSession: (model: InsightsModel, projectPath?: string, provider?: AgentProviderId, copilotModel?: string) => Promise<InsightsSession | null>;
  deleteSession: (id: string) => Promise<void>;
  renameSession: (id: string, title: string) => Promise<void>;
  toggleSidebar: () => void;
  clearError: () => void;
  setSelectedProjectPath: (path: string | null) => void;
  setSelectedProvider: (provider: AgentProviderId) => void;
  setSearchQuery: (query: string) => void;
  togglePin: (id: string) => Promise<void>;
  updateQCTask: (task: QCTask) => Promise<void>;
}

export const useQCStore = create<QCState>((set, get) => ({
  sessions: [],
  activeSession: null,
  sidebarOpen: true,
  error: null,
  selectedProjectPath: null,
  selectedProvider: 'claude',
  searchQuery: '',

  loadSessions: async () => {
    try {
      const result = await window.electronAPI.insightsListSessions();
      if (result.success) {
        // Filter only QC sessions
        const qcSessions = result.data.filter((s: InsightsSessionMeta) => s.mode === 'qc');
        set({ sessions: qcSessions });
        // Auto-restore last active QC session on first load
        const { activeSession } = get();
        if (!activeSession) {
          const lastId = localStorage.getItem('qc:lastSessionId');
          if (lastId && qcSessions.some((s: InsightsSessionMeta) => s.id === lastId)) {
            await get().selectSession(lastId);
          }
        }
      }
    } catch (err) {
      console.error('Failed to load QC sessions:', err);
    }
  },

  selectSession: async (id: string) => {
    try {
      const result = await window.electronAPI.insightsGetSession(id);
      if (result.success) {
        localStorage.setItem('qc:lastSessionId', id);
        set({
          activeSession: result.data,
          error: null,
          selectedProjectPath: result.data.projectPath ?? null,
          selectedProvider: result.data.provider || 'claude',
        });
      }
    } catch (err) {
      console.error('Failed to select QC session:', err);
    }
  },

  createQCSession: async (model, projectPath?, provider?, copilotModel?) => {
    try {
      const result = await window.electronAPI.insightsCreateSession(model, projectPath, provider, copilotModel);
      if (result.success) {
        const session = result.data;
        const updateResult = await window.electronAPI.insightsUpdateSession(session.id, {
          mode: 'qc',
          title: 'QC Testing',
        });
        if (updateResult.success) {
          set({
            activeSession: updateResult.data,
            error: null,
            selectedProvider: session.provider || 'claude',
          });
          await get().loadSessions();
          return updateResult.data;
        }
      }
      return null;
    } catch {
      return null;
    }
  },

  deleteSession: async (id) => {
    try {
      await window.electronAPI.insightsDeleteSession(id);
      const { activeSession } = get();
      if (activeSession?.id === id) {
        localStorage.removeItem('qc:lastSessionId');
        set({ activeSession: null });
      }
      await get().loadSessions();
    } catch (err) {
      console.error('Failed to delete QC session:', err);
    }
  },

  renameSession: async (id, title) => {
    try {
      await window.electronAPI.insightsRenameSession(id, title);
      const { activeSession } = get();
      if (activeSession?.id === id) set({ activeSession: { ...activeSession, title } });
      await get().loadSessions();
    } catch (err) {
      console.error('Failed to rename QC session:', err);
    }
  },

  toggleSidebar: () => set((s) => ({ sidebarOpen: !s.sidebarOpen })),
  clearError: () => set({ error: null }),
  setSelectedProjectPath: (path) => set({ selectedProjectPath: path }),
  setSelectedProvider: (provider) => set({ selectedProvider: provider }),
  setSearchQuery: (query) => set({ searchQuery: query }),

  togglePin: async (id) => {
    try {
      const result = await window.electronAPI.insightsPinSession(id);
      if (result.success) {
        await get().loadSessions();
        const { activeSession } = get();
        if (activeSession?.id === id) set({ activeSession: { ...activeSession, pinned: result.data } });
      }
    } catch (err) {
      console.error('Failed to toggle pin:', err);
    }
  },

  updateQCTask: async (task: QCTask) => {
    const { activeSession } = get();
    if (!activeSession) return;
    try {
      const result = await window.electronAPI.insightsUpdateSession(activeSession.id, { qcTask: task });
      if (result.success && result.data) {
        set({ activeSession: result.data });
        await get().loadSessions();
      }
    } catch (err) {
      console.error('Failed to update QC task:', err);
    }
  },
}));
