import { create } from 'zustand';
import type { CodeReviewEvent, CodeReviewFinding, CodeReviewItem } from '../../shared/types';

interface CodeReviewState {
  items: CodeReviewItem[];
  loading: boolean;
  error: string | null;
  reviewingAll: boolean;
  // Actions
  loadTasks: (statuses?: string[], projectPath?: string) => Promise<void>;
  runReview: (projectPath: string, taskId: string, prNumber: number) => Promise<void>;
  runAllReviews: (projectPath: string) => Promise<void>;
  stopReview: (taskId: string) => Promise<void>;
  stopAllReviews: () => Promise<void>;
  submitResult: (projectPath: string, taskId: string, prNumber: number, passed: boolean, findings: CodeReviewFinding[], prTitle: string) => Promise<void>;
  handleEvent: (event: CodeReviewEvent) => void;
  updateItem: (taskId: string, updates: Partial<CodeReviewItem>) => void;
  clearItems: () => void;
}

export const useCodeReviewStore = create<CodeReviewState>((set, get) => ({
  items: [],
  loading: false,
  error: null,
  reviewingAll: false,

  loadTasks: async (statuses, projectPath) => {
    set({ loading: true, error: null });
    try {
      const result = await window.electronAPI.codeReviewGetTasks(statuses, projectPath);
      if (result.success) {
        set({ items: result.data, loading: false });
      } else {
        set({ error: result.error, loading: false });
      }
    } catch (err) {
      set({ error: err instanceof Error ? err.message : 'Failed to load tasks', loading: false });
    }
  },

  runReview: async (projectPath, taskId, prNumber) => {
    get().updateItem(taskId, { status: 'reviewing', findings: [], error: undefined });
    try {
      const result = await window.electronAPI.codeReviewRun(projectPath, taskId, prNumber);
      if (result.success) {
        const { passed, findings, prTitle, prUrl, prBranch, skipped } = result.data;
        if (skipped) {
          get().updateItem(taskId, { status: 'skipped', prUrl, prBranch, prTitle });
          return;
        }
        get().updateItem(taskId, {
          status: passed ? 'passed' : 'failed',
          findings,
          prUrl,
          prBranch,
          prTitle,
          reviewedAt: new Date().toISOString(),
        });
        // Auto-submit result
        await get().submitResult(projectPath, taskId, prNumber, passed, findings, prTitle);
      } else {
        get().updateItem(taskId, { status: 'error', error: result.error });
      }
    } catch (err) {
      get().updateItem(taskId, { status: 'error', error: err instanceof Error ? err.message : 'Review failed' });
    }
  },

  runAllReviews: async (projectPath) => {
    set({ reviewingAll: true });
    const items = get().items.filter((i) => i.prNumber && i.status === 'pending');
    for (const item of items) {
      if (!get().reviewingAll) break; // stop-all was requested
      if (!item.prNumber) continue;
      await get().runReview(projectPath, item.taskId, item.prNumber);
    }
    set({ reviewingAll: false });
  },

  stopReview: async (taskId) => {
    await window.electronAPI.codeReviewStop?.(taskId);
    get().updateItem(taskId, { status: 'pending', error: undefined });
  },

  stopAllReviews: async () => {
    set({ reviewingAll: false });
    await window.electronAPI.codeReviewStopAll?.();
    // Reset all reviewing items back to pending
    const items = get().items;
    for (const item of items) {
      if (item.status === 'reviewing') {
        get().updateItem(item.taskId, { status: 'pending', error: undefined });
      }
    }
  },

  submitResult: async (projectPath, taskId, prNumber, passed, findings, prTitle) => {
    try {
      await window.electronAPI.codeReviewSubmit(projectPath, taskId, prNumber, passed, findings, prTitle);
    } catch (err) {
      // Non-critical — review result is already shown in UI
      console.error('[CodeReview] Failed to submit result:', err);
    }
  },

  handleEvent: (event) => {
    const { taskId } = event;
    const TERMINAL: string[] = ['passed', 'failed', 'error', 'skipped'];
    const item = get().items.find((i) => i.taskId === taskId);

    switch (event.type) {
      case 'progress':
        // Don't overwrite terminal statuses with 'reviewing'
        if (item && TERMINAL.includes(item.status)) break;
        set((state) => ({
          items: state.items.map((i) =>
            i.taskId === taskId ? { ...i, status: 'reviewing' as const } : i,
          ),
        }));
        break;
      case 'finding':
        if (event.finding && item) {
          set((state) => ({
            items: state.items.map((i) =>
              i.taskId === taskId ? { ...i, findings: [...i.findings, event.finding!] } : i,
            ),
          }));
        }
        break;
      case 'done':
        set((state) => ({
          items: state.items.map((i) =>
            i.taskId === taskId
              ? { ...i, status: event.status || 'passed', findings: event.findings || i.findings, reviewedAt: new Date().toISOString() }
              : i,
          ),
        }));
        break;
      case 'error':
        set((state) => ({
          items: state.items.map((i) =>
            i.taskId === taskId ? { ...i, status: 'error' as const, error: event.message } : i,
          ),
        }));
        break;
    }
  },

  updateItem: (taskId, updates) => {
    set((state) => ({
      items: state.items.map((item) =>
        item.taskId === taskId ? { ...item, ...updates } : item,
      ),
    }));
  },

  clearItems: () => set({ items: [], error: null }),
}));
