import * as os from 'os';
import type { TerminalCreateOptions } from '../../shared/types';
import type { TerminalProcess, WindowGetter, TerminalOperationResult } from './types';
import * as PtyManager from './pty-manager';
import { IPC_CHANNELS } from '../../shared/constants';
import { debugLog, debugError } from '../../shared/utils';
import { extractCostFromOutput } from '../usage/usage-service';

export class TerminalManager {
  private terminals: Map<string, TerminalProcess> = new Map();
  private getWindow: WindowGetter;

  constructor(getWindow: WindowGetter) {
    this.getWindow = getWindow;
  }

  async create(options: TerminalCreateOptions): Promise<TerminalOperationResult> {
    const { id, cwd, cols = 80, rows = 24, env: customEnv } = options;

    if (this.terminals.has(id)) {
      return { success: true };
    }

    try {
      const { pty: ptyProcess, shellType } = PtyManager.spawnPtyProcess(
        cwd || os.homedir(),
        cols,
        rows,
        customEnv
      );

      const terminal: TerminalProcess = {
        id,
        pty: ptyProcess,
        isClaudeMode: false,
        hasExited: false,
        cwd: cwd || os.homedir(),
        outputBuffer: '',
        title: `Terminal ${this.terminals.size + 1}`,
        shellType,
      };

      this.terminals.set(id, terminal);

      PtyManager.setupPtyHandlers(
        terminal,
        this.terminals,
        this.getWindow,
        (term, data) => this.handleTerminalData(term, data),
        (_term) => {}
      );

      return { success: true };
    } catch (error) {
      debugError('[TerminalManager] Error creating terminal:', error);
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Failed to create terminal',
      };
    }
  }

  async destroy(id: string): Promise<TerminalOperationResult> {
    const terminal = this.terminals.get(id);
    if (!terminal) {
      return { success: false, error: 'Terminal not found' };
    }

    try {
      this.terminals.delete(id);
      PtyManager.killPty(terminal);
      return { success: true };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Failed to destroy terminal',
      };
    }
  }

  async killAll(): Promise<void> {
    PtyManager.setShuttingDown(true);
    this.terminals.forEach((terminal) => {
      PtyManager.killPty(terminal);
    });
    this.terminals.clear();
  }

  write(id: string, data: string): void {
    const terminal = this.terminals.get(id);
    if (terminal) {
      PtyManager.writeToPty(terminal, data);
    }
  }

  resize(id: string, cols: number, rows: number): boolean {
    const terminal = this.terminals.get(id);
    if (!terminal) return false;
    return PtyManager.resizePty(terminal, cols, rows);
  }

  invokeClaude(id: string, cwd?: string, skipPermissions?: boolean): void {
    const terminal = this.terminals.get(id);
    if (!terminal) return;

    terminal.isClaudeMode = true;
    const dir = cwd || terminal.cwd;
    const separator = terminal.shellType === 'powershell' ? '; ' : ' && ';
    const claudeCmd = skipPermissions ? 'claude --dangerously-skip-permissions' : 'claude';
    // Use "cd /d" on cmd.exe to handle drive letter changes on Windows
    const cdCmd = terminal.shellType === 'cmd' ? `cd /d "${dir}"` : `cd "${dir}"`;
    const command = `${cdCmd}${separator}${claudeCmd}\r`;
    PtyManager.writeToPty(terminal, command);

    const win = this.getWindow();
    if (win && !win.isDestroyed()) {
      win.webContents.send(IPC_CHANNELS.TERMINAL_TITLE_CHANGE, id, 'Claude Code');
    }
  }

  resumeClaude(id: string): void {
    const terminal = this.terminals.get(id);
    if (!terminal) return;

    terminal.isClaudeMode = true;
    const command = 'claude --continue\r';
    PtyManager.writeToPty(terminal, command);
  }

  setTitle(id: string, title: string): void {
    const terminal = this.terminals.get(id);
    if (terminal) {
      terminal.title = title;
    }
  }

  getActiveTerminalIds(): string[] {
    return Array.from(this.terminals.keys());
  }

  isClaudeMode(id: string): boolean {
    return this.terminals.get(id)?.isClaudeMode ?? false;
  }

  private handleTerminalData(terminal: TerminalProcess, data: string): void {
    if (terminal.isClaudeMode) {
      // Detect Claude exit
      const exitPatterns = [/Goodbye!?\s*$/im, /Session ended/i];
      if (exitPatterns.some((p) => p.test(data))) {
        terminal.isClaudeMode = false;
        const win = this.getWindow();
        if (win && !win.isDestroyed()) {
          win.webContents.send(IPC_CHANNELS.TERMINAL_CLAUDE_BUSY, terminal.id, false);
        }
      }

      // Extract cost/token data from Claude output
      const costData = extractCostFromOutput(data);
      if (costData) {
        const win = this.getWindow();
        if (win && !win.isDestroyed()) {
          win.webContents.send(IPC_CHANNELS.USAGE_COST_UPDATE, {
            terminalId: terminal.id,
            cost: costData.cost,
            inputTokens: costData.inputTokens,
            outputTokens: costData.outputTokens,
            timestamp: new Date(),
          });
        }
      }
    }
  }
}
