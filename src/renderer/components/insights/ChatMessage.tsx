import { useState, useCallback } from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { Copy, Check, Sparkles } from 'lucide-react';
import type { InsightsMessage } from '../../../shared/types';


interface ChatMessageProps {
  message: InsightsMessage;
}

function CodeBlock({ className, children }: { className?: string; children: React.ReactNode }) {
  const [copied, setCopied] = useState(false);
  const match = /language-(\w+)/.exec(className || '');
  const lang = match ? match[1] : '';
  const code = String(children).replace(/\n$/, '');

  const handleCopy = useCallback(() => {
    navigator.clipboard.writeText(code);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }, [code]);

  return (
    <div className="relative group my-3 rounded-lg overflow-hidden border border-[var(--border)]">
      <div className="flex items-center justify-between px-3 py-1.5 bg-[var(--bg-secondary)] border-b border-[var(--border)]">
        <span className="text-xs text-[var(--text-muted)]">{lang || 'code'}</span>
        <button
          onClick={handleCopy}
          className="flex items-center gap-1 text-xs text-[var(--text-muted)] hover:text-[var(--text-primary)] opacity-0 group-hover:opacity-100 transition-opacity"
        >
          {copied ? <Check className="w-3 h-3" /> : <Copy className="w-3 h-3" />}
          {copied ? 'Copied' : 'Copy'}
        </button>
      </div>
      <pre className="p-3 overflow-x-auto bg-[var(--bg-primary)] text-sm">
        <code className={className}>{code}</code>
      </pre>
    </div>
  );
}

export function ChatMessage({ message }: ChatMessageProps) {
  const isUser = message.role === 'user';

  if (isUser) {
    return (
      <div className="flex justify-end px-4 py-3">
        <div className="max-w-[75%] flex flex-col items-end gap-1">
          <div className="bg-[var(--accent)] text-white rounded-2xl rounded-br-sm px-4 py-2.5">
            <p className="text-sm whitespace-pre-wrap">{message.content}</p>
          </div>
          <span className="text-[10px] text-[var(--text-muted)] px-1" title={message.timestamp}>
            {new Date(message.timestamp).toLocaleTimeString()}
          </span>
        </div>
      </div>
    );
  }

  return (
    <div className="flex gap-3 px-4 py-3">
      <div className="w-7 h-7 rounded-lg flex items-center justify-center flex-shrink-0 mt-0.5 bg-purple-500/20 text-purple-400">
        <Sparkles className="w-4 h-4" />
      </div>

      <div className="flex-1 min-w-0 max-w-[85%]">
        <div className="flex items-center gap-2 mb-1">
          <span className="text-xs font-medium text-[var(--text-secondary)]">Claude</span>
          {message.model && (
            <span className="text-[10px] px-1.5 py-0.5 rounded bg-[var(--bg-tertiary)] text-[var(--text-muted)]">
              {message.model}
            </span>
          )}
          <span className="text-[10px] text-[var(--text-muted)]" title={message.timestamp}>
            {new Date(message.timestamp).toLocaleTimeString()}
          </span>
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
