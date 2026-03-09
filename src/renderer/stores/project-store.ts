import { create } from 'zustand';
import type { Project, ProjectTabState } from '../../shared/types';

interface ProjectState {
  projects: Project[];
  openProjectIds: string[];
  activeProjectId: string | null;
  tabOrder: string[];
  isLoaded: boolean;

  // Actions
  loadProjects: () => Promise<void>;
  addProject: () => Promise<Project | null>;
  addProjectByPath: (path: string, name?: string) => Promise<Project | null>;
  removeProject: (id: string) => Promise<void>;
  updateProject: (id: string, updates: Partial<Project>) => Promise<void>;
  openProjectTab: (projectId: string) => void;
  closeProjectTab: (projectId: string) => void;
  setActiveProject: (projectId: string | null) => void;
  reorderTabs: (fromIndex: number, toIndex: number) => void;
  getActiveProject: () => Project | undefined;
}

let saveDebounceTimer: ReturnType<typeof setTimeout> | null = null;

function saveTabStateDebounced(state: ProjectState) {
  if (saveDebounceTimer) clearTimeout(saveDebounceTimer);
  saveDebounceTimer = setTimeout(() => {
    window.electronAPI.saveTabState({
      openProjectIds: state.openProjectIds,
      activeProjectId: state.activeProjectId,
      tabOrder: state.tabOrder,
    });
  }, 200);
}

export const useProjectStore = create<ProjectState>((set, get) => ({
  projects: [],
  openProjectIds: [],
  activeProjectId: null,
  tabOrder: [],
  isLoaded: false,

  loadProjects: async () => {
    try {
      const [projectsResult, tabResult] = await Promise.all([
        window.electronAPI.getProjects(),
        window.electronAPI.getTabState(),
      ]);

      const projects: Project[] = projectsResult.success ? projectsResult.data : [];
      const tabState: ProjectTabState = tabResult.success ? tabResult.data : {
        openProjectIds: [],
        activeProjectId: null,
        tabOrder: [],
      };

      // Validate tab state against existing projects
      const validIds = new Set(projects.map((p: Project) => p.id));
      const openProjectIds = tabState.openProjectIds.filter((id: string) => validIds.has(id));
      const tabOrder = tabState.tabOrder.filter((id: string) => validIds.has(id));
      const activeProjectId = tabState.activeProjectId && validIds.has(tabState.activeProjectId)
        ? tabState.activeProjectId
        : openProjectIds[0] || null;

      set({
        projects,
        openProjectIds,
        activeProjectId,
        tabOrder,
        isLoaded: true,
      });
    } catch {
      set({ isLoaded: true });
    }
  },

  addProject: async () => {
    try {
      const result = await window.electronAPI.selectProjectFolder();
      if (!result.success || !result.data) return null;

      const project: Project = result.data;
      const state = get();

      // Add to projects if not already there
      const exists = state.projects.some((p) => p.id === project.id);
      const newProjects = exists ? state.projects : [...state.projects, project];

      // Open tab
      const newOpen = state.openProjectIds.includes(project.id)
        ? state.openProjectIds
        : [...state.openProjectIds, project.id];
      const newOrder = state.tabOrder.includes(project.id)
        ? state.tabOrder
        : [...state.tabOrder, project.id];

      set({
        projects: newProjects,
        openProjectIds: newOpen,
        activeProjectId: project.id,
        tabOrder: newOrder,
      });
      saveTabStateDebounced(get());
      return project;
    } catch {
      return null;
    }
  },

  addProjectByPath: async (path: string, name?: string) => {
    try {
      const result = await window.electronAPI.addProject(path, name);
      if (!result.success || !result.data) return null;

      const project: Project = result.data;
      const state = get();

      const exists = state.projects.some((p) => p.id === project.id);
      const newProjects = exists ? state.projects : [...state.projects, project];

      const newOpen = state.openProjectIds.includes(project.id)
        ? state.openProjectIds
        : [...state.openProjectIds, project.id];
      const newOrder = state.tabOrder.includes(project.id)
        ? state.tabOrder
        : [...state.tabOrder, project.id];

      set({
        projects: newProjects,
        openProjectIds: newOpen,
        activeProjectId: project.id,
        tabOrder: newOrder,
      });
      saveTabStateDebounced(get());
      return project;
    } catch {
      return null;
    }
  },

  removeProject: async (id: string) => {
    await window.electronAPI.removeProject(id);
    set((state) => {
      const newOpen = state.openProjectIds.filter((pid) => pid !== id);
      const newOrder = state.tabOrder.filter((pid) => pid !== id);
      const newActive = state.activeProjectId === id
        ? (newOpen[0] || null)
        : state.activeProjectId;
      return {
        projects: state.projects.filter((p) => p.id !== id),
        openProjectIds: newOpen,
        tabOrder: newOrder,
        activeProjectId: newActive,
      };
    });
    saveTabStateDebounced(get());
  },

  updateProject: async (id: string, updates: Partial<Project>) => {
    try {
      const result = await window.electronAPI.updateProject(id, updates);
      if (result.success && result.data) {
        set((state) => ({
          projects: state.projects.map((p) => (p.id === id ? result.data : p)),
        }));
      }
    } catch {
      // ignore
    }
  },

  openProjectTab: (projectId: string) => {
    set((state) => {
      const newOpen = state.openProjectIds.includes(projectId)
        ? state.openProjectIds
        : [...state.openProjectIds, projectId];
      const newOrder = state.tabOrder.includes(projectId)
        ? state.tabOrder
        : [...state.tabOrder, projectId];
      return {
        openProjectIds: newOpen,
        activeProjectId: projectId,
        tabOrder: newOrder,
      };
    });
    saveTabStateDebounced(get());
  },

  closeProjectTab: (projectId: string) => {
    set((state) => {
      const newOpen = state.openProjectIds.filter((id) => id !== projectId);
      const newOrder = state.tabOrder.filter((id) => id !== projectId);
      const newActive = state.activeProjectId === projectId
        ? (newOpen[newOpen.length - 1] || null)
        : state.activeProjectId;
      return {
        openProjectIds: newOpen,
        tabOrder: newOrder,
        activeProjectId: newActive,
      };
    });
    saveTabStateDebounced(get());
  },

  setActiveProject: (projectId: string | null) => {
    set({ activeProjectId: projectId });
    saveTabStateDebounced(get());
  },

  reorderTabs: (fromIndex: number, toIndex: number) => {
    set((state) => {
      const newOrder = [...state.tabOrder];
      const [moved] = newOrder.splice(fromIndex, 1);
      newOrder.splice(toIndex, 0, moved);
      return { tabOrder: newOrder };
    });
    saveTabStateDebounced(get());
  },

  getActiveProject: () => {
    const state = get();
    return state.projects.find((p) => p.id === state.activeProjectId);
  },
}));
