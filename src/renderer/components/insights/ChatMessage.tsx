import { useState, useCallback, useRef, useEffect } from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import hljs from 'highlight.js';
import { Copy, Check, Sparkles, Terminal, MoreHorizontal, Trash2, RefreshCw } from 'lucide-react';
import type { InsightsMessage } from '../../../shared/types';
import { useTerminalStore } from '../../stores/terminal-store';
interface ChatMessageProps {
  message: InsightsMessage;
  providerLabel?: string;
  onDelete?: (id: string) => void;
  onRetry?: () => void;
  isLastAssistant?: boolean;
}

function CodeBlock({ className, children }: { className?: string; children: React.ReactNode }) {
  const [copied, setCopied] = useState(false);
  const [showTerminalMenu, setShowTerminalMenu] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);
  const match = /language-(\w+)/.exec(className || '');
  const lang = match ? match[1] : '';
  const code = String(children).replace(/\n$/, '');

  // Syntax highlight
  let highlightedHtml: string | null = null;
  try {
    if (lang && hljs.getLanguage(lang)) {
      highlightedHtml = hljs.highlight(code, { language: lang }).value;
    } else {
      highlightedHtml = hljs.highlightAuto(code).value;
    }
  } catch {
    highlightedHtml = null;
  }

  const handleCopy = useCallback(() => {
    navigator.clipboard.writeText(code);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }, [code]);

  const handleSendToTerminal = useCallback((terminalId: string) => {
    window.electronAPI.sendTerminalInput(terminalId, code);
    setShowTerminalMenu(false);
  }, [code]);

  // Close terminal menu on outside click
  useEffect(() => {
    if (!showTerminalMenu) return;
    const handler = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setShowTerminalMenu(false);
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [showTerminalMenu]);

  // Get active terminals from store
  const terminals = useTerminalStore((s) => s.terminals);

  return (
    <div className="relative group my-3 rounded-lg overflow-hidden border border-[var(--border)]">
      <div className="flex items-center justify-between px-3 py-1.5 bg-[var(--bg-secondary)] border-b border-[var(--border)]">
        <span className="text-xs text-[var(--text-muted)]">{lang || 'code'}</span>
        <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
          {/* Send to terminal button */}
          <div className="relative" ref={menuRef}>
            <button
              onClick={() => setShowTerminalMenu(!showTerminalMenu)}
              className="flex items-center gap-1 text-xs text-[var(--text-muted)] hover:text-[var(--text-primary)] px-1.5 py-0.5 rounded hover:bg-[var(--bg-tertiary)] transition-colors"
              title="Send to terminal"
            >
              <Terminal className="w-3 h-3" />
              Run
            </button>
            {showTerminalMenu && (
              <div className="absolute right-0 top-full mt-1 z-50 w-48 bg-[var(--bg-card)] border border-[var(--border)] rounded-lg shadow-2xl overflow-hidden">
                {terminals.length === 0 ? (
                  <div className="px-3 py-2 text-xs text-[var(--text-muted)]">No open terminals</div>
                ) : (
                  terminals.map((t) => (
                    <button
                      key={t.id}
                      onClick={() => handleSendToTerminal(t.id)}
                      className="w-full text-left px-3 py-1.5 text-xs hover:bg-[var(--bg-tertiary)] transition-colors text-[var(--text-secondary)] truncate"
                    >
                      <Terminal className="w-3 h-3 inline-block mr-1.5 text-[var(--text-muted)]" />
                      {t.title}
                    </button>
                  ))
                )}
              </div>
            )}
          </div>
          <button
            onClick={handleCopy}
            className="flex items-center gap-1 text-xs text-[var(--text-muted)] hover:text-[var(--text-primary)] px-1.5 py-0.5 rounded hover:bg-[var(--bg-tertiary)] transition-colors"
          >
            {copied ? <Check className="w-3 h-3" /> : <Copy className="w-3 h-3" />}
            {copied ? 'Copied' : 'Copy'}
          </button>
        </div>
      </div>
      <pre className="p-3 overflow-x-auto bg-[var(--bg-primary)] text-sm">
        {highlightedHtml ? (
          <code className={className} dangerouslySetInnerHTML={{ __html: highlightedHtml }} />
        ) : (
          <code className={className}>{code}</code>
        )}
      </pre>
    </div>
  );
}

export function ChatMessage({ message, providerLabel, onDelete, onRetry, isLastAssistant }: ChatMessageProps) {
  const isUser = message.role === 'user';
  const [copied, setCopied] = useState(false);
  const [showMenu, setShowMenu] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);

  // Close menu on outside click
  useEffect(() => {
    if (!showMenu) return;
    const handler = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setShowMenu(false);
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [showMenu]);

  const handleCopyMessage = useCallback(() => {
    navigator.clipboard.writeText(message.content);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }, [message.content]);

  if (isUser) {
    return (
      <div className="flex justify-end px-4 py-3 group">
        <div className="max-w-[75%] flex flex-col items-end gap-1">
          <div className="flex items-center gap-1">
            {/* Context menu for user messages */}
            <div className="relative opacity-0 group-hover:opacity-100 transition-opacity" ref={!isUser ? undefined : menuRef}>
              <button
                onClick={() => setShowMenu(!showMenu)}
                className="w-6 h-6 rounded flex items-center justify-center text-[var(--text-muted)] hover:text-[var(--text-primary)] hover:bg-[var(--bg-tertiary)] transition-colors"
              >
                <MoreHorizontal className="w-3.5 h-3.5" />
              </button>
              {showMenu && (
                <div className="absolute right-0 top-full mt-1 z-50 w-40 bg-[var(--bg-card)] border border-[var(--border)] rounded-lg shadow-2xl overflow-hidden">
                  <button
                    onClick={() => { handleCopyMessage(); setShowMenu(false); }}
                    className="w-full text-left px-3 py-1.5 text-xs hover:bg-[var(--bg-tertiary)] transition-colors text-[var(--text-secondary)] flex items-center gap-2"
                  >
                    <Copy className="w-3 h-3" /> Copy message
                  </button>
                  {onDelete && (
                    <button
                      onClick={() => { onDelete(message.id); setShowMenu(false); }}
                      className="w-full text-left px-3 py-1.5 text-xs hover:bg-[var(--error)]/10 transition-colors text-[var(--error)] flex items-center gap-2"
                    >
                      <Trash2 className="w-3 h-3" /> Delete from here
                    </button>
                  )}
                </div>
              )}
            </div>
            <div className="bg-[var(--accent)] text-white rounded-2xl rounded-br-sm px-4 py-2.5">
              <p className="text-sm whitespace-pre-wrap">{message.content}</p>
            </div>
          </div>
          <span className="text-[10px] text-[var(--text-muted)] px-1" title={message.timestamp}>
            {new Date(message.timestamp).toLocaleTimeString()}
          </span>
        </div>
      </div>
    );
  }

  return (
    <div className="flex gap-3 px-4 py-3 group">
      <div className="w-7 h-7 rounded-lg flex items-center justify-center shrink-0 mt-0.5 bg-purple-500/20 text-purple-400">
        <Sparkles className="w-4 h-4" />
      </div>

      <div className="flex-1 min-w-0 max-w-[85%]">
        <div className="flex items-center gap-2 mb-1">
          <span className="text-xs font-medium text-[var(--text-secondary)]">{providerLabel || 'Claude'}</span>
          {message.model && (
            <span className="text-[10px] px-1.5 py-0.5 rounded bg-[var(--bg-tertiary)] text-[var(--text-muted)]">
              {message.model}
            </span>
          )}
          <span className="text-[10px] text-[var(--text-muted)]" title={message.timestamp}>
            {new Date(message.timestamp).toLocaleTimeString()}
          </span>

          {/* Action buttons */}
          <div className="ml-auto flex items-center gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity">
            <button
              onClick={handleCopyMessage}
              className="w-6 h-6 rounded flex items-center justify-center text-[var(--text-muted)] hover:text-[var(--text-primary)] hover:bg-[var(--bg-tertiary)] transition-colors"
              title="Copy message"
            >
              {copied ? <Check className="w-3 h-3 text-emerald-400" /> : <Copy className="w-3 h-3" />}
            </button>
            {isLastAssistant && onRetry && (
              <button
                onClick={onRetry}
                className="w-6 h-6 rounded flex items-center justify-center text-[var(--text-muted)] hover:text-[var(--text-primary)] hover:bg-[var(--bg-tertiary)] transition-colors"
                title="Retry"
              >
                <RefreshCw className="w-3 h-3" />
              </button>
            )}
            {onDelete && (
              <button
                onClick={() => onDelete(message.id)}
                className="w-6 h-6 rounded flex items-center justify-center text-[var(--text-muted)] hover:text-[var(--error)] hover:bg-[var(--error)]/10 transition-colors"
                title="Delete from here"
              >
                <Trash2 className="w-3 h-3" />
              </button>
            )}
          </div>
        </div>

        <div className="insights-prose text-sm text-[var(--text-primary)]">
          <ReactMarkdown
            remarkPlugins={[remarkGfm]}
            components={{
              code({ className, children, ...props }) {
                const isInline = !className;
                if (isInline) {
                  return (
                    <code className="px-1.5 py-0.5 rounded bg-[var(--bg-tertiary)] text-[var(--accent-hover)] text-[0.85em]" {...props}>
                      {children}
                    </code>
                  );
                }
                return <CodeBlock className={className}>{children}</CodeBlock>;
              },
              a({ href, children }) {
                return (
                  <a
                    href={href}
                    onClick={(e) => {
                      e.preventDefault();
                      if (href) window.electronAPI.openExternal(href);
                    }}
                    className="text-[var(--accent)] hover:text-[var(--accent-hover)] underline"
                  >
                    {children}
                  </a>
                );
              },
            }}
          >
            {message.content}
          </ReactMarkdown>
        </div>
      </div>
    </div>
  );
}
