import { useState, useEffect } from 'react';
import { Settings, Terminal, CheckSquare, Bot, Palette, Save, RotateCcw, Loader2, CheckCircle, XCircle, Info, RefreshCw, Download } from 'lucide-react';
import { useSettingsStore } from '../../stores/settings-store';
import type { AppSettings } from '../../../shared/types';
import { cn } from '../../../shared/utils';

type SettingsSection = 'general' | 'terminal' | 'clickup' | 'agent' | 'appearance';

const sections: { id: SettingsSection; icon: typeof Terminal; label: string; description: string }[] = [
  { id: 'general', icon: Info, label: 'General', description: 'Version and update settings' },
  { id: 'terminal', icon: Terminal, label: 'Terminal', description: 'Font, cursor, and display settings' },
  { id: 'clickup', icon: CheckSquare, label: 'ClickUp', description: 'Task management integration' },
  { id: 'agent', icon: Bot, label: 'Agent', description: 'Claude AI configuration' },
  { id: 'appearance', icon: Palette, label: 'Appearance', description: 'Theme and display options' },
];

export function SettingsView() {
  const { settings, loadSettings, updateSettings, isLoading } = useSettingsStore();
  const [activeSection, setActiveSection] = useState<SettingsSection>('general');
  const [localSettings, setLocalSettings] = useState<AppSettings>(settings);
  const [hasChanges, setHasChanges] = useState(false);
  const [saving, setSaving] = useState(false);
  const [clickupStatus, setClickupStatus] = useState<'idle' | 'checking' | 'connected' | 'error'>('idle');
  const [clickupMessage, setClickupMessage] = useState('');
  const [updateStatus, setUpdateStatus] = useState<'idle' | 'checking' | 'available' | 'downloading' | 'ready' | 'up-to-date' | 'error'>('idle');
  const [updateInfo, setUpdateInfo] = useState<{ version?: string; percent?: number; error?: string }>({});

  useEffect(() => {
    loadSettings();
  }, [loadSettings]);

  useEffect(() => {
    setLocalSettings(settings);
  }, [settings]);

  useEffect(() => {
    const cleanup = window.electronAPI.onUpdateStatus((data: any) => {
      setUpdateStatus(data.status);
      setUpdateInfo({
        version: data.version,
        percent: data.percent,
        error: data.error,
      });
    });
    return cleanup;
  }, []);

  const handleChange = (key: keyof AppSettings, value: any) => {
    setLocalSettings((prev) => ({ ...prev, [key]: value }));
    setHasChanges(true);
  };

  const handleSave = async () => {
    setSaving(true);
    await updateSettings(localSettings);
    setHasChanges(false);
    setSaving(false);
  };

  const handleReset = () => {
    setLocalSettings(settings);
    setHasChanges(false);
  };

  const testClickUpConnection = async () => {
    setClickupStatus('checking');
    setClickupMessage('');
    try {
      // Save API key first
      await updateSettings({
        clickupApiKey: localSettings.clickupApiKey,
        clickupEnabled: localSettings.clickupEnabled,
        clickupWorkspaceId: localSettings.clickupWorkspaceId,
        clickupListId: localSettings.clickupListId,
      });

      const result = await window.electronAPI.checkClickUpConnection();
      if (result.success) {
        setClickupStatus('connected');
        const workspace = result.data?.workspaces?.[0];
        setClickupMessage(`Connected to ${workspace?.name || 'workspace'}`);
      } else {
        setClickupStatus('error');
        setClickupMessage(result.error || 'Connection failed');
      }
    } catch (err) {
      setClickupStatus('error');
      setClickupMessage(err instanceof Error ? err.message : 'Connection failed');
    }
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-full">
        <Loader2 className="w-6 h-6 animate-spin text-[var(--text-muted)]" />
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="h-12 bg-[var(--bg-secondary)] border-b border-[var(--border)] flex items-center px-4 justify-between drag-region">
        <div className="flex items-center gap-2 no-drag">
          <Settings className="w-4 h-4 text-[var(--text-muted)]" />
          <h1 className="text-sm font-semibold text-[var(--text-primary)]">Settings</h1>
        </div>
        <div className="flex items-center gap-2 no-drag">
          {hasChanges && (
            <>
              <button
                onClick={handleReset}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs text-[var(--text-secondary)] hover:bg-[var(--bg-tertiary)] transition-colors"
              >
                <RotateCcw className="w-3.5 h-3.5" />
                Reset
              </button>
              <button
                onClick={handleSave}
                disabled={saving}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs bg-[var(--accent)] text-white hover:bg-[var(--accent-hover)] transition-colors disabled:opacity-50"
              >
                {saving ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Save className="w-3.5 h-3.5" />}
                Save Changes
              </button>
            </>
          )}
        </div>
      </div>

      <div className="flex flex-1 overflow-hidden">
        {/* Sidebar */}
        <div className="w-56 bg-[var(--bg-secondary)] border-r border-[var(--border)] p-3 space-y-1">
          {sections.map(({ id, icon: Icon, label, description }) => (
            <button
              key={id}
              onClick={() => setActiveSection(id)}
              className={cn(
                'w-full text-left p-3 rounded-lg transition-colors',
                activeSection === id
                  ? 'bg-[var(--bg-card)] border border-[var(--border)]'
                  : 'hover:bg-[var(--bg-tertiary)]'
              )}
            >
              <div className="flex items-center gap-2">
                <Icon className={cn('w-4 h-4', activeSection === id ? 'text-[var(--accent)]' : 'text-[var(--text-muted)]')} />
                <span className={cn('text-sm', activeSection === id ? 'text-[var(--text-primary)]' : 'text-[var(--text-secondary)]')}>
                  {label}
                </span>
              </div>
              <p className="text-[10px] text-[var(--text-muted)] mt-1 ml-6">{description}</p>
            </button>
          ))}
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto p-6">
          {activeSection === 'general' && (
            <div className="space-y-6 max-w-xl">
              <h2 className="text-lg font-semibold text-[var(--text-primary)]">General</h2>

              <div className="space-y-4">
                {/* Version */}
                <div className="p-4 rounded-lg bg-[var(--bg-card)] border border-[var(--border)]">
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="text-sm font-medium text-[var(--text-primary)]">Agent Terminal</p>
                      <p className="text-xs text-[var(--text-muted)] mt-0.5">Version 1.0.9</p>
                      <p className="text-[10px] text-[var(--text-muted)] mt-1">&copy; {new Date().getFullYear()} Tom. All rights reserved.</p>
                    </div>
                    {updateStatus === 'up-to-date' && (
                      <span className="flex items-center gap-1.5 text-xs text-[var(--success)]">
                        <CheckCircle className="w-3.5 h-3.5" />
                        Up to date
                      </span>
                    )}
                    {updateStatus === 'available' && (
                      <span className="flex items-center gap-1.5 text-xs text-[var(--warning)]">
                        <Download className="w-3.5 h-3.5" />
                        v{updateInfo.version} available
                      </span>
                    )}
                    {updateStatus === 'ready' && (
                      <span className="flex items-center gap-1.5 text-xs text-[var(--success)]">
                        <CheckCircle className="w-3.5 h-3.5" />
                        v{updateInfo.version} ready to install
                      </span>
                    )}
                  </div>
                </div>

                {/* Auto Update */}
                <div className="flex items-center justify-between">
                  <div>
                    <label className="text-sm text-[var(--text-secondary)]">Automatic Updates</label>
                    <p className="text-[10px] text-[var(--text-muted)] mt-0.5">Check for updates when the app starts</p>
                  </div>
                  <button
                    onClick={() => handleChange('autoUpdate', !localSettings.autoUpdate)}
                    className={cn(
                      'w-10 h-5 rounded-full transition-colors relative',
                      localSettings.autoUpdate ? 'bg-[var(--accent)]' : 'bg-[var(--border)]'
                    )}
                  >
                    <div className={cn(
                      'w-4 h-4 rounded-full bg-white absolute top-0.5 transition-transform',
                      localSettings.autoUpdate ? 'translate-x-5' : 'translate-x-0.5'
                    )} />
                  </button>
                </div>

                {/* Check for Updates */}
                <div>
                  <button
                    onClick={async () => {
                      setUpdateStatus('checking');
                      setUpdateInfo({});
                      try {
                        const result = await window.electronAPI.checkForUpdate();
                        if (!result.success) {
                          setUpdateStatus('error');
                          setUpdateInfo({ error: result.error || 'Failed to check for updates' });
                        }
                      } catch {
                        setUpdateStatus('error');
                        setUpdateInfo({ error: 'Failed to check for updates' });
                      }
                    }}
                    disabled={updateStatus === 'checking' || updateStatus === 'downloading'}
                    className="flex items-center gap-2 px-4 py-2 rounded-lg bg-[var(--bg-card)] border border-[var(--border)] text-sm text-[var(--text-primary)] hover:bg-[var(--bg-tertiary)] transition-colors disabled:opacity-50"
                  >
                    {updateStatus === 'checking' ? (
                      <Loader2 className="w-4 h-4 animate-spin" />
                    ) : (
                      <RefreshCw className="w-4 h-4" />
                    )}
                    Check for Updates
                  </button>

                  {updateStatus === 'downloading' && (
                    <div className="mt-3">
                      <div className="flex items-center justify-between text-xs text-[var(--text-muted)] mb-1">
                        <span>Downloading v{updateInfo.version}...</span>
                        <span>{updateInfo.percent ?? 0}%</span>
                      </div>
                      <div className="w-full h-1.5 bg-[var(--border)] rounded-full overflow-hidden">
                        <div
                          className="h-full bg-[var(--accent)] rounded-full transition-all"
                          style={{ width: `${updateInfo.percent ?? 0}%` }}
                        />
                      </div>
                    </div>
                  )}

                  {updateStatus === 'available' && (
                    <div className="mt-3 flex items-center gap-2">
                      <button
                        onClick={() => window.electronAPI.downloadUpdate()}
                        className="flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs bg-[var(--accent)] text-white hover:bg-[var(--accent-hover)] transition-colors"
                      >
                        <Download className="w-3.5 h-3.5" />
                        Download v{updateInfo.version}
                      </button>
                    </div>
                  )}

                  {updateStatus === 'ready' && (
                    <div className="mt-3 flex items-center gap-2">
                      <button
                        onClick={() => window.electronAPI.installUpdate()}
                        className="flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs bg-[var(--success)] text-white hover:opacity-90 transition-opacity"
                      >
                        <RefreshCw className="w-3.5 h-3.5" />
                        Restart & Install
                      </button>
                    </div>
                  )}

                  {updateStatus === 'error' && (
                    <p className="text-xs text-[var(--error)] mt-2">{updateInfo.error || 'Failed to check for updates'}</p>
                  )}
                </div>
              </div>
            </div>
          )}

          {activeSection === 'terminal' && (
            <div className="space-y-6 max-w-xl">
              <h2 className="text-lg font-semibold text-[var(--text-primary)]">Terminal Settings</h2>

              <div className="space-y-4">
                <div>
                  <label className="block text-sm text-[var(--text-secondary)] mb-1.5">Font Family</label>
                  <input
                    type="text"
                    value={localSettings.terminalFontFamily}
                    onChange={(e) => handleChange('terminalFontFamily', e.target.value)}
                    className="w-full px-3 py-2 bg-[var(--bg-card)] border border-[var(--border)] rounded-lg text-sm text-[var(--text-primary)] focus:outline-none focus:border-[var(--accent)]"
                  />
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm text-[var(--text-secondary)] mb-1.5">Font Size</label>
                    <input
                      type="number"
                      min={8}
                      max={32}
                      value={localSettings.terminalFontSize}
                      onChange={(e) => handleChange('terminalFontSize', parseInt(e.target.value))}
                      className="w-full px-3 py-2 bg-[var(--bg-card)] border border-[var(--border)] rounded-lg text-sm text-[var(--text-primary)] focus:outline-none focus:border-[var(--accent)]"
                    />
                  </div>
                  <div>
                    <label className="block text-sm text-[var(--text-secondary)] mb-1.5">Line Height</label>
                    <input
                      type="number"
                      min={1}
                      max={2}
                      step={0.1}
                      value={localSettings.terminalLineHeight}
                      onChange={(e) => handleChange('terminalLineHeight', parseFloat(e.target.value))}
                      className="w-full px-3 py-2 bg-[var(--bg-card)] border border-[var(--border)] rounded-lg text-sm text-[var(--text-primary)] focus:outline-none focus:border-[var(--accent)]"
                    />
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm text-[var(--text-secondary)] mb-1.5">Cursor Style</label>
                    <select
                      value={localSettings.terminalCursorStyle}
                      onChange={(e) => handleChange('terminalCursorStyle', e.target.value)}
                      className="w-full px-3 py-2 bg-[var(--bg-card)] border border-[var(--border)] rounded-lg text-sm text-[var(--text-primary)] focus:outline-none focus:border-[var(--accent)]"
                    >
                      <option value="block">Block</option>
                      <option value="underline">Underline</option>
                      <option value="bar">Bar</option>
                    </select>
                  </div>
                  <div>
                    <label className="block text-sm text-[var(--text-secondary)] mb-1.5">Scrollback Lines</label>
                    <input
                      type="number"
                      min={1000}
                      max={100000}
                      step={1000}
                      value={localSettings.terminalScrollback}
                      onChange={(e) => handleChange('terminalScrollback', parseInt(e.target.value))}
                      className="w-full px-3 py-2 bg-[var(--bg-card)] border border-[var(--border)] rounded-lg text-sm text-[var(--text-primary)] focus:outline-none focus:border-[var(--accent)]"
                    />
                  </div>
                </div>

                <div className="flex items-center justify-between">
                  <label className="text-sm text-[var(--text-secondary)]">Cursor Blink</label>
                  <button
                    onClick={() => handleChange('terminalCursorBlink', !localSettings.terminalCursorBlink)}
                    className={cn(
                      'w-10 h-5 rounded-full transition-colors relative',
                      localSettings.terminalCursorBlink ? 'bg-[var(--accent)]' : 'bg-[var(--border)]'
                    )}
                  >
                    <div className={cn(
                      'w-4 h-4 rounded-full bg-white absolute top-0.5 transition-transform',
                      localSettings.terminalCursorBlink ? 'translate-x-5' : 'translate-x-0.5'
                    )} />
                  </button>
                </div>
              </div>
            </div>
          )}

          {activeSection === 'clickup' && (
            <div className="space-y-6 max-w-xl">
              <h2 className="text-lg font-semibold text-[var(--text-primary)]">ClickUp Integration</h2>

              <div className="space-y-4">
                <div className="flex items-center justify-between">
                  <div>
                    <label className="text-sm text-[var(--text-secondary)]">Enable ClickUp</label>
                    <p className="text-[10px] text-[var(--text-muted)] mt-0.5">Connect your ClickUp workspace</p>
                  </div>
                  <button
                    onClick={() => handleChange('clickupEnabled', !localSettings.clickupEnabled)}
                    className={cn(
                      'w-10 h-5 rounded-full transition-colors relative',
                      localSettings.clickupEnabled ? 'bg-[var(--clickup-purple)]' : 'bg-[var(--border)]'
                    )}
                  >
                    <div className={cn(
                      'w-4 h-4 rounded-full bg-white absolute top-0.5 transition-transform',
                      localSettings.clickupEnabled ? 'translate-x-5' : 'translate-x-0.5'
                    )} />
                  </button>
                </div>

                {localSettings.clickupEnabled && (
                  <>
                    <div>
                      <label className="block text-sm text-[var(--text-secondary)] mb-1.5">API Token</label>
                      <input
                        type="password"
                        value={localSettings.clickupApiKey}
                        onChange={(e) => handleChange('clickupApiKey', e.target.value)}
                        placeholder="pk_xxxxx..."
                        className="w-full px-3 py-2 bg-[var(--bg-card)] border border-[var(--border)] rounded-lg text-sm text-[var(--text-primary)] placeholder:text-[var(--text-muted)] focus:outline-none focus:border-[var(--accent)]"
                      />
                      <p className="text-[10px] text-[var(--text-muted)] mt-1">
                        Get your token from ClickUp Settings → Apps
                      </p>
                    </div>

                    <div>
                      <label className="block text-sm text-[var(--text-secondary)] mb-1.5">Workspace ID</label>
                      <input
                        type="text"
                        value={localSettings.clickupWorkspaceId}
                        onChange={(e) => handleChange('clickupWorkspaceId', e.target.value)}
                        placeholder="Enter workspace ID"
                        className="w-full px-3 py-2 bg-[var(--bg-card)] border border-[var(--border)] rounded-lg text-sm text-[var(--text-primary)] placeholder:text-[var(--text-muted)] focus:outline-none focus:border-[var(--accent)]"
                      />
                    </div>

                    <div>
                      <label className="block text-sm text-[var(--text-secondary)] mb-1.5">Default List ID</label>
                      <input
                        type="text"
                        value={localSettings.clickupListId}
                        onChange={(e) => handleChange('clickupListId', e.target.value)}
                        placeholder="Enter list ID for task sync"
                        className="w-full px-3 py-2 bg-[var(--bg-card)] border border-[var(--border)] rounded-lg text-sm text-[var(--text-primary)] placeholder:text-[var(--text-muted)] focus:outline-none focus:border-[var(--accent)]"
                      />
                    </div>

                    <div>
                      <button
                        onClick={testClickUpConnection}
                        disabled={!localSettings.clickupApiKey || clickupStatus === 'checking'}
                        className="flex items-center gap-2 px-4 py-2 rounded-lg bg-[var(--clickup-purple)] text-white text-sm hover:opacity-90 transition-opacity disabled:opacity-50"
                      >
                        {clickupStatus === 'checking' ? (
                          <Loader2 className="w-4 h-4 animate-spin" />
                        ) : clickupStatus === 'connected' ? (
                          <CheckCircle className="w-4 h-4" />
                        ) : clickupStatus === 'error' ? (
                          <XCircle className="w-4 h-4" />
                        ) : null}
                        Test Connection
                      </button>
                      {clickupMessage && (
                        <p className={cn(
                          'text-xs mt-2',
                          clickupStatus === 'connected' ? 'text-[var(--success)]' : 'text-[var(--error)]'
                        )}>
                          {clickupMessage}
                        </p>
                      )}
                    </div>

                    <div className="p-3 rounded-lg bg-[var(--bg-card)] border border-[var(--border)]">
                      <h4 className="text-xs font-semibold text-[var(--text-primary)] mb-2">Setup Instructions</h4>
                      <ol className="text-[11px] text-[var(--text-muted)] space-y-1 list-decimal list-inside">
                        <li>Go to ClickUp Settings → Apps</li>
                        <li>Generate a personal API token</li>
                        <li>Paste it in the API Token field above</li>
                        <li>Enter your Workspace ID (found in URL)</li>
                        <li>Enter the List ID for task synchronization</li>
                        <li>Click "Test Connection" to verify</li>
                      </ol>
                    </div>
                  </>
                )}
              </div>
            </div>
          )}

          {activeSection === 'agent' && (
            <div className="space-y-6 max-w-xl">
              <h2 className="text-lg font-semibold text-[var(--text-primary)]">Agent Settings</h2>

              <div className="space-y-4">
                <div>
                  <label className="block text-sm text-[var(--text-secondary)] mb-1.5">Default Model</label>
                  <select
                    value={localSettings.defaultModel}
                    onChange={(e) => handleChange('defaultModel', e.target.value)}
                    className="w-full px-3 py-2 bg-[var(--bg-card)] border border-[var(--border)] rounded-lg text-sm text-[var(--text-primary)] focus:outline-none focus:border-[var(--accent)]"
                  >
                    <option value="claude-opus-4-6">Claude Opus 4.6</option>
                    <option value="claude-sonnet-4-6">Claude Sonnet 4.6</option>
                    <option value="claude-haiku-4-5">Claude Haiku 4.5</option>
                  </select>
                </div>

                <div>
                  <label className="block text-sm text-[var(--text-secondary)] mb-1.5">Working Directory</label>
                  <input
                    type="text"
                    value={localSettings.workingDirectory}
                    onChange={(e) => handleChange('workingDirectory', e.target.value)}
                    placeholder="Default working directory for terminals"
                    className="w-full px-3 py-2 bg-[var(--bg-card)] border border-[var(--border)] rounded-lg text-sm text-[var(--text-primary)] placeholder:text-[var(--text-muted)] focus:outline-none focus:border-[var(--accent)]"
                  />
                </div>

                <div>
                  <label className="block text-sm text-[var(--text-secondary)] mb-1.5">Max Terminals</label>
                  <input
                    type="number"
                    min={1}
                    max={12}
                    value={localSettings.maxTerminals}
                    onChange={(e) => handleChange('maxTerminals', parseInt(e.target.value))}
                    className="w-full px-3 py-2 bg-[var(--bg-card)] border border-[var(--border)] rounded-lg text-sm text-[var(--text-primary)] focus:outline-none focus:border-[var(--accent)]"
                  />
                  <p className="text-[10px] text-[var(--text-muted)] mt-1">Maximum number of parallel terminals (1-12)</p>
                </div>
              </div>
            </div>
          )}

          {activeSection === 'appearance' && (
            <div className="space-y-6 max-w-xl">
              <h2 className="text-lg font-semibold text-[var(--text-primary)]">Appearance</h2>

              <div className="space-y-4">
                <div>
                  <label className="block text-sm text-[var(--text-secondary)] mb-1.5">Theme</label>
                  <div className="flex gap-3">
                    {(['dark', 'light'] as const).map((theme) => (
                      <button
                        key={theme}
                        onClick={() => handleChange('theme', theme)}
                        className={cn(
                          'flex-1 p-3 rounded-lg border-2 transition-colors capitalize text-sm',
                          localSettings.theme === theme
                            ? 'border-[var(--accent)] bg-[var(--accent)]/10'
                            : 'border-[var(--border)] hover:border-[var(--text-muted)]'
                        )}
                      >
                        {theme}
                      </button>
                    ))}
                  </div>
                </div>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
