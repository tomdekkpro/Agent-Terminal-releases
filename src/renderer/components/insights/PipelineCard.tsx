import { ClipboardList, Terminal, ShieldCheck, GitPullRequest, CheckCircle, Loader2, ExternalLink } from 'lucide-react';
import type { InsightsMessage } from '../../../shared/types';
import { cn } from '../../../shared/utils';

interface PipelineCardProps {
  message: InsightsMessage;
  onViewTerminal?: (terminalId: string) => void;
}

const TYPE_CONFIG: Record<string, { icon: any; label: string; color: string; bgColor: string }> = {
  spec: { icon: ClipboardList, label: 'Implementation Spec', color: 'text-indigo-400', bgColor: 'bg-indigo-500/10 border-indigo-500/30' },
  implementation: { icon: Terminal, label: 'Implementation', color: 'text-emerald-400', bgColor: 'bg-emerald-500/10 border-emerald-500/30' },
  review: { icon: ShieldCheck, label: 'Review', color: 'text-amber-400', bgColor: 'bg-amber-500/10 border-amber-500/30' },
  pr: { icon: GitPullRequest, label: 'Pull Request', color: 'text-purple-400', bgColor: 'bg-purple-500/10 border-purple-500/30' },
  status: { icon: CheckCircle, label: 'Status', color: 'text-sky-400', bgColor: 'bg-sky-500/10 border-sky-500/30' },
};

export function PipelineCard({ message, onViewTerminal }: PipelineCardProps) {
  const config = TYPE_CONFIG[message.messageType || 'status'] || TYPE_CONFIG.status;
  const Icon = config.icon;
  const meta = message.metadata || {};

  return (
    <div className={cn('mx-4 my-3 rounded-lg border p-4', config.bgColor)}>
      <div className="flex items-center gap-2 mb-2">
        <Icon className={cn('w-4 h-4', config.color)} />
        <span className={cn('text-xs font-medium', config.color)}>{config.label}</span>
        <span className="text-[10px] text-[var(--text-muted)] ml-auto">
          {new Date(message.timestamp).toLocaleTimeString()}
        </span>
      </div>

      {message.messageType === 'implementation' && (
        <div className="flex items-center gap-3">
          {meta.status === 'running' ? (
            <Loader2 className="w-4 h-4 text-emerald-400 animate-spin" />
          ) : (
            <CheckCircle className="w-4 h-4 text-emerald-400" />
          )}
          <span className="text-sm text-[var(--text-primary)]">
            {meta.status === 'running' ? 'Agent is implementing...' : 'Implementation complete'}
          </span>
          {meta.terminalId && onViewTerminal && (
            <button
              onClick={() => onViewTerminal(meta.terminalId)}
              className="ml-auto flex items-center gap-1 text-xs text-emerald-400 hover:text-emerald-300"
            >
              <Terminal className="w-3 h-3" /> View Terminal
            </button>
          )}
        </div>
      )}

      {message.messageType === 'pr' && (
        <div className="flex items-center gap-3">
          <GitPullRequest className="w-4 h-4 text-purple-400" />
          <div className="flex-1 min-w-0">
            <span className="text-sm text-[var(--text-primary)]">{meta.title || 'Pull Request'}</span>
            {meta.branch && (
              <span className="text-[10px] text-[var(--text-muted)] ml-2 font-mono">{meta.branch}</span>
            )}
          </div>
          {meta.url && (
            <button
              onClick={() => window.electronAPI.openExternal(meta.url)}
              className="flex items-center gap-1 text-xs text-purple-400 hover:text-purple-300"
            >
              <ExternalLink className="w-3 h-3" /> Open
            </button>
          )}
        </div>
      )}

      {message.messageType === 'status' && (
        <p className="text-sm text-[var(--text-secondary)]">{message.content}</p>
      )}

      {message.messageType === 'review' && (
        <div>
          <div className="flex items-center gap-2 mb-1">
            {meta.passed ? (
              <span className="text-xs text-emerald-400 flex items-center gap-1">
                <CheckCircle className="w-3 h-3" /> Passed
              </span>
            ) : (
              <span className="text-xs text-amber-400 flex items-center gap-1">
                <ShieldCheck className="w-3 h-3" /> Issues found
              </span>
            )}
          </div>
          <p className="text-sm text-[var(--text-secondary)] whitespace-pre-wrap">{message.content}</p>
        </div>
      )}
    </div>
  );
}
