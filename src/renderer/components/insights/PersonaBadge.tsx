import { ClipboardList, Code, ShieldCheck, User, Palette, Server, Lock } from 'lucide-react';
import type { Persona } from '../../../shared/types';
import { cn } from '../../../shared/utils';

const ICON_MAP: Record<string, any> = {
  ClipboardList,
  Code,
  ShieldCheck,
  User,
  Palette,
  Server,
  Lock,
};

interface PersonaBadgeProps {
  persona: Persona;
  size?: 'sm' | 'md';
  showName?: boolean;
  active?: boolean;
  thinking?: boolean;
}

export function PersonaBadge({ persona, size = 'sm', showName = true, active, thinking }: PersonaBadgeProps) {
  const Icon = ICON_MAP[persona.icon] || User;
  const sizeClass = size === 'md' ? 'w-8 h-8' : 'w-6 h-6';
  const iconSize = size === 'md' ? 'w-4 h-4' : 'w-3 h-3';

  return (
    <div className={cn('flex items-center gap-1.5', active && 'ring-2 ring-offset-1 ring-offset-[var(--bg-primary)] rounded-full')}>
      <div
        className={cn(sizeClass, 'rounded-full flex items-center justify-center shrink-0', thinking && 'animate-pulse')}
        style={{ backgroundColor: `${persona.color}20`, color: persona.color }}
        title={`${persona.name} — ${persona.role}`}
      >
        <Icon className={iconSize} />
      </div>
      {showName && (
        <span className="text-xs font-medium" style={{ color: persona.color }}>
          {persona.name}
        </span>
      )}
    </div>
  );
}

export function getPersonaIcon(iconName: string) {
  return ICON_MAP[iconName] || User;
}

export const AVAILABLE_ICONS = Object.keys(ICON_MAP);
