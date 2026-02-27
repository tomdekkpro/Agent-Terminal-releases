import { useState, useEffect, useRef, useCallback } from 'react';
import { Sparkles, PanelLeftClose, PanelLeftOpen, Square, Send, FolderOpen, AlertCircle, X, ChevronDown } from 'lucide-react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { useInsightsStore } from '../../stores/insights-store';
import { useProjectStore } from '../../stores/project-store';
import { ChatMessage } from './ChatMessage';
import { ModelSelector } from './ModelSelector';
import { SessionSidebar } from './SessionSidebar';
import type { InsightsModel, InsightsMessage } from '../../../shared/types';
import { cn } from '../../../shared/utils';

const QUICK_PROMPTS = [
  { label: 'Explain codebase', prompt: 'Give me a high-level overview of this codebase. What are the main components, how are they organized, and what does the application do?' },
  { label: 'Find bugs', prompt: 'Review this codebase for potential bugs, error handling issues, or edge cases that could cause problems. Focus on the most impactful issues.' },
  { label: 'Suggest improvements', prompt: 'What are the top improvements you would suggest for this codebase? Consider code quality, architecture, performance, and maintainability.' },
  { label: 'Optimize performance', prompt: 'Analyze this codebase for performance bottlenecks and suggest specific optimizations. Focus on areas that would have the biggest impact.' },
];

function StreamingMessage({ text }: { text: string }) {
  return (
    <div className="flex gap-3 px-4 py-3 bg-[var(--bg-secondary)]/30">
      <div className="w-7 h-7 rounded-lg flex items-center justify-center flex-shrink-0 mt-0.5 bg-purple-500/20 text-purple-400">
        <Sparkles className="w-4 h-4" />
      </div>
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 mb-1">
          <span className="text-xs font-medium text-[var(--text-secondary)]">Claude</span>
          <span className="flex items-center gap-1 text-[10px] text-[var(--accent)]">
            <span className="w-1.5 h-1.5 rounded-full bg-[var(--accent)] animate-pulse" />
            {text ? 'writing...' : 'thinking...'}
          </span>
        </div>
        {text ? (
          <div className="insights-prose text-sm text-[var(--text-primary)]">
            <ReactMarkdown remarkPlugins={[remarkGfm]}>{text}</ReactMarkdown>
          </div>
        ) : (
          <div className="flex gap-1 py-2">
            <span className="w-2 h-2 rounded-full bg-[var(--text-muted)] animate-bounce [animation-delay:0ms]" />
            <span className="w-2 h-2 rounded-full bg-[var(--text-muted)] animate-bounce [animation-delay:150ms]" />
            <span className="w-2 h-2 rounded-full bg-[var(--text-muted)] animate-bounce [animation-delay:300ms]" />
          </div>
        )}
      </div>
    </div>
  );
}

export function InsightsView() {
  const {
    sessions,
    activeSession,
    isStreaming,
    streamingText,
    sidebarOpen,
    error,
    selectedProjectPath,
    loadSessions,
    selectSession,
    createSession,
    deleteSession,
    renameSession,
    sendMessage,
    abortStream,
    toggleSidebar,
    handleStreamEvent,
    clearError,
    setSelectedProjectPath,
  } = useInsightsStore();

  const projects = useProjectStore((s) => s.projects);
  const activeProjectId = useProjectStore((s) => s.activeProjectId);

  const [input, setInput] = useState('');
  const [model, setModel] = useState<InsightsModel>('sonnet');
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  // Initialize selectedProjectPath from active project on first mount
  useEffect(() => {
    if (selectedProjectPath === null && activeProjectId) {
      const proj = projects.find((p) => p.id === activeProjectId);
      if (proj) setSelectedProjectPath(proj.path);
    }
  }, [activeProjectId, projects, selectedProjectPath, setSelectedProjectPath]);

  // Load sessions on mount and set up stream listener
  useEffect(() => {
    loadSessions();
    const cleanup = window.electronAPI.onInsightsStreamEvent(handleStreamEvent);
    return () => { cleanup(); };
  }, [loadSessions, handleStreamEvent]);

  // Auto-scroll to bottom on new messages
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [activeSession?.messages, streamingText]);

  // Sync model from active session
  useEffect(() => {
    if (activeSession?.model) {
      setModel(activeSession.model);
    }
  }, [activeSession?.model]);

  const handleSend = useCallback(
    async (content: string) => {
      const text = content.trim();
      if (!text || isStreaming) return;
      setInput('');

      if (!activeSession) {
        const session = await createSession(model, selectedProjectPath ?? undefined);
        if (!session) return;
        // createSession sets activeSession — now sendMessage can pick it up
        useInsightsStore.getState().sendMessage(text, model);
        return;
      }

      sendMessage(text, model);
    },
    [activeSession, isStreaming, model, selectedProjectPath, createSession, sendMessage],
  );

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend(input);
    }
  };

  // Auto-resize textarea
  useEffect(() => {
    const el = textareaRef.current;
    if (el) {
      el.style.height = 'auto';
      el.style.height = `${Math.min(el.scrollHeight, 200)}px`;
    }
  }, [input]);

  const handleNewChat = async () => {
    await createSession(model, selectedProjectPath ?? undefined);
  };

  const messages: InsightsMessage[] = activeSession?.messages ?? [];

  return (
    <div className="flex h-full">
      {/* Session sidebar */}
      {sidebarOpen && (
        <SessionSidebar
          sessions={sessions}
          activeSessionId={activeSession?.id ?? null}
          onSelect={selectSession}
          onNew={handleNewChat}
          onDelete={deleteSession}
          onRename={renameSession}
        />
      )}

      {/* Main chat area */}
      <div className="flex-1 flex flex-col min-w-0">
        {/* Header */}
        <div className="flex items-center gap-3 px-4 py-2.5 border-b border-[var(--border)] bg-[var(--bg-secondary)]">
          <button
            onClick={toggleSidebar}
            className="w-7 h-7 rounded flex items-center justify-center text-[var(--text-muted)] hover:text-[var(--text-primary)] hover:bg-[var(--bg-tertiary)] transition-colors"
            title={sidebarOpen ? 'Hide sidebar' : 'Show sidebar'}
          >
            {sidebarOpen ? <PanelLeftClose className="w-4 h-4" /> : <PanelLeftOpen className="w-4 h-4" />}
          </button>

          <Sparkles className="w-4 h-4 text-[var(--accent)]" />
          <span className="text-sm font-medium text-[var(--text-primary)]">
            {activeSession?.title || 'Insights'}
          </span>

          {/* Project picker */}
          <div className="relative">
            <select
              value={selectedProjectPath ?? ''}
              onChange={(e) => setSelectedProjectPath(e.target.value || null)}
              disabled={isStreaming}
              className="appearance-none text-[11px] bg-[var(--bg-tertiary)] text-[var(--text-muted)] border border-[var(--border)] rounded-md pl-6 pr-5 py-1 outline-none focus:border-[var(--accent)] disabled:opacity-50 cursor-pointer max-w-[180px] truncate"
            >
              <option value="">No project</option>
              {projects.map((p) => (
                <option key={p.id} value={p.path}>
                  {p.name}
                </option>
              ))}
            </select>
            <FolderOpen className="w-3 h-3 absolute left-1.5 top-1/2 -translate-y-1/2 text-[var(--text-muted)] pointer-events-none" />
            <ChevronDown className="w-3 h-3 absolute right-1 top-1/2 -translate-y-1/2 text-[var(--text-muted)] pointer-events-none" />
          </div>

          <div className="ml-auto">
            <ModelSelector value={model} onChange={setModel} disabled={isStreaming} />
          </div>
        </div>

        {/* Error banner */}
        {error && (
          <div className="flex items-center gap-2 px-4 py-2 bg-[var(--error)]/10 border-b border-[var(--error)]/20">
            <AlertCircle className="w-4 h-4 text-[var(--error)] flex-shrink-0" />
            <span className="text-xs text-[var(--error)] flex-1">{error}</span>
            <button onClick={clearError} className="text-[var(--error)] hover:text-[var(--error)]/80">
              <X className="w-3 h-3" />
            </button>
          </div>
        )}

        {/* Messages or empty state */}
        <div className="flex-1 overflow-y-auto">
          {messages.length === 0 && !isStreaming ? (
            <div className="flex flex-col items-center justify-center h-full gap-6 px-4">
              <div className="flex flex-col items-center gap-3">
                <div className="w-16 h-16 rounded-2xl bg-[var(--accent)]/10 flex items-center justify-center">
                  <Sparkles className="w-8 h-8 text-[var(--accent)]" />
                </div>
                <h2 className="text-lg font-medium text-[var(--text-primary)]">Start a conversation</h2>
                <p className="text-sm text-[var(--text-muted)] text-center max-w-md">
                  Ask questions about your code, get suggestions, or explore ideas with Claude.
                </p>
              </div>

              <div className="grid grid-cols-2 gap-3 w-full max-w-lg">
                {QUICK_PROMPTS.map((qp) => (
                  <button
                    key={qp.label}
                    onClick={() => handleSend(qp.prompt)}
                    className={cn(
                      'text-left px-4 py-3 rounded-lg border border-[var(--border)]',
                      'bg-[var(--bg-secondary)] hover:bg-[var(--bg-tertiary)] transition-colors',
                      'text-sm text-[var(--text-secondary)] hover:text-[var(--text-primary)]',
                    )}
                  >
                    {qp.label}
                  </button>
                ))}
              </div>
            </div>
          ) : (
            <div>
              {messages.map((msg) => (
                <ChatMessage key={msg.id} message={msg} />
              ))}
              {isStreaming && <StreamingMessage text={streamingText} />}
              <div ref={messagesEndRef} />
            </div>
          )}
        </div>

        {/* Input area */}
        <div className="border-t border-[var(--border)] bg-[var(--bg-secondary)] p-3">
          <div className="flex items-end gap-2 max-w-4xl mx-auto">
            <textarea
              ref={textareaRef}
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder="Ask anything..."
              rows={1}
              disabled={isStreaming}
              className={cn(
                'flex-1 resize-none bg-[var(--bg-primary)] text-sm text-[var(--text-primary)]',
                'border border-[var(--border)] rounded-lg px-3 py-2.5 outline-none',
                'focus:border-[var(--accent)] placeholder:text-[var(--text-muted)]',
                'disabled:opacity-50',
              )}
            />
            {isStreaming ? (
              <button
                onClick={abortStream}
                className="w-9 h-9 rounded-lg bg-[var(--error)]/20 text-[var(--error)] flex items-center justify-center hover:bg-[var(--error)]/30 transition-colors flex-shrink-0"
                title="Stop"
              >
                <Square className="w-4 h-4" />
              </button>
            ) : (
              <button
                onClick={() => handleSend(input)}
                disabled={!input.trim()}
                className={cn(
                  'w-9 h-9 rounded-lg flex items-center justify-center flex-shrink-0 transition-colors',
                  input.trim()
                    ? 'bg-[var(--accent)] text-white hover:bg-[var(--accent-hover)]'
                    : 'bg-[var(--bg-tertiary)] text-[var(--text-muted)]',
                )}
                title="Send"
              >
                <Send className="w-4 h-4" />
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
