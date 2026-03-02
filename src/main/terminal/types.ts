import type * as pty from '@lydell/node-pty';
import type { BrowserWindow } from 'electron';
import type { WindowsShellType, AgentProviderId } from '../../shared/types';

export interface TerminalProcess {
  id: string;
  pty: pty.IPty;
  isAgentMode: boolean;
  cwd: string;
  agentSessionId?: string;
  agentCwd?: string;
  agentProvider?: AgentProviderId;
  outputBuffer: string;
  title: string;
  shellType?: WindowsShellType;
  hasExited?: boolean;
  /** @deprecated Use isAgentMode */
  isClaudeMode?: boolean;
  /** @deprecated Use agentSessionId */
  claudeSessionId?: string;
  /** @deprecated Use agentCwd */
  claudeCwd?: string;
  /** @deprecated Use agentProvider */
  copilotProvider?: AgentProviderId;
}

export type WindowGetter = () => BrowserWindow | null;

export interface TerminalOperationResult {
  success: boolean;
  error?: string;
  outputBuffer?: string;
}
