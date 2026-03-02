import { useState, useEffect, useCallback } from 'react';
import { Sidebar } from './components/layout/Sidebar';
import { ProjectTabBar } from './components/layout/ProjectTabBar';
import { TerminalView } from './components/terminal/TerminalView';
import { TasksView } from './components/tasks';
import { SettingsView } from './components/settings/SettingsView';
import { useGlobalTerminalListeners } from './hooks/useGlobalTerminalListeners';
import { useProjectStore } from './stores/project-store';
import { useSettingsStore } from './stores/settings-store';
import { useTerminalStore } from './stores/terminal-store';
import { InsightsView } from './components/insights';
import { UpdateNotification } from './components/updates/UpdateNotification';

export type ViewType = 'terminals' | 'tasks' | 'insights' | 'settings';

export default function App() {
  const [activeView, setActiveView] = useState<ViewType>('terminals');
  const loadProjects = useProjectStore((s) => s.loadProjects);
  const activeProjectId = useProjectStore((s) => s.activeProjectId);
  const loadSettings = useSettingsStore((s) => s.loadSettings);
  const restoreState = useTerminalStore((s) => s.restoreState);

  useGlobalTerminalListeners();

  // Keyboard shortcuts
  const openProjectIds = useProjectStore((s) => s.openProjectIds);
  const tabOrder = useProjectStore((s) => s.tabOrder);
  const setActiveProject = useProjectStore((s) => s.setActiveProject);

  useEffect(() => {
    const viewKeys: Record<string, ViewType> = {
      t: 'terminals',
      k: 'tasks',
      i: 'insights',
      s: 'settings',
    };
    const handler = (e: KeyboardEvent) => {
      if (!e.ctrlKey || e.shiftKey || e.altKey || e.metaKey) return;
      const key = e.key.toLowerCase();

      // Ctrl+T/K/S — switch views
      const view = viewKeys[key];
      if (view) {
        e.preventDefault();
        setActiveView(view);
        return;
      }

      // Ctrl+N — new terminal
      if (key === 'n') {
        e.preventDefault();
        setActiveView('terminals');
        window.dispatchEvent(new CustomEvent('agent-terminal:new-terminal'));
        return;
      }

      // Ctrl+1..9 — switch project tabs
      const digit = parseInt(e.key, 10);
      if (digit >= 1 && digit <= 9) {
        e.preventDefault();
        const orderedIds = tabOrder.length > 0 ? tabOrder : openProjectIds;
        const targetId = orderedIds[digit - 1];
        if (targetId) {
          setActiveView('terminals');
          setActiveProject(targetId);
        }
      }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [openProjectIds, tabOrder, setActiveProject]);

  const restoreTerminals = useCallback(async () => {
    const restored = await restoreState();
    // Track which agents have been continued (only one --continue per agent)
    const continuedAgents = new Set<string>();
    // Create PTYs for each restored terminal
    for (const terminal of restored) {
      try {
        await window.electronAPI.createTerminal({
          id: terminal.id,
          cwd: terminal.cwd || '',
          cols: 80,
          rows: 24,
        });
        if (terminal.isClaudeMode) {
          const agentId = terminal.agentProvider || 'claude';
          const resumeCwd = terminal.claudeCwd || terminal.cwd;

          if (agentId === 'claude') {
            // Claude supports per-session resume
            await window.electronAPI.resumeAgent(terminal.id, 'claude', {
              sessionId: terminal.claudeSessionId,
              cwd: resumeCwd,
            });
          } else {
            // Other agents: resume the first one with --continue, reset the rest
            if (!continuedAgents.has(agentId)) {
              await window.electronAPI.resumeAgent(terminal.id, agentId, { cwd: terminal.cwd });
              continuedAgents.add(agentId);
            } else {
              useTerminalStore.getState().setClaudeMode(terminal.id, false);
            }
          }
        }
      } catch {
        useTerminalStore.getState().setTerminalStatus(terminal.id, 'exited');
      }
    }
  }, [restoreState]);

  useEffect(() => {
    loadProjects();
    loadSettings();
    restoreTerminals();
  }, [loadProjects, loadSettings, restoreTerminals]);

  return (
    <div className="flex h-screen bg-[var(--bg-primary)]">
      <Sidebar activeView={activeView} onViewChange={setActiveView} />
      <main className="flex-1 flex flex-col overflow-hidden">
        {activeView === 'terminals' && (
          <>
            <ProjectTabBar />
            <TerminalView projectId={activeProjectId ?? undefined} />
          </>
        )}
        {activeView === 'tasks' && <TasksView />}
        {activeView === 'insights' && <InsightsView />}
        {activeView === 'settings' && <SettingsView />}
      </main>
      <UpdateNotification />
    </div>
  );
}
