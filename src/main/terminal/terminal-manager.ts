import * as os from 'os';
import { execSync } from 'child_process';
import { readdirSync, statSync, existsSync } from 'fs';
import { join } from 'path';
import type { TerminalCreateOptions } from '../../shared/types';
import type { TerminalProcess, WindowGetter, TerminalOperationResult } from './types';
import * as PtyManager from './pty-manager';
import { IPC_CHANNELS } from '../../shared/constants';
import { debugLog, debugError } from '../../shared/utils';
import { extractCostFromOutput } from '../usage/usage-service';

/** Check if a CLI command is available on the system PATH */
function isCommandAvailable(command: string): boolean {
  try {
    const check = process.platform === 'win32' ? `where ${command}` : `which ${command}`;
    execSync(check, { stdio: 'ignore' });
    return true;
  } catch {
    return false;
  }
}

/** Encode a project path to match Claude Code's project directory naming */
function encodeProjectPath(cwd: string): string {
  return cwd.replace(/[:/\\]/g, '-');
}

/** Get Claude Code's project data directory for a given cwd */
function getClaudeProjectDir(cwd: string): string {
  return join(os.homedir(), '.claude', 'projects', encodeProjectPath(cwd));
}

/** Build the cd command, clear command, and separator for a given shell type */
function buildShellCommand(
  shellType: string | undefined,
  dir: string,
): { cdCmd: string; clearCmd: string; separator: string } {
  if (shellType === 'powershell') {
    return { cdCmd: `cd "${dir}"`, clearCmd: 'cls', separator: '; ' };
  }
  if (shellType === 'bash') {
    // Git Bash / bash.exe on Windows: POSIX-style cd, no /d flag needed
    return { cdCmd: `cd "${dir}"`, clearCmd: 'clear', separator: ' && ' };
  }
  // cmd.exe (default): use /d to handle drive-letter changes
  return { cdCmd: `cd /d "${dir}"`, clearCmd: 'cls', separator: ' && ' };
}

/** Get snapshot of existing session files with their mtimes */
function getSessionSnapshot(claudeDir: string): Map<string, number> {
  const result = new Map<string, number>();
  try {
    if (!existsSync(claudeDir)) return result;
    for (const f of readdirSync(claudeDir)) {
      if (!f.endsWith('.jsonl')) continue;
      result.set(f, statSync(join(claudeDir, f)).mtimeMs);
    }
  } catch { /* ignore */ }
  return result;
}

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
        (_term) => { }
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

  invokeClaude(id: string, cwd?: string, skipPermissions?: boolean, model?: string): { success: boolean; error?: string } {
    const terminal = this.terminals.get(id);
    if (!terminal) return { success: false, error: 'Terminal not found' };

    if (!isCommandAvailable('claude')) {
      return { success: false, error: 'Claude Code CLI is not installed. Install it with: npm install -g @anthropic-ai/claude-code' };
    }

    terminal.isClaudeMode = true;
    terminal.copilotProvider = 'claude';
    const dir = cwd || terminal.cwd;
    terminal.claudeCwd = dir;

    // Snapshot existing sessions before Claude starts (for session ID detection)
    const claudeDir = getClaudeProjectDir(dir);
    const preSnapshot = getSessionSnapshot(claudeDir);

    // Build cd + clear + claude command with correct separator for each shell type
    const { cdCmd, clearCmd, separator } = buildShellCommand(terminal.shellType, dir);
    let claudeCmd = skipPermissions ? 'claude --dangerously-skip-permissions' : 'claude';
    if (model) claudeCmd += ` --model ${model}`;
    const command = `${cdCmd}${separator}${clearCmd}${separator}${claudeCmd}\r`;
    PtyManager.writeToPty(terminal, command);

    const win = this.getWindow();
    if (win && !win.isDestroyed()) {
      win.webContents.send(IPC_CHANNELS.TERMINAL_TITLE_CHANGE, id, 'Claude Code');
    }

    // Detect which session Claude opened/created
    this.detectSessionId(terminal, claudeDir, preSnapshot);
    return { success: true };
  }

  resumeClaude(id: string, sessionId?: string, cwd?: string): void {
    const terminal = this.terminals.get(id);
    if (!terminal) return;

    terminal.isClaudeMode = true;
    const dir = cwd || terminal.claudeCwd || terminal.cwd;
    terminal.claudeCwd = dir;

    // Build resume command with clear to hide the shell echo before Claude starts
    const { cdCmd, clearCmd, separator } = buildShellCommand(terminal.shellType, dir);
    const claudeCmd = sessionId
      ? `claude --resume "${sessionId}"`
      : 'claude --continue';
    const command = `${cdCmd}${separator}${clearCmd}${separator}${claudeCmd}\r`;
    PtyManager.writeToPty(terminal, command);

    const win = this.getWindow();
    if (win && !win.isDestroyed()) {
      win.webContents.send(IPC_CHANNELS.TERMINAL_TITLE_CHANGE, id, 'Claude Code');
    }
  }

  invokeCopilot(id: string, cwd?: string, model?: string): { success: boolean; error?: string } {
    const terminal = this.terminals.get(id);
    if (!terminal) return { success: false, error: 'Terminal not found' };

    if (!isCommandAvailable('copilot')) {
      return { success: false, error: 'GitHub Copilot CLI is not installed. Install it with: npm install -g @github/copilot' };
    }

    terminal.isClaudeMode = true;
    terminal.copilotProvider = 'copilot';
    const dir = cwd || terminal.cwd;

    const { cdCmd, clearCmd, separator } = buildShellCommand(terminal.shellType, dir);
    const copilotCmd = model ? `copilot --model ${model}` : 'copilot';
    const command = `${cdCmd}${separator}${clearCmd}${separator}${copilotCmd}\r`;
    PtyManager.writeToPty(terminal, command);

    const win = this.getWindow();
    if (win && !win.isDestroyed()) {
      win.webContents.send(IPC_CHANNELS.TERMINAL_TITLE_CHANGE, id, 'GitHub Copilot');
    }
    return { success: true };
  }

  resumeCopilot(id: string, cwd?: string): void {
    const terminal = this.terminals.get(id);
    if (!terminal) return;

    terminal.isClaudeMode = true;
    terminal.copilotProvider = 'copilot';
    const dir = cwd || terminal.cwd;

    const { cdCmd, clearCmd, separator } = buildShellCommand(terminal.shellType, dir);
    const command = `${cdCmd}${separator}${clearCmd}${separator}copilot --continue\r`;
    PtyManager.writeToPty(terminal, command);

    const win = this.getWindow();
    if (win && !win.isDestroyed()) {
      win.webContents.send(IPC_CHANNELS.TERMINAL_TITLE_CHANGE, id, 'GitHub Copilot');
    }
  }

  /** Poll the Claude project directory to detect which session file was created/modified */
  private detectSessionId(
    terminal: TerminalProcess,
    claudeDir: string,
    preSnapshot: Map<string, number>,
  ): void {
    let attempts = 0;
    const MAX_ATTEMPTS = 45; // ~47s total (2s initial delay + 1s per poll)

    const poll = () => {
      attempts++;
      if (attempts > MAX_ATTEMPTS || terminal.hasExited || terminal.claudeSessionId) return;

      try {
        if (!existsSync(claudeDir)) {
          setTimeout(poll, 1000);
          return;
        }

        for (const f of readdirSync(claudeDir)) {
          if (!f.endsWith('.jsonl')) continue;
          const mtime = statSync(join(claudeDir, f)).mtimeMs;
          const prevMtime = preSnapshot.get(f);

          // New file or file modified since snapshot
          if (prevMtime === undefined || mtime > prevMtime + 500) {
            terminal.claudeSessionId = f.replace('.jsonl', '');
            debugLog('[TerminalManager] Detected Claude session:', terminal.claudeSessionId, 'for terminal:', terminal.id);
            // Notify renderer so it can save in store
            const win = this.getWindow();
            if (win && !win.isDestroyed()) {
              win.webContents.send(IPC_CHANNELS.TERMINAL_CLAUDE_SESSION, terminal.id, terminal.claudeSessionId);
            }
            return;
          }
        }
      } catch { /* ignore */ }

      setTimeout(poll, 1000);
    };

    setTimeout(poll, 2000);
  }

  setTitle(id: string, title: string): void {
    const terminal = this.terminals.get(id);
    if (terminal) {
      terminal.title = title;
    }
  }

  getOutputBuffers(): Record<string, string> {
    const buffers: Record<string, string> = {};
    this.terminals.forEach((terminal, id) => {
      if (terminal.outputBuffer) {
        buffers[id] = terminal.outputBuffer;
      }
    });
    return buffers;
  }

  getActiveTerminalIds(): string[] {
    return Array.from(this.terminals.keys());
  }

  isClaudeMode(id: string): boolean {
    return this.terminals.get(id)?.isClaudeMode ?? false;
  }

  private handleTerminalData(terminal: TerminalProcess, data: string): void {
    if (terminal.isClaudeMode && terminal.copilotProvider !== 'copilot') {
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
