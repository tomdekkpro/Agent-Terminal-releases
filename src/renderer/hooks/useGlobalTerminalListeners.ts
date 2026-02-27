import { useEffect } from 'react';
import { useTerminalStore, flushTerminalStateSync } from '../stores/terminal-store';

/** Sync all running/paused timers to ClickUp (fire-and-forget) */
function syncAllTimers() {
  const terminals = useTerminalStore.getState().terminals;
  for (const t of terminals) {
    if (!t.timeTracking || !t.clickUpTask) continue;
    const { startedAt, elapsed } = t.timeTracking;
    const total = elapsed + (startedAt ? Date.now() - startedAt : 0);
    if (total <= 0) continue;
    const start = startedAt || Date.now() - total;
    // Use sendBeacon for reliability during unload, fall back to invoke
    try {
      window.electronAPI.postClickUpTimeEntry(t.clickUpTask.id, start, total);
    } catch { /* best effort */ }
  }
}

export function useGlobalTerminalListeners() {
  const updateTerminal = useTerminalStore((s) => s.updateTerminal);
  const setTerminalStatus = useTerminalStore((s) => s.setTerminalStatus);

  useEffect(() => {
    const cleanups: (() => void)[] = [];

    // Listen for terminal output
    cleanups.push(
      window.electronAPI.onTerminalOutput((id, data) => {
        const { writeToTerminal } = useTerminalStore.getState();
        writeToTerminal(id, data);
      })
    );

    // Listen for terminal exit
    cleanups.push(
      window.electronAPI.onTerminalExit((id, _exitCode) => {
        setTerminalStatus(id, 'exited');
      })
    );

    // Listen for title changes
    cleanups.push(
      window.electronAPI.onTerminalTitleChange((id, title) => {
        updateTerminal(id, { title });
      })
    );

    // Listen for Claude busy state
    cleanups.push(
      window.electronAPI.onTerminalClaudeBusy((id, isBusy) => {
        updateTerminal(id, { isClaudeBusy: isBusy });
      })
    );

    // Listen for Claude session ID detection
    cleanups.push(
      window.electronAPI.onTerminalClaudeSession((id, sessionId) => {
        updateTerminal(id, { claudeSessionId: sessionId });
      })
    );

    // Flush terminal state and sync timers to ClickUp before app closes
    const handleBeforeUnload = () => {
      flushTerminalStateSync();
      syncAllTimers();
    };
    window.addEventListener('beforeunload', handleBeforeUnload);
    cleanups.push(() => window.removeEventListener('beforeunload', handleBeforeUnload));

    return () => cleanups.forEach((c) => c());
  }, [updateTerminal, setTerminalStatus]);
}
