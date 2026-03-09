import { create } from 'zustand';
import type {
  AgentProviderId,
  DiscussionStatus,
  InsightsModel,
  InsightsSession,
  InsightsSessionMeta,
  InsightsStreamEvent,
  Persona,
} from '../../shared/types';

interface InsightsState {
  sessions: InsightsSessionMeta[];
  activeSession: InsightsSession | null;
  isStreaming: boolean;
  streamingText: string;
  streamingPersonaId: string | null;
  sidebarOpen: boolean;
  error: string | null;
  selectedProjectPath: string | null;
  selectedProvider: AgentProviderId;
  searchQuery: string;
  personas: Persona[];

  loadSessions: () => Promise<void>;
  selectSession: (id: string) => Promise<void>;
  createSession: (model: InsightsModel, projectPath?: string, provider?: AgentProviderId, copilotModel?: string) => Promise<InsightsSession | null>;
  createRoundTableSession: (model: InsightsModel, personaIds: string[], projectPath?: string, provider?: AgentProviderId, copilotModel?: string) => Promise<InsightsSession | null>;
  createQCSession: (model: InsightsModel, projectPath?: string, provider?: AgentProviderId, copilotModel?: string) => Promise<InsightsSession | null>;
  deleteSession: (id: string) => Promise<void>;
  renameSession: (id: string, title: string) => Promise<void>;
  sendMessage: (content: string, model?: InsightsModel, copilotModel?: string) => Promise<void>;
  sendPersonaMessage: (content: string, persona: Persona, model?: InsightsModel, copilotModel?: string, userMessage?: string) => Promise<void>;
  advanceRoundTable: (userMessage: string, model?: InsightsModel, copilotModel?: string) => Promise<void>;
  abortStream: () => void;
  toggleSidebar: () => void;
  handleStreamEvent: (event: InsightsStreamEvent) => void;
  clearError: () => void;
  setSelectedProjectPath: (path: string | null) => void;
  setSelectedProvider: (provider: AgentProviderId) => void;
  setSearchQuery: (query: string) => void;
  togglePin: (id: string) => Promise<void>;
  deleteMessage: (messageId: string) => Promise<void>;
  retryLastMessage: (model?: InsightsModel, copilotModel?: string) => Promise<void>;
  exportSession: () => Promise<string | null>;
  loadPersonas: () => Promise<void>;
  addPersona: (persona: Persona) => Promise<void>;
  updatePersona: (id: string, updates: Partial<Persona>) => Promise<void>;
  removePersona: (id: string) => Promise<void>;
  resetPersonas: () => Promise<void>;
  updateSessionStatus: (status: DiscussionStatus) => Promise<void>;
  addStatusMessage: (content: string, messageType: string, metadata?: Record<string, any>) => Promise<void>;
  linkTerminal: (terminalId: string) => Promise<void>;
  generateSpec: () => Promise<string | null>;
}

export const useInsightsStore = create<InsightsState>((set, get) => ({
  sessions: [],
  activeSession: null,
  isStreaming: false,
  streamingText: '',
  streamingPersonaId: null,
  sidebarOpen: true,
  error: null,
  selectedProjectPath: null,
  selectedProvider: 'claude',
  searchQuery: '',
  personas: [],

  loadSessions: async () => {
    try {
      const result = await window.electronAPI.insightsListSessions();
      if (result.success) set({ sessions: result.data });
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
          streamingPersonaId: null,
          error: null,
          selectedProjectPath: result.data.projectPath ?? null,
          selectedProvider: result.data.provider || 'claude',
        });
      }
    } catch (err) {
      console.error('Failed to select session:', err);
    }
  },

  createSession: async (model, projectPath?, provider?, copilotModel?) => {
    try {
      const result = await window.electronAPI.insightsCreateSession(model, projectPath, provider, copilotModel);
      if (result.success) {
        set({
          activeSession: result.data,
          streamingText: '',
          streamingPersonaId: null,
          error: null,
          selectedProvider: result.data.provider || 'claude',
        });
        await get().loadSessions();
        return result.data;
      }
      return null;
    } catch {
      return null;
    }
  },

  createRoundTableSession: async (model, personaIds, projectPath?, provider?, copilotModel?) => {
    try {
      const result = await window.electronAPI.insightsCreateSession(model, projectPath, provider, copilotModel);
      if (result.success) {
        const session = result.data;
        // Update session with round table config
        const updateResult = await window.electronAPI.insightsUpdateSession(session.id, {
          mode: 'roundtable',
          personas: personaIds,
          activePersonaIndex: 0,
          discussionStatus: 'discussing',
          title: 'Round Table Discussion',
        });
        if (updateResult.success) {
          set({
            activeSession: updateResult.data,
            streamingText: '',
            streamingPersonaId: null,
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
            streamingText: '',
            streamingPersonaId: null,
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
      if (activeSession?.id === id) set({ activeSession: null, streamingText: '' });
      await get().loadSessions();
    } catch (err) {
      console.error('Failed to delete session:', err);
    }
  },

  renameSession: async (id, title) => {
    try {
      await window.electronAPI.insightsRenameSession(id, title);
      const { activeSession } = get();
      if (activeSession?.id === id) set({ activeSession: { ...activeSession, title } });
      await get().loadSessions();
    } catch (err) {
      console.error('Failed to rename session:', err);
    }
  },

  sendMessage: async (content, model?, copilotModel?) => {
    const { activeSession, selectedProjectPath } = get();
    if (!activeSession) return;

    const optimisticMsg = {
      id: `temp-${Date.now()}`,
      role: 'user' as const,
      content,
      timestamp: new Date().toISOString(),
    };
    set({
      activeSession: { ...activeSession, messages: [...activeSession.messages, optimisticMsg] },
      isStreaming: true,
      streamingText: '',
      streamingPersonaId: null,
      error: null,
    });

    try {
      const result = await window.electronAPI.insightsSendMessage(
        activeSession.id, content, model, selectedProjectPath ?? undefined, copilotModel,
      );
      if (result.success) {
        set({ activeSession: result.data, isStreaming: false, streamingText: '' });
        await get().loadSessions();
      } else {
        set({ isStreaming: false, error: result.error || 'Failed to send message' });
      }
    } catch (err) {
      set({ isStreaming: false, error: err instanceof Error ? err.message : 'Failed to send message' });
    }
  },

  sendPersonaMessage: async (content, persona, model?, copilotModel?, userMessage?) => {
    const { activeSession, selectedProjectPath } = get();
    if (!activeSession) return;

    set({ isStreaming: true, streamingText: '', streamingPersonaId: persona.id, error: null });

    try {
      const result = await window.electronAPI.insightsSendPersonaMessage(
        activeSession.id, content, persona, model, selectedProjectPath ?? undefined, copilotModel, userMessage,
      );
      if (result.success) {
        set({ activeSession: result.data, isStreaming: false, streamingText: '', streamingPersonaId: null });
      } else {
        set({ isStreaming: false, streamingPersonaId: null, error: result.error || 'Failed to send persona message' });
      }
    } catch (err) {
      set({ isStreaming: false, streamingPersonaId: null, error: err instanceof Error ? err.message : 'Failed' });
    }
  },

  advanceRoundTable: async (userMessage, model?, copilotModel?) => {
    const { activeSession, personas } = get();
    if (!activeSession || activeSession.mode !== 'roundtable' || !activeSession.personas) return;

    // Show user message optimistically
    const optimisticMsg = {
      id: `temp-${Date.now()}`,
      role: 'user' as const,
      content: userMessage,
      timestamp: new Date().toISOString(),
    };
    set({
      activeSession: { ...activeSession, messages: [...activeSession.messages, optimisticMsg] },
    });

    // Cycle through each persona — first call also saves user message to backend
    const personaIds = activeSession.personas;
    for (let i = 0; i < personaIds.length; i++) {
      const persona = personas.find((p) => p.id === personaIds[i]);
      if (!persona) continue;

      const contextMsg = `The user said: "${userMessage}"\n\nPlease respond from your perspective as ${persona.name} (${persona.role}). Consider what other team members have already said in this discussion.`;

      set({ isStreaming: true, streamingText: '', streamingPersonaId: persona.id, error: null });

      try {
        const result = await window.electronAPI.insightsSendPersonaMessage(
          activeSession.id, contextMsg, persona, model, get().selectedProjectPath ?? undefined, copilotModel,
          i === 0 ? userMessage : undefined, // first call saves user message
        );
        if (result.success) {
          set({ activeSession: result.data, isStreaming: false, streamingText: '', streamingPersonaId: null });
        } else {
          set({ isStreaming: false, streamingPersonaId: null, error: result.error });
          break;
        }
      } catch (err) {
        set({ isStreaming: false, streamingPersonaId: null, error: err instanceof Error ? err.message : 'Failed' });
        break;
      }
    }
    await get().loadSessions();
  },

  abortStream: () => {
    const { activeSession } = get();
    if (activeSession) {
      window.electronAPI.insightsAbortStream(activeSession.id);
      set({ isStreaming: false, streamingPersonaId: null });
    }
  },

  toggleSidebar: () => set((s) => ({ sidebarOpen: !s.sidebarOpen })),

  handleStreamEvent: (event) => {
    const { activeSession } = get();
    if (!activeSession || event.sessionId !== activeSession.id) return;

    if (event.type === 'text' && event.text) {
      set((s) => ({ streamingText: s.streamingText + event.text }));
    } else if (event.type === 'error') {
      set({ error: event.error || 'Stream error', isStreaming: false, streamingPersonaId: null });
    }
  },

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

  deleteMessage: async (messageId) => {
    const { activeSession } = get();
    if (!activeSession) return;
    try {
      const result = await window.electronAPI.insightsDeleteMessage(activeSession.id, messageId);
      if (result.success) {
        set({ activeSession: result.data });
        await get().loadSessions();
      }
    } catch (err) {
      console.error('Failed to delete message:', err);
    }
  },

  retryLastMessage: async (model?, copilotModel?) => {
    const { activeSession } = get();
    if (!activeSession || activeSession.messages.length === 0) return;

    const messages = activeSession.messages;
    let lastUserIdx = -1;
    for (let i = messages.length - 1; i >= 0; i--) {
      if (messages[i].role === 'user') { lastUserIdx = i; break; }
    }
    if (lastUserIdx === -1) return;

    const lastUserMsg = messages[lastUserIdx];
    try {
      const result = await window.electronAPI.insightsDeleteMessage(activeSession.id, lastUserMsg.id);
      if (result.success) {
        set({ activeSession: result.data });
        await get().sendMessage(lastUserMsg.content, model, copilotModel);
      }
    } catch (err) {
      console.error('Failed to retry:', err);
    }
  },

  exportSession: async () => {
    const { activeSession } = get();
    if (!activeSession) return null;
    try {
      const result = await window.electronAPI.insightsExportSession(activeSession.id);
      if (result.success) return result.data;
      return null;
    } catch {
      return null;
    }
  },

  // ─── Persona Management ──────────────────────────────────────
  loadPersonas: async () => {
    try {
      const result = await window.electronAPI.personasList();
      if (result.success) set({ personas: result.data });
    } catch (err) {
      console.error('Failed to load personas:', err);
    }
  },

  addPersona: async (persona) => {
    try {
      const result = await window.electronAPI.personasAdd(persona);
      if (result.success) set({ personas: result.data });
    } catch (err) {
      console.error('Failed to add persona:', err);
    }
  },

  updatePersona: async (id, updates) => {
    try {
      const result = await window.electronAPI.personasUpdate(id, updates);
      if (result.success) set({ personas: result.data });
    } catch (err) {
      console.error('Failed to update persona:', err);
    }
  },

  removePersona: async (id) => {
    try {
      const result = await window.electronAPI.personasDelete(id);
      if (result.success) set({ personas: result.data });
    } catch (err) {
      console.error('Failed to remove persona:', err);
    }
  },

  resetPersonas: async () => {
    try {
      const result = await window.electronAPI.personasReset();
      if (result.success) set({ personas: result.data });
    } catch (err) {
      console.error('Failed to reset personas:', err);
    }
  },

  // ─── Discussion Pipeline ─────────────────────────────────────
  updateSessionStatus: async (status) => {
    const { activeSession } = get();
    if (!activeSession) return;
    try {
      const result = await window.electronAPI.insightsUpdateSession(activeSession.id, { discussionStatus: status });
      if (result.success) {
        set({ activeSession: result.data });
        await get().loadSessions();
      }
    } catch (err) {
      console.error('Failed to update session status:', err);
    }
  },

  addStatusMessage: async (content, messageType, metadata?) => {
    const { activeSession } = get();
    if (!activeSession) return;
    const statusMsg = {
      id: `status-${Date.now()}`,
      role: 'assistant' as const,
      content,
      timestamp: new Date().toISOString(),
      messageType: messageType as any,
      metadata,
    };
    const updatedMessages = [...activeSession.messages, statusMsg];
    try {
      const result = await window.electronAPI.insightsUpdateSession(activeSession.id, { messages: updatedMessages });
      if (result.success) set({ activeSession: result.data });
    } catch (err) {
      console.error('Failed to add status message:', err);
    }
  },

  linkTerminal: async (terminalId) => {
    const { activeSession } = get();
    if (!activeSession) return;
    try {
      const result = await window.electronAPI.insightsUpdateSession(activeSession.id, {
        linkedTerminalId: terminalId,
        discussionStatus: 'implementing',
      });
      if (result.success) {
        set({ activeSession: result.data });
        await get().loadSessions();
      }
    } catch (err) {
      console.error('Failed to link terminal:', err);
    }
  },

  generateSpec: async () => {
    const { activeSession, personas } = get();
    if (!activeSession || activeSession.messages.length === 0) return null;

    // Build a summary request for PM to generate spec
    const pmPersona = personas.find((p) => p.id === 'pm') || personas[0];
    if (!pmPersona) return null;

    const specPrompt = `Based on this entire discussion, generate a clear implementation specification. Format it as:

## Feature Specification

### Requirements
- List each requirement clearly

### Technical Approach
- Describe the implementation approach
- List files to create/modify

### Acceptance Criteria
- Define clear pass/fail criteria

### Test Cases
- List key test scenarios

Be specific and actionable. This spec will be sent directly to an AI coding agent for implementation.`;

    set({ isStreaming: true, streamingText: '', streamingPersonaId: pmPersona.id, error: null });

    try {
      const result = await window.electronAPI.insightsSendPersonaMessage(
        activeSession.id, specPrompt, pmPersona, activeSession.model,
        get().selectedProjectPath ?? undefined, activeSession.copilotModel,
      );
      if (result.success) {
        // Mark the last message as spec type
        const session = result.data;
        const lastMsg = session.messages[session.messages.length - 1];
        if (lastMsg) lastMsg.messageType = 'spec';

        await window.electronAPI.insightsUpdateSession(session.id, {
          messages: session.messages,
          discussionStatus: 'spec-ready',
        });

        const reloaded = await window.electronAPI.insightsGetSession(session.id);
        if (reloaded.success) set({ activeSession: reloaded.data });

        set({ isStreaming: false, streamingText: '', streamingPersonaId: null });
        await get().loadSessions();
        return lastMsg?.content || null;
      }
      set({ isStreaming: false, streamingPersonaId: null });
      return null;
    } catch (err) {
      set({ isStreaming: false, streamingPersonaId: null, error: err instanceof Error ? err.message : 'Failed' });
      return null;
    }
  },
}));
