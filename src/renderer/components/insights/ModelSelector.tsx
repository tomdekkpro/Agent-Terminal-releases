import type { InsightsModel } from '../../../shared/types';

interface ModelSelectorProps {
  value: InsightsModel;
  onChange: (model: InsightsModel) => void;
  disabled?: boolean;
}

const models: { value: InsightsModel; label: string }[] = [
  { value: 'sonnet', label: 'Sonnet (Balanced)' },
  { value: 'opus', label: 'Opus (Most capable)' },
  { value: 'haiku', label: 'Haiku (Fastest)' },
];

export function ModelSelector({ value, onChange, disabled }: ModelSelectorProps) {
  return (
    <select
      value={value}
      onChange={(e) => onChange(e.target.value as InsightsModel)}
      disabled={disabled}
      className="text-xs bg-[var(--bg-tertiary)] text-[var(--text-secondary)] border border-[var(--border)] rounded-md px-2 py-1 outline-none focus:border-[var(--accent)] disabled:opacity-50 cursor-pointer"
    >
      {models.map((m) => (
        <option key={m.value} value={m.value}>
          {m.label}
        </option>
      ))}
    </select>
  );
}
