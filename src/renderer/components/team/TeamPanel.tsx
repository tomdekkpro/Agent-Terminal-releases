import { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import { Users, Send, Wifi, X, ChevronDown, GitBranch, Bot, Loader2, AtSign, Smile, ImagePlus } from 'lucide-react';
import EmojiPicker, { Theme, EmojiStyle, type EmojiClickData } from 'emoji-picker-react';
import { useTeamStore } from '../../stores/team-store';
import { useProjectStore } from '../../stores/project-store';
import { useSettingsStore } from '../../stores/settings-store';
import { cn } from '../../../shared/utils';
import type { TeamMessage, Persona } from '../../../shared/types';

// ─── Mention types ──────────────────────────────────────────

interface MentionOption {
  id: string;
  label: string;
  type: 'user' | 'persona';
  color?: string;
  avatarUrl?: string;
}

// ─── Helper: render message content with highlighted @mentions ─

function renderContent(content: string, mentions: MentionOption[]) {
  const mentionNames = mentions.map(m => m.label);
  if (mentionNames.length === 0) return content;

  const pattern = new RegExp(`(@(?:${mentionNames.map(n => n.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('|')}))`, 'g');
  const parts = content.split(pattern);

  return parts.map((part, i) => {
    if (part.startsWith('@')) {
      const name = part.slice(1);
      const mention = mentions.find(m => m.label === name);
      if (mention) {
        return (
          <span
            key={i}
            className="font-medium rounded px-0.5"
            style={{ color: mention.color || 'var(--accent)' }}
          >
            {part}
          </span>
        );
      }
    }
    return part;
  });
}

// ─── Avatar ─────────────────────────────────────────────────

function TeamAvatar({ username, avatarUrl, size = 'sm' }: { username: string; avatarUrl?: string; size?: 'sm' | 'md' }) {
  const dim = size === 'sm' ? 'w-6 h-6' : 'w-8 h-8';
  const textSize = size === 'sm' ? 'text-[10px]' : 'text-xs';
  const [imgError, setImgError] = useState(false);

  if (avatarUrl && !imgError) {
    return <img src={avatarUrl} alt={username} className={cn(dim, 'rounded-full object-cover')} onError={() => setImgError(true)} />;
  }
  return (
    <div className={cn(dim, 'rounded-full bg-[var(--accent)]/20 text-[var(--accent)] flex items-center justify-center', textSize)}>
      {username.slice(0, 2).toUpperCase()}
    </div>
  );
}

// ─── Chat Bubble ────────────────────────────────────────────

function ChatBubble({ message, isOwn, mentions }: { message: TeamMessage; isOwn: boolean; mentions: MentionOption[] }) {
  const time = new Date(message.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  const isPersona = !!message.personaId;

  return (
    <div className={cn('flex gap-2 px-3 py-1', isOwn && !isPersona ? 'flex-row-reverse' : 'flex-row')}>
      {isPersona && (
        <div
          className="w-6 h-6 rounded-full flex items-center justify-center shrink-0 mt-0.5"
          style={{ backgroundColor: `${message.personaColor || '#6366f1'}20` }}
        >
          <Bot className="w-3.5 h-3.5" style={{ color: message.personaColor || '#6366f1' }} />
        </div>
      )}
      <div className={cn(
        'max-w-[80%] rounded-lg px-3 py-1.5',
        isPersona
          ? 'border'
          : isOwn ? 'bg-[var(--accent)]/20' : 'bg-[var(--bg-tertiary)]',
      )} style={isPersona ? { borderColor: `${message.personaColor || '#6366f1'}30`, backgroundColor: `${message.personaColor || '#6366f1'}08` } : undefined}>
        {isPersona ? (
          <div className="text-[10px] font-medium mb-0.5" style={{ color: message.personaColor || '#6366f1' }}>
            {message.personaName || message.from}
            <span className="text-[var(--text-muted)] font-normal ml-1">AI</span>
          </div>
        ) : (
          !isOwn && <div className="text-[10px] font-medium text-[var(--accent)] mb-0.5">{message.from}</div>
        )}
        {message.image && (
          <img
            src={message.image}
            alt="Shared image"
            className="max-w-full max-h-48 rounded-md mt-1 mb-1 cursor-pointer"
            onClick={() => window.open(message.image, '_blank')}
          />
        )}
        {message.content && (
          <div className="text-sm text-[var(--text-primary)] break-words whitespace-pre-wrap">
            {renderContent(message.content, mentions)}
          </div>
        )}
        <div className="text-[9px] text-[var(--text-muted)] mt-0.5 text-right">{time}</div>
      </div>
    </div>
  );
}

// ─── Mention Dropdown ───────────────────────────────────────

function MentionDropdown({
  options,
  selectedIndex,
  onSelect,
}: {
  options: MentionOption[];
  selectedIndex: number;
  onSelect: (option: MentionOption) => void;
}) {
  return (
    <div className="absolute bottom-full left-0 right-0 mb-1 bg-[var(--bg-card)] border border-[var(--border)] rounded-lg shadow-2xl overflow-hidden max-h-48 overflow-y-auto">
      {options.length === 0 ? (
        <div className="px-3 py-2 text-xs text-[var(--text-muted)]">No matches</div>
      ) : (
        options.map((opt, i) => (
          <button
            key={opt.id}
            onMouseDown={(e) => { e.preventDefault(); onSelect(opt); }}
            className={cn(
              'w-full flex items-center gap-2 px-3 py-1.5 text-xs text-left transition-colors',
              i === selectedIndex ? 'bg-[var(--accent)]/10' : 'hover:bg-[var(--bg-tertiary)]',
            )}
          >
            {opt.type === 'persona' ? (
              <div
                className="w-5 h-5 rounded-full flex items-center justify-center shrink-0"
                style={{ backgroundColor: `${opt.color || '#6366f1'}20` }}
              >
                <Bot className="w-3 h-3" style={{ color: opt.color || '#6366f1' }} />
              </div>
            ) : (
              <TeamAvatar username={opt.label} avatarUrl={opt.avatarUrl} size="sm" />
            )}
            <span className="text-[var(--text-primary)]">{opt.label}</span>
            <span className="text-[var(--text-muted)] ml-auto">
              {opt.type === 'persona' ? 'AI Persona' : 'User'}
            </span>
          </button>
        ))
      )}
    </div>
  );
}

// ─── Main Panel ─────────────────────────────────────────────

export function TeamPanel() {
  const {
    connected, connecting, currentUser, onlineUsers, messages, typingUsers,
    error, repo, hosting,
    connect, disconnect, sendMessage, sendTyping, startServer,
    handleEvent, clearError, detectRepo,
  } = useTeamStore();

  const projects = useProjectStore((s) => s.projects);
  const activeProjectId = useProjectStore((s) => s.activeProjectId);
  const settings = useSettingsStore((s) => s.settings);
  const settingsLoading = useSettingsStore((s) => s.isLoading);

  const [expanded, setExpanded] = useState(false);
  const [input, setInput] = useState('');
  const [pendingImage, setPendingImage] = useState<string | null>(null);
  const [serverUrl, setServerUrl] = useState(settings.teamServerUrl || 'ws://localhost:9877');
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Sync serverUrl when settings change
  useEffect(() => {
    if (settings.teamServerUrl) {
      setServerUrl(settings.teamServerUrl);
    }
  }, [settings.teamServerUrl]);
  const [showConnect, setShowConnect] = useState(false);
  const [showEmojiPicker, setShowEmojiPicker] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const typingTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const emojiPickerRef = useRef<HTMLDivElement>(null);

  // Personas
  const [personas, setPersonas] = useState<Persona[]>([]);
  const [personaLoading, setPersonaLoading] = useState<string | null>(null);
  useEffect(() => {
    window.electronAPI.personasList().then((result: any) => {
      if (result.success) setPersonas(result.data);
    });
  }, []);

  // Build mention options: online users + personas
  const mentionOptions = useMemo<MentionOption[]>(() => {
    const userOpts: MentionOption[] = onlineUsers
      .filter(u => u.username !== currentUser?.username)
      .map(u => ({ id: `user:${u.username}`, label: u.username, type: 'user' as const, avatarUrl: u.avatarUrl }));
    const personaOpts: MentionOption[] = personas.map(p => ({
      id: `persona:${p.id}`, label: p.name, type: 'persona' as const, color: p.color,
    }));
    return [...userOpts, ...personaOpts];
  }, [onlineUsers, currentUser, personas]);

  // Mention autocomplete state
  const [showMentions, setShowMentions] = useState(false);
  const [mentionQuery, setMentionQuery] = useState('');
  const [mentionIndex, setMentionIndex] = useState(0);
  const [mentionStartPos, setMentionStartPos] = useState(-1);

  const filteredMentions = useMemo(() => {
    if (!mentionQuery) return mentionOptions;
    const q = mentionQuery.toLowerCase();
    return mentionOptions.filter(m => m.label.toLowerCase().includes(q));
  }, [mentionOptions, mentionQuery]);

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

  // Auto-start relay server and/or auto-connect once settings have loaded
  const autoStartedRef = useRef(false);
  useEffect(() => {
    if (settingsLoading || autoStartedRef.current) return;
    autoStartedRef.current = true;

    const project = projects.find((p) => p.id === activeProjectId);

    const autoStart = async () => {
      // Auto-start relay server if enabled
      if (settings.teamAutoStartServer && !hosting) {
        await startServer();
      }
      // Auto-connect if enabled and not already connected
      if (settings.teamAutoConnect && !connected && !connecting && project) {
        const url = settings.teamServerUrl || serverUrl;
        connect(url, project.path);
      }
    };
    autoStart();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [settingsLoading]);

  // Close emoji picker on outside click
  useEffect(() => {
    if (!showEmojiPicker) return;
    const handleClick = (e: MouseEvent) => {
      if (emojiPickerRef.current && !emojiPickerRef.current.contains(e.target as Node)) {
        setShowEmojiPicker(false);
      }
    };
    document.addEventListener('mousedown', handleClick);
    return () => document.removeEventListener('mousedown', handleClick);
  }, [showEmojiPicker]);

  const handleEmojiClick = useCallback((emojiData: EmojiClickData) => {
    setInput(prev => prev + emojiData.emoji);
    setShowEmojiPicker(false);
    inputRef.current?.focus();
  }, []);

  // Convert a File/Blob to a compressed base64 data URL (max ~500KB)
  const fileToDataUrl = useCallback((file: Blob): Promise<string | null> => {
    return new Promise((resolve) => {
      const img = new Image();
      const url = URL.createObjectURL(file);
      img.onload = () => {
        URL.revokeObjectURL(url);
        const maxDim = 800;
        let { width, height } = img;
        if (width > maxDim || height > maxDim) {
          const scale = maxDim / Math.max(width, height);
          width = Math.round(width * scale);
          height = Math.round(height * scale);
        }
        const canvas = document.createElement('canvas');
        canvas.width = width;
        canvas.height = height;
        const ctx = canvas.getContext('2d');
        if (!ctx) { resolve(null); return; }
        ctx.drawImage(img, 0, 0, width, height);
        resolve(canvas.toDataURL('image/jpeg', 0.7));
      };
      img.onerror = () => { URL.revokeObjectURL(url); resolve(null); };
      img.src = url;
    });
  }, []);

  // Handle paste — detect images from clipboard
  const handlePaste = useCallback(async (e: React.ClipboardEvent) => {
    const items = e.clipboardData?.items;
    if (!items) return;
    for (const item of items) {
      if (item.type.startsWith('image/')) {
        e.preventDefault();
        const file = item.getAsFile();
        if (file) {
          const dataUrl = await fileToDataUrl(file);
          if (dataUrl) setPendingImage(dataUrl);
        }
        return;
      }
    }
  }, [fileToDataUrl]);

  // Handle file upload
  const handleFileSelect = useCallback(async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file && file.type.startsWith('image/')) {
      const dataUrl = await fileToDataUrl(file);
      if (dataUrl) setPendingImage(dataUrl);
    }
    // Reset so same file can be selected again
    if (fileInputRef.current) fileInputRef.current.value = '';
  }, [fileToDataUrl]);

  // Auto-scroll
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  // Insert a mention into input at the correct position
  const insertMention = useCallback((option: MentionOption) => {
    const before = input.slice(0, mentionStartPos);
    const after = input.slice(inputRef.current?.selectionStart || input.length);
    const newInput = `${before}@${option.label} ${after}`;
    setInput(newInput);
    setShowMentions(false);
    setMentionQuery('');
    setMentionStartPos(-1);
    // Focus back on input
    setTimeout(() => {
      if (inputRef.current) {
        const pos = before.length + option.label.length + 2; // @name + space
        inputRef.current.focus();
        inputRef.current.setSelectionRange(pos, pos);
      }
    }, 0);
  }, [input, mentionStartPos]);

  // Handle sending — detect persona mentions and trigger AI responses
  const handleSend = useCallback(async () => {
    const text = input.trim();
    const image = pendingImage;
    if ((!text && !image) || !connected) return;

    // Send the user's message first (with image if attached)
    const meta: Record<string, string> = {};
    if (image) meta.image = image;
    sendMessage(text || '📷 Image', Object.keys(meta).length > 0 ? meta : undefined);
    setInput('');
    setPendingImage(null);

    // Check for @mentions (users and personas)
    const mentionedPersonas = personas.filter(p =>
      text.includes(`@${p.name}`),
    );
    const mentionedUsers = onlineUsers.filter(u =>
      u.username !== currentUser?.username && text.includes(`@${u.username}`),
    );
    const hasMention = mentionedPersonas.length > 0 || mentionedUsers.length > 0;

    // Build list of personas to respond — if no @mentions at all, use Claude as default
    const respondingPersonas = mentionedPersonas.length > 0
      ? mentionedPersonas
      : !hasMention
        ? [{ id: '__claude__', name: 'Claude', role: 'AI Assistant', systemPrompt: 'You are Claude, a helpful AI assistant. Be concise and helpful.', color: '#c084fc', icon: 'Bot' } as Persona]
        : [];

    // For each responding persona, get AI response
    for (const persona of respondingPersonas) {
      setPersonaLoading(persona.id);
      try {
        const project = projects.find((p) => p.id === activeProjectId);
        const result = await window.electronAPI.teamPersonaReply(
          text,
          persona,
          settings.defaultModel,
          project?.path,
        );
        if (result?.success && result.data) {
          await sendMessage(result.data, {
            personaId: persona.id,
            personaName: persona.name,
            personaColor: persona.color,
            replyTo: text,
          });
        }
      } catch {
        // Non-critical — persona just won't respond
      }
      setPersonaLoading(null);
    }
  }, [input, pendingImage, connected, sendMessage, personas, onlineUsers, currentUser, settings.defaultModel, projects, activeProjectId]);

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (showMentions) {
      if (e.key === 'ArrowDown') {
        e.preventDefault();
        setMentionIndex(i => Math.min(i + 1, filteredMentions.length - 1));
        return;
      }
      if (e.key === 'ArrowUp') {
        e.preventDefault();
        setMentionIndex(i => Math.max(i - 1, 0));
        return;
      }
      if (e.key === 'Enter' || e.key === 'Tab') {
        e.preventDefault();
        if (filteredMentions[mentionIndex]) {
          insertMention(filteredMentions[mentionIndex]);
        }
        return;
      }
      if (e.key === 'Escape') {
        setShowMentions(false);
        return;
      }
    }
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const value = e.target.value;
    const pos = e.target.selectionStart || 0;
    setInput(value);

    // Detect @mention trigger
    const textBefore = value.slice(0, pos);
    const atMatch = textBefore.match(/@(\w*)$/);
    if (atMatch) {
      setShowMentions(true);
      setMentionQuery(atMatch[1]);
      setMentionStartPos(pos - atMatch[0].length);
      setMentionIndex(0);
    } else {
      setShowMentions(false);
      setMentionQuery('');
      setMentionStartPos(-1);
    }

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

          <button
            onClick={handleConnect}
            disabled={connecting || !activeProjectId}
            className="w-full flex items-center justify-center gap-1.5 text-xs text-white bg-[var(--accent)] hover:bg-[var(--accent-hover)] px-3 py-2 rounded-lg disabled:opacity-50"
          >
            <Wifi className="w-3 h-3" />
            {connecting ? 'Connecting...' : 'Join'}
          </button>

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
            {personas.length > 0 && (
              <>
                <div className="w-px h-4 bg-[var(--border)]" />
                <div className="flex -space-x-1">
                  {personas.slice(0, 3).map(p => (
                    <div
                      key={p.id}
                      className="w-5 h-5 rounded-full flex items-center justify-center border border-[var(--bg-card)]"
                      style={{ backgroundColor: `${p.color}20` }}
                      title={`${p.name} (AI)`}
                    >
                      <Bot className="w-2.5 h-2.5" style={{ color: p.color }} />
                    </div>
                  ))}
                </div>
              </>
            )}
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
                <span className="text-[10px] opacity-60 mt-0.5">Type @ to mention a teammate or AI persona</span>
              </div>
            ) : (
              <>
                {messages.map((msg) => (
                  <ChatBubble
                    key={msg.id}
                    message={msg}
                    isOwn={msg.from === currentUser?.username && !msg.personaId}
                    mentions={mentionOptions}
                  />
                ))}
                <div ref={messagesEndRef} />
              </>
            )}
            {personaLoading && (
              <div className="px-4 py-1 flex items-center gap-1.5">
                <Loader2 className="w-3 h-3 animate-spin text-[var(--accent)]" />
                <span className="text-[10px] text-[var(--text-muted)] italic">
                  {personas.find(p => p.id === personaLoading)?.name || 'AI'} is thinking...
                </span>
              </div>
            )}
            {typingUsers.length > 0 && (
              <div className="px-4 py-1">
                <span className="text-[10px] text-[var(--text-muted)] italic">
                  {typingUsers.join(', ')} {typingUsers.length === 1 ? 'is' : 'are'} typing...
                </span>
              </div>
            )}
          </div>

          {/* Input with mention dropdown + emoji picker */}
          <div className="border-t border-[var(--border)] px-3 py-2 relative">
            {showMentions && (
              <MentionDropdown
                options={filteredMentions}
                selectedIndex={mentionIndex}
                onSelect={insertMention}
              />
            )}
            {showEmojiPicker && (
              <div ref={emojiPickerRef} className="absolute bottom-full right-0 mb-1 z-50">
                <EmojiPicker
                  theme={Theme.DARK}
                  emojiStyle={EmojiStyle.TWITTER}
                  onEmojiClick={handleEmojiClick}
                  width={320}
                  height={350}
                  searchPlaceholder="Search emoji..."
                  lazyLoadEmojis
                />
              </div>
            )}
            {/* Image preview */}
            {pendingImage && (
              <div className="mb-2 relative inline-block">
                <img src={pendingImage} alt="Preview" className="max-h-24 rounded-md border border-[var(--border)]" />
                <button
                  onClick={() => setPendingImage(null)}
                  className="absolute -top-1.5 -right-1.5 w-5 h-5 rounded-full bg-[var(--bg-primary)] border border-[var(--border)] flex items-center justify-center text-[var(--text-muted)] hover:text-[var(--error)]"
                >
                  <X className="w-3 h-3" />
                </button>
              </div>
            )}
            {/* Hidden file input */}
            <input
              ref={fileInputRef}
              type="file"
              accept="image/*"
              className="hidden"
              onChange={handleFileSelect}
            />
            <div className="flex items-center gap-1">
              <button
                onClick={() => {
                  setInput(prev => prev + '@');
                  setShowMentions(true);
                  setMentionQuery('');
                  setMentionStartPos(input.length);
                  setMentionIndex(0);
                  inputRef.current?.focus();
                }}
                className="w-7 h-7 rounded-lg flex items-center justify-center shrink-0 text-[var(--text-muted)] hover:text-[var(--accent)] hover:bg-[var(--accent)]/10 transition-colors"
                title="Mention someone (@)"
              >
                <AtSign className="w-3.5 h-3.5" />
              </button>
              <button
                onClick={() => setShowEmojiPicker(prev => !prev)}
                className={cn(
                  'w-7 h-7 rounded-lg flex items-center justify-center shrink-0 transition-colors',
                  showEmojiPicker
                    ? 'text-[var(--accent)] bg-[var(--accent)]/10'
                    : 'text-[var(--text-muted)] hover:text-[var(--accent)] hover:bg-[var(--accent)]/10',
                )}
                title="Emoji"
              >
                <Smile className="w-3.5 h-3.5" />
              </button>
              <button
                onClick={() => fileInputRef.current?.click()}
                className="w-7 h-7 rounded-lg flex items-center justify-center shrink-0 text-[var(--text-muted)] hover:text-[var(--accent)] hover:bg-[var(--accent)]/10 transition-colors"
                title="Upload image"
              >
                <ImagePlus className="w-3.5 h-3.5" />
              </button>
              <input
                ref={inputRef}
                value={input}
                onChange={handleInputChange}
                onKeyDown={handleKeyDown}
                onPaste={handlePaste}
                onBlur={() => setTimeout(() => setShowMentions(false), 150)}
                placeholder="Message your team..."
                className="flex-1 text-sm bg-[var(--bg-primary)] text-[var(--text-primary)] border border-[var(--border)] rounded-lg px-3 py-1.5 outline-none focus:border-[var(--accent)] placeholder:text-[var(--text-muted)]"
              />
              <button
                onClick={handleSend}
                disabled={(!input.trim() && !pendingImage) || !!personaLoading}
                className={cn(
                  'w-8 h-8 rounded-lg flex items-center justify-center shrink-0 transition-colors',
                  (input.trim() || pendingImage) && !personaLoading
                    ? 'bg-[var(--accent)] text-white hover:bg-[var(--accent-hover)]'
                    : 'bg-[var(--bg-tertiary)] text-[var(--text-muted)]',
                )}
              >
                <Send className="w-3.5 h-3.5" />
              </button>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
