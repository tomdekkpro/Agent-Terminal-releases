import type { CopilotProvider, InsightsModel } from '../../../shared/types';

interface ModelSelectorProps {
  provider: CopilotProvider;
  value: InsightsModel;
  copilotValue: string;
  onChange: (model: InsightsModel) => void;
  onCopilotChange: (model: string) => void;
  disabled?: boolean;
}

const claudeModels: { value: InsightsModel; label: string }[] = [
  { value: 'sonnet', label: 'Sonnet (Balanced)' },
  { value: 'opus', label: 'Opus (Most capable)' },
  { value: 'haiku', label: 'Haiku (Fastest)' },
];

const copilotModels: { value: string; label: string }[] = [
  { value: 'claude-sonnet-4.5', label: 'Claude Sonnet 4.5' },
  { value: 'claude-opus-4.5', label: 'Claude Opus 4.5' },
  { value: 'claude-haiku-4.5', label: 'Claude Haiku 4.5' },
  { value: 'gpt-5.1', label: 'GPT-5.1' },
  { value: 'gpt-5.1-codex-mini', label: 'GPT-5.1-Codex-Mini' },
  { value: 'gpt-5.1-codex', label: 'GPT-5.1-Codex' },
  { value: 'gpt-5', label: 'GPT-5' },
  { value: 'gpt-5-mini', label: 'GPT-5-Mini' },
  { value: 'gpt-4.1', label: 'GPT-4.1' },
  { value: 'gemini-3-pro-preview', label: 'Gemini 3 Pro' },
];

export function ModelSelector({ provider, value, copilotValue, onChange, onCopilotChange, disabled }: ModelSelectorProps) {
  if (provider === 'copilot') {
    return (
      <select
        value={copilotValue}
        onChange={(e) => onCopilotChange(e.target.value)}
        disabled={disabled}
        className="text-xs bg-[var(--bg-tertiary)] text-[var(--text-secondary)] border border-[var(--border)] rounded-md px-2 py-1 outline-none focus:border-[var(--accent)] disabled:opacity-50 cursor-pointer"
      >
        {copilotModels.map((m) => (
          <option key={m.value} value={m.value}>
            {m.label}
          </option>
        ))}
      </select>
    );
  }

  return (
    <select
      value={value}
      onChange={(e) => onChange(e.target.value as InsightsModel)}
      disabled={disabled}
      className="text-xs bg-[var(--bg-tertiary)] text-[var(--text-secondary)] border border-[var(--border)] rounded-md px-2 py-1 outline-none focus:border-[var(--accent)] disabled:opacity-50 cursor-pointer"
    >
      {claudeModels.map((m) => (
        <option key={m.value} value={m.value}>
          {m.label}
        </option>
      ))}
    </select>
  );
}
