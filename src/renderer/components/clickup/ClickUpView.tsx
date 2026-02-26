import { useState, useEffect, useCallback } from 'react';
import { RefreshCw, Search, ExternalLink, AlertCircle, CheckSquare } from 'lucide-react';
import { useSettingsStore } from '../../stores/settings-store';
import { cn } from '../../../shared/utils';
import type { ClickUpTask } from '../../../shared/types';

export function ClickUpView() {
  const settings = useSettingsStore((s) => s.settings);
  const [tasks, setTasks] = useState<ClickUpTask[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedTask, setSelectedTask] = useState<ClickUpTask | null>(null);

  const loadTasks = useCallback(async () => {
    if (!settings.clickupEnabled || !settings.clickupApiKey) return;

    setLoading(true);
    setError(null);
    try {
      const result = await window.electronAPI.getClickUpTasks();
      if (result.success) {
        setTasks(result.data || []);
      } else {
        setError(result.error || 'Failed to load tasks');
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load tasks');
    } finally {
      setLoading(false);
    }
  }, [settings.clickupEnabled, settings.clickupApiKey]);

  useEffect(() => {
    loadTasks();
  }, [loadTasks]);

  const filteredTasks = tasks.filter((task) => {
    if (!searchQuery) return true;
    const query = searchQuery.toLowerCase();
    return (
      task.name.toLowerCase().includes(query) ||
      task.custom_id?.toLowerCase().includes(query) ||
      task.text_content?.toLowerCase().includes(query) ||
      task.status.status.toLowerCase().includes(query)
    );
  });

  if (!settings.clickupEnabled) {
    return (
      <div className="flex flex-col h-full">
        <div className="h-12 bg-[var(--bg-secondary)] border-b border-[var(--border)] flex items-center px-4 drag-region">
          <h1 className="text-sm font-semibold text-[var(--text-primary)] no-drag">ClickUp Tasks</h1>
        </div>
        <div className="flex-1 flex flex-col items-center justify-center text-[var(--text-muted)] gap-4">
          <CheckSquare className="w-12 h-12 opacity-30" />
          <p className="text-sm">ClickUp integration is not enabled</p>
          <p className="text-xs">Enable it in Settings to connect your tasks</p>
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="h-12 bg-[var(--bg-secondary)] border-b border-[var(--border)] flex items-center px-4 justify-between drag-region">
        <h1 className="text-sm font-semibold text-[var(--text-primary)] no-drag">ClickUp Tasks</h1>
        <div className="flex items-center gap-2 no-drag">
          <span className="text-xs text-[var(--text-muted)]">{filteredTasks.length} tasks</span>
          <button
            onClick={loadTasks}
            disabled={loading}
            className="p-1.5 rounded-md hover:bg-[var(--bg-tertiary)] text-[var(--text-muted)] transition-colors"
          >
            <RefreshCw className={cn('w-4 h-4', loading && 'animate-spin')} />
          </button>
        </div>
      </div>

      {/* Search bar */}
      <div className="px-4 py-3 bg-[var(--bg-secondary)] border-b border-[var(--border)]">
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-[var(--text-muted)]" />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search tasks..."
            className="w-full pl-9 pr-4 py-2 bg-[var(--bg-card)] border border-[var(--border)] rounded-lg text-sm text-[var(--text-primary)] placeholder:text-[var(--text-muted)] focus:outline-none focus:border-[var(--accent)]"
          />
        </div>
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
        ) : filteredTasks.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-32 text-[var(--text-muted)]">
            <p className="text-sm">No tasks found</p>
          </div>
        ) : (
          <div className="p-2 space-y-1">
            {filteredTasks.map((task) => (
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
                      {task.custom_id && (
                        <span className="text-[10px] font-mono text-[var(--text-muted)] shrink-0">
                          {task.custom_id}
                        </span>
                      )}
                      <span className="text-sm text-[var(--text-primary)] truncate">{task.name}</span>
                    </div>
                    <div className="flex items-center gap-2 mt-1">
                      <span className="text-[10px] px-1.5 py-0.5 rounded-full" style={{
                        backgroundColor: `${task.status.color}20`,
                        color: task.status.color,
                      }}>
                        {task.status.status}
                      </span>
                      {task.priority && (
                        <span className="text-[10px] text-[var(--text-muted)]">
                          P{task.priority.id}
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
                {selectedTask?.id === task.id && task.text_content && (
                  <div className="mt-3 pt-3 border-t border-[var(--border)]">
                    <p className="text-xs text-[var(--text-secondary)] whitespace-pre-wrap line-clamp-6">
                      {task.text_content}
                    </p>
                    {task.tags.length > 0 && (
                      <div className="flex flex-wrap gap-1 mt-2">
                        {task.tags.map((tag) => (
                          <span
                            key={tag.name}
                            className="text-[10px] px-1.5 py-0.5 rounded"
                            style={{ backgroundColor: tag.tag_bg, color: tag.tag_fg }}
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
