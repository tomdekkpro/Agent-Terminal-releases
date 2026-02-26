import { useCallback, useState, useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';
import {
  Plus, X, Bot, Terminal as TerminalIcon, Search,
  Columns2, ChevronDown, GitBranch, GitMerge, GitPullRequest,
  ArrowLeft, FolderGit2, Folder, Upload, Download, RefreshCw,
} from 'lucide-react';
import { useTerminalStore, type TerminalClickUpTask } from '../../stores/terminal-store';
import { useSettingsStore } from '../../stores/settings-store';
import { useProjectStore } from '../../stores/project-store';
import { TerminalPanel } from './TerminalPanel';
import { UsageIndicator } from '../usage/UsageIndicator';
import { cn } from '../../../shared/utils';
import type { ClickUpTask } from '../../../shared/types';

/** Task Picker Modal - shown when creating terminal with ClickUp task */
function TaskPickerModal({
  onSelect,
  onCancel,
  onPlain,
}: {
  onSelect: (task: ClickUpTask, useWorktree: boolean) => void;
  onCancel: () => void;
  onPlain: () => void;
}) {
  const [tasks, setTasks] = useState<ClickUpTask[]>([]);
  const [loading, setLoading] = useState(true);
  const [searching, setSearching] = useState(false);
  const [search, setSearch] = useState('');
  const [selectedTask, setSelectedTask] = useState<ClickUpTask | null>(null);
  const [includeClosed, setIncludeClosed] = useState(false);
  const searchTimerRef = useRef<ReturnType<typeof setTimeout>>();

  const doSearch = useCallback(async (query: string, closed: boolean) => {
    const result = await window.electronAPI.searchClickUpTasks(
      query,
      { includeClosed: closed }
    );
    if (result.success && result.data) setTasks(result.data);
  }, []);

  useEffect(() => {
    doSearch('', includeClosed)
      .catch(() => {})
      .finally(() => setLoading(false));
    return () => {
      if (searchTimerRef.current) clearTimeout(searchTimerRef.current);
    };
  }, []);

  const handleSearchChange = useCallback((value: string) => {
    setSearch(value);
    if (searchTimerRef.current) clearTimeout(searchTimerRef.current);

    searchTimerRef.current = setTimeout(async () => {
      setSearching(true);
      try {
        await doSearch(value, includeClosed);
      } catch {
        // Keep existing tasks on error
      } finally {
        setSearching(false);
      }
    }, 300);
  }, [doSearch, includeClosed]);

  // Re-fetch when includeClosed changes
  useEffect(() => {
    setSearching(true);
    doSearch(search, includeClosed)
      .catch(() => {})
      .finally(() => setSearching(false));
  }, [includeClosed]);

  const filtered = tasks;

  // Step 2: task selected — choose worktree or current branch
  if (selectedTask) {
    return (
      <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60">
        <div className="w-[440px] bg-[var(--bg-card)] border border-[var(--border)] rounded-xl shadow-2xl flex flex-col overflow-hidden">
          <div className="p-4 border-b border-[var(--border)]">
            <div className="flex items-center gap-2 mb-2">
              <button
                onClick={() => setSelectedTask(null)}
                className="w-6 h-6 rounded flex items-center justify-center hover:bg-[var(--bg-tertiary)] text-[var(--text-muted)] transition-colors"
              >
                <ArrowLeft className="w-3.5 h-3.5" />
              </button>
              <h2 className="text-sm font-semibold text-[var(--text-primary)]">
                Working Directory
              </h2>
            </div>
            <div className="flex items-center gap-2 mt-2">
              <div
                className="w-2 h-2 rounded-full shrink-0"
                style={{ backgroundColor: selectedTask.status.color }}
              />
              <span className="text-xs text-[var(--text-secondary)] truncate">
                {selectedTask.custom_id && <span className="font-mono mr-1.5">{selectedTask.custom_id}</span>}
                {selectedTask.name}
              </span>
            </div>
          </div>

          <div className="p-3 space-y-2">
            <button
              onClick={() => onSelect(selectedTask, true)}
              className="w-full flex items-start gap-3 p-3 rounded-lg hover:bg-[var(--bg-tertiary)] transition-colors text-left border border-[var(--border)]"
            >
              <FolderGit2 className="w-5 h-5 shrink-0 text-[var(--accent)] mt-0.5" />
              <div>
                <div className="text-sm font-medium text-[var(--text-primary)]">New Worktree</div>
                <div className="text-[11px] text-[var(--text-muted)] mt-0.5">
                  Create an isolated branch for this task. Changes stay separate from main.
                </div>
              </div>
            </button>
            <button
              onClick={() => onSelect(selectedTask, false)}
              className="w-full flex items-start gap-3 p-3 rounded-lg hover:bg-[var(--bg-tertiary)] transition-colors text-left border border-[var(--border)]"
            >
              <Folder className="w-5 h-5 shrink-0 text-amber-400 mt-0.5" />
              <div>
                <div className="text-sm font-medium text-[var(--text-primary)]">Current Branch</div>
                <div className="text-[11px] text-[var(--text-muted)] mt-0.5">
                  Work directly on the current branch in the project directory.
                </div>
              </div>
            </button>
          </div>

          <div className="p-3 border-t border-[var(--border)] flex items-center justify-end">
            <button
              onClick={onCancel}
              className="px-3 py-1.5 rounded-md text-xs text-[var(--text-muted)] hover:bg-[var(--bg-tertiary)] transition-colors"
            >
              Cancel
            </button>
          </div>
        </div>
      </div>
    );
  }

  // Step 1: pick a task
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60">
      <div className="w-[480px] max-h-[70vh] bg-[var(--bg-card)] border border-[var(--border)] rounded-xl shadow-2xl flex flex-col overflow-hidden">
        <div className="p-4 border-b border-[var(--border)]">
          <h2 className="text-sm font-semibold text-[var(--text-primary)] mb-3">
            Start Terminal with Task
          </h2>
          <div className="relative">
            {searching ? (
              <RefreshCw className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-[var(--accent)] animate-spin" />
            ) : (
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-[var(--text-muted)]" />
            )}
            <input
              type="text"
              autoFocus
              value={search}
              onChange={(e) => handleSearchChange(e.target.value)}
              placeholder="Search by title or task ID..."
              className="w-full pl-9 pr-4 py-2 bg-[var(--bg-secondary)] border border-[var(--border)] rounded-lg text-sm text-[var(--text-primary)] placeholder:text-[var(--text-muted)] focus:outline-none focus:border-[var(--accent)]"
            />
          </div>
          <label className="flex items-center gap-2 mt-2 cursor-pointer">
            <input
              type="checkbox"
              checked={includeClosed}
              onChange={(e) => setIncludeClosed(e.target.checked)}
              className="rounded border-[var(--border)] accent-[var(--accent)]"
            />
            <span className="text-[11px] text-[var(--text-muted)]">Include closed tasks</span>
          </label>
        </div>
        <div className="flex-1 overflow-y-auto p-2">
          {loading ? (
            <div className="flex items-center justify-center h-24 text-[var(--text-muted)]">
              <span className="text-sm">Loading tasks...</span>
            </div>
          ) : filtered.length === 0 ? (
            <div className="flex items-center justify-center h-24 text-[var(--text-muted)]">
              <span className="text-sm">No tasks found</span>
            </div>
          ) : (
            filtered.map((task) => (
              <button
                key={task.id}
                onClick={() => setSelectedTask(task)}
                className="w-full text-left p-3 rounded-lg hover:bg-[var(--bg-tertiary)] transition-colors"
              >
                <div className="flex items-center gap-3">
                  <div
                    className="w-2 h-2 rounded-full shrink-0"
                    style={{ backgroundColor: task.status.color }}
                  />
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      {task.custom_id && (
                        <span className="text-[10px] font-mono text-[var(--text-muted)] shrink-0">
                          {task.custom_id}
                        </span>
                      )}
                      <span className="text-sm text-[var(--text-primary)] truncate">
                        {task.name}
                      </span>
                    </div>
                    <div className="flex items-center gap-2 mt-0.5">
                      <span
                        className="text-[10px] px-1.5 py-0.5 rounded-full"
                        style={{
                          backgroundColor: `${task.status.color}20`,
                          color: task.status.color,
                        }}
                      >
                        {task.status.status}
                      </span>
                      {task.priority && (
                        <span className="text-[10px] text-[var(--text-muted)]">
                          P{task.priority.id}
                        </span>
                      )}
                    </div>
                  </div>
                </div>
              </button>
            ))
          )}
        </div>
        <div className="p-3 border-t border-[var(--border)] flex items-center justify-between">
          <button
            onClick={onPlain}
            className="px-3 py-1.5 rounded-md text-xs text-[var(--text-secondary)] hover:bg-[var(--bg-tertiary)] transition-colors"
          >
            Plain Terminal (no task)
          </button>
          <button
            onClick={onCancel}
            className="px-3 py-1.5 rounded-md text-xs text-[var(--text-muted)] hover:bg-[var(--bg-tertiary)] transition-colors"
          >
            Cancel
          </button>
        </div>
      </div>
    </div>
  );
}

/** Complete Task Modal - pick branch then choose Merge or Create PR */
function CompleteTaskModal({
  taskBranch,
  taskName,
  projectPath,
  isWorktree,
  onMerge: onMergeAction,
  onCreatePR,
  onPush,
  onCancel,
}: {
  taskBranch: string;
  taskName?: string;
  projectPath: string;
  isWorktree: boolean;
  onMerge: (targetBranch: string) => void;
  onCreatePR: (targetBranch: string, title: string, body: string) => void;
  onPush: () => void;
  onCancel: () => void;
}) {
  const [branches, setBranches] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [selectedBranch, setSelectedBranch] = useState<string | null>(null);
  const [prTitle, setPrTitle] = useState(taskName ? `[${taskBranch}] ${taskName}` : taskBranch);
  const [prBody, setPrBody] = useState('');

  useEffect(() => {
    window.electronAPI
      .listBranches(projectPath)
      .then((result: any) => {
        if (result.success && result.branches) {
          const others = (result.branches as string[]).filter((b) => b !== taskBranch);
          const priority = ['main', 'master', 'develop', 'dev'];
          others.sort((a, b) => {
            const ai = priority.indexOf(a);
            const bi = priority.indexOf(b);
            if (ai !== -1 && bi !== -1) return ai - bi;
            if (ai !== -1) return -1;
            if (bi !== -1) return 1;
            return a.localeCompare(b);
          });
          setBranches(others);
        }
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [projectPath, taskBranch]);

  const filtered = branches.filter((b) => {
    if (!search) return true;
    return b.toLowerCase().includes(search.toLowerCase());
  });

  // Step 2: branch selected — show action choices
  if (selectedBranch) {
    return (
      <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60">
        <div className="w-[480px] bg-[var(--bg-card)] border border-[var(--border)] rounded-xl shadow-2xl flex flex-col overflow-hidden">
          <div className="p-4 border-b border-[var(--border)]">
            <div className="flex items-center gap-2 mb-2">
              <button
                onClick={() => setSelectedBranch(null)}
                className="w-6 h-6 rounded flex items-center justify-center hover:bg-[var(--bg-tertiary)] text-[var(--text-muted)] transition-colors"
              >
                <ArrowLeft className="w-3.5 h-3.5" />
              </button>
              <h2 className="text-sm font-semibold text-[var(--text-primary)]">
                Complete Task
              </h2>
            </div>
            <p className="text-[11px] text-[var(--text-muted)]">
              <span className="font-mono text-[var(--accent)]">{taskBranch}</span>
              {' → '}
              <span className="font-mono text-emerald-400">{selectedBranch}</span>
            </p>
          </div>

          <div className="p-4 space-y-3">
            {/* PR title & body */}
            <div>
              <label className="text-[11px] text-[var(--text-muted)] mb-1 block">Title</label>
              <input
                type="text"
                value={prTitle}
                onChange={(e) => setPrTitle(e.target.value)}
                className="w-full px-3 py-2 bg-[var(--bg-secondary)] border border-[var(--border)] rounded-lg text-sm text-[var(--text-primary)] placeholder:text-[var(--text-muted)] focus:outline-none focus:border-[var(--accent)]"
              />
            </div>
            <div>
              <label className="text-[11px] text-[var(--text-muted)] mb-1 block">Description (optional)</label>
              <textarea
                value={prBody}
                onChange={(e) => setPrBody(e.target.value)}
                rows={3}
                placeholder="PR description..."
                className="w-full px-3 py-2 bg-[var(--bg-secondary)] border border-[var(--border)] rounded-lg text-sm text-[var(--text-primary)] placeholder:text-[var(--text-muted)] focus:outline-none focus:border-[var(--accent)] resize-none"
              />
            </div>
          </div>

          <div className="p-4 border-t border-[var(--border)] flex items-center gap-2 justify-end">
            <button
              onClick={onCancel}
              className="px-3 py-2 rounded-lg text-xs text-[var(--text-muted)] hover:bg-[var(--bg-tertiary)] transition-colors"
            >
              Cancel
            </button>
            {isWorktree && (
              <button
                onClick={() => onMergeAction(selectedBranch)}
                className="flex items-center gap-2 px-4 py-2 rounded-lg text-xs bg-emerald-500/20 text-emerald-400 hover:bg-emerald-500/30 transition-colors"
              >
                <GitMerge className="w-3.5 h-3.5" />
                Merge Locally
              </button>
            )}
            <button
              onClick={() => onCreatePR(selectedBranch, prTitle, prBody)}
              className="flex items-center gap-2 px-4 py-2 rounded-lg text-xs bg-[var(--accent)]/20 text-[var(--accent)] hover:bg-[var(--accent)]/30 transition-colors"
            >
              <GitPullRequest className="w-3.5 h-3.5" />
              Create PR
            </button>
          </div>
        </div>
      </div>
    );
  }

  // Step 1: pick target branch
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60">
      <div className="w-[420px] max-h-[60vh] bg-[var(--bg-card)] border border-[var(--border)] rounded-xl shadow-2xl flex flex-col overflow-hidden">
        <div className="p-4 border-b border-[var(--border)]">
          <h2 className="text-sm font-semibold text-[var(--text-primary)] mb-1">
            Complete Task
          </h2>
          <p className="text-[11px] text-[var(--text-muted)] mb-3">
            Select target branch for <span className="font-mono text-[var(--accent)]">{taskBranch}</span>
          </p>
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-[var(--text-muted)]" />
            <input
              type="text"
              autoFocus
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search branches..."
              className="w-full pl-9 pr-4 py-2 bg-[var(--bg-secondary)] border border-[var(--border)] rounded-lg text-sm text-[var(--text-primary)] placeholder:text-[var(--text-muted)] focus:outline-none focus:border-[var(--accent)]"
            />
          </div>
        </div>
        <div className="flex-1 overflow-y-auto p-2">
          {loading ? (
            <div className="flex items-center justify-center h-20 text-[var(--text-muted)]">
              <span className="text-sm">Loading branches...</span>
            </div>
          ) : filtered.length === 0 ? (
            <div className="flex items-center justify-center h-20 text-[var(--text-muted)]">
              <span className="text-sm">No branches found</span>
            </div>
          ) : (
            filtered.map((branch) => {
              const isMain = branch === 'main' || branch === 'master';
              return (
                <button
                  key={branch}
                  onClick={() => setSelectedBranch(branch)}
                  className="w-full text-left p-3 rounded-lg hover:bg-[var(--bg-tertiary)] transition-colors flex items-center gap-3"
                >
                  <GitBranch className="w-3.5 h-3.5 shrink-0 text-[var(--text-muted)]" />
                  <span className="text-sm font-mono text-[var(--text-primary)] truncate flex-1">
                    {branch}
                  </span>
                  {isMain && (
                    <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-emerald-500/20 text-emerald-400 shrink-0">
                      default
                    </span>
                  )}
                </button>
              );
            })
          )}
        </div>
        <div className="p-3 border-t border-[var(--border)] flex items-center justify-between">
          <button
            onClick={onPush}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs text-amber-400 bg-amber-500/10 hover:bg-amber-500/20 transition-colors"
            title="Push current branch to remote without creating a PR"
          >
            <Upload className="w-3 h-3" />
            Push to Remote
          </button>
          <button
            onClick={onCancel}
            className="px-3 py-1.5 rounded-md text-xs text-[var(--text-muted)] hover:bg-[var(--bg-tertiary)] transition-colors"
          >
            Cancel
          </button>
        </div>
      </div>
    </div>
  );
}

/** Grid column class based on terminal count */
function getGridClass(count: number): string {
  if (count <= 1) return 'grid-cols-1';
  if (count <= 4) return 'grid-cols-2';
  if (count <= 9) return 'grid-cols-3';
  return 'grid-cols-4';
}

interface TerminalViewProps {
  projectId?: string;
}

export function TerminalView({ projectId }: TerminalViewProps) {
  const allTerminals = useTerminalStore((s) => s.terminals);
  const activeTerminalId = useTerminalStore((s) => s.activeTerminalId);
  const activeGroupId = useTerminalStore((s) => s.activeGroupId);
  const setActiveTerminal = useTerminalStore((s) => s.setActiveTerminal);
  const setActiveGroup = useTerminalStore((s) => s.setActiveGroup);
  const addTerminal = useTerminalStore((s) => s.addTerminal);
  const splitTerminal = useTerminalStore((s) => s.splitTerminal);
  const removeTerminal = useTerminalStore((s) => s.removeTerminal);
  const removeGroup = useTerminalStore((s) => s.removeGroup);
  const canAddTerminal = useTerminalStore((s) => s.canAddTerminal);
  const settings = useSettingsStore((s) => s.settings);

  // Lazy-mount: only render TerminalPanel once a group has been active
  const [mountedGroups, setMountedGroups] = useState<Set<string>>(new Set());

  // Filter terminals by current project
  const terminals = allTerminals.filter((t) => t.projectId === projectId);

  // Derive group IDs in order
  const groupIds = (() => {
    const seen = new Set<string>();
    const result: string[] = [];
    for (const t of terminals) {
      if (!seen.has(t.groupId)) {
        seen.add(t.groupId);
        result.push(t.groupId);
      }
    }
    return result;
  })();

  // Terminals in the active group
  const activeGroupTerminals = terminals.filter((t) => t.groupId === activeGroupId);
  const isSplit = activeGroupTerminals.length > 1;

  const [showTaskPicker, setShowTaskPicker] = useState(false);
  const [taskPickerMode, setTaskPickerMode] = useState<'tab' | 'split'>('tab');
  const [showNewMenu, setShowNewMenu] = useState(false);
  const [menuPos, setMenuPos] = useState<{ top: number; left: number }>({ top: 0, left: 0 });
  const newMenuRef = useRef<HTMLDivElement>(null);
  const menuTriggerRef = useRef<HTMLButtonElement>(null);

  // Close dropdown on outside click
  useEffect(() => {
    if (!showNewMenu) return;
    const handler = (e: MouseEvent) => {
      const target = e.target as Node;
      if (
        newMenuRef.current && !newMenuRef.current.contains(target) &&
        menuTriggerRef.current && !menuTriggerRef.current.contains(target)
      ) {
        setShowNewMenu(false);
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [showNewMenu]);

  const openNewMenu = useCallback(() => {
    if (menuTriggerRef.current) {
      const rect = menuTriggerRef.current.getBoundingClientRect();
      setMenuPos({ top: rect.bottom + 4, left: rect.left });
    }
    setShowNewMenu((v) => !v);
  }, []);

  // Auto-select group from current project when switching projects
  const groupIdsKey = groupIds.join(',');
  useEffect(() => {
    if (!activeGroupId || !groupIds.includes(activeGroupId)) {
      if (groupIds.length > 0) {
        setActiveGroup(groupIds[groupIds.length - 1]);
      }
    }
  }, [projectId, groupIdsKey]);

  // Mark active group as mounted (lazy-mount for xterm stability)
  useEffect(() => {
    if (activeGroupId && !mountedGroups.has(activeGroupId)) {
      setMountedGroups((prev) => new Set(prev).add(activeGroupId));
    }
  }, [activeGroupId]);

  // Get active project path for cwd
  const activeProject = useProjectStore((s) => {
    if (!projectId) return undefined;
    return s.projects.find((p) => p.id === projectId);
  });

  // Git branch + fetch/pull state
  const [currentBranch, setCurrentBranch] = useState<string>('');
  const [fetchStatus, setFetchStatus] = useState<'idle' | 'loading' | 'success' | 'error'>('idle');
  const [pullStatus, setPullStatus] = useState<'idle' | 'loading' | 'success' | 'error'>('idle');

  // Fetch current branch for active project
  const refreshBranch = useCallback(async () => {
    if (!activeProject?.path) { setCurrentBranch(''); return; }
    try {
      const result = await window.electronAPI.listBranches(activeProject.path);
      if (result.success && result.current) setCurrentBranch(result.current);
      else setCurrentBranch('');
    } catch { setCurrentBranch(''); }
  }, [activeProject?.path]);

  useEffect(() => {
    refreshBranch();
    const interval = setInterval(refreshBranch, 15000);
    return () => clearInterval(interval);
  }, [refreshBranch]);

  const handleGitFetch = useCallback(async () => {
    if (!activeProject?.path || fetchStatus === 'loading') return;
    setFetchStatus('loading');
    try {
      const result = await window.electronAPI.gitFetch(activeProject.path);
      setFetchStatus(result.success ? 'success' : 'error');
      refreshBranch();
    } catch {
      setFetchStatus('error');
    }
    setTimeout(() => setFetchStatus('idle'), 2000);
  }, [activeProject?.path, fetchStatus, refreshBranch]);

  const handleGitPull = useCallback(async () => {
    if (!activeProject?.path || pullStatus === 'loading') return;
    setPullStatus('loading');
    try {
      const result = await window.electronAPI.gitPull(activeProject.path);
      setPullStatus(result.success ? 'success' : 'error');
      refreshBranch();
    } catch {
      setPullStatus('error');
    }
    setTimeout(() => setPullStatus('idle'), 2000);
  }, [activeProject?.path, pullStatus, refreshBranch]);

  /** Setup a terminal with task info, optionally create worktree, create PTY, and optionally start Claude */
  const setupTerminalWithTask = useCallback(
    async (terminal: { id: string }, task?: ClickUpTask, useWorktree = true) => {
      let cwd = activeProject?.path || '';

      if (task) {
        const title = `${task.custom_id || task.id} - ${task.name}`.slice(0, 40);
        const clickUpTask: TerminalClickUpTask = {
          id: task.id,
          customId: task.custom_id,
          name: task.name,
          status: task.status.status,
          statusColor: task.status.color,
          url: task.url,
        };

        if (useWorktree && activeProject?.path) {
          // Create git worktree for task isolation
          const taskSlug = task.custom_id || task.id;
          const result = await window.electronAPI.createTaskWorktree(activeProject.path, taskSlug);
          if (result.success && result.data) {
            cwd = result.data;
            useTerminalStore.getState().updateTerminal(terminal.id, {
              title,
              clickUpTask,
              cwd,
              worktreePath: result.data,
              worktreeBranch: result.branch,
            });
          } else {
            // Worktree failed (not a git repo, etc.) — use project dir
            useTerminalStore.getState().updateTerminal(terminal.id, { title, clickUpTask });
          }
        } else {
          // Use current branch / project directory
          useTerminalStore.getState().updateTerminal(terminal.id, { title, clickUpTask });
        }

        // Fetch existing tracked time from ClickUp as initial elapsed
        try {
          const timeResult = await window.electronAPI.getClickUpTimeEntries(task.id);
          if (timeResult.success && timeResult.totalMs > 0) {
            useTerminalStore.getState().updateTerminal(terminal.id, {
              timeTracking: { startedAt: null, elapsed: timeResult.totalMs },
            });
          }
        } catch { /* non-critical */ }
      }

      await window.electronAPI.createTerminal({
        id: terminal.id,
        cwd,
        cols: 80,
        rows: 24,
      });

      if (task) {
        setTimeout(async () => {
          await window.electronAPI.invokeClaude(terminal.id, cwd);
          useTerminalStore.getState().setClaudeMode(terminal.id, true);
          setTimeout(() => {
            const taskContext = buildTaskPrompt(task);
            window.electronAPI.sendTerminalInput(terminal.id, taskContext);
          }, 3000);
        }, 500);
      }
    },
    [activeProject]
  );

  /** Create a terminal in a new tab, optionally with a ClickUp task */
  const createTerminalNewTab = useCallback(
    async (task?: ClickUpTask, useWorktree = true) => {
      if (!canAddTerminal()) return;
      const terminal = addTerminal(activeProject?.path, projectId);
      if (!terminal) return;
      await setupTerminalWithTask(terminal, task, useWorktree);
    },
    [addTerminal, canAddTerminal, activeProject, projectId, setupTerminalWithTask]
  );

  /** Create a terminal in the current group (split), optionally with task */
  const createTerminalSplit = useCallback(
    async (task?: ClickUpTask, useWorktree = true) => {
      if (!canAddTerminal()) return;
      if (!activeGroupId) {
        createTerminalNewTab(task, useWorktree);
        return;
      }
      const terminal = splitTerminal(activeProject?.path, projectId);
      if (!terminal) return;
      await setupTerminalWithTask(terminal, task, useWorktree);
    },
    [splitTerminal, canAddTerminal, activeProject, projectId, activeGroupId, createTerminalNewTab, setupTerminalWithTask]
  );

  const handleNewTerminal = useCallback(() => {
    if (!canAddTerminal()) return;
    if (settings.clickupEnabled && settings.clickupApiKey) {
      setTaskPickerMode('tab');
      setShowTaskPicker(true);
    } else {
      createTerminalNewTab();
    }
  }, [canAddTerminal, settings.clickupEnabled, settings.clickupApiKey, createTerminalNewTab]);

  // Listen for Ctrl+N shortcut from App
  useEffect(() => {
    const handler = () => handleNewTerminal();
    window.addEventListener('agent-terminal:new-terminal', handler);
    return () => window.removeEventListener('agent-terminal:new-terminal', handler);
  }, [handleNewTerminal]);

  const handleNewSplit = useCallback(() => {
    if (!canAddTerminal()) return;
    if (settings.clickupEnabled && settings.clickupApiKey) {
      setTaskPickerMode('split');
      setShowTaskPicker(true);
    } else {
      createTerminalSplit();
    }
  }, [canAddTerminal, settings.clickupEnabled, settings.clickupApiKey, createTerminalSplit]);

  /** Sync timer to ClickUp for a terminal if it has a running/accumulated timer */
  const syncTimerBeforeClose = useCallback(async (terminal: { id: string; clickUpTask?: { id: string }; timeTracking?: { startedAt: number | null; elapsed: number } }) => {
    if (!terminal.timeTracking || !terminal.clickUpTask) return;
    const { startedAt, elapsed } = terminal.timeTracking;
    const total = elapsed + (startedAt ? Date.now() - startedAt : 0);
    if (total > 0 && startedAt) {
      try {
        await window.electronAPI.postClickUpTimeEntry(terminal.clickUpTask.id, startedAt, total);
      } catch { /* non-critical */ }
    } else if (total > 0 && !startedAt) {
      // Timer was paused but has accumulated time — use current time as reference
      try {
        await window.electronAPI.postClickUpTimeEntry(terminal.clickUpTask.id, Date.now() - total, total);
      } catch { /* non-critical */ }
    }
  }, []);

  const handleCloseGroup = useCallback(
    async (groupId: string, e: React.MouseEvent) => {
      e.stopPropagation();
      const groupTerminals = allTerminals.filter((t) => t.groupId === groupId);
      for (const t of groupTerminals) {
        await syncTimerBeforeClose(t);
        await window.electronAPI.destroyTerminal(t.id);
      }
      removeGroup(groupId);
    },
    [allTerminals, removeGroup, syncTimerBeforeClose]
  );

  const handleCloseTerminal = useCallback(
    async (id: string) => {
      const terminal = allTerminals.find((t) => t.id === id);
      if (terminal) await syncTimerBeforeClose(terminal);
      await window.electronAPI.destroyTerminal(id);
      removeTerminal(id);
    },
    [allTerminals, removeTerminal, syncTimerBeforeClose]
  );

  const handleInvokeClaude = useCallback(async (id: string, skipPermissions?: boolean) => {
    await window.electronAPI.invokeClaude(id, activeProject?.path, skipPermissions);
    useTerminalStore.getState().setClaudeMode(id, true);
  }, [activeProject]);

  const [mergeStatus, setMergeStatus] = useState<{ message: string; type: 'success' | 'error' } | null>(null);
  const [mergeTarget, setMergeTarget] = useState<{
    id: string;
    worktreePath?: string;
    worktreeBranch?: string;
    currentBranch?: string;
    cwd?: string;
    isWorktree: boolean;
    clickUpTask?: TerminalClickUpTask;
  } | null>(null);

  const handleMergeComplete = useCallback(async (terminal: { id: string; cwd?: string; worktreePath?: string; worktreeBranch?: string; clickUpTask?: TerminalClickUpTask }) => {
    if (!activeProject?.path) return;

    if (terminal.worktreePath && terminal.worktreeBranch) {
      // Worktree mode
      setMergeTarget({
        id: terminal.id,
        worktreePath: terminal.worktreePath,
        worktreeBranch: terminal.worktreeBranch,
        isWorktree: true,
        clickUpTask: terminal.clickUpTask,
      });
    } else if (terminal.clickUpTask) {
      // Current-branch mode — detect current branch
      const cwd = terminal.cwd || activeProject.path;
      try {
        const result = await window.electronAPI.listBranches(cwd);
        if (result.success && result.current) {
          setMergeTarget({
            id: terminal.id,
            currentBranch: result.current,
            cwd,
            isWorktree: false,
            clickUpTask: terminal.clickUpTask,
          });
        }
      } catch { /* ignore */ }
    }
  }, [activeProject]);

  /** Stop timer and sync to ClickUp */
  const stopAndSyncTimer = useCallback(async (terminalId: string, clickUpTaskId?: string) => {
    const result = useTerminalStore.getState().stopTimer(terminalId);
    if (result && result.startedAt && clickUpTaskId && result.elapsed > 0) {
      try {
        await window.electronAPI.postClickUpTimeEntry(clickUpTaskId, result.startedAt, result.elapsed);
      } catch { /* non-critical */ }
    }
  }, []);

  const executeMerge = useCallback(async (targetBranch: string) => {
    if (!mergeTarget || !mergeTarget.isWorktree || !activeProject?.path) return;
    setMergeTarget(null);

    const result = await window.electronAPI.mergeTaskBranch(
      activeProject.path,
      mergeTarget.worktreePath!,
      mergeTarget.worktreeBranch!,
      targetBranch,
    );

    if (result.success) {
      useTerminalStore.getState().updateTerminal(mergeTarget.id, {
        worktreePath: undefined,
        worktreeBranch: undefined,
        cwd: activeProject.path,
      });

      // Stop timer and sync tracked time
      await stopAndSyncTimer(mergeTarget.id, mergeTarget.clickUpTask?.id);

      if (mergeTarget.clickUpTask) {
        try {
          await window.electronAPI.updateClickUpStatus(mergeTarget.clickUpTask.id, 'complete');
        } catch { /* non-critical */ }
      }

      setMergeStatus({ message: `Merged into ${result.targetBranch} successfully`, type: 'success' });
    } else {
      setMergeStatus({ message: result.error || 'Merge failed', type: 'error' });
    }

    setTimeout(() => setMergeStatus(null), 5000);
  }, [mergeTarget, activeProject, stopAndSyncTimer]);

  /** Remove worktree and update terminal state after a successful complete action */
  const cleanupWorktree = useCallback(async (saved: NonNullable<typeof mergeTarget>) => {
    if (!saved.isWorktree || !saved.worktreePath || !activeProject?.path) return;

    try {
      await window.electronAPI.removeTaskWorktree(activeProject.path, saved.worktreePath);
    } catch { /* non-critical */ }

    useTerminalStore.getState().updateTerminal(saved.id, {
      worktreePath: undefined,
      worktreeBranch: undefined,
      cwd: activeProject.path,
    });
  }, [activeProject]);

  const executeCreatePR = useCallback(async (targetBranch: string, title: string, body: string) => {
    if (!mergeTarget || !activeProject?.path) return;
    const saved = mergeTarget;
    setMergeTarget(null);

    const taskBranch = saved.worktreeBranch || saved.currentBranch || '';
    const pushCwd = saved.worktreePath || saved.cwd || activeProject.path;

    const result = await window.electronAPI.createPR(
      activeProject.path,
      pushCwd,
      taskBranch,
      targetBranch,
      title,
      body,
    );

    if (result.success) {
      const msg = result.existing
        ? `PR already exists: ${result.prUrl}`
        : `PR created: ${result.prUrl}`;
      setMergeStatus({ message: msg, type: 'success' });

      if (result.prUrl) {
        window.electronAPI?.openExternal?.(result.prUrl);
      }

      // Stop timer and sync tracked time
      await stopAndSyncTimer(saved.id, saved.clickUpTask?.id);
      // Clean up worktree — code is on remote now
      await cleanupWorktree(saved);
    } else {
      setMergeStatus({ message: result.error || 'Failed to create PR', type: 'error' });
    }

    setTimeout(() => setMergeStatus(null), 8000);
  }, [mergeTarget, activeProject, cleanupWorktree, stopAndSyncTimer]);

  const executePush = useCallback(async () => {
    if (!mergeTarget) return;
    const saved = mergeTarget;
    setMergeTarget(null);

    const cwd = saved.cwd || saved.worktreePath || activeProject?.path || '';
    const branch = saved.currentBranch || saved.worktreeBranch;

    const result = await window.electronAPI.pushBranch(cwd, branch);

    if (result.success) {
      const msg = result.alreadyUpToDate
        ? `Branch ${result.branch} is already up to date`
        : `Pushed ${result.branch} to remote`;
      setMergeStatus({ message: msg, type: 'success' });

      // Stop timer and sync tracked time
      await stopAndSyncTimer(saved.id, saved.clickUpTask?.id);
      // Clean up worktree — code is on remote now
      await cleanupWorktree(saved);

      if (saved.clickUpTask) {
        try {
          await window.electronAPI.updateClickUpStatus(saved.clickUpTask.id, 'complete');
        } catch { /* non-critical */ }
      }
    } else {
      setMergeStatus({ message: result.error || 'Failed to push', type: 'error' });
    }

    setTimeout(() => setMergeStatus(null), 5000);
  }, [mergeTarget, activeProject, cleanupWorktree, stopAndSyncTimer]);

  return (
    <div className="flex flex-col flex-1 min-h-0 overflow-hidden">
      {/* Task picker modal */}
      {showTaskPicker && (
        <TaskPickerModal
          onSelect={(task, useWorktree) => {
            setShowTaskPicker(false);
            taskPickerMode === 'split' ? createTerminalSplit(task, useWorktree) : createTerminalNewTab(task, useWorktree);
          }}
          onPlain={() => {
            setShowTaskPicker(false);
            taskPickerMode === 'split' ? createTerminalSplit() : createTerminalNewTab();
          }}
          onCancel={() => setShowTaskPicker(false)}
        />
      )}

      {/* Complete task modal — pick branch then merge or create PR */}
      {mergeTarget && activeProject && (
        <CompleteTaskModal
          taskBranch={mergeTarget.worktreeBranch || mergeTarget.currentBranch || ''}
          taskName={mergeTarget.clickUpTask?.name}
          projectPath={mergeTarget.cwd || activeProject.path}
          isWorktree={mergeTarget.isWorktree}
          onMerge={executeMerge}
          onCreatePR={executeCreatePR}
          onPush={executePush}
          onCancel={() => setMergeTarget(null)}
        />
      )}

      {/* Header */}
      <div className="h-12 bg-[var(--bg-secondary)] border-b border-[var(--border)] flex items-center px-4 justify-between drag-region shrink-0">
        <div className="flex items-center gap-2 no-drag">
          <h1 className="text-sm font-semibold text-[var(--text-primary)]">
            {activeProject ? activeProject.name : 'Agent Terminal'}
          </h1>
          {activeProject && (
            <span className="text-[10px] text-[var(--text-muted)] truncate max-w-[300px]" title={activeProject.path}>
              {activeProject.path}
            </span>
          )}
        </div>
        <div className="flex items-center gap-2 no-drag">
          {activeProject && (
            <div className="flex items-center gap-1">
              {currentBranch && (
                <span className="flex items-center gap-1 px-2 h-7 text-[11px] text-[var(--accent)] shrink-0" title={`Branch: ${currentBranch}`}>
                  <GitBranch className="w-3 h-3" />
                  <span className="truncate max-w-[120px]">{currentBranch}</span>
                </span>
              )}
              <button
                onClick={handleGitFetch}
                disabled={fetchStatus === 'loading'}
                title="Fetch latest from remote"
                className={cn(
                  'flex items-center gap-1 px-2 h-7 rounded-md text-[11px] transition-all',
                  'hover:bg-[var(--bg-tertiary)] border border-transparent',
                  fetchStatus === 'loading' && 'opacity-60 cursor-wait',
                  fetchStatus === 'success' && 'text-green-500 border-green-500/20 bg-green-500/10',
                  fetchStatus === 'error' && 'text-red-500 border-red-500/20 bg-red-500/10',
                  fetchStatus === 'idle' && 'text-[var(--text-muted)]',
                )}
              >
                <RefreshCw className={cn('w-3 h-3', fetchStatus === 'loading' && 'animate-spin')} />
                <span>Fetch</span>
              </button>
              <button
                onClick={handleGitPull}
                disabled={pullStatus === 'loading'}
                title="Pull latest from remote"
                className={cn(
                  'flex items-center gap-1 px-2 h-7 rounded-md text-[11px] transition-all',
                  'hover:bg-[var(--bg-tertiary)] border border-transparent',
                  pullStatus === 'loading' && 'opacity-60 cursor-wait',
                  pullStatus === 'success' && 'text-green-500 border-green-500/20 bg-green-500/10',
                  pullStatus === 'error' && 'text-red-500 border-red-500/20 bg-red-500/10',
                  pullStatus === 'idle' && 'text-[var(--text-muted)]',
                )}
              >
                <Download className={cn('w-3 h-3', pullStatus === 'loading' && 'animate-bounce')} />
                <span>Pull</span>
              </button>
            </div>
          )}
          <UsageIndicator />
          <span className="text-xs text-[var(--text-muted)]">
            {terminals.filter((t) => t.status !== 'exited').length}/
            {useTerminalStore.getState().maxTerminals}
          </span>
        </div>
      </div>

      {/* Tab bar - shows groups */}
      <div className="h-10 bg-[var(--bg-secondary)] border-b border-[var(--border)] flex items-center px-2 gap-1 overflow-x-auto shrink-0">
        {groupIds.map((groupId) => {
          const groupTerminals = terminals.filter((t) => t.groupId === groupId);
          const firstTerminal = groupTerminals[0];
          if (!firstTerminal) return null;
          const isGroupSplit = groupTerminals.length > 1;
          const hasClaudeActive = groupTerminals.some((t) => t.isClaudeMode);
          const hasClaudeBusy = groupTerminals.some((t) => t.isClaudeBusy);

          return (
            <div
              key={groupId}
              onClick={() => setActiveGroup(groupId)}
              className={cn(
                'group flex items-center gap-2 px-3 h-8 rounded-md text-xs transition-all min-w-0 shrink-0 cursor-pointer',
                'hover:bg-[var(--bg-tertiary)]',
                activeGroupId === groupId
                  ? 'bg-[var(--bg-card)] text-[var(--text-primary)] border border-[var(--border)]'
                  : 'text-[var(--text-secondary)]'
              )}
            >
              {isGroupSplit ? (
                <Columns2 className="w-3.5 h-3.5 shrink-0" />
              ) : hasClaudeActive ? (
                <Bot
                  className={cn(
                    'w-3.5 h-3.5 shrink-0',
                    hasClaudeBusy && 'animate-pulse text-[var(--accent)]'
                  )}
                />
              ) : (
                <TerminalIcon className="w-3.5 h-3.5 shrink-0" />
              )}
              <span className="truncate max-w-[120px]">
                {firstTerminal.title}
                {isGroupSplit && (
                  <span className="text-[var(--text-muted)] ml-1">+{groupTerminals.length - 1}</span>
                )}
              </span>
              {firstTerminal.status === 'exited' && !isGroupSplit && (
                <span className="text-[10px] text-[var(--error)]">exited</span>
              )}
              <button
                className="w-4 h-4 shrink-0 rounded opacity-0 group-hover:opacity-100 flex items-center justify-center hover:bg-[var(--error)]/20 hover:text-[var(--error)] text-[var(--text-muted)] transition-all"
                onClick={(e) => handleCloseGroup(groupId, e)}
                title="Close tab"
              >
                <X className="w-3 h-3" />
              </button>
            </div>
          );
        })}

        {/* New terminal button with dropdown */}
        <div className="flex items-center shrink-0">
          <button
            onClick={handleNewTerminal}
            disabled={!canAddTerminal()}
            className={cn(
              'w-8 h-8 rounded-md flex items-center justify-center transition-all shrink-0',
              'hover:bg-[var(--bg-tertiary)] text-[var(--text-muted)]',
              'disabled:opacity-30 disabled:cursor-not-allowed'
            )}
            title="New Tab"
          >
            <Plus className="w-4 h-4" />
          </button>
          {activeGroupId && canAddTerminal() && (
            <button
              ref={menuTriggerRef}
              onClick={openNewMenu}
              className="w-5 h-8 rounded-md flex items-center justify-center hover:bg-[var(--bg-tertiary)] text-[var(--text-muted)] transition-all shrink-0"
              title="More options"
            >
              <ChevronDown className="w-3 h-3" />
            </button>
          )}
        </div>
        {/* Dropdown rendered via portal to escape overflow clipping */}
        {showNewMenu && createPortal(
          <div
            ref={newMenuRef}
            className="fixed z-[9999] w-48 bg-[var(--bg-card)] border border-[var(--border)] rounded-lg shadow-2xl overflow-hidden"
            style={{ top: menuPos.top, left: menuPos.left }}
          >
            <button
              onClick={() => { setShowNewMenu(false); handleNewTerminal(); }}
              className="w-full flex items-center gap-2 px-3 py-2.5 hover:bg-[var(--bg-tertiary)] text-xs text-[var(--text-secondary)]"
            >
              <Plus className="w-3.5 h-3.5" />
              <span>New Tab</span>
            </button>
            <button
              onClick={() => { setShowNewMenu(false); handleNewSplit(); }}
              className="w-full flex items-center gap-2 px-3 py-2.5 hover:bg-[var(--bg-tertiary)] text-xs text-[var(--text-secondary)]"
            >
              <Columns2 className="w-3.5 h-3.5" />
              <span>Split Terminal</span>
            </button>
          </div>,
          document.body
        )}
      </div>

      {/* Merge status notification */}
      {mergeStatus && (
        <div className={cn(
          'px-4 py-2 text-xs flex items-center justify-between shrink-0',
          mergeStatus.type === 'success'
            ? 'bg-emerald-500/20 text-emerald-400 border-b border-emerald-500/30'
            : 'bg-red-500/20 text-red-400 border-b border-red-500/30'
        )}>
          <span>{mergeStatus.message}</span>
          <button onClick={() => setMergeStatus(null)} className="hover:opacity-70">
            <X className="w-3 h-3" />
          </button>
        </div>
      )}

      {/* Terminal panels */}
      <div className="flex-1 relative min-h-0">
        {terminals.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-full text-[var(--text-muted)] gap-4">
            <TerminalIcon className="w-12 h-12 opacity-30" />
            <p className="text-sm">No terminals open</p>
            <button
              onClick={handleNewTerminal}
              className="px-4 py-2 rounded-lg bg-[var(--accent)] text-white text-sm hover:bg-[var(--accent-hover)] transition-colors"
            >
              New Terminal
            </button>
          </div>
        ) : (
          groupIds.map((groupId) => {
            // Lazy-mount: skip groups that haven't been active yet
            if (!mountedGroups.has(groupId)) return null;

            const groupTerminals = terminals.filter((t) => t.groupId === groupId);
            const isCurrentGroup = activeGroupId === groupId;
            const isGroupSplit = groupTerminals.length > 1;

            return (
              <div
                key={groupId}
                className={cn(
                  'absolute inset-0',
                  // Use visibility:hidden instead of display:none so xterm
                  // containers keep valid dimensions (prevents internal crash)
                  !isCurrentGroup && 'invisible pointer-events-none'
                )}
              >
                {isGroupSplit ? (
                  /* Grid layout for split terminals */
                  <div className={cn('grid h-full gap-1 p-1', getGridClass(groupTerminals.length))}>
                    {groupTerminals.map((terminal) => (
                      <div
                        key={terminal.id}
                        className={cn(
                          'rounded-lg overflow-hidden border min-h-0',
                          activeTerminalId === terminal.id
                            ? 'border-[var(--accent)]'
                            : 'border-[var(--border)]'
                        )}
                      >
                        <TerminalPanel
                          terminal={terminal}
                          isActive={activeTerminalId === terminal.id}
                          isSplit={true}
                          onInvokeClaude={() => handleInvokeClaude(terminal.id)}
                          onInvokeClaudeYolo={() => handleInvokeClaude(terminal.id, true)}
                          onMergeComplete={() => handleMergeComplete(terminal)}
                          onClose={() => handleCloseTerminal(terminal.id)}
                          onFocus={() => setActiveTerminal(terminal.id)}
                        />
                      </div>
                    ))}
                  </div>
                ) : (
                  /* Single terminal, full size */
                  groupTerminals.map((terminal) => (
                    <div key={terminal.id} className="absolute inset-0">
                      <TerminalPanel
                        terminal={terminal}
                        isActive={isCurrentGroup}
                        onInvokeClaude={() => handleInvokeClaude(terminal.id)}
                        onInvokeClaudeYolo={() => handleInvokeClaude(terminal.id, true)}
                        onMergeComplete={() => handleMergeComplete(terminal)}
                      />
                    </div>
                  ))
                )}
              </div>
            );
          })
        )}
      </div>
    </div>
  );
}

/** Build a prompt string from a ClickUp task to send to Claude */
function buildTaskPrompt(task: ClickUpTask): string {
  const lines: string[] = [];
  lines.push(`I need you to work on the following task from ClickUp:`);
  lines.push(``);
  lines.push(`Task: ${task.name}`);
  if (task.custom_id) lines.push(`ID: ${task.custom_id}`);
  lines.push(`Status: ${task.status.status}`);
  if (task.priority) lines.push(`Priority: ${task.priority.priority}`);
  if (task.url) lines.push(`URL: ${task.url}`);
  if (task.text_content) {
    lines.push(``);
    lines.push(`Description:`);
    lines.push(task.text_content.slice(0, 2000));
  }
  if (task.tags.length > 0) {
    lines.push(``);
    lines.push(`Tags: ${task.tags.map((t) => t.name).join(', ')}`);
  }
  lines.push(``);
  lines.push(`Please review this task and help me implement it.\r`);
  return lines.join('\n');
}
