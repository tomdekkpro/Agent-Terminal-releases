import { contextBridge, ipcRenderer } from 'electron';
import { IPC_CHANNELS } from '../shared/constants';

const electronAPI = {
  // Terminal
  createTerminal: (options: any) => ipcRenderer.invoke(IPC_CHANNELS.TERMINAL_CREATE, options),
  destroyTerminal: (id: string) => ipcRenderer.invoke(IPC_CHANNELS.TERMINAL_DESTROY, id),
  sendTerminalInput: (id: string, data: string) => ipcRenderer.send(IPC_CHANNELS.TERMINAL_WRITE, id, data),
  resizeTerminal: (id: string, cols: number, rows: number) => ipcRenderer.send(IPC_CHANNELS.TERMINAL_RESIZE, id, cols, rows),
  invokeClaude: (id: string, cwd?: string, skipPermissions?: boolean) => ipcRenderer.invoke(IPC_CHANNELS.TERMINAL_INVOKE_CLAUDE, id, cwd, skipPermissions),
  resumeClaude: (id: string) => ipcRenderer.invoke(IPC_CHANNELS.TERMINAL_RESUME_CLAUDE, id),
  saveTerminalState: (state: any) => ipcRenderer.invoke(IPC_CHANNELS.TERMINAL_STATE_SAVE, state),
  loadTerminalState: () => ipcRenderer.invoke(IPC_CHANNELS.TERMINAL_STATE_LOAD),

  // Terminal events
  onTerminalOutput: (callback: (id: string, data: string) => void) => {
    const handler = (_event: any, id: string, data: string) => callback(id, data);
    ipcRenderer.on(IPC_CHANNELS.TERMINAL_OUTPUT, handler);
    return () => ipcRenderer.removeListener(IPC_CHANNELS.TERMINAL_OUTPUT, handler);
  },
  onTerminalExit: (callback: (id: string, exitCode: number) => void) => {
    const handler = (_event: any, id: string, exitCode: number) => callback(id, exitCode);
    ipcRenderer.on(IPC_CHANNELS.TERMINAL_EXIT, handler);
    return () => ipcRenderer.removeListener(IPC_CHANNELS.TERMINAL_EXIT, handler);
  },
  onTerminalTitleChange: (callback: (id: string, title: string) => void) => {
    const handler = (_event: any, id: string, title: string) => callback(id, title);
    ipcRenderer.on(IPC_CHANNELS.TERMINAL_TITLE_CHANGE, handler);
    return () => ipcRenderer.removeListener(IPC_CHANNELS.TERMINAL_TITLE_CHANGE, handler);
  },
  onTerminalClaudeBusy: (callback: (id: string, isBusy: boolean) => void) => {
    const handler = (_event: any, id: string, isBusy: boolean) => callback(id, isBusy);
    ipcRenderer.on(IPC_CHANNELS.TERMINAL_CLAUDE_BUSY, handler);
    return () => ipcRenderer.removeListener(IPC_CHANNELS.TERMINAL_CLAUDE_BUSY, handler);
  },

  // ClickUp
  checkClickUpConnection: () => ipcRenderer.invoke(IPC_CHANNELS.CLICKUP_CHECK_CONNECTION),
  getClickUpTasks: (listId?: string) => ipcRenderer.invoke(IPC_CHANNELS.CLICKUP_GET_TASKS, listId),
  getClickUpTask: (taskId: string) => ipcRenderer.invoke(IPC_CHANNELS.CLICKUP_GET_TASK, taskId),
  createClickUpTask: (listId: string, data: any) => ipcRenderer.invoke(IPC_CHANNELS.CLICKUP_CREATE_TASK, listId, data),
  postClickUpComment: (taskId: string, comment: string) => ipcRenderer.invoke(IPC_CHANNELS.CLICKUP_POST_COMMENT, taskId, comment),
  updateClickUpStatus: (taskId: string, status: string) => ipcRenderer.invoke(IPC_CHANNELS.CLICKUP_UPDATE_STATUS, taskId, status),
  postClickUpTimeEntry: (taskId: string, startMs: number, durationMs: number, description?: string) =>
    ipcRenderer.invoke(IPC_CHANNELS.CLICKUP_POST_TIME_ENTRY, taskId, startMs, durationMs, description),
  getClickUpTimeEntries: (taskId: string) => ipcRenderer.invoke(IPC_CHANNELS.CLICKUP_GET_TIME_ENTRIES, taskId),

  // Usage Monitor
  requestUsageUpdate: () => ipcRenderer.invoke(IPC_CHANNELS.USAGE_REQUEST),
  onUsageUpdated: (callback: (snapshot: any) => void) => {
    const handler = (_event: any, snapshot: any) => callback(snapshot);
    ipcRenderer.on(IPC_CHANNELS.USAGE_UPDATED, handler);
    return () => ipcRenderer.removeListener(IPC_CHANNELS.USAGE_UPDATED, handler);
  },
  onUsageCostUpdate: (callback: (data: any) => void) => {
    const handler = (_event: any, data: any) => callback(data);
    ipcRenderer.on(IPC_CHANNELS.USAGE_COST_UPDATE, handler);
    return () => ipcRenderer.removeListener(IPC_CHANNELS.USAGE_COST_UPDATE, handler);
  },

  // Projects
  getProjects: () => ipcRenderer.invoke(IPC_CHANNELS.PROJECT_LIST),
  addProject: (path: string, name?: string) => ipcRenderer.invoke(IPC_CHANNELS.PROJECT_ADD, path, name),
  removeProject: (id: string) => ipcRenderer.invoke(IPC_CHANNELS.PROJECT_REMOVE, id),
  updateProject: (id: string, updates: any) => ipcRenderer.invoke(IPC_CHANNELS.PROJECT_UPDATE, id, updates),
  selectProjectFolder: () => ipcRenderer.invoke(IPC_CHANNELS.PROJECT_SELECT_FOLDER),
  getTabState: () => ipcRenderer.invoke(IPC_CHANNELS.TAB_STATE_GET),
  saveTabState: (tabState: any) => ipcRenderer.invoke(IPC_CHANNELS.TAB_STATE_SAVE, tabState),

  // Git
  createTaskWorktree: (projectPath: string, taskId: string) => ipcRenderer.invoke(IPC_CHANNELS.GIT_CREATE_WORKTREE, projectPath, taskId),
  removeTaskWorktree: (projectPath: string, worktreePath: string) => ipcRenderer.invoke(IPC_CHANNELS.GIT_REMOVE_WORKTREE, projectPath, worktreePath),
  mergeTaskBranch: (projectPath: string, worktreePath: string, taskBranch: string, targetBranch: string) => ipcRenderer.invoke(IPC_CHANNELS.GIT_MERGE_TASK, projectPath, worktreePath, taskBranch, targetBranch),
  listBranches: (projectPath: string) => ipcRenderer.invoke(IPC_CHANNELS.GIT_LIST_BRANCHES, projectPath),
  createPR: (projectPath: string, worktreePath: string, taskBranch: string, targetBranch: string, title: string, body: string) =>
    ipcRenderer.invoke(IPC_CHANNELS.GIT_CREATE_PR, projectPath, worktreePath, taskBranch, targetBranch, title, body),
  pushBranch: (cwd: string, branch?: string) => ipcRenderer.invoke(IPC_CHANNELS.GIT_PUSH_BRANCH, cwd, branch),

  // Settings
  getSettings: () => ipcRenderer.invoke(IPC_CHANNELS.SETTINGS_GET_ALL),
  getSetting: (key: string) => ipcRenderer.invoke(IPC_CHANNELS.SETTINGS_GET, key),
  setSettings: (updates: any) => ipcRenderer.invoke(IPC_CHANNELS.SETTINGS_SET, updates),

  // Updates
  checkForUpdate: () => ipcRenderer.invoke(IPC_CHANNELS.UPDATE_CHECK),
  downloadUpdate: () => ipcRenderer.invoke(IPC_CHANNELS.UPDATE_DOWNLOAD),
  installUpdate: () => ipcRenderer.invoke(IPC_CHANNELS.UPDATE_INSTALL),
  onUpdateStatus: (callback: (data: any) => void) => {
    const handler = (_event: any, data: any) => callback(data);
    ipcRenderer.on(IPC_CHANNELS.UPDATE_STATUS, handler);
    return () => ipcRenderer.removeListener(IPC_CHANNELS.UPDATE_STATUS, handler);
  },

  // App
  openExternal: (url: string) => ipcRenderer.invoke(IPC_CHANNELS.OPEN_EXTERNAL, url),
};

contextBridge.exposeInMainWorld('electronAPI', electronAPI);

export type ElectronAPI = typeof electronAPI;
