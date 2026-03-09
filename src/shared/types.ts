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
  clickupListIds: string;
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
export interface ProjectSkill {
  id: string;
  name: string;
  description?: string;
  prompt: string;
  agentProvider?: AgentProviderId;
  icon?: string;
  color?: string;
}

export interface Project {
  id: string;
  name: string;
  path: string;
  createdAt: string;
  updatedAt: string;
  agentProvider?: AgentProviderId;
  agentModel?: string;
  agentConfig?: Record<string, string>;
  skills?: ProjectSkill[];
}

export interface ProjectTabState {
  openProjectIds: string[];
  activeProjectId: string | null;
  tabOrder: string[];
}

// Insights
export type InsightsModel = 'opus' | 'sonnet' | 'haiku';

export interface Persona {
  id: string;
  name: string;
  role: string;
  systemPrompt: string;
  color: string;
  icon: string;
}

export type DiscussionStatus = 'discussing' | 'spec-ready' | 'implementing' | 'reviewing' | 'completed';

export interface InsightsMessage {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  timestamp: string;
  model?: InsightsModel;
  personaId?: string;
  /** Special message types for pipeline cards */
  messageType?: 'message' | 'spec' | 'implementation' | 'review' | 'pr' | 'status';
  metadata?: Record<string, any>;
}

export interface InsightsSession {
  id: string;
  title: string;
  messages: InsightsMessage[];
  model: InsightsModel;
  provider?: AgentProviderId;
  copilotModel?: string;
  projectPath?: string;
  pinned?: boolean;
  /** Chat mode: single persona or round table discussion */
  mode?: 'single' | 'roundtable';
  /** Persona IDs participating in round table */
  personas?: string[];
  /** Current persona turn index */
  activePersonaIndex?: number;
  /** Linked terminal for implementation */
  linkedTerminalId?: string;
  /** Discussion pipeline status */
  discussionStatus?: DiscussionStatus;
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
  pinned?: boolean;
  mode?: 'single' | 'roundtable';
  discussionStatus?: DiscussionStatus;
  createdAt: string;
  updatedAt: string;
}

export interface InsightsStreamEvent {
  type: 'text' | 'done' | 'error';
  sessionId: string;
  text?: string;
  error?: string;
  personaId?: string;
}

export const DEFAULT_PERSONAS: Persona[] = [
  {
    id: 'pm',
    name: 'PM',
    role: 'Product Manager',
    systemPrompt: 'You are an experienced Product Manager. Focus on user requirements, acceptance criteria, user stories, business logic, and prioritization. Break down features into clear, actionable specifications. Consider edge cases from the user\'s perspective. When discussing implementation, focus on WHAT needs to be built and WHY, not HOW.',
    color: '#6366f1',
    icon: 'ClipboardList',
  },
  {
    id: 'developer',
    name: 'Developer',
    role: 'Senior Developer',
    systemPrompt: 'You are a Senior Software Developer. Focus on architecture, code implementation, design patterns, technical debt, and best practices. When discussing features, propose concrete technical approaches — which files to modify, data structures, APIs, and component design. Consider performance, maintainability, and scalability.',
    color: '#22c55e',
    icon: 'Code',
  },
  {
    id: 'qc',
    name: 'QC',
    role: 'Quality Engineer',
    systemPrompt: 'You are a Quality Assurance Engineer. Focus on test cases, edge cases, regression risks, error handling, and quality criteria. When reviewing features or code, identify potential bugs, missing validations, accessibility issues, and security concerns. Define clear pass/fail criteria for every requirement.',
    color: '#f59e0b',
    icon: 'ShieldCheck',
  },
];

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
  clickupListIds: '',
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
