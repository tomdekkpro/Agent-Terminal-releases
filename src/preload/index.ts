import { contextBridge, ipcRenderer } from 'electron';
import { IPC_CHANNELS } from '../shared/constants';

const electronAPI = {
  // Terminal
  createTerminal: (options: any) => ipcRenderer.invoke(IPC_CHANNELS.TERMINAL_CREATE, options),
  destroyTerminal: (id: string) => ipcRenderer.invoke(IPC_CHANNELS.TERMINAL_DESTROY, id),
  sendTerminalInput: (id: string, data: string) => ipcRenderer.send(IPC_CHANNELS.TERMINAL_WRITE, id, data),
  resizeTerminal: (id: string, cols: number, rows: number) => ipcRenderer.send(IPC_CHANNELS.TERMINAL_RESIZE, id, cols, rows),
  // Unified agent API
  invokeAgent: (id: string, agentId: string, options?: any) => ipcRenderer.invoke(IPC_CHANNELS.TERMINAL_INVOKE_AGENT, id, agentId, options),
  resumeAgent: (id: string, agentId: string, options?: any) => ipcRenderer.invoke(IPC_CHANNELS.TERMINAL_RESUME_AGENT, id, agentId, options),
  getAgentProviders: () => ipcRenderer.invoke(IPC_CHANNELS.TERMINAL_AGENT_LIST),
  // Legacy agent API (delegates to unified)
  invokeClaude: (id: string, cwd?: string, skipPermissions?: boolean, model?: string) => ipcRenderer.invoke(IPC_CHANNELS.TERMINAL_INVOKE_CLAUDE, id, cwd, skipPermissions, model),
  invokeCopilot: (id: string, cwd?: string, model?: string) => ipcRenderer.invoke(IPC_CHANNELS.TERMINAL_INVOKE_COPILOT, id, cwd, model),
  resumeCopilot: (id: string, cwd?: string) => ipcRenderer.invoke(IPC_CHANNELS.TERMINAL_RESUME_COPILOT, id, cwd),
  resumeClaude: (id: string, sessionId?: string, cwd?: string) => ipcRenderer.invoke(IPC_CHANNELS.TERMINAL_RESUME_CLAUDE, id, sessionId, cwd),
  saveTerminalState: (state: any) => ipcRenderer.invoke(IPC_CHANNELS.TERMINAL_STATE_SAVE, state),
  saveTerminalStateSync: (state: any) => ipcRenderer.sendSync(IPC_CHANNELS.TERMINAL_STATE_SAVE_SYNC, state),
  loadTerminalState: () => ipcRenderer.invoke(IPC_CHANNELS.TERMINAL_STATE_LOAD),
  loadTerminalBuffers: () => ipcRenderer.invoke(IPC_CHANNELS.TERMINAL_BUFFERS_LOAD),

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
  // Agent-generic event listeners
  onTerminalAgentBusy: (callback: (id: string, isBusy: boolean) => void) => {
    const handler = (_event: any, id: string, isBusy: boolean) => callback(id, isBusy);
    ipcRenderer.on(IPC_CHANNELS.TERMINAL_AGENT_BUSY, handler);
    return () => ipcRenderer.removeListener(IPC_CHANNELS.TERMINAL_AGENT_BUSY, handler);
  },
  onTerminalAgentSession: (callback: (id: string, sessionId: string) => void) => {
    const handler = (_event: any, id: string, sessionId: string) => callback(id, sessionId);
    ipcRenderer.on(IPC_CHANNELS.TERMINAL_AGENT_SESSION, handler);
    return () => ipcRenderer.removeListener(IPC_CHANNELS.TERMINAL_AGENT_SESSION, handler);
  },
  // Legacy event listeners (still fired for backward compat)
  onTerminalClaudeBusy: (callback: (id: string, isBusy: boolean) => void) => {
    const handler = (_event: any, id: string, isBusy: boolean) => callback(id, isBusy);
    ipcRenderer.on(IPC_CHANNELS.TERMINAL_CLAUDE_BUSY, handler);
    return () => ipcRenderer.removeListener(IPC_CHANNELS.TERMINAL_CLAUDE_BUSY, handler);
  },
  onTerminalClaudeSession: (callback: (id: string, sessionId: string) => void) => {
    const handler = (_event: any, id: string, sessionId: string) => callback(id, sessionId);
    ipcRenderer.on(IPC_CHANNELS.TERMINAL_CLAUDE_SESSION, handler);
    return () => ipcRenderer.removeListener(IPC_CHANNELS.TERMINAL_CLAUDE_SESSION, handler);
  },

  // Task Manager
  checkTaskManagerConnection: () => ipcRenderer.invoke(IPC_CHANNELS.TASK_MANAGER_CHECK_CONNECTION),
  getTaskManagerLists: () => ipcRenderer.invoke(IPC_CHANNELS.TASK_MANAGER_GET_LISTS),
  getTaskManagerTasks: (listId?: string, page?: number) => ipcRenderer.invoke(IPC_CHANNELS.TASK_MANAGER_GET_TASKS, listId, page),
  searchTaskManagerTasks: (query: string, filters?: { statuses?: string[]; assignees?: string[]; includeClosed?: boolean }, listId?: string, page?: number) =>
    ipcRenderer.invoke(IPC_CHANNELS.TASK_MANAGER_SEARCH_TASKS, query, filters, listId, page),
  getTaskManagerTask: (taskId: string) => ipcRenderer.invoke(IPC_CHANNELS.TASK_MANAGER_GET_TASK, taskId),
  createTaskManagerTask: (listId: string, data: any) => ipcRenderer.invoke(IPC_CHANNELS.TASK_MANAGER_CREATE_TASK, listId, data),
  postTaskComment: (taskId: string, comment: string) => ipcRenderer.invoke(IPC_CHANNELS.TASK_MANAGER_POST_COMMENT, taskId, comment),
  updateTaskStatus: (taskId: string, status: string) => ipcRenderer.invoke(IPC_CHANNELS.TASK_MANAGER_UPDATE_STATUS, taskId, status),
  postTaskTimeEntry: (taskId: string, startMs: number, durationMs: number, description?: string) =>
    ipcRenderer.invoke(IPC_CHANNELS.TASK_MANAGER_POST_TIME_ENTRY, taskId, startMs, durationMs, description),
  getTaskTimeEntries: (taskId: string) => ipcRenderer.invoke(IPC_CHANNELS.TASK_MANAGER_GET_TIME_ENTRIES, taskId),

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
  requestCopilotUsageUpdate: () => ipcRenderer.invoke(IPC_CHANNELS.COPILOT_USAGE_REQUEST),
  onCopilotUsageUpdated: (callback: (data: any) => void) => {
    const handler = (_event: any, data: any) => callback(data);
    ipcRenderer.on(IPC_CHANNELS.COPILOT_USAGE_UPDATED, handler);
    return () => ipcRenderer.removeListener(IPC_CHANNELS.COPILOT_USAGE_UPDATED, handler);
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
  gitFetch: (cwd: string) => ipcRenderer.invoke(IPC_CHANNELS.GIT_FETCH, cwd),
  gitPull: (cwd: string) => ipcRenderer.invoke(IPC_CHANNELS.GIT_PULL, cwd),

  // Insights
  insightsListSessions: () => ipcRenderer.invoke(IPC_CHANNELS.INSIGHTS_LIST_SESSIONS),
  insightsGetSession: (id: string) => ipcRenderer.invoke(IPC_CHANNELS.INSIGHTS_GET_SESSION, id),
  insightsCreateSession: (model: string, projectPath?: string, provider?: string, copilotModel?: string) =>
    ipcRenderer.invoke(IPC_CHANNELS.INSIGHTS_CREATE_SESSION, model, projectPath, provider, copilotModel),
  insightsDeleteSession: (id: string) => ipcRenderer.invoke(IPC_CHANNELS.INSIGHTS_DELETE_SESSION, id),
  insightsRenameSession: (id: string, title: string) =>
    ipcRenderer.invoke(IPC_CHANNELS.INSIGHTS_RENAME_SESSION, id, title),
  insightsSendMessage: (sessionId: string, content: string, model?: string, projectPath?: string, copilotModel?: string) =>
    ipcRenderer.invoke(IPC_CHANNELS.INSIGHTS_SEND_MESSAGE, sessionId, content, model, projectPath, copilotModel),
  insightsAbortStream: (sessionId: string) =>
    ipcRenderer.invoke(IPC_CHANNELS.INSIGHTS_ABORT_STREAM, sessionId),
  onInsightsStreamEvent: (callback: (event: any) => void) => {
    const handler = (_event: any, data: any) => callback(data);
    ipcRenderer.on(IPC_CHANNELS.INSIGHTS_STREAM_EVENT, handler);
    return () => ipcRenderer.removeListener(IPC_CHANNELS.INSIGHTS_STREAM_EVENT, handler);
  },

  // Service Status
  requestServiceStatus: () => ipcRenderer.invoke(IPC_CHANNELS.SERVICE_STATUS_REQUEST),
  onServiceStatusUpdated: (callback: (summary: any) => void) => {
    const handler = (_event: any, summary: any) => callback(summary);
    ipcRenderer.on(IPC_CHANNELS.SERVICE_STATUS_UPDATED, handler);
    return () => ipcRenderer.removeListener(IPC_CHANNELS.SERVICE_STATUS_UPDATED, handler);
  },

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
