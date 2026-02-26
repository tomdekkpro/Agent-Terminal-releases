import type * as pty from '@lydell/node-pty';
import type { BrowserWindow } from 'electron';
import type { WindowsShellType } from '../../shared/types';

export interface TerminalProcess {
  id: string;
  pty: pty.IPty;
  isClaudeMode: boolean;
  cwd: string;
  claudeSessionId?: string;
  outputBuffer: string;
  title: string;
  shellType?: WindowsShellType;
  hasExited?: boolean;
}

export type WindowGetter = () => BrowserWindow | null;

export interface TerminalOperationResult {
  success: boolean;
  error?: string;
  outputBuffer?: string;
}
