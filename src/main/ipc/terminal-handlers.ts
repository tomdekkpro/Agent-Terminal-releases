import type { IpcMain } from 'electron';
import type { TerminalManager } from '../terminal/terminal-manager';
import type { WindowGetter } from '../terminal/types';
import { IPC_CHANNELS } from '../../shared/constants';
import { loadTerminalState, saveTerminalState, loadOutputBuffers, type SavedTerminalState } from '../terminal/terminal-state-store';

export function registerTerminalHandlers(
  ipcMain: IpcMain,
  terminalManager: TerminalManager,
  _getWindow: WindowGetter
): void {
  ipcMain.handle(IPC_CHANNELS.TERMINAL_CREATE, async (_event, options) => {
    return terminalManager.create(options);
  });

  ipcMain.handle(IPC_CHANNELS.TERMINAL_DESTROY, async (_event, id: string) => {
    return terminalManager.destroy(id);
  });

  ipcMain.on(IPC_CHANNELS.TERMINAL_WRITE, (_event, id: string, data: string) => {
    terminalManager.write(id, data);
  });

  ipcMain.on(IPC_CHANNELS.TERMINAL_RESIZE, (_event, id: string, cols: number, rows: number) => {
    terminalManager.resize(id, cols, rows);
  });

  ipcMain.handle(IPC_CHANNELS.TERMINAL_INVOKE_CLAUDE, async (_event, id: string, cwd?: string, skipPermissions?: boolean) => {
    terminalManager.invokeClaude(id, cwd, skipPermissions);
    return { success: true };
  });

  ipcMain.handle(IPC_CHANNELS.TERMINAL_RESUME_CLAUDE, async (_event, id: string, sessionId?: string, cwd?: string) => {
    terminalManager.resumeClaude(id, sessionId, cwd);
    return { success: true };
  });

  // Terminal state persistence
  ipcMain.handle(IPC_CHANNELS.TERMINAL_STATE_LOAD, async () => {
    return { success: true, data: loadTerminalState() };
  });

  ipcMain.handle(IPC_CHANNELS.TERMINAL_BUFFERS_LOAD, async () => {
    return { success: true, data: loadOutputBuffers() };
  });

  ipcMain.handle(IPC_CHANNELS.TERMINAL_STATE_SAVE, async (_event, state: SavedTerminalState) => {
    saveTerminalState(state);
    return { success: true };
  });

  // Synchronous save for beforeunload (ensures state is flushed before renderer is destroyed)
  ipcMain.on(IPC_CHANNELS.TERMINAL_STATE_SAVE_SYNC, (event, state: SavedTerminalState) => {
    saveTerminalState(state);
    event.returnValue = true;
  });
}
