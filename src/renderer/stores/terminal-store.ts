import { create } from 'zustand';
import { v4 as uuid } from 'uuid';
import type { CopilotProvider } from '../../shared/types';
import { useSettingsStore } from './settings-store';

export type TerminalStatus = 'idle' | 'running' | 'claude-active' | 'exited';

export interface TerminalClickUpTask {
  id: string;
  customId?: string;
  name: string;
  status: string;
  statusColor: string;
  url: string;
}

export interface TimeTracking {
  startedAt: number | null;  // Unix timestamp ms when current session started
  elapsed: number;           // Accumulated ms from previous sessions
}

export interface Terminal {
  id: string;
  groupId: string;
  title: string;
  status: TerminalStatus;
  cwd: string;
  createdAt: Date;
  isClaudeMode: boolean;
  isClaudeBusy?: boolean;
  claudeSessionId?: string;
  claudeCwd?: string;
  projectId?: string;
  clickUpTask?: TerminalClickUpTask;
  copilotProvider: CopilotProvider;
  worktreePath?: string;
  worktreeBranch?: string;
  timeTracking?: TimeTracking;
}

// Output callback registry
const xtermCallbacks = new Map<string, (data: string) => void>();

// Saved output buffers from previous session (consumed once on terminal mount)
const savedOutputBuffers = new Map<string, string>();

/** Get and consume saved output buffer for a restored terminal */
export function getAndClearSavedBuffer(id: string): string | undefined {
  const buffer = savedOutputBuffers.get(id);
  if (buffer) savedOutputBuffers.delete(id);
  return buffer;
}

export function registerOutputCallback(terminalId: string, callback: (data: string) => void): void {
  xtermCallbacks.set(terminalId, callback);
}

export function unregisterOutputCallback(terminalId: string): void {
  xtermCallbacks.delete(terminalId);
}

// Build saveable state snapshot
function buildSaveableState(state: TerminalState) {
  const saveable = state.terminals
    .filter((t) => t.status !== 'exited')
    .map((t) => ({
      id: t.id,
      groupId: t.groupId,
      title: t.title,
      cwd: t.cwd,
      projectId: t.projectId,
      isClaudeMode: t.isClaudeMode,
      claudeSessionId: t.claudeSessionId,
      claudeCwd: t.claudeCwd,
      copilotProvider: t.copilotProvider,
      clickUpTask: t.clickUpTask,
      worktreePath: t.worktreePath,
      worktreeBranch: t.worktreeBranch,
      timeTracking: t.timeTracking,
    }));

  return {
    terminals: saveable,
    activeTerminalId: state.activeTerminalId,
    activeGroupId: state.activeGroupId,
  };
}

// Debounced save
let saveTimer: ReturnType<typeof setTimeout> | null = null;

function debouncedSaveState(state: TerminalState): void {
  if (saveTimer) clearTimeout(saveTimer);
  saveTimer = setTimeout(() => {
    window.electronAPI?.saveTerminalState?.(buildSaveableState(state));
  }, 500);
}

/** Flush terminal state to disk synchronously (for use in beforeunload) */
export function flushTerminalStateSync(): void {
  if (saveTimer) {
    clearTimeout(saveTimer);
    saveTimer = null;
  }
  const state = useTerminalStore.getState();
  if (!state.isRestored) return;
  window.electronAPI?.saveTerminalStateSync?.(buildSaveableState(state));
}

interface TerminalState {
  terminals: Terminal[];
  activeTerminalId: string | null;
  activeGroupId: string | null;
  maxTerminals: number;
  isRestored: boolean;

  addTerminal: (cwd?: string, projectId?: string) => Terminal | null;
  splitTerminal: (cwd?: string, projectId?: string) => Terminal | null;
  removeTerminal: (id: string) => void;
  removeGroup: (groupId: string) => void;
  updateTerminal: (id: string, updates: Partial<Terminal>) => void;
  setActiveTerminal: (id: string | null) => void;
  setActiveGroup: (groupId: string) => void;
  setTerminalStatus: (id: string, status: TerminalStatus) => void;
  setClaudeMode: (id: string, isClaudeMode: boolean) => void;
  setCopilotProvider: (id: string, provider: CopilotProvider) => void;
  clearAllTerminals: () => void;
  getTerminal: (id: string) => Terminal | undefined;
  getActiveTerminal: () => Terminal | undefined;
  canAddTerminal: () => boolean;
  getTerminalsByProject: (projectId?: string) => Terminal[];
  getGroupIds: (projectId?: string) => string[];
  getTerminalsInGroup: (groupId: string) => Terminal[];
  startTimer: (id: string) => void;
  stopTimer: (id: string) => TimeTracking | null;
  writeToTerminal: (terminalId: string, data: string) => void;
  restoreState: () => Promise<Terminal[]>;
}

export const useTerminalStore = create<TerminalState>((set, get) => ({
  terminals: [],
  activeTerminalId: null,
  activeGroupId: null,
  maxTerminals: 12,
  isRestored: false,

  // Create a terminal in a new group (new tab)
  addTerminal: (cwd?: string, projectId?: string) => {
    const state = get();
    const activeCount = state.terminals.filter(t => t.status !== 'exited').length;
    if (activeCount >= state.maxTerminals) return null;

    const groupId = uuid();
    const defaultProvider = useSettingsStore.getState().settings.defaultCopilotProvider || 'claude';
    const newTerminal: Terminal = {
      id: uuid(),
      groupId,
      title: `Terminal ${state.terminals.length + 1}`,
      status: 'idle',
      cwd: cwd || '',
      createdAt: new Date(),
      isClaudeMode: false,
      copilotProvider: defaultProvider,
      projectId,
    };

    set((state) => ({
      terminals: [...state.terminals, newTerminal],
      activeTerminalId: newTerminal.id,
      activeGroupId: groupId,
    }));

    return newTerminal;
  },

  // Create a terminal in the active group (split)
  splitTerminal: (cwd?: string, projectId?: string) => {
    const state = get();
    const activeCount = state.terminals.filter(t => t.status !== 'exited').length;
    if (activeCount >= state.maxTerminals) return null;
    if (!state.activeGroupId) return null;

    const defaultProvider = useSettingsStore.getState().settings.defaultCopilotProvider || 'claude';
    const newTerminal: Terminal = {
      id: uuid(),
      groupId: state.activeGroupId,
      title: `Terminal ${state.terminals.length + 1}`,
      status: 'idle',
      cwd: cwd || '',
      createdAt: new Date(),
      isClaudeMode: false,
      copilotProvider: defaultProvider,
      projectId,
    };

    set((state) => ({
      terminals: [...state.terminals, newTerminal],
      activeTerminalId: newTerminal.id,
    }));

    return newTerminal;
  },

  removeTerminal: (id: string) => {
    xtermCallbacks.delete(id);
    set((state) => {
      const removed = state.terminals.find((t) => t.id === id);
      const newTerminals = state.terminals.filter((t) => t.id !== id);

      let newActiveId = state.activeTerminalId;
      let newActiveGroupId = state.activeGroupId;

      if (removed && state.activeTerminalId === id) {
        // Try to stay in the same group
        const sameGroup = newTerminals.filter((t) => t.groupId === removed.groupId);
        if (sameGroup.length > 0) {
          newActiveId = sameGroup[sameGroup.length - 1].id;
        } else {
          // Group is empty, pick another
          const last = newTerminals[newTerminals.length - 1];
          newActiveId = last?.id || null;
          newActiveGroupId = last?.groupId || null;
        }
      }

      // If activeGroupId's group no longer exists, fix it
      if (newActiveGroupId && !newTerminals.some((t) => t.groupId === newActiveGroupId)) {
        const last = newTerminals[newTerminals.length - 1];
        newActiveGroupId = last?.groupId || null;
        newActiveId = last?.id || null;
      }

      return { terminals: newTerminals, activeTerminalId: newActiveId, activeGroupId: newActiveGroupId };
    });
  },

  removeGroup: (groupId: string) => {
    const state = get();
    const groupTerminals = state.terminals.filter((t) => t.groupId === groupId);
    groupTerminals.forEach((t) => xtermCallbacks.delete(t.id));

    set((state) => {
      const newTerminals = state.terminals.filter((t) => t.groupId !== groupId);
      let newActiveGroupId = state.activeGroupId;
      let newActiveId = state.activeTerminalId;

      if (state.activeGroupId === groupId) {
        const last = newTerminals[newTerminals.length - 1];
        newActiveGroupId = last?.groupId || null;
        newActiveId = last?.id || null;
      }

      return { terminals: newTerminals, activeTerminalId: newActiveId, activeGroupId: newActiveGroupId };
    });
  },

  updateTerminal: (id: string, updates: Partial<Terminal>) => {
    set((state) => ({
      terminals: state.terminals.map((t) => t.id === id ? { ...t, ...updates } : t),
    }));
  },

  setActiveTerminal: (id: string | null) => {
    if (!id) {
      set({ activeTerminalId: null });
      return;
    }
    const terminal = get().terminals.find((t) => t.id === id);
    if (terminal) {
      set({ activeTerminalId: id, activeGroupId: terminal.groupId });
    }
  },

  setActiveGroup: (groupId: string) => {
    const state = get();
    // If already in this group and have an active terminal there, keep it
    const activeTerminal = state.terminals.find((t) => t.id === state.activeTerminalId);
    if (activeTerminal?.groupId === groupId) {
      set({ activeGroupId: groupId });
      return;
    }
    // Otherwise pick the first terminal in the group
    const first = state.terminals.find((t) => t.groupId === groupId);
    set({
      activeGroupId: groupId,
      activeTerminalId: first?.id || null,
    });
  },

  setTerminalStatus: (id: string, status: TerminalStatus) => {
    set((state) => ({
      terminals: state.terminals.map((t) => t.id === id ? { ...t, status } : t),
    }));
  },

  setClaudeMode: (id: string, isClaudeMode: boolean) => {
    set((state) => ({
      terminals: state.terminals.map((t) =>
        t.id === id ? {
          ...t,
          isClaudeMode,
          status: isClaudeMode ? 'claude-active' : (t.status === 'exited' ? 'exited' : 'running'),
        } : t
      ),
    }));
  },

  setCopilotProvider: (id: string, provider: CopilotProvider) => {
    set((state) => ({
      terminals: state.terminals.map((t) =>
        t.id === id ? { ...t, copilotProvider: provider } : t
      ),
    }));
  },

  clearAllTerminals: () => {
    xtermCallbacks.clear();
    set({ terminals: [], activeTerminalId: null, activeGroupId: null });
  },

  getTerminal: (id: string) => get().terminals.find((t) => t.id === id),
  getActiveTerminal: () => {
    const state = get();
    return state.terminals.find((t) => t.id === state.activeTerminalId);
  },
  canAddTerminal: () => {
    const state = get();
    return state.terminals.filter(t => t.status !== 'exited').length < state.maxTerminals;
  },
  getTerminalsByProject: (projectId?: string) => {
    const state = get();
    if (!projectId) return state.terminals.filter(t => !t.projectId);
    return state.terminals.filter(t => t.projectId === projectId);
  },
  getGroupIds: (projectId?: string) => {
    const state = get();
    const filtered = projectId
      ? state.terminals.filter((t) => t.projectId === projectId)
      : state.terminals.filter((t) => !t.projectId);
    // Unique groupIds in order of first appearance
    const seen = new Set<string>();
    const result: string[] = [];
    for (const t of filtered) {
      if (!seen.has(t.groupId)) {
        seen.add(t.groupId);
        result.push(t.groupId);
      }
    }
    return result;
  },
  getTerminalsInGroup: (groupId: string) => {
    return get().terminals.filter((t) => t.groupId === groupId);
  },

  startTimer: (id: string) => {
    set((state) => ({
      terminals: state.terminals.map((t) =>
        t.id === id
          ? { ...t, timeTracking: { startedAt: Date.now(), elapsed: t.timeTracking?.elapsed || 0 } }
          : t
      ),
    }));
  },

  stopTimer: (id: string) => {
    const terminal = get().terminals.find((t) => t.id === id);
    if (!terminal?.timeTracking?.startedAt) return null;

    const now = Date.now();
    const sessionMs = now - terminal.timeTracking.startedAt;
    const totalElapsed = terminal.timeTracking.elapsed + sessionMs;
    const result: TimeTracking = { startedAt: null, elapsed: totalElapsed };

    set((state) => ({
      terminals: state.terminals.map((t) =>
        t.id === id ? { ...t, timeTracking: result } : t
      ),
    }));

    return { ...result, startedAt: terminal.timeTracking.startedAt };
  },

  writeToTerminal: (terminalId: string, data: string) => {
    const callback = xtermCallbacks.get(terminalId);
    if (callback) {
      try { callback(data); } catch { }
    }
  },

  restoreState: async () => {
    try {
      const result = await window.electronAPI.loadTerminalState();
      if (!result.success || !result.data) {
        set({ isRestored: true });
        return [];
      }

      const saved = result.data;
      if (!saved.terminals || saved.terminals.length === 0) {
        set({ isRestored: true });
        return [];
      }

      // Load saved output buffers from previous session
      try {
        const buffersResult = await window.electronAPI.loadTerminalBuffers();
        if (buffersResult.success && buffersResult.data) {
          for (const [id, buffer] of Object.entries(buffersResult.data)) {
            savedOutputBuffers.set(id, buffer as string);
          }
        }
      } catch { /* non-critical — terminals restore without history */ }

      const restored: Terminal[] = saved.terminals.map((t: any) => ({
        id: t.id,
        groupId: t.groupId,
        title: t.title,
        status: (t.isClaudeMode ? 'claude-active' : 'idle') as TerminalStatus,
        cwd: t.cwd || '',
        createdAt: new Date(),
        isClaudeMode: t.isClaudeMode || false,
        copilotProvider: t.copilotProvider || 'claude',
        claudeSessionId: t.claudeSessionId,
        claudeCwd: t.claudeCwd,
        projectId: t.projectId,
        clickUpTask: t.clickUpTask,
        worktreePath: t.worktreePath,
        worktreeBranch: t.worktreeBranch,
        timeTracking: t.timeTracking,
      }));

      set({
        terminals: restored,
        activeTerminalId: saved.activeTerminalId,
        activeGroupId: saved.activeGroupId,
        isRestored: true,
      });

      return restored;
    } catch {
      set({ isRestored: true });
      return [];
    }
  },
}));

// Auto-save on state changes (skip transient fields like isClaudeBusy)
let prevSnapshot = '';
useTerminalStore.subscribe((state) => {
  if (!state.isRestored) return;
  // Build a lightweight snapshot to avoid saving on every busy toggle
  const snap = JSON.stringify({
    ids: state.terminals.map((t) => t.id).join(','),
    groups: state.terminals.map((t) => t.groupId).join(','),
    titles: state.terminals.map((t) => t.title).join(','),
    cwds: state.terminals.map((t) => t.cwd).join(','),
    projects: state.terminals.map((t) => t.projectId || '').join(','),
    active: state.activeTerminalId,
    activeGroup: state.activeGroupId,
    claude: state.terminals.map((t) => `${t.isClaudeMode ? 1 : 0}:${t.claudeSessionId || ''}:${t.copilotProvider}`).join(','),
    worktrees: state.terminals.map((t) => t.worktreeBranch || '').join(','),
    tasks: state.terminals.map((t) => t.clickUpTask?.id || '').join(','),
    timers: state.terminals.map((t) => `${t.timeTracking?.startedAt || 0}:${t.timeTracking?.elapsed || 0}`).join(','),
  });
  if (snap !== prevSnapshot) {
    prevSnapshot = snap;
    debouncedSaveState(state);
  }
});
