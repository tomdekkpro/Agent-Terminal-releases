import type { AgentModelOption } from '../../../shared/types';

interface ModelSelectorProps {
  models: AgentModelOption[];
  value: string;
  onChange: (model: string) => void;
  disabled?: boolean;
}

export function ModelSelector({ models, value, onChange, disabled }: ModelSelectorProps) {
  if (models.length === 0) return null;

  return (
    <select
      value={value}
      onChange={(e) => onChange(e.target.value)}
      disabled={disabled}
      className="text-xs bg-[var(--bg-tertiary)] text-[var(--text-secondary)] border border-[var(--border)] rounded-md px-2 py-1 outline-none focus:border-[var(--accent)] disabled:opacity-50 cursor-pointer"
    >
      {models.map((m) => (
        <option key={m.id} value={m.id}>
          {m.label}
        </option>
      ))}
    </select>
  );
}
