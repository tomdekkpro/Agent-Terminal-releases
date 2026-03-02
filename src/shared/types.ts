export type WindowsShellType = 'cmd' | 'powershell' | 'bash';
export type AgentProviderId = 'claude' | 'copilot' | 'gemini' | 'qwen' | 'aider';
/** @deprecated Use AgentProviderId instead */
export type CopilotProvider = AgentProviderId;
export type TaskManagerProvider = 'clickup' | 'jira' | 'none';

export interface AgentCapabilities {
  resume: boolean;
  continue: boolean;
  yolo: boolean;
  sessionDetection: boolean;
  remoteControl: boolean;
  insights: boolean;
}

export interface AgentModelOption {
  id: string;
  label: string;
}

export interface AgentInvokeOptions {
  cwd?: string;
  model?: string;
  skipPermissions?: boolean;
  sessionId?: string;
  task?: string;
  env?: Record<string, string>;
}

export interface AgentSettingsField {
  key: string;
  label: string;
  type: 'text' | 'password' | 'select';
  placeholder?: string;
  description?: string;
  options?: { value: string; label: string }[];
}

/** Serializable agent metadata sent to the renderer */
export interface AgentProviderMeta {
  id: AgentProviderId;
  displayName: string;
  command: string;
  iconName: string;
  color: string;
  capabilities: AgentCapabilities;
  installHint: string;
  available: boolean;
  models: AgentModelOption[];
  defaultModel: string;
  settingsFields: AgentSettingsField[];
}

/** Per-agent usage data extracted from terminal output */
export interface AgentUsageData {
  cost?: number;
  inputTokens?: number;
  outputTokens?: number;
  premiumRequests?: number;
  durationApi?: string;
  durationWall?: string;
  linesAdded?: number;
  linesRemoved?: number;
}

export interface TerminalCreateOptions {
  id: string;
  cwd: string;
  cols?: number;
  rows?: number;
  env?: Record<string, string>;
}

/** Normalized task shape all providers map to */
export interface TaskManagerTask {
  id: string;
  customId?: string;
  name: string;
  description?: string;
  status: { name: string; color: string };
  priority?: { name: string; color: string };
  assignees: Array<{ id: string; username: string; email?: string; initials?: string }>;
  tags: Array<{ name: string; bgColor: string; fgColor: string }>;
  url: string;
  createdAt: string;
  updatedAt: string;
  providerTaskId: string;
  provider: TaskManagerProvider;
}

/** List/container that holds tasks (ClickUp list, Jira project, etc.) */
export interface TaskManagerList {
  id: string;
  name: string;
  space?: string;
  folder?: string;
}

/** Slim task shape stored on terminals */
export interface TerminalTask {
  id: string;
  customId?: string;
  name: string;
  status: string;
  statusColor: string;
  url: string;
  provider: TaskManagerProvider;
}

export interface AppSettings {
  // Terminal
  terminalFontFamily: string;
  terminalFontSize: number;
  terminalLineHeight: number;
  terminalCursorStyle: 'block' | 'underline' | 'bar';
  terminalCursorBlink: boolean;
  terminalScrollback: number;
  terminalGpuAcceleration: boolean;
  // Task Manager
  taskManagerProvider: TaskManagerProvider;
  clickupApiKey: string;
  clickupWorkspaceId: string;
  clickupListId: string;
  jiraEmail: string;
  jiraApiToken: string;
  jiraDomain: string;
  jiraProjectKey: string;
  // Agent
  defaultModel: string;
  workingDirectory: string;
  maxTerminals: number;
  // Appearance
  theme: 'dark' | 'light';
  // General
  autoUpdate: boolean;
  telemetryEnabled: boolean;
  // Agent providers
  defaultAgentProvider: AgentProviderId;
  agentModels: Partial<Record<AgentProviderId, string>>;
  agentConfig: Partial<Record<AgentProviderId, Record<string, string>>>;
  /** @deprecated Use defaultAgentProvider */
  defaultCopilotProvider?: AgentProviderId;
  /** @deprecated Use agentModels.copilot */
  defaultCopilotModel?: string;
}

// Usage Monitor
export interface UsageSnapshot {
  sessionPercent: number;
  weeklyPercent: number;
  sessionResetTime?: string;
  weeklyResetTime?: string;
  fetchedAt: Date;
}

export interface UsageCostData {
  terminalId: string;
  provider?: AgentProviderId;
  cost?: number;
  inputTokens?: number;
  outputTokens?: number;
  premiumRequests?: number;
  durationApi?: string;
  durationWall?: string;
  linesAdded?: number;
  linesRemoved?: number;
  timestamp: Date;
}

export interface CopilotUsageData {
  premiumRequests?: number;
  totalTurns: number;
  models: string[];
  tokenLimit?: number;
  tokensUsed?: number;
  inputTokens?: number;
  outputTokens?: number;
  durationApi?: string;
  durationWall?: string;
  linesAdded?: number;
  linesRemoved?: number;
}

// Project Management
export interface Project {
  id: string;
  name: string;
  path: string;
  createdAt: string;
  updatedAt: string;
}

export interface ProjectTabState {
  openProjectIds: string[];
  activeProjectId: string | null;
  tabOrder: string[];
}

// Insights
export type InsightsModel = 'opus' | 'sonnet' | 'haiku';

export interface InsightsMessage {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  timestamp: string;
  model?: InsightsModel;
}

export interface InsightsSession {
  id: string;
  title: string;
  messages: InsightsMessage[];
  model: InsightsModel;
  provider?: AgentProviderId;
  copilotModel?: string;
  projectPath?: string;
  createdAt: string;
  updatedAt: string;
}

export interface InsightsSessionMeta {
  id: string;
  title: string;
  messageCount: number;
  model: InsightsModel;
  provider?: AgentProviderId;
  projectPath?: string;
  createdAt: string;
  updatedAt: string;
}

export interface InsightsStreamEvent {
  type: 'text' | 'done' | 'error';
  sessionId: string;
  text?: string;
  error?: string;
}

// Service Status
export type ServiceStatusLevel = 'operational' | 'degraded' | 'major' | 'critical' | 'unknown';

export interface ServiceStatusIncident {
  name: string;
  impact: string;
  status: string;
  url?: string;
  updatedAt: string;
}

export interface ProviderStatus {
  provider: AgentProviderId;
  level: ServiceStatusLevel;
  description: string;
  incidents: ServiceStatusIncident[];
  components?: { name: string; status: string }[];
  lastChecked: number;
}

export interface ServiceStatusSummary {
  providers: Record<string, ProviderStatus>;
  worstLevel: ServiceStatusLevel;
}

export const DEFAULT_SETTINGS: AppSettings = {
  terminalFontFamily: 'Cascadia Code, Consolas, Courier New, monospace',
  terminalFontSize: 14,
  terminalLineHeight: 1.2,
  terminalCursorStyle: 'block',
  terminalCursorBlink: true,
  terminalScrollback: 10000,
  terminalGpuAcceleration: true,
  taskManagerProvider: 'none',
  clickupApiKey: '',
  clickupWorkspaceId: '',
  clickupListId: '',
  jiraEmail: '',
  jiraApiToken: '',
  jiraDomain: '',
  jiraProjectKey: '',
  defaultModel: 'claude-opus-4-6',
  workingDirectory: '',
  maxTerminals: 12,
  theme: 'dark',
  autoUpdate: true,
  telemetryEnabled: true,
  defaultAgentProvider: 'claude',
  agentModels: {
    claude: 'claude-opus-4-6',
    copilot: 'claude-sonnet-4.5',
    gemini: 'gemini-2.5-pro',
    qwen: 'qwen3-coder',
    aider: '',
  },
  agentConfig: {},
};
