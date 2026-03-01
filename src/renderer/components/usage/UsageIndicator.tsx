/**
 * Usage Indicator - Real-time Claude usage display
 *
 * Shows session/weekly usage as a color-coded badge.
 * Hover to expand detailed breakdown popup.
 * Tracks accumulated cost and tokens from terminal output.
 */

import { useState, useEffect, useRef, useCallback } from 'react';
import { Activity, TrendingUp, AlertCircle, Clock } from 'lucide-react';
import { useUsageStore } from '../../stores/usage-store';
import { cn } from '../../../shared/utils';
import type { UsageSnapshot, UsageCostData } from '../../../shared/types';

/** Usage threshold constants */
const THRESHOLD_CRITICAL = 95;
const THRESHOLD_WARNING = 91;
const THRESHOLD_ELEVATED = 71;

/** Color helpers */
function getColorClass(percent: number): string {
  if (percent >= THRESHOLD_CRITICAL) return 'text-red-500';
  if (percent >= THRESHOLD_WARNING) return 'text-orange-500';
  if (percent >= THRESHOLD_ELEVATED) return 'text-yellow-500';
  return 'text-green-500';
}

function getBadgeClasses(percent: number): string {
  if (percent >= THRESHOLD_CRITICAL) return 'text-red-500 bg-red-500/10 border-red-500/20';
  if (percent >= THRESHOLD_WARNING) return 'text-orange-500 bg-orange-500/10 border-orange-500/20';
  if (percent >= THRESHOLD_ELEVATED) return 'text-yellow-500 bg-yellow-500/10 border-yellow-500/20';
  return 'text-green-500 bg-green-500/10 border-green-500/20';
}

function getBarGradient(percent: number): string {
  if (percent >= THRESHOLD_CRITICAL) return 'bg-gradient-to-r from-red-600 to-red-500';
  if (percent >= THRESHOLD_WARNING) return 'bg-gradient-to-r from-orange-600 to-orange-500';
  if (percent >= THRESHOLD_ELEVATED) return 'bg-gradient-to-r from-yellow-600 to-yellow-500';
  return 'bg-gradient-to-r from-green-600 to-green-500';
}

function formatTokens(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}K`;
  return n.toString();
}

export function UsageIndicator() {
  const usage = useUsageStore((s) => s.usage);
  const isLoading = useUsageStore((s) => s.isLoading);
  const isAvailable = useUsageStore((s) => s.isAvailable);
  const setUsage = useUsageStore((s) => s.setUsage);
  const setLoading = useUsageStore((s) => s.setLoading);
  const setAvailable = useUsageStore((s) => s.setAvailable);
  const addCostData = useUsageStore((s) => s.addCostData);
  const totalSessionCost = useUsageStore((s) => s.totalSessionCost);
  const totalInputTokens = useUsageStore((s) => s.totalInputTokens);
  const totalOutputTokens = useUsageStore((s) => s.totalOutputTokens);

  const [isOpen, setIsOpen] = useState(false);
  const [isPinned, setIsPinned] = useState(false);
  const hoverTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const popoverRef = useRef<HTMLDivElement>(null);

  // Fetch initial usage + listen for updates
  useEffect(() => {
    let unsubUsage: (() => void) | undefined;
    let unsubCost: (() => void) | undefined;

    // Listen for usage updates from main process
    if (window.electronAPI.onUsageUpdated) {
      unsubUsage = window.electronAPI.onUsageUpdated((snapshot: UsageSnapshot) => {
        setUsage(snapshot);
      });
    }

    // Listen for cost updates from terminal output
    if (window.electronAPI.onUsageCostUpdate) {
      unsubCost = window.electronAPI.onUsageCostUpdate((data: UsageCostData) => {
        addCostData(data);
      });
    }

    // Request initial usage
    if (window.electronAPI.requestUsageUpdate) {
      window.electronAPI
        .requestUsageUpdate()
        .then((result: { success: boolean; data?: UsageSnapshot }) => {
          setLoading(false);
          if (result.success && result.data) {
            setUsage(result.data);
          } else {
            setAvailable(false);
          }
        })
        .catch(() => {
          setLoading(false);
          setAvailable(false);
        });
    } else {
      setLoading(false);
      setAvailable(false);
    }

    return () => {
      unsubUsage?.();
      unsubCost?.();
    };
  }, [setUsage, setLoading, setAvailable, addCostData]);

  // Click outside to close pinned popup
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

  // Cleanup hover timeout
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
    if (!window.electronAPI.requestUsageUpdate) return;
    setLoading(true);
    try {
      const result = await window.electronAPI.requestUsageUpdate();
      if (result.success && result.data) {
        setUsage(result.data);
      }
    } catch {
      // Silently fail
    } finally {
      setLoading(false);
    }
  }, [setUsage, setLoading]);

  // Loading state
  if (isLoading) {
    return (
      <div className="flex items-center gap-1.5 px-2 py-1 rounded-md border border-[var(--border)] bg-[var(--bg-card)] text-[var(--text-muted)]">
        <Activity className="h-3.5 w-3.5 animate-pulse" />
        <span className="text-[10px] font-semibold">...</span>
      </div>
    );
  }

  // Unavailable state
  if (!isAvailable || !usage) {
    return (
      <div
        className="flex items-center gap-1.5 px-2 py-1 rounded-md border border-[var(--border)] bg-[var(--bg-card)] text-[var(--text-muted)] cursor-help"
        title="Usage data unavailable. Ensure Claude CLI is installed and authenticated."
      >
        <Activity className="h-3.5 w-3.5" />
        <span className="text-[10px] font-semibold">N/A</span>
      </div>
    );
  }

  const sessionPercent = usage.sessionPercent;
  const weeklyPercent = usage.weeklyPercent;
  const limitingPercent = Math.max(sessionPercent, weeklyPercent);
  const badgeClasses = getBadgeClasses(limitingPercent);
  const Icon =
    limitingPercent >= THRESHOLD_WARNING
      ? AlertCircle
      : limitingPercent >= THRESHOLD_ELEVATED
        ? TrendingUp
        : Activity;

  return (
    <div className="relative" ref={popoverRef}>
      {/* Badge trigger */}
      <button
        className={cn(
          'flex items-center gap-1 px-2 py-1 rounded-md border transition-all hover:opacity-80',
          badgeClasses
        )}
        onMouseEnter={handleMouseEnter}
        onMouseLeave={handleMouseLeave}
        onClick={handleClick}
        title="Claude Usage"
      >
        <Icon className="h-3.5 w-3.5 shrink-0" />
        <div className="flex items-center gap-0.5 text-[10px] font-semibold font-mono">
          <span className={getColorClass(sessionPercent)}>{Math.round(sessionPercent)}</span>
          <span className="text-[var(--text-muted)] opacity-50">|</span>
          <span className={getColorClass(weeklyPercent)}>{Math.round(weeklyPercent)}</span>
        </div>
      </button>

      {/* Popover */}
      {isOpen && (
        <div
          className="absolute top-full right-0 mt-1 w-64 bg-[var(--bg-card)] border border-[var(--border)] rounded-lg shadow-xl z-50"
          onMouseEnter={handleMouseEnter}
          onMouseLeave={handleMouseLeave}
        >
          <div className="p-3 space-y-3">
            {/* Header */}
            <div className="flex items-center justify-between pb-2 border-b border-[var(--border)]">
              <div className="flex items-center gap-1.5">
                <Icon className="h-3.5 w-3.5 text-[var(--text-secondary)]" />
                <span className="font-semibold text-xs text-[var(--text-primary)]">
                  Usage Breakdown
                </span>
              </div>
              <button
                onClick={handleRefresh}
                className="text-[10px] text-[var(--text-muted)] hover:text-[var(--accent)] transition-colors"
                title="Refresh"
              >
                Refresh
              </button>
            </div>

            {/* Session usage */}
            <div className="space-y-1.5">
              <div className="flex items-center justify-between">
                <span className="text-[var(--text-muted)] font-medium text-[11px] flex items-center gap-1">
                  <Clock className="h-3 w-3" />
                  Session
                </span>
                <span className={cn('font-semibold text-xs tabular-nums', getColorClass(sessionPercent))}>
                  {Math.round(sessionPercent)}%
                </span>
              </div>
              {usage.sessionResetTime && (
                <div className="text-[10px] text-[var(--text-muted)] pl-4">
                  {usage.sessionResetTime}
                </div>
              )}
              <div className="h-2 bg-[var(--bg-secondary)] rounded-full overflow-hidden">
                <div
                  className={cn('h-full rounded-full transition-all duration-500 ease-out', getBarGradient(sessionPercent))}
                  style={{ width: `${Math.min(sessionPercent, 100)}%` }}
                />
              </div>
            </div>

            {/* Weekly usage */}
            <div className="space-y-1.5">
              <div className="flex items-center justify-between">
                <span className="text-[var(--text-muted)] font-medium text-[11px] flex items-center gap-1">
                  <TrendingUp className="h-3 w-3" />
                  Weekly
                </span>
                <span className={cn('font-semibold text-xs tabular-nums', getColorClass(weeklyPercent))}>
                  {Math.round(weeklyPercent)}%
                </span>
              </div>
              {usage.weeklyResetTime && (
                <div className="text-[10px] text-[var(--text-muted)] pl-4">
                  {usage.weeklyResetTime}
                </div>
              )}
              <div className="h-2 bg-[var(--bg-secondary)] rounded-full overflow-hidden">
                <div
                  className={cn('h-full rounded-full transition-all duration-500 ease-out', getBarGradient(weeklyPercent))}
                  style={{ width: `${Math.min(weeklyPercent, 100)}%` }}
                />
              </div>
            </div>

            {/* Session cost/tokens summary */}
            {(totalSessionCost > 0 || totalInputTokens > 0 || totalOutputTokens > 0) && (
              <div className="pt-2 border-t border-[var(--border)] space-y-1">
                <div className="text-[10px] text-[var(--text-muted)] font-medium">
                  Session Totals
                </div>
                <div className="grid grid-cols-3 gap-2 text-center">
                  {totalSessionCost > 0 && (
                    <div>
                      <div className="text-[10px] text-[var(--text-muted)]">Cost</div>
                      <div className="text-xs font-semibold text-[var(--text-primary)]">
                        ${totalSessionCost.toFixed(2)}
                      </div>
                    </div>
                  )}
                  {totalInputTokens > 0 && (
                    <div>
                      <div className="text-[10px] text-[var(--text-muted)]">In</div>
                      <div className="text-xs font-semibold text-[var(--text-primary)]">
                        {formatTokens(totalInputTokens)}
                      </div>
                    </div>
                  )}
                  {totalOutputTokens > 0 && (
                    <div>
                      <div className="text-[10px] text-[var(--text-muted)]">Out</div>
                      <div className="text-xs font-semibold text-[var(--text-primary)]">
                        {formatTokens(totalOutputTokens)}
                      </div>
                    </div>
                  )}
                </div>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
