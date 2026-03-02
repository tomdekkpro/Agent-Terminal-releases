import { useEffect, useRef, useState, useCallback } from 'react';
import { Bot, X, ExternalLink, GitBranch, GitMerge, Play, Square, Clock, Smartphone, Copy, Check, Eraser, ChevronDown } from 'lucide-react';
import { Terminal as XTerm } from '@xterm/xterm';
import { FitAddon } from '@xterm/addon-fit';
import { WebLinksAddon } from '@xterm/addon-web-links';
import { WebglAddon } from '@xterm/addon-webgl';
import QRCode from 'qrcode';
import { registerOutputCallback, unregisterOutputCallback, getAndClearSavedBuffer, useTerminalStore, type Terminal } from '../../stores/terminal-store';
import { useSettingsStore } from '../../stores/settings-store';
import type { AgentProviderId, AgentProviderMeta } from '../../../shared/types';
import { cn } from '../../../shared/utils';

/** Format milliseconds to HH:MM:SS */
function formatElapsed(ms: number): string {
  const totalSeconds = Math.floor(ms / 1000);
  const h = Math.floor(totalSeconds / 3600);
  const m = Math.floor((totalSeconds % 3600) / 60);
  const s = totalSeconds % 60;
  if (h > 0) return `${h}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
  return `${m}:${String(s).padStart(2, '0')}`;
}

interface TerminalPanelProps {
  terminal: Terminal;
  isActive: boolean;
  isSplit?: boolean;
  agentProviders: AgentProviderMeta[];
  onInvokeAgent: (skipPermissions?: boolean) => void;
  onProviderChange: (provider: AgentProviderId) => void;
  onMergeComplete?: () => void;
  onClose?: () => void;
  onFocus?: () => void;
}

const TERMINAL_THEME = {
  background: '#0f0f23',
  foreground: '#e2e8f0',
  cursor: '#e2e8f0',
  cursorAccent: '#0f0f23',
  selectionBackground: '#6366f140',
  selectionForeground: '#e2e8f0',
  black: '#1e1e3a',
  red: '#ef4444',
  green: '#22c55e',
  yellow: '#f59e0b',
  blue: '#3b82f6',
  magenta: '#a855f7',
  cyan: '#06b6d4',
  white: '#e2e8f0',
  brightBlack: '#64748b',
  brightRed: '#f87171',
  brightGreen: '#4ade80',
  brightYellow: '#fbbf24',
  brightBlue: '#60a5fa',
  brightMagenta: '#c084fc',
  brightCyan: '#22d3ee',
  brightWhite: '#f8fafc',
};

export function TerminalPanel({ terminal, isActive, isSplit, agentProviders, onInvokeAgent, onProviderChange, onMergeComplete, onClose, onFocus }: TerminalPanelProps) {
  const currentProvider = agentProviders.find((p) => p.id === terminal.agentProvider) || agentProviders[0];
  const containerRef = useRef<HTMLDivElement>(null);
  const xtermRef = useRef<XTerm | null>(null);
  const fitAddonRef = useRef<FitAddon | null>(null);
  const webglAddonRef = useRef<WebglAddon | null>(null);
  const readyRef = useRef(false);
  const bufferRef = useRef<string[]>([]);

  const gpuAcceleration = useSettingsStore((s) => s.settings.terminalGpuAcceleration);

  // Provider dropdown
  const [showProviderMenu, setShowProviderMenu] = useState(false);
  const providerMenuRef = useRef<HTMLDivElement>(null);

  const initObserverRef = useRef<ResizeObserver | null>(null);

  // Remote control URL capture
  const rcBufferRef = useRef<string | null>(null);
  const rcTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [remoteUrl, setRemoteUrl] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [qrDataUrl, setQrDataUrl] = useState<string | null>(null);

  // Time tracking
  const startTimer = useTerminalStore((s) => s.startTimer);
  const stopTimer = useTerminalStore((s) => s.stopTimer);
  const tracking = terminal.timeTracking;
  const isTimerRunning = !!tracking?.startedAt;

  // Live elapsed display — tick every second while running
  const [now, setNow] = useState(Date.now());
  useEffect(() => {
    if (!isTimerRunning) return;
    const interval = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(interval);
  }, [isTimerRunning]);

  const currentElapsed = tracking
    ? tracking.elapsed + (tracking.startedAt ? now - tracking.startedAt : 0)
    : 0;

  const handleToggleTimer = useCallback(async () => {
    if (isTimerRunning) {
      const result = stopTimer(terminal.id);
      // Sync to ClickUp
      if (result && result.startedAt && terminal.task) {
        const duration = result.elapsed;
        if (duration > 0) {
          try {
            await window.electronAPI.postTaskTimeEntry(
              terminal.task.id,
              result.startedAt,
              duration,
            );
          } catch { /* non-critical */ }
        }
      }
    } else {
      startTimer(terminal.id);
    }
  }, [isTimerRunning, terminal.id, terminal.task, startTimer, stopTimer]);

  // Inline title rename state
  const [isEditingTitle, setIsEditingTitle] = useState(false);
  const [editTitle, setEditTitle] = useState('');
  const updateTerminal = useTerminalStore((s) => s.updateTerminal);

  // Close provider dropdown on outside click
  useEffect(() => {
    if (!showProviderMenu) return;
    const handler = (e: MouseEvent) => {
      if (providerMenuRef.current && !providerMenuRef.current.contains(e.target as Node)) {
        setShowProviderMenu(false);
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [showProviderMenu]);

  /** Safe fit — xterm can throw if renderer isn't fully ready */
  const safeFit = () => {
    try {
      if (fitAddonRef.current && xtermRef.current && readyRef.current) {
        fitAddonRef.current.fit();
      }
    } catch { /* xterm renderer not ready yet */ }
  };

  /** Safe write — xterm can throw if renderer isn't fully ready */
  const safeWrite = (data: string) => {
    try {
      if (xtermRef.current && readyRef.current) {
        xtermRef.current.write(data);
      } else {
        bufferRef.current.push(data);
      }
    } catch {
      bufferRef.current.push(data);
    }
  };

  // Initialize xterm — deferred until container has non-zero dimensions
  useEffect(() => {
    if (!containerRef.current) return;
    const container = containerRef.current;
    let disposed = false;

    // Restore saved output from previous session (before live data arrives)
    // Skip for Claude terminals — claude --resume displays its own conversation history
    const savedBuffer = getAndClearSavedBuffer(terminal.id);
    if (savedBuffer && !terminal.isClaudeMode) {
      bufferRef.current.push(savedBuffer);
      bufferRef.current.push('\r\n\x1b[90m--- Session restored ---\x1b[0m\r\n\r\n');
    }

    // Buffer output from the very start, before xterm even exists
    registerOutputCallback(terminal.id, (data) => {
      safeWrite(data);
      // Capture remote control URL from output
      if (rcBufferRef.current !== null) {
        rcBufferRef.current += data;
        // Strip ANSI escape codes and match URL
        const clean = rcBufferRef.current.replace(/\x1b\[[0-9;]*[a-zA-Z]/g, '');
        const urlMatch = clean.match(/https:\/\/\S+/);
        if (urlMatch) {
          const url = urlMatch[0].replace(/[)\]}>.,;:!?'"+]+$/, '');
          setRemoteUrl(url);
          setCopied(false);
          rcBufferRef.current = null;
          if (rcTimeoutRef.current) { clearTimeout(rcTimeoutRef.current); rcTimeoutRef.current = null; }
        }
      }
    });

    const doInit = () => {
      if (disposed || xtermRef.current) return;

      const rect = container.getBoundingClientRect();
      if (rect.width === 0 || rect.height === 0) return; // not visible yet

      // Container is visible — disconnect init observer
      if (initObserverRef.current) {
        initObserverRef.current.disconnect();
        initObserverRef.current = null;
      }

      const xterm = new XTerm({
        cursorBlink: true,
        cursorStyle: 'block',
        fontSize: 14,
        fontFamily: 'Cascadia Code, Consolas, Courier New, monospace',
        lineHeight: 1.2,
        theme: TERMINAL_THEME,
        allowProposedApi: true,
        scrollback: 10000,
      });

      const fitAddon = new FitAddon();
      const webLinksAddon = new WebLinksAddon((_event, uri) => {
        window.electronAPI?.openExternal?.(uri);
      });

      xterm.loadAddon(fitAddon);
      xterm.loadAddon(webLinksAddon);

      xtermRef.current = xterm;
      fitAddonRef.current = fitAddon;

      // Open xterm inside rAF to ensure container is fully laid out
      requestAnimationFrame(() => {
        if (disposed || !xtermRef.current || !containerRef.current) return;

        try {
          xterm.open(containerRef.current);
        } catch {
          // open failed — container still not ready, retry
          xtermRef.current = null;
          fitAddonRef.current = null;
          setTimeout(() => doInit(), 100);
          return;
        }

        // Double rAF: wait for xterm's internal renderer to initialize
        requestAnimationFrame(() => {
          if (disposed || !fitAddonRef.current || !xtermRef.current) return;

          try {
            fitAddonRef.current.fit();
          } catch { /* renderer not ready */ }

          xtermRef.current.focus();
          readyRef.current = true;

          // Load WebGL renderer if GPU acceleration is enabled
          const gpuEnabled = useSettingsStore.getState().settings.terminalGpuAcceleration;
          if (gpuEnabled) {
            try {
              const addon = new WebglAddon();
              addon.onContextLoss(() => {
                // WebGL context lost — dispose and fall back to DOM renderer
                addon.dispose();
                webglAddonRef.current = null;
              });
              xtermRef.current!.loadAddon(addon);
              webglAddonRef.current = addon;
            } catch {
              // WebGL not supported — silently fall back to DOM renderer
            }
          }

          // Flush buffered output
          if (bufferRef.current.length > 0) {
            const pending = bufferRef.current.splice(0);
            for (const data of pending) {
              try { xtermRef.current!.write(data); } catch { /* skip */ }
            }
          }

          const cols = xtermRef.current.cols;
          const rows = xtermRef.current.rows;
          if (cols > 0 && rows > 0) {
            window.electronAPI.resizeTerminal(terminal.id, cols, rows);
          }
        });
      });

      // Handle input
      xterm.onData((data) => {
        window.electronAPI.sendTerminalInput(terminal.id, data);
      });

      // Handle resize
      xterm.onResize(({ cols, rows }) => {
        window.electronAPI.resizeTerminal(terminal.id, cols, rows);
      });

      // Copy/paste handling
      xterm.attachCustomKeyEventHandler((event) => {
        const isMod = event.metaKey || event.ctrlKey;

        if (event.key === 'Enter' && event.shiftKey && !isMod && event.type === 'keydown') {
          xterm.input('\x1b\n');
          return false;
        }

        if (isMod && (event.key === 'c' || event.key === 'C') && event.type === 'keydown') {
          if (xterm.hasSelection()) {
            const selection = xterm.getSelection();
            if (selection) navigator.clipboard.writeText(selection);
            return false;
          }
          return true;
        }

        if (event.ctrlKey && (event.key === 'v' || event.key === 'V') && event.type === 'keydown') {
          event.preventDefault();
          navigator.clipboard.readText().then((text) => {
            if (text) xterm.paste(text);
          });
          return false;
        }

        return true;
      });
    };

    // Try init after a frame, otherwise wait via ResizeObserver
    requestAnimationFrame(() => {
      if (disposed || xtermRef.current) return;
      const rect = container.getBoundingClientRect();
      if (rect.width > 0 && rect.height > 0) {
        doInit();
      } else {
        initObserverRef.current = new ResizeObserver(() => {
          doInit();
        });
        initObserverRef.current.observe(container);
      }
    });

    return () => {
      disposed = true;
      unregisterOutputCallback(terminal.id);
      readyRef.current = false;
      bufferRef.current = [];
      rcBufferRef.current = null;
      if (rcTimeoutRef.current) { clearTimeout(rcTimeoutRef.current); rcTimeoutRef.current = null; }
      if (initObserverRef.current) { initObserverRef.current.disconnect(); initObserverRef.current = null; }
      if (webglAddonRef.current) { webglAddonRef.current.dispose(); webglAddonRef.current = null; }
      if (fitAddonRef.current) { fitAddonRef.current.dispose(); fitAddonRef.current = null; }
      if (xtermRef.current) { xtermRef.current.dispose(); xtermRef.current = null; }
    };
  }, [terminal.id]);

  // Fit on visibility change
  useEffect(() => {
    if (!isActive || !containerRef.current) return;

    if (!xtermRef.current || !readyRef.current) return;

    requestAnimationFrame(() => {
      safeFit();
      xtermRef.current?.focus();
    });
  }, [isActive]);

  // Resize observer for ongoing resizes (only when xterm is ready)
  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    let resizeTimeout: ReturnType<typeof setTimeout>;
    const observer = new ResizeObserver(() => {
      clearTimeout(resizeTimeout);
      resizeTimeout = setTimeout(() => {
        if (readyRef.current && containerRef.current) {
          const rect = containerRef.current.getBoundingClientRect();
          if (rect.width > 0 && rect.height > 0) {
            safeFit();
          }
        }
      }, 200);
    });

    observer.observe(container);
    return () => {
      clearTimeout(resizeTimeout);
      observer.disconnect();
    };
  }, []);

  // Generate QR code when remoteUrl changes
  useEffect(() => {
    if (!remoteUrl) { setQrDataUrl(null); return; }
    QRCode.toDataURL(remoteUrl, { width: 200, margin: 2, color: { dark: '#000000', light: '#ffffff' } })
      .then(setQrDataUrl)
      .catch(() => setQrDataUrl(null));
  }, [remoteUrl]);

  return (
    <div className="flex flex-col h-full relative" onClick={onFocus}>
      {/* Terminal toolbar */}
      <div className={cn(
        'h-9 bg-[var(--bg-card)] border-b border-[var(--border)] flex items-center px-3 justify-between shrink-0',
        isSplit && isActive && 'border-b-[var(--accent)]'
      )}>
        <div className="flex items-center gap-2 min-w-0 flex-1">
          {isEditingTitle ? (
            <input
              className="text-xs text-[var(--text-primary)] bg-transparent outline-none border-b border-[var(--accent)] truncate shrink-0 py-0 w-[120px]"
              value={editTitle}
              onChange={(e) => setEditTitle(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  const trimmed = editTitle.trim();
                  if (trimmed) updateTerminal(terminal.id, { title: trimmed });
                  setIsEditingTitle(false);
                } else if (e.key === 'Escape') {
                  setIsEditingTitle(false);
                }
              }}
              onBlur={() => {
                const trimmed = editTitle.trim();
                if (trimmed) updateTerminal(terminal.id, { title: trimmed });
                setIsEditingTitle(false);
              }}
              autoFocus
              onClick={(e) => e.stopPropagation()}
            />
          ) : (
            <span
              className="text-xs text-[var(--text-secondary)] truncate shrink-0"
              onDoubleClick={(e) => {
                e.stopPropagation();
                setIsEditingTitle(true);
                setEditTitle(terminal.title);
              }}
            >
              {terminal.title}
            </span>
          )}
          {terminal.task && (
            <button
              onClick={(e) => {
                e.stopPropagation();
                if (terminal.task?.url) window.electronAPI?.openExternal?.(terminal.task.url);
              }}
              className="flex items-center gap-1.5 px-2 py-0.5 rounded-md text-[10px] hover:opacity-80 transition-opacity min-w-0 shrink"
              style={{
                backgroundColor: `${terminal.task.statusColor}20`,
                color: terminal.task.statusColor,
              }}
              title={`${terminal.task.name} — Click to open task`}
            >
              <span
                className="w-1.5 h-1.5 rounded-full shrink-0"
                style={{ backgroundColor: terminal.task.statusColor }}
              />
              {terminal.task.customId && (
                <span className="font-mono shrink-0">{terminal.task.customId}</span>
              )}
              <span className="truncate">{terminal.task.name}</span>
              <ExternalLink className="w-2.5 h-2.5 shrink-0 opacity-60" />
            </button>
          )}
          {terminal.worktreeBranch && (
            <span className="flex items-center gap-1 text-[10px] text-[var(--text-muted)] shrink-0">
              <GitBranch className="w-2.5 h-2.5" />
              <span className="font-mono">{terminal.worktreeBranch}</span>
            </span>
          )}
          {!terminal.task && !terminal.worktreeBranch && isSplit && (
            <span className="text-[10px] text-[var(--text-muted)] truncate">{terminal.cwd || '~'}</span>
          )}
        </div>
        <div className="flex items-center gap-1 shrink-0">
          {/* Time tracker */}
          {terminal.task && (
            <div className="flex items-center gap-1 mr-1">
              <button
                onClick={(e) => { e.stopPropagation(); handleToggleTimer(); }}
                className={cn(
                  'w-6 h-6 rounded-md flex items-center justify-center transition-colors',
                  isTimerRunning
                    ? 'bg-red-500/20 text-red-400 hover:bg-red-500/30'
                    : 'bg-sky-500/20 text-sky-400 hover:bg-sky-500/30'
                )}
                title={isTimerRunning ? 'Stop timer & sync time' : 'Start time tracking'}
              >
                {isTimerRunning ? <Square className="w-3 h-3" /> : <Play className="w-3 h-3" />}
              </button>
              {(currentElapsed > 0 || isTimerRunning) && (
                <span className={cn(
                  'text-[11px] font-mono tabular-nums',
                  isTimerRunning ? 'text-red-400' : 'text-[var(--text-muted)]'
                )}>
                  <Clock className="w-3 h-3 inline-block mr-0.5 -mt-px" />
                  {formatElapsed(currentElapsed)}
                </span>
              )}
            </div>
          )}
          {terminal.task && onMergeComplete && (
            <button
              onClick={(e) => { e.stopPropagation(); onMergeComplete(); }}
              className="flex items-center gap-1.5 px-2.5 py-1 rounded-md text-xs bg-emerald-500/20 text-emerald-400 hover:bg-emerald-500/30 transition-colors"
              title={terminal.worktreeBranch
                ? `Complete task — merge or create PR for ${terminal.worktreeBranch}`
                : 'Complete task — create PR or push code'}
            >
              <GitMerge className="w-3.5 h-3.5" />
              {!isSplit && 'Complete'}
            </button>
          )}
          {!terminal.isClaudeMode && (
            <>
              {/* Provider dropdown */}
              <div className="relative" ref={providerMenuRef}>
                <button
                  onClick={(e) => { e.stopPropagation(); setShowProviderMenu(!showProviderMenu); }}
                  className="flex items-center gap-1 px-2 py-1 rounded-md text-xs bg-[var(--bg-tertiary)] text-[var(--text-secondary)] hover:bg-[var(--bg-tertiary)]/80 transition-colors"
                  title="Select AI provider"
                >
                  <Bot className="w-3 h-3" />
                  {!isSplit && (currentProvider?.displayName || terminal.agentProvider)}
                  <ChevronDown className="w-3 h-3" />
                </button>
                {showProviderMenu && (
                  <div className="absolute right-0 top-full mt-1 z-50 w-44 bg-[var(--bg-card)] border border-[var(--border)] rounded-lg shadow-2xl overflow-hidden max-h-60 overflow-y-auto">
                    {agentProviders.map((p) => (
                      <button
                        key={p.id}
                        onClick={(e) => { e.stopPropagation(); onProviderChange(p.id); setShowProviderMenu(false); }}
                        className={cn(
                          'w-full flex items-center gap-2 px-3 py-2 text-xs hover:bg-[var(--bg-tertiary)] transition-colors',
                          terminal.agentProvider === p.id ? 'font-medium' : 'text-[var(--text-secondary)]'
                        )}
                        style={terminal.agentProvider === p.id ? { color: p.color } : undefined}
                      >
                        <Bot className="w-3.5 h-3.5" />
                        {p.displayName}
                        {!p.available && <span className="text-[9px] text-[var(--text-muted)] ml-auto">(N/A)</span>}
                      </button>
                    ))}
                  </div>
                )}
              </div>
              {/* Start button */}
              <button
                onClick={(e) => { e.stopPropagation(); onInvokeAgent(); }}
                className="flex items-center gap-1.5 px-2.5 py-1 rounded-md text-xs transition-colors"
                style={{
                  backgroundColor: `${currentProvider?.color || '#6366f1'}20`,
                  color: currentProvider?.color || '#6366f1',
                }}
                title={`Start ${currentProvider?.displayName || terminal.agentProvider}`}
              >
                <Bot className="w-3.5 h-3.5" />
                {!isSplit && 'Start'}
              </button>
              {/* YOLO button — only for agents with yolo capability */}
              {currentProvider?.capabilities.yolo && (
                <button
                  onClick={(e) => { e.stopPropagation(); onInvokeAgent(true); }}
                  className="flex items-center gap-1.5 px-2.5 py-1 rounded-md text-xs bg-amber-500/20 text-amber-400 hover:bg-amber-500/30 transition-colors"
                  title={`Start ${currentProvider.displayName} (skip permissions)`}
                >
                  <Bot className="w-3.5 h-3.5" />
                  {!isSplit && 'YOLO'}
                </button>
              )}
            </>
          )}
          {terminal.isClaudeMode && (
            <>
              {/* Mobile button — only for agents with remoteControl */}
              {currentProvider?.capabilities.remoteControl && (
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    rcBufferRef.current = '';
                    if (rcTimeoutRef.current) clearTimeout(rcTimeoutRef.current);
                    rcTimeoutRef.current = setTimeout(() => { rcBufferRef.current = null; rcTimeoutRef.current = null; }, 15000);
                    window.electronAPI.sendTerminalInput(terminal.id, '/remote-control');
                    setTimeout(() => window.electronAPI.sendTerminalInput(terminal.id, '\r'), 50);
                  }}
                  disabled={terminal.isClaudeBusy}
                  className={cn(
                    'flex items-center gap-1.5 px-2.5 py-1 rounded-md text-xs transition-colors',
                    terminal.isClaudeBusy
                      ? 'bg-[var(--text-muted)]/10 text-[var(--text-muted)] cursor-not-allowed opacity-50'
                      : 'bg-violet-500/20 text-violet-400 hover:bg-violet-500/30'
                  )}
                  title={terminal.isClaudeBusy ? `Wait for ${currentProvider.displayName} to finish` : 'Open remote control (mobile access)'}
                >
                  <Smartphone className="w-3.5 h-3.5" />
                  {!isSplit && 'Mobile'}
                </button>
              )}
              {/* Clear button */}
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  window.electronAPI.sendTerminalInput(terminal.id, '\x15');
                }}
                disabled={terminal.isClaudeBusy}
                className={cn(
                  'flex items-center gap-1.5 px-2.5 py-1 rounded-md text-xs transition-colors',
                  terminal.isClaudeBusy
                    ? 'bg-[var(--text-muted)]/10 text-[var(--text-muted)] cursor-not-allowed opacity-50'
                    : 'bg-orange-500/20 text-orange-400 hover:bg-orange-500/30'
                )}
                title={terminal.isClaudeBusy ? `Wait for ${currentProvider?.displayName || 'agent'} to finish` : 'Clear input text'}
              >
                <Eraser className="w-3.5 h-3.5" />
                {!isSplit && 'Clear'}
              </button>
              {/* Active indicator */}
              <div
                className="flex items-center gap-1.5 px-2.5 py-1 rounded-md text-xs"
                style={{
                  backgroundColor: `${currentProvider?.color || '#22c55e'}20`,
                  color: currentProvider?.color || '#22c55e',
                }}
              >
                <Bot className={cn('w-3.5 h-3.5', terminal.isClaudeBusy && 'animate-pulse')} />
                {!isSplit && (terminal.isClaudeBusy ? 'Thinking...' : `${currentProvider?.displayName || 'Agent'} Active`)}
              </div>
            </>
          )}
          {isSplit && onClose && (
            <button
              onClick={(e) => { e.stopPropagation(); onClose(); }}
              className="w-5 h-5 rounded flex items-center justify-center hover:bg-[var(--error)]/20 hover:text-[var(--error)] text-[var(--text-muted)] transition-all"
              title="Close terminal"
            >
              <X className="w-3 h-3" />
            </button>
          )}
        </div>
      </div>

      {/* Remote control dialog */}
      {remoteUrl && (
        <div
          className="absolute inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm"
          onClick={(e) => { e.stopPropagation(); setRemoteUrl(null); }}
        >
          <div
            className="bg-[#1a1a2e] border border-violet-500/30 rounded-xl p-6 shadow-2xl flex flex-col items-center gap-4 max-w-sm mx-4"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center gap-2 text-violet-300">
              <Smartphone className="w-5 h-5" />
              <span className="text-sm font-medium">Remote Control</span>
            </div>

            <div className="bg-white rounded-lg p-3">
              {qrDataUrl
                ? <img src={qrDataUrl} alt="QR Code" className="w-[180px] h-[180px]" />
                : <div className="w-[180px] h-[180px] flex items-center justify-center text-xs text-[var(--text-muted)]">Generating...</div>
              }
            </div>

            <p className="text-[11px] text-[var(--text-muted)] text-center">
              Scan with your phone or copy the link below
            </p>

            <div className="flex items-center gap-2 w-full bg-[#0f0f23] rounded-lg px-3 py-2 border border-[var(--border)]">
              <span className="text-[11px] text-violet-300 font-mono truncate flex-1 select-all">{remoteUrl}</span>
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  navigator.clipboard.writeText(remoteUrl);
                  setCopied(true);
                  setTimeout(() => setCopied(false), 2000);
                }}
                className={cn(
                  'flex items-center gap-1 px-2.5 py-1 rounded-md text-[11px] transition-colors shrink-0',
                  copied
                    ? 'bg-emerald-500/20 text-emerald-400'
                    : 'bg-violet-500/20 text-violet-300 hover:bg-violet-500/30'
                )}
              >
                {copied ? <Check className="w-3.5 h-3.5" /> : <Copy className="w-3.5 h-3.5" />}
                {copied ? 'Copied!' : 'Copy'}
              </button>
            </div>

            <div className="flex gap-2 w-full">
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  window.electronAPI?.openExternal?.(remoteUrl);
                }}
                className="flex-1 flex items-center justify-center gap-1.5 px-3 py-1.5 rounded-lg text-xs bg-violet-500/20 text-violet-300 hover:bg-violet-500/30 transition-colors"
              >
                <ExternalLink className="w-3.5 h-3.5" />
                Open in Browser
              </button>
              <button
                onClick={(e) => { e.stopPropagation(); setRemoteUrl(null); }}
                className="flex-1 flex items-center justify-center gap-1.5 px-3 py-1.5 rounded-lg text-xs bg-[var(--text-muted)]/10 text-[var(--text-muted)] hover:bg-[var(--text-muted)]/20 transition-colors"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Terminal container */}
      <div ref={containerRef} className="flex-1 bg-[#0f0f23] p-1" />
    </div>
  );
}
