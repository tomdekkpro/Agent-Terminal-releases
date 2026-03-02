import { useState, useEffect, useCallback, useRef } from 'react';
import { RefreshCw, Search, ExternalLink, AlertCircle, CheckSquare, Filter, X, ChevronDown, List } from 'lucide-react';
import { useSettingsStore } from '../../stores/settings-store';
import { cn } from '../../../shared/utils';
import type { TaskManagerTask, TaskManagerList } from '../../../shared/types';

type SearchFilters = {
  statuses?: string[];
  assignees?: string[];
  includeClosed?: boolean;
};

export function TasksView() {
  const settings = useSettingsStore((s) => s.settings);
  const [tasks, setTasks] = useState<TaskManagerTask[]>([]);
  const [loading, setLoading] = useState(false);
  const [searching, setSearching] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedTask, setSelectedTask] = useState<TaskManagerTask | null>(null);
  const searchTimerRef = useRef<ReturnType<typeof setTimeout>>(null);

  // Lists
  const [lists, setLists] = useState<TaskManagerList[]>([]);
  const [selectedListId, setSelectedListId] = useState<string>('');
  const [listsLoading, setListsLoading] = useState(false);
  const [showListDropdown, setShowListDropdown] = useState(false);
  const listDropdownRef = useRef<HTMLDivElement>(null);

  // Filters
  const [showFilters, setShowFilters] = useState(false);
  const [filterStatuses, setFilterStatuses] = useState<string[]>([]);
  const [filterAssignees, setFilterAssignees] = useState<string[]>([]);
  const [includeClosed, setIncludeClosed] = useState(false);

  // Collected unique statuses/assignees from loaded tasks
  const [availableStatuses, setAvailableStatuses] = useState<{ name: string; color: string }[]>([]);
  const [availableAssignees, setAvailableAssignees] = useState<{ id: string; username: string }[]>([]);

  // Close list dropdown on outside click
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (listDropdownRef.current && !listDropdownRef.current.contains(e.target as Node)) {
        setShowListDropdown(false);
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  // Fetch lists on mount
  useEffect(() => {
    if (settings.taskManagerProvider === 'none') return;
    setListsLoading(true);
    window.electronAPI.getTaskManagerLists().then((result: any) => {
      if (result.success && result.data) {
        setLists(result.data);
        // Auto-select first list if none selected (or use clickupListId as default)
        if (!selectedListId && result.data.length > 0) {
          const defaultId = settings.clickupListId || result.data[0].id;
          const exists = result.data.some((l: TaskManagerList) => l.id === defaultId);
          setSelectedListId(exists ? defaultId : result.data[0].id);
        }
      }
    }).finally(() => setListsLoading(false));
  }, [settings.taskManagerProvider]);

  const buildFilters = useCallback((): SearchFilters => ({
    statuses: filterStatuses.length > 0 ? filterStatuses : undefined,
    assignees: filterAssignees.length > 0 ? filterAssignees : undefined,
    includeClosed,
  }), [filterStatuses, filterAssignees, includeClosed]);

  const doSearch = useCallback(async (query: string, filters: SearchFilters, listId?: string) => {
    try {
      const result = await window.electronAPI.searchTaskManagerTasks(query, filters, listId);
      if (result.success) {
        const data = result.data || [];
        setTasks(data);

        // Collect unique statuses and assignees for filter dropdowns
        const statusMap = new Map<string, string>();
        const assigneeMap = new Map<string, string>();
        for (const t of data) {
          if (t.status?.name) statusMap.set(t.status.name, t.status.color);
          for (const a of t.assignees || []) {
            assigneeMap.set(String(a.id), a.username);
          }
        }
        setAvailableStatuses(Array.from(statusMap, ([name, color]) => ({ name, color })));
        setAvailableAssignees(Array.from(assigneeMap, ([id, username]) => ({ id, username })));
      } else {
        setError(result.error || 'Failed to load tasks');
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load tasks');
    }
  }, []);

  const loadTasks = useCallback(async () => {
    if (settings.taskManagerProvider === 'none') return;
    if (!selectedListId) return;
    setLoading(true);
    setError(null);
    await doSearch(searchQuery, buildFilters(), selectedListId);
    setLoading(false);
  }, [settings.taskManagerProvider, searchQuery, buildFilters, doSearch, selectedListId]);

  // Reload tasks when selected list changes
  useEffect(() => {
    if (selectedListId) {
      loadTasks();
    }
  }, [selectedListId, loadTasks]);

  // Debounced text search
  const handleSearchChange = useCallback((value: string) => {
    setSearchQuery(value);
    if (searchTimerRef.current) clearTimeout(searchTimerRef.current);

    const filters = buildFilters();
    searchTimerRef.current = setTimeout(async () => {
      setSearching(true);
      await doSearch(value, filters, selectedListId);
      setSearching(false);
    }, 300);
  }, [buildFilters, doSearch, selectedListId]);

  // Re-fetch when filters change
  useEffect(() => {
    if (settings.taskManagerProvider === 'none' || !selectedListId) return;
    const filters = buildFilters();
    setSearching(true);
    doSearch(searchQuery, filters, selectedListId).finally(() => setSearching(false));
  }, [filterStatuses, filterAssignees, includeClosed]);

  useEffect(() => {
    return () => {
      if (searchTimerRef.current) clearTimeout(searchTimerRef.current);
    };
  }, []);

  const activeFilterCount = (filterStatuses.length > 0 ? 1 : 0)
    + (filterAssignees.length > 0 ? 1 : 0)
    + (includeClosed ? 1 : 0);

  const clearFilters = useCallback(() => {
    setFilterStatuses([]);
    setFilterAssignees([]);
    setIncludeClosed(false);
  }, []);

  const toggleStatus = useCallback((status: string) => {
    setFilterStatuses((prev) =>
      prev.includes(status) ? prev.filter((s) => s !== status) : [...prev, status]
    );
  }, []);

  const toggleAssignee = useCallback((id: string) => {
    setFilterAssignees((prev) =>
      prev.includes(id) ? prev.filter((a) => a !== id) : [...prev, id]
    );
  }, []);

  const selectedList = lists.find((l) => l.id === selectedListId);

  // Group lists by space for the dropdown
  const listsBySpace = lists.reduce<Record<string, TaskManagerList[]>>((acc, list) => {
    const key = list.space || 'Other';
    if (!acc[key]) acc[key] = [];
    acc[key].push(list);
    return acc;
  }, {});

  if (settings.taskManagerProvider === 'none') {
    return (
      <div className="flex flex-col h-full">
        <div className="h-12 bg-[var(--bg-secondary)] border-b border-[var(--border)] flex items-center px-4 drag-region">
          <h1 className="text-sm font-semibold text-[var(--text-primary)] no-drag">Tasks</h1>
        </div>
        <div className="flex-1 flex flex-col items-center justify-center text-[var(--text-muted)] gap-4">
          <CheckSquare className="w-12 h-12 opacity-30" />
          <p className="text-sm">No task manager configured</p>
          <p className="text-xs">Enable one in Settings to connect your tasks</p>
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="h-12 bg-[var(--bg-secondary)] border-b border-[var(--border)] flex items-center px-4 justify-between drag-region">
        <h1 className="text-sm font-semibold text-[var(--text-primary)] no-drag">Tasks</h1>
        <div className="flex items-center gap-2 no-drag">
          <span className="text-xs text-[var(--text-muted)]">{tasks.length} tasks</span>
          <button
            onClick={loadTasks}
            disabled={loading}
            className="p-1.5 rounded-md hover:bg-[var(--bg-tertiary)] text-[var(--text-muted)] transition-colors"
          >
            <RefreshCw className={cn('w-4 h-4', loading && 'animate-spin')} />
          </button>
        </div>
      </div>

      {/* List selector + Search + filter bar */}
      <div className="px-4 py-3 bg-[var(--bg-secondary)] border-b border-[var(--border)] space-y-2">
        {/* List selector */}
        <div className="relative" ref={listDropdownRef}>
          <button
            onClick={() => setShowListDropdown(!showListDropdown)}
            disabled={listsLoading}
            className="w-full flex items-center justify-between px-3 py-2 bg-[var(--bg-card)] border border-[var(--border)] rounded-lg text-sm text-[var(--text-primary)] hover:border-[var(--accent)] transition-colors"
          >
            <div className="flex items-center gap-2 min-w-0">
              <List className="w-4 h-4 text-[var(--text-muted)] shrink-0" />
              {listsLoading ? (
                <span className="text-[var(--text-muted)]">Loading lists...</span>
              ) : selectedList ? (
                <span className="truncate">
                  {selectedList.name}
                  {selectedList.folder && (
                    <span className="text-[var(--text-muted)]"> &middot; {selectedList.folder}</span>
                  )}
                </span>
              ) : (
                <span className="text-[var(--text-muted)]">Select a list...</span>
              )}
            </div>
            <ChevronDown className={cn('w-4 h-4 text-[var(--text-muted)] shrink-0 transition-transform', showListDropdown && 'rotate-180')} />
          </button>

          {showListDropdown && lists.length > 0 && (
            <div className="absolute z-50 top-full left-0 right-0 mt-1 max-h-64 overflow-y-auto bg-[var(--bg-card)] border border-[var(--border)] rounded-lg shadow-xl">
              {Object.entries(listsBySpace).map(([space, spaceLists]) => (
                <div key={space}>
                  {Object.keys(listsBySpace).length > 1 && (
                    <div className="px-3 py-1.5 text-[10px] uppercase tracking-wider text-[var(--text-muted)] bg-[var(--bg-secondary)] sticky top-0">
                      {space}
                    </div>
                  )}
                  {spaceLists.map((list) => (
                    <button
                      key={list.id}
                      onClick={() => {
                        setSelectedListId(list.id);
                        setShowListDropdown(false);
                      }}
                      className={cn(
                        'w-full text-left px-3 py-2 text-sm transition-colors hover:bg-[var(--bg-tertiary)]',
                        list.id === selectedListId && 'bg-[var(--accent)]/10 text-[var(--accent)]'
                      )}
                    >
                      <span>{list.name}</span>
                      {list.folder && (
                        <span className="text-[10px] text-[var(--text-muted)] ml-2">{list.folder}</span>
                      )}
                    </button>
                  ))}
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Search + filter */}
        <div className="flex items-center gap-2">
          <div className="relative flex-1">
            {searching ? (
              <RefreshCw className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-[var(--accent)] animate-spin" />
            ) : (
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-[var(--text-muted)]" />
            )}
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => handleSearchChange(e.target.value)}
              placeholder="Search by title or task ID..."
              className="w-full pl-9 pr-4 py-2 bg-[var(--bg-card)] border border-[var(--border)] rounded-lg text-sm text-[var(--text-primary)] placeholder:text-[var(--text-muted)] focus:outline-none focus:border-[var(--accent)]"
            />
          </div>
          <button
            onClick={() => setShowFilters(!showFilters)}
            className={cn(
              'flex items-center gap-1 px-2.5 py-2 rounded-lg border text-xs transition-colors',
              showFilters || activeFilterCount > 0
                ? 'bg-[var(--accent)]/10 border-[var(--accent)]/30 text-[var(--accent)]'
                : 'bg-[var(--bg-card)] border-[var(--border)] text-[var(--text-muted)] hover:bg-[var(--bg-tertiary)]'
            )}
          >
            <Filter className="w-3.5 h-3.5" />
            {activeFilterCount > 0 && <span>{activeFilterCount}</span>}
          </button>
        </div>

        {/* Filter panel */}
        {showFilters && (
          <div className="p-3 bg-[var(--bg-card)] border border-[var(--border)] rounded-lg space-y-3">
            {/* Include closed toggle */}
            <label className="flex items-center gap-2 cursor-pointer">
              <input
                type="checkbox"
                checked={includeClosed}
                onChange={(e) => setIncludeClosed(e.target.checked)}
                className="rounded border-[var(--border)] accent-[var(--accent)]"
              />
              <span className="text-xs text-[var(--text-secondary)]">Include closed tasks</span>
            </label>

            {/* Status filter */}
            {availableStatuses.length > 0 && (
              <div>
                <div className="text-[10px] uppercase tracking-wider text-[var(--text-muted)] mb-1.5">Status</div>
                <div className="flex flex-wrap gap-1">
                  {availableStatuses.map((s) => (
                    <button
                      key={s.name}
                      onClick={() => toggleStatus(s.name)}
                      className={cn(
                        'text-[11px] px-2 py-0.5 rounded-full border transition-colors',
                        filterStatuses.includes(s.name)
                          ? 'border-[var(--accent)] bg-[var(--accent)]/10 text-[var(--accent)]'
                          : 'border-[var(--border)] text-[var(--text-muted)] hover:bg-[var(--bg-tertiary)]'
                      )}
                    >
                      <span className="inline-block w-1.5 h-1.5 rounded-full mr-1" style={{ backgroundColor: s.color }} />
                      {s.name}
                    </button>
                  ))}
                </div>
              </div>
            )}

            {/* Assignee filter */}
            {availableAssignees.length > 0 && (
              <div>
                <div className="text-[10px] uppercase tracking-wider text-[var(--text-muted)] mb-1.5">Assignee</div>
                <div className="flex flex-wrap gap-1">
                  {availableAssignees.map((a) => (
                    <button
                      key={a.id}
                      onClick={() => toggleAssignee(a.id)}
                      className={cn(
                        'text-[11px] px-2 py-0.5 rounded-full border transition-colors',
                        filterAssignees.includes(a.id)
                          ? 'border-[var(--accent)] bg-[var(--accent)]/10 text-[var(--accent)]'
                          : 'border-[var(--border)] text-[var(--text-muted)] hover:bg-[var(--bg-tertiary)]'
                      )}
                    >
                      {a.username}
                    </button>
                  ))}
                </div>
              </div>
            )}

            {/* Clear filters */}
            {activeFilterCount > 0 && (
              <button
                onClick={clearFilters}
                className="flex items-center gap-1 text-[11px] text-[var(--error)] hover:underline"
              >
                <X className="w-3 h-3" />
                Clear all filters
              </button>
            )}
          </div>
        )}
      </div>

      {/* Task list */}
      <div className="flex-1 overflow-y-auto">
        {error && (
          <div className="m-4 p-3 rounded-lg bg-[var(--error)]/10 border border-[var(--error)]/20 flex items-center gap-2">
            <AlertCircle className="w-4 h-4 text-[var(--error)] shrink-0" />
            <p className="text-sm text-[var(--error)]">{error}</p>
          </div>
        )}

        {loading && tasks.length === 0 ? (
          <div className="flex items-center justify-center h-32">
            <RefreshCw className="w-5 h-5 animate-spin text-[var(--text-muted)]" />
          </div>
        ) : !selectedListId ? (
          <div className="flex flex-col items-center justify-center h-32 text-[var(--text-muted)]">
            <List className="w-8 h-8 opacity-30 mb-2" />
            <p className="text-sm">Select a list to view tasks</p>
          </div>
        ) : tasks.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-32 text-[var(--text-muted)]">
            <p className="text-sm">No tasks found</p>
          </div>
        ) : (
          <div className="p-2 space-y-1">
            {tasks.map((task) => (
              <button
                key={task.id}
                onClick={() => setSelectedTask(selectedTask?.id === task.id ? null : task)}
                className={cn(
                  'w-full text-left p-3 rounded-lg transition-colors',
                  'hover:bg-[var(--bg-card)]',
                  selectedTask?.id === task.id && 'bg-[var(--bg-card)] border border-[var(--border)]'
                )}
              >
                <div className="flex items-center gap-3">
                  <div
                    className="w-2 h-2 rounded-full shrink-0"
                    style={{ backgroundColor: task.status.color }}
                  />
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      {task.customId && (
                        <span className="text-[10px] font-mono text-[var(--text-muted)] shrink-0">
                          {task.customId}
                        </span>
                      )}
                      <span className="text-sm text-[var(--text-primary)] truncate">{task.name}</span>
                    </div>
                    <div className="flex items-center gap-2 mt-1">
                      <span className="text-[10px] px-1.5 py-0.5 rounded-full" style={{
                        backgroundColor: `${task.status.color}20`,
                        color: task.status.color,
                      }}>
                        {task.status.name}
                      </span>
                      {task.priority && (
                        <span className="text-[10px] text-[var(--text-muted)]">
                          {task.priority.name}
                        </span>
                      )}
                      {task.assignees.length > 0 && (
                        <span className="text-[10px] text-[var(--text-muted)]">
                          {task.assignees.map(a => a.username).join(', ')}
                        </span>
                      )}
                    </div>
                  </div>
                  <a
                    href="#"
                    onClick={(e) => {
                      e.stopPropagation();
                      window.electronAPI.openExternal(task.url);
                    }}
                    className="p-1 rounded hover:bg-[var(--bg-tertiary)] text-[var(--text-muted)]"
                  >
                    <ExternalLink className="w-3.5 h-3.5" />
                  </a>
                </div>

                {/* Expanded task detail */}
                {selectedTask?.id === task.id && task.description && (
                  <div className="mt-3 pt-3 border-t border-[var(--border)]">
                    <p className="text-xs text-[var(--text-secondary)] whitespace-pre-wrap line-clamp-6">
                      {task.description}
                    </p>
                    {task.tags.length > 0 && (
                      <div className="flex flex-wrap gap-1 mt-2">
                        {task.tags.map((tag) => (
                          <span
                            key={tag.name}
                            className="text-[10px] px-1.5 py-0.5 rounded"
                            style={{ backgroundColor: tag.bgColor, color: tag.fgColor }}
                          >
                            {tag.name}
                          </span>
                        ))}
                      </div>
                    )}
                  </div>
                )}
              </button>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
