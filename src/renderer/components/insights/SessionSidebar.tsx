import { useState } from 'react';
import { Plus, Trash2, MessageSquare, FolderOpen, GitBranch, Sparkles } from 'lucide-react';
import type { InsightsSessionMeta } from '../../../shared/types';
import { cn } from '../../../shared/utils';

interface SessionSidebarProps {
  sessions: InsightsSessionMeta[];
  activeSessionId: string | null;
  onSelect: (id: string) => void;
  onNew: () => void;
  onDelete: (id: string) => void;
  onRename: (id: string, title: string) => void;
}

function formatDate(iso: string): string {
  const d = new Date(iso);
  const now = new Date();
  const diffMs = now.getTime() - d.getTime();
  const diffMins = Math.floor(diffMs / 60000);
  if (diffMins < 1) return 'just now';
  if (diffMins < 60) return `${diffMins}m ago`;
  const diffHours = Math.floor(diffMins / 60);
  if (diffHours < 24) return `${diffHours}h ago`;
  const diffDays = Math.floor(diffHours / 24);
  if (diffDays < 7) return `${diffDays}d ago`;
  return d.toLocaleDateString();
}

function folderName(path?: string): string | null {
  if (!path) return null;
  const parts = path.replace(/\\/g, '/').split('/');
  return parts[parts.length - 1] || null;
}

export function SessionSidebar({
  sessions,
  activeSessionId,
  onSelect,
  onNew,
  onDelete,
  onRename,
}: SessionSidebarProps) {
  const [renamingId, setRenamingId] = useState<string | null>(null);
  const [renameText, setRenameText] = useState('');

  const startRename = (id: string, currentTitle: string) => {
    setRenamingId(id);
    setRenameText(currentTitle);
  };

  const commitRename = () => {
    if (renamingId && renameText.trim()) {
      onRename(renamingId, renameText.trim());
    }
    setRenamingId(null);
  };

  return (
    <div className="w-64 bg-[var(--bg-secondary)] border-r border-[var(--border)] flex flex-col h-full">
      {/* Header */}
      <div className="flex items-center justify-between px-3 py-3 border-b border-[var(--border)]">
        <span className="text-xs font-medium text-[var(--text-secondary)] uppercase tracking-wider">
          Chats
        </span>
        <button
          onClick={onNew}
          className="w-6 h-6 rounded flex items-center justify-center text-[var(--text-muted)] hover:text-[var(--text-primary)] hover:bg-[var(--bg-tertiary)] transition-colors"
          title="New chat"
        >
          <Plus className="w-4 h-4" />
        </button>
      </div>

      {/* Session list */}
      <div className="flex-1 overflow-y-auto py-1">
        {sessions.length === 0 && (
          <p className="text-xs text-[var(--text-muted)] text-center py-8">No conversations yet</p>
        )}
        {sessions.map((s) => (
          <div
            key={s.id}
            onClick={() => onSelect(s.id)}
            className={cn(
              'group px-3 py-2.5 cursor-pointer border-l-2 transition-colors',
              s.id === activeSessionId
                ? 'bg-[var(--accent)]/10 border-[var(--accent)]'
                : 'border-transparent hover:bg-[var(--bg-tertiary)]',
            )}
          >
            {renamingId === s.id ? (
              <input
                autoFocus
                value={renameText}
                onChange={(e) => setRenameText(e.target.value)}
                onBlur={commitRename}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') commitRename();
                  if (e.key === 'Escape') setRenamingId(null);
                }}
                className="w-full text-sm bg-[var(--bg-primary)] text-[var(--text-primary)] border border-[var(--accent)] rounded px-1.5 py-0.5 outline-none"
                onClick={(e) => e.stopPropagation()}
              />
            ) : (
              <div className="flex items-start justify-between gap-1">
                <div
                  className="flex-1 min-w-0"
                  onDoubleClick={(e) => {
                    e.stopPropagation();
                    startRename(s.id, s.title);
                  }}
                >
                  <p className="text-sm text-[var(--text-primary)] truncate">{s.title}</p>
                  <div className="flex items-center gap-2 mt-0.5">
                    {s.provider === 'copilot' ? (
                      <span className="flex items-center gap-0.5 text-[10px] text-emerald-400">
                        <GitBranch className="w-2.5 h-2.5" />
                        Copilot
                      </span>
                    ) : (
                      <span className="flex items-center gap-0.5 text-[10px] text-purple-400">
                        <Sparkles className="w-2.5 h-2.5" />
                        Claude
                      </span>
                    )}
                    <span className="flex items-center gap-0.5 text-[10px] text-[var(--text-muted)]">
                      <MessageSquare className="w-2.5 h-2.5" />
                      {s.messageCount}
                    </span>
                    <span className="text-[10px] text-[var(--text-muted)]">{formatDate(s.updatedAt)}</span>
                    {folderName(s.projectPath) && (
                      <span className="flex items-center gap-0.5 text-[10px] text-[var(--text-muted)] truncate">
                        <FolderOpen className="w-2.5 h-2.5 shrink-0" />
                        {folderName(s.projectPath)}
                      </span>
                    )}
                  </div>
                </div>
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    onDelete(s.id);
                  }}
                  className="w-5 h-5 rounded flex items-center justify-center text-[var(--text-muted)] hover:text-[var(--error)] opacity-0 group-hover:opacity-100 transition-opacity shrink-0 mt-0.5"
                  title="Delete"
                >
                  <Trash2 className="w-3 h-3" />
                </button>
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
