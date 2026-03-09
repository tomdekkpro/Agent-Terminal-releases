import { useState, useEffect, useRef, useCallback } from 'react';
import { Users, Send, Wifi, Server, X, ChevronDown, GitBranch } from 'lucide-react';
import { useTeamStore } from '../../stores/team-store';
import { useProjectStore } from '../../stores/project-store';
import { useSettingsStore } from '../../stores/settings-store';
import { cn } from '../../../shared/utils';
import type { TeamMessage } from '../../../shared/types';

function TeamAvatar({ username, avatarUrl, size = 'sm' }: { username: string; avatarUrl?: string; size?: 'sm' | 'md' }) {
  const dim = size === 'sm' ? 'w-6 h-6' : 'w-8 h-8';
  const textSize = size === 'sm' ? 'text-[10px]' : 'text-xs';

  if (avatarUrl) {
    return <img src={avatarUrl} alt={username} className={cn(dim, 'rounded-full')} />;
  }
  return (
    <div className={cn(dim, 'rounded-full bg-[var(--accent)]/20 text-[var(--accent)] flex items-center justify-center', textSize)}>
      {username.slice(0, 2).toUpperCase()}
    </div>
  );
}

function ChatBubble({ message, isOwn }: { message: TeamMessage; isOwn: boolean }) {
  const time = new Date(message.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  return (
    <div className={cn('flex gap-2 px-3 py-1', isOwn ? 'flex-row-reverse' : 'flex-row')}>
      <div className={cn('max-w-[80%] rounded-lg px-3 py-1.5', isOwn ? 'bg-[var(--accent)]/20' : 'bg-[var(--bg-tertiary)]')}>
        {!isOwn && <div className="text-[10px] font-medium text-[var(--accent)] mb-0.5">{message.from}</div>}
        <div className="text-sm text-[var(--text-primary)] break-words whitespace-pre-wrap">{message.content}</div>
        <div className="text-[9px] text-[var(--text-muted)] mt-0.5 text-right">{time}</div>
      </div>
    </div>
  );
}

export function TeamPanel() {
  const {
    connected, connecting, currentUser, onlineUsers, messages, typingUsers,
    error, hosting, repo,
    connect, disconnect, sendMessage, sendTyping, startServer,
    handleEvent, clearError, detectRepo,
  } = useTeamStore();

  const projects = useProjectStore((s) => s.projects);
  const activeProjectId = useProjectStore((s) => s.activeProjectId);
  const settings = useSettingsStore((s) => s.settings);

  const [expanded, setExpanded] = useState(false);
  const [input, setInput] = useState('');
  const [serverUrl, setServerUrl] = useState(settings.teamServerUrl || 'ws://localhost:9877');
  const [showConnect, setShowConnect] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const typingTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Listen for team events
  useEffect(() => {
    const cleanup = window.electronAPI.onTeamEvent(handleEvent);
    return () => { cleanup(); };
  }, [handleEvent]);

  // Detect repo when active project changes
  useEffect(() => {
    if (!activeProjectId) return;
    const project = projects.find((p) => p.id === activeProjectId);
    if (project) detectRepo(project.path);
  }, [activeProjectId, projects, detectRepo]);

  // Auto-scroll
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  const handleSend = useCallback(() => {
    const text = input.trim();
    if (!text || !connected) return;
    sendMessage(text);
    setInput('');
  }, [input, connected, sendMessage]);

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setInput(e.target.value);
    // Throttle typing indicator
    if (!typingTimerRef.current) {
      sendTyping();
      typingTimerRef.current = setTimeout(() => { typingTimerRef.current = null; }, 2000);
    }
  };

  const handleConnect = async () => {
    if (!activeProjectId) return;
    const project = projects.find((p) => p.id === activeProjectId);
    if (!project) return;
    await connect(serverUrl, project.path);
    setShowConnect(false);
    setExpanded(true);
  };

  const handleHost = async () => {
    const result = await startServer();
    if (result) {
      setServerUrl('ws://localhost:9877');
      if (activeProjectId) {
        const project = projects.find((p) => p.id === activeProjectId);
        if (project) await connect('ws://localhost:9877', project.path);
      }
      setShowConnect(false);
      setExpanded(true);
    }
  };

  const otherUsers = onlineUsers.filter((u) => u.username !== currentUser?.username);

  // Collapsed bar — always visible at bottom-right
  if (!expanded) {
    return (
      <div className="fixed bottom-4 right-4 z-40 flex items-center gap-2">
        {connected && otherUsers.length > 0 && (
          <div className="flex -space-x-2 mr-1">
            {otherUsers.slice(0, 3).map((u) => (
              <TeamAvatar key={u.username} username={u.username} avatarUrl={u.avatarUrl} size="sm" />
            ))}
            {otherUsers.length > 3 && (
              <div className="w-6 h-6 rounded-full bg-[var(--bg-tertiary)] text-[var(--text-muted)] flex items-center justify-center text-[9px] border border-[var(--border)]">
                +{otherUsers.length - 3}
              </div>
            )}
          </div>
        )}
        <button
          onClick={() => {
            if (!connected) setShowConnect(true);
            setExpanded(true);
          }}
          className={cn(
            'flex items-center gap-2 px-3 py-2 rounded-full shadow-lg border transition-colors',
            connected
              ? 'bg-green-500/10 border-green-500/30 text-green-400 hover:bg-green-500/20'
              : 'bg-[var(--bg-card)] border-[var(--border)] text-[var(--text-muted)] hover:text-[var(--text-primary)] hover:bg-[var(--bg-tertiary)]',
          )}
        >
          {connected ? <Wifi className="w-4 h-4" /> : <Users className="w-4 h-4" />}
          <span className="text-xs font-medium">
            {connected ? `${onlineUsers.length} online` : 'Team'}
          </span>
          {messages.length > 0 && !expanded && (
            <span className="w-2 h-2 rounded-full bg-[var(--accent)] animate-pulse" />
          )}
        </button>
      </div>
    );
  }

  // Expanded panel
  return (
    <div className="fixed bottom-4 right-4 z-40 w-[360px] h-[480px] bg-[var(--bg-card)] border border-[var(--border)] rounded-xl shadow-2xl flex flex-col overflow-hidden">
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-[var(--border)] bg-[var(--bg-secondary)]">
        <div className="flex items-center gap-2">
          <Users className="w-4 h-4 text-[var(--accent)]" />
          <span className="text-sm font-medium text-[var(--text-primary)]">Team Chat</span>
          {repo && (
            <span className="flex items-center gap-1 text-[10px] text-[var(--text-muted)] bg-[var(--bg-tertiary)] px-1.5 py-0.5 rounded">
              <GitBranch className="w-2.5 h-2.5" /> {repo}
            </span>
          )}
        </div>
        <div className="flex items-center gap-1">
          {connected && (
            <button
              onClick={disconnect}
              className="text-[10px] text-[var(--text-muted)] hover:text-[var(--error)] px-2 py-0.5 rounded hover:bg-[var(--error)]/10"
            >
              Disconnect
            </button>
          )}
          <button onClick={() => setExpanded(false)} className="w-6 h-6 rounded flex items-center justify-center text-[var(--text-muted)] hover:text-[var(--text-primary)]">
            <ChevronDown className="w-4 h-4" />
          </button>
        </div>
      </div>

      {/* Connection UI */}
      {!connected && (showConnect || !connected) ? (
        <div className="flex-1 flex flex-col items-center justify-center p-6 gap-4">
          <div className="w-14 h-14 rounded-2xl bg-[var(--accent)]/10 flex items-center justify-center">
            <Users className="w-7 h-7 text-[var(--accent)]" />
          </div>
          <div className="text-center">
            <h3 className="text-sm font-medium text-[var(--text-primary)]">Connect with your team</h3>
            <p className="text-[11px] text-[var(--text-muted)] mt-1 max-w-[250px]">
              Chat in real-time with teammates on the same GitHub project
            </p>
          </div>

          {error && (
            <div className="flex items-center gap-2 text-[11px] text-[var(--error)] bg-[var(--error)]/10 px-3 py-1.5 rounded-lg w-full">
              <span className="flex-1">{error}</span>
              <button onClick={clearError}><X className="w-3 h-3" /></button>
            </div>
          )}

          <div className="w-full space-y-2">
            <label className="text-[10px] text-[var(--text-muted)] uppercase tracking-wider">Server URL</label>
            <input
              value={serverUrl}
              onChange={(e) => setServerUrl(e.target.value)}
              placeholder="ws://localhost:9877"
              className="w-full text-sm bg-[var(--bg-primary)] text-[var(--text-primary)] border border-[var(--border)] rounded-md px-2.5 py-1.5 outline-none focus:border-[var(--accent)]"
            />
          </div>

          <div className="flex gap-2 w-full">
            <button
              onClick={handleConnect}
              disabled={connecting || !activeProjectId}
              className="flex-1 flex items-center justify-center gap-1.5 text-xs text-white bg-[var(--accent)] hover:bg-[var(--accent-hover)] px-3 py-2 rounded-lg disabled:opacity-50"
            >
              <Wifi className="w-3 h-3" />
              {connecting ? 'Connecting...' : 'Join'}
            </button>
            <button
              onClick={handleHost}
              disabled={hosting || !activeProjectId}
              className="flex-1 flex items-center justify-center gap-1.5 text-xs text-[var(--text-primary)] bg-[var(--bg-tertiary)] hover:bg-[var(--border)] px-3 py-2 rounded-lg disabled:opacity-50"
            >
              <Server className="w-3 h-3" />
              {hosting ? 'Hosting...' : 'Host'}
            </button>
          </div>

          {!activeProjectId && (
            <p className="text-[10px] text-[var(--text-muted)]">Open a project first to connect</p>
          )}
        </div>
      ) : (
        <>
          {/* Online users bar */}
          <div className="flex items-center gap-2 px-4 py-2 border-b border-[var(--border)] bg-[var(--bg-secondary)]/50">
            <div className="flex -space-x-1.5">
              {onlineUsers.map((u) => (
                <div key={u.username} className="relative" title={u.username}>
                  <TeamAvatar username={u.username} avatarUrl={u.avatarUrl} size="sm" />
                  <div className="absolute -bottom-0.5 -right-0.5 w-2 h-2 rounded-full bg-green-500 border border-[var(--bg-card)]" />
                </div>
              ))}
            </div>
            <span className="text-[10px] text-[var(--text-muted)]">
              {onlineUsers.length} online
            </span>
          </div>

          {/* Messages */}
          <div className="flex-1 overflow-y-auto py-2 space-y-1">
            {messages.length === 0 ? (
              <div className="flex flex-col items-center justify-center h-full text-[var(--text-muted)]">
                <Users className="w-8 h-8 opacity-30 mb-2" />
                <span className="text-xs">No messages yet</span>
                <span className="text-[10px] opacity-60 mt-0.5">Say hi to your team!</span>
              </div>
            ) : (
              <>
                {messages.map((msg) => (
                  <ChatBubble
                    key={msg.id}
                    message={msg}
                    isOwn={msg.from === currentUser?.username}
                  />
                ))}
                <div ref={messagesEndRef} />
              </>
            )}
            {typingUsers.length > 0 && (
              <div className="px-4 py-1">
                <span className="text-[10px] text-[var(--text-muted)] italic">
                  {typingUsers.join(', ')} {typingUsers.length === 1 ? 'is' : 'are'} typing...
                </span>
              </div>
            )}
          </div>

          {/* Input */}
          <div className="border-t border-[var(--border)] px-3 py-2 flex items-center gap-2">
            <input
              value={input}
              onChange={handleInputChange}
              onKeyDown={handleKeyDown}
              placeholder="Message your team..."
              className="flex-1 text-sm bg-[var(--bg-primary)] text-[var(--text-primary)] border border-[var(--border)] rounded-lg px-3 py-1.5 outline-none focus:border-[var(--accent)] placeholder:text-[var(--text-muted)]"
            />
            <button
              onClick={handleSend}
              disabled={!input.trim()}
              className={cn(
                'w-8 h-8 rounded-lg flex items-center justify-center shrink-0 transition-colors',
                input.trim()
                  ? 'bg-[var(--accent)] text-white hover:bg-[var(--accent-hover)]'
                  : 'bg-[var(--bg-tertiary)] text-[var(--text-muted)]',
              )}
            >
              <Send className="w-3.5 h-3.5" />
            </button>
          </div>
        </>
      )}
    </div>
  );
}
