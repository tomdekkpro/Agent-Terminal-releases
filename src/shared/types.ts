export type WindowsShellType = 'cmd' | 'powershell' | 'bash';

export interface TerminalCreateOptions {
  id: string;
  cwd: string;
  cols?: number;
  rows?: number;
  env?: Record<string, string>;
}

export interface ClickUpTask {
  id: string;
  custom_id?: string;
  name: string;
  text_content?: string;
  description?: string;
  markdown_description?: string;
  status: { status: string; color: string; type: string };
  creator: { id: number; username: string; email: string };
  assignees: Array<{ id: number; username: string; email: string; initials?: string }>;
  tags: Array<{ name: string; tag_bg: string; tag_fg: string }>;
  date_created: string;
  date_updated: string;
  url: string;
  priority?: { id: string; priority: string; color: string };
  list?: { id: string; name: string };
  folder?: { id: string; name: string };
  space?: { id: string; name: string };
  team_id?: string;
}

export interface AppSettings {
  // Terminal
  terminalFontFamily: string;
  terminalFontSize: number;
  terminalLineHeight: number;
  terminalCursorStyle: 'block' | 'underline' | 'bar';
  terminalCursorBlink: boolean;
  terminalScrollback: number;
  // ClickUp
  clickupEnabled: boolean;
  clickupApiKey: string;
  clickupWorkspaceId: string;
  clickupListId: string;
  // Agent
  defaultModel: string;
  workingDirectory: string;
  maxTerminals: number;
  // Appearance
  theme: 'dark' | 'light';
  // General
  autoUpdate: boolean;
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
  cost?: number;
  inputTokens?: number;
  outputTokens?: number;
  timestamp: Date;
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
  projectPath?: string;
  createdAt: string;
  updatedAt: string;
}

export interface InsightsSessionMeta {
  id: string;
  title: string;
  messageCount: number;
  model: InsightsModel;
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

export const DEFAULT_SETTINGS: AppSettings = {
  terminalFontFamily: 'Cascadia Code, Consolas, Courier New, monospace',
  terminalFontSize: 14,
  terminalLineHeight: 1.2,
  terminalCursorStyle: 'block',
  terminalCursorBlink: true,
  terminalScrollback: 10000,
  clickupEnabled: false,
  clickupApiKey: '',
  clickupWorkspaceId: '',
  clickupListId: '',
  defaultModel: 'claude-opus-4-6',
  workingDirectory: '',
  maxTerminals: 12,
  theme: 'dark',
  autoUpdate: true,
};
