/**
 * Service Status Indicator
 *
 * Shows a color-coded dot reflecting the worst status across
 * Claude, GitHub Copilot, and Gemini provider status pages.
 * Hover/click to see per-provider breakdown and incidents.
 */

import { useState, useEffect, useRef, useCallback } from 'react';
import { Radio, ExternalLink, RefreshCw, ChevronDown, ChevronRight } from 'lucide-react';
import { useServiceStatusStore } from '../../stores/service-status-store';
import { cn } from '../../../shared/utils';
import type { ServiceStatusLevel, ProviderStatus, ServiceStatusSummary } from '../../../shared/types';

/** Provider display metadata */
const PROVIDER_META: Record<string, { label: string; color: string }> = {
  claude: { label: 'Claude', color: '#D97706' },
  copilot: { label: 'GitHub Copilot', color: '#6366F1' },
  gemini: { label: 'Gemini', color: '#3B82F6' },
};

const PROVIDER_ORDER = ['claude', 'copilot', 'gemini'];

function levelDotColor(level: ServiceStatusLevel): string {
  switch (level) {
    case 'operational':
      return 'bg-green-500';
    case 'degraded':
      return 'bg-yellow-500';
    case 'major':
      return 'bg-orange-500';
    case 'critical':
      return 'bg-red-500';
    default:
      return 'bg-gray-400';
  }
}

function levelBadgeClasses(level: ServiceStatusLevel): string {
  switch (level) {
    case 'operational':
      return 'text-green-500 bg-green-500/10 border-green-500/20';
    case 'degraded':
      return 'text-yellow-500 bg-yellow-500/10 border-yellow-500/20';
    case 'major':
      return 'text-orange-500 bg-orange-500/10 border-orange-500/20';
    case 'critical':
      return 'text-red-500 bg-red-500/10 border-red-500/20';
    default:
      return 'text-gray-400 bg-gray-400/10 border-gray-400/20';
  }
}

function levelLabel(level: ServiceStatusLevel): string {
  switch (level) {
    case 'operational':
      return 'Operational';
    case 'degraded':
      return 'Degraded';
    case 'major':
      return 'Major Outage';
    case 'critical':
      return 'Critical';
    default:
      return 'Unknown';
  }
}

function timeAgo(timestamp: number): string {
  const diff = Math.floor((Date.now() - timestamp) / 1000);
  if (diff < 60) return 'just now';
  if (diff < 3600) return `${Math.floor(diff / 60)}m ago`;
  if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`;
  return `${Math.floor(diff / 86400)}d ago`;
}

function ProviderRow({ status }: { status: ProviderStatus }) {
  const [expanded, setExpanded] = useState(false);
  const meta = PROVIDER_META[status.provider] || { label: status.provider, color: '#888' };
  const hasIncidents = status.incidents.length > 0;

  return (
    <div className="space-y-1">
      <div
        className={cn(
          'flex items-center gap-2 py-1 px-1.5 rounded',
          hasIncidents && 'cursor-pointer hover:bg-[var(--bg-secondary)]'
        )}
        onClick={() => hasIncidents && setExpanded(!expanded)}
      >
        {/* Provider color indicator */}
        <div className="w-1.5 h-1.5 rounded-full shrink-0" style={{ backgroundColor: meta.color }} />

        {/* Provider name */}
        <span className="text-[11px] font-medium text-[var(--text-primary)] flex-1">
          {meta.label}
        </span>

        {/* Status dot + label */}
        <div className="flex items-center gap-1.5">
          <div className={cn('w-2 h-2 rounded-full', levelDotColor(status.level))} />
          <span className="text-[10px] text-[var(--text-muted)]">{levelLabel(status.level)}</span>
        </div>

        {/* Expand arrow for incidents */}
        {hasIncidents && (
          expanded
            ? <ChevronDown className="w-3 h-3 text-[var(--text-muted)]" />
            : <ChevronRight className="w-3 h-3 text-[var(--text-muted)]" />
        )}
      </div>

      {/* Expanded incidents */}
      {expanded && hasIncidents && (
        <div className="ml-4 space-y-1.5 pb-1">
          {status.incidents.map((inc, i) => (
            <div key={i} className="text-[10px] space-y-0.5 pl-2 border-l-2 border-[var(--border)]">
              <div className="flex items-start justify-between gap-2">
                <span className="text-[var(--text-secondary)] font-medium leading-tight">
                  {inc.name}
                </span>
                {inc.url && (
                  <button
                    className="text-[var(--accent)] hover:underline shrink-0"
                    onClick={(e) => {
                      e.stopPropagation();
                      window.electronAPI.openExternal(inc.url!);
                    }}
                  >
                    <ExternalLink className="w-3 h-3" />
                  </button>
                )}
              </div>
              <div className="text-[var(--text-muted)]">
                {inc.impact} &middot; {inc.status}
                {inc.updatedAt && ` &middot; ${new Date(inc.updatedAt).toLocaleString()}`}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

export function ServiceStatusIndicator() {
  const summary = useServiceStatusStore((s) => s.summary);
  const isLoading = useServiceStatusStore((s) => s.isLoading);
  const setSummary = useServiceStatusStore((s) => s.setSummary);
  const setLoading = useServiceStatusStore((s) => s.setLoading);

  const [isOpen, setIsOpen] = useState(false);
  const [isPinned, setIsPinned] = useState(false);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const hoverTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const popoverRef = useRef<HTMLDivElement>(null);

  // Fetch initial status + listen for updates
  useEffect(() => {
    let unsub: (() => void) | undefined;

    if (window.electronAPI.onServiceStatusUpdated) {
      unsub = window.electronAPI.onServiceStatusUpdated((data: ServiceStatusSummary) => {
        setSummary(data);
      });
    }

    if (window.electronAPI.requestServiceStatus) {
      window.electronAPI
        .requestServiceStatus()
        .then((result: { success: boolean; data?: ServiceStatusSummary }) => {
          setLoading(false);
          if (result.success && result.data) {
            setSummary(result.data);
          }
        })
        .catch(() => {
          setLoading(false);
        });
    } else {
      setLoading(false);
    }

    return () => {
      unsub?.();
    };
  }, [setSummary, setLoading]);

  // Click outside to close pinned popover
  useEffect(() => {
    if (!isPinned) return;
    const handler = (e: MouseEvent) => {
      if (popoverRef.current && !popoverRef.current.contains(e.target as Node)) {
        setIsPinned(false);
        setIsOpen(false);
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [isPinned]);

  useEffect(() => {
    return () => {
      if (hoverTimeoutRef.current) clearTimeout(hoverTimeoutRef.current);
    };
  }, []);

  const handleMouseEnter = useCallback(() => {
    if (isPinned) return;
    if (hoverTimeoutRef.current) clearTimeout(hoverTimeoutRef.current);
    hoverTimeoutRef.current = setTimeout(() => setIsOpen(true), 150);
  }, [isPinned]);

  const handleMouseLeave = useCallback(() => {
    if (isPinned) return;
    if (hoverTimeoutRef.current) clearTimeout(hoverTimeoutRef.current);
    hoverTimeoutRef.current = setTimeout(() => setIsOpen(false), 300);
  }, [isPinned]);

  const handleClick = useCallback((e: React.MouseEvent) => {
    e.preventDefault();
    if (isPinned) {
      setIsPinned(false);
      setIsOpen(false);
    } else {
      setIsPinned(true);
      setIsOpen(true);
    }
  }, [isPinned]);

  const handleRefresh = useCallback(async () => {
    if (!window.electronAPI.requestServiceStatus) return;
    setIsRefreshing(true);
    try {
      const result = await window.electronAPI.requestServiceStatus();
      if (result.success && result.data) {
        setSummary(result.data);
      }
    } catch {
      // Silently fail
    } finally {
      setIsRefreshing(false);
    }
  }, [setSummary]);

  // Loading state
  if (isLoading) {
    return (
      <div className="flex items-center gap-1.5 px-2 py-1 rounded-md border border-[var(--border)] bg-[var(--bg-card)] text-[var(--text-muted)]">
        <Radio className="h-3.5 w-3.5 animate-pulse" />
      </div>
    );
  }

  const worstLevel = summary?.worstLevel || 'unknown';
  const providers = summary?.providers || {};
  const affectedCount = PROVIDER_ORDER.filter(
    (id) => providers[id] && providers[id].level !== 'operational'
  ).length;

  const badgeClasses = levelBadgeClasses(worstLevel);

  // Find oldest lastChecked for footer
  const lastCheckedTs = Math.min(
    ...PROVIDER_ORDER.map((id) => providers[id]?.lastChecked || Date.now())
  );

  return (
    <div className="relative" ref={popoverRef}>
      {/* Badge trigger */}
      <button
        className={cn(
          'flex items-center gap-1.5 px-2 py-1 rounded-md border transition-all hover:opacity-80',
          badgeClasses
        )}
        onMouseEnter={handleMouseEnter}
        onMouseLeave={handleMouseLeave}
        onClick={handleClick}
        title="Service Status"
      >
        <div className={cn('w-2 h-2 rounded-full', levelDotColor(worstLevel))} />
        {affectedCount > 0 && (
          <span className="text-[10px] font-semibold font-mono">
            {affectedCount}/{PROVIDER_ORDER.length}
          </span>
        )}
      </button>

      {/* Popover */}
      {isOpen && (
        <div
          className="absolute top-full right-0 mt-1 w-72 bg-[var(--bg-card)] border border-[var(--border)] rounded-lg shadow-xl z-50"
          onMouseEnter={handleMouseEnter}
          onMouseLeave={handleMouseLeave}
        >
          <div className="p-3 space-y-2">
            {/* Header */}
            <div className="flex items-center justify-between pb-2 border-b border-[var(--border)]">
              <div className="flex items-center gap-1.5">
                <Radio className="h-3.5 w-3.5 text-[var(--text-secondary)]" />
                <span className="font-semibold text-xs text-[var(--text-primary)]">
                  Service Status
                </span>
              </div>
              <button
                onClick={handleRefresh}
                className="text-[var(--text-muted)] hover:text-[var(--accent)] transition-colors"
                title="Refresh"
                disabled={isRefreshing}
              >
                <RefreshCw className={cn('w-3.5 h-3.5', isRefreshing && 'animate-spin')} />
              </button>
            </div>

            {/* Provider rows */}
            <div className="space-y-0.5">
              {PROVIDER_ORDER.map((id) => {
                const status = providers[id];
                if (!status) return null;
                return <ProviderRow key={id} status={status} />;
              })}
            </div>

            {/* Footer */}
            <div className="pt-2 border-t border-[var(--border)] flex items-center justify-between">
              <span className="text-[9px] text-[var(--text-muted)]">
                Checked {timeAgo(lastCheckedTs)}
              </span>
              <button
                className="text-[9px] text-[var(--accent)] hover:underline flex items-center gap-0.5"
                onClick={() => window.electronAPI.openExternal('https://status.claude.com')}
              >
                Status Pages <ExternalLink className="w-2.5 h-2.5" />
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
