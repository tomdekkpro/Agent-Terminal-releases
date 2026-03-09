import { useState } from 'react';
import { Plus, Trash2, RotateCcw, X, Save } from 'lucide-react';
import type { Persona } from '../../../shared/types';
import { useInsightsStore } from '../../stores/insights-store';
import { PersonaBadge, AVAILABLE_ICONS, getPersonaIcon } from './PersonaBadge';
import { cn } from '../../../shared/utils';

const PRESET_COLORS = ['#6366f1', '#22c55e', '#f59e0b', '#ef4444', '#06b6d4', '#a855f7', '#f97316', '#ec4899'];

interface PersonaManagerProps {
  onClose: () => void;
}

export function PersonaManager({ onClose }: PersonaManagerProps) {
  const { personas, addPersona, updatePersona, removePersona, resetPersonas } = useInsightsStore();
  const [editingId, setEditingId] = useState<string | null>(null);
  const [draft, setDraft] = useState<Partial<Persona>>({});

  const startNew = () => {
    setEditingId('__new__');
    setDraft({
      id: `persona-${Date.now()}`,
      name: '',
      role: '',
      systemPrompt: '',
      color: PRESET_COLORS[personas.length % PRESET_COLORS.length],
      icon: 'User',
    });
  };

  const startEdit = (p: Persona) => {
    setEditingId(p.id);
    setDraft({ ...p });
  };

  const handleSave = async () => {
    if (!draft.name || !draft.role || !draft.systemPrompt) return;
    const persona = draft as Persona;

    if (editingId === '__new__') {
      await addPersona(persona);
    } else if (editingId) {
      await updatePersona(editingId, persona);
    }
    setEditingId(null);
    setDraft({});
  };

  const handleDelete = async (id: string) => {
    await removePersona(id);
    if (editingId === id) {
      setEditingId(null);
      setDraft({});
    }
  };

  return (
    <div className="absolute inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm" onClick={onClose}>
      <div className="bg-[var(--bg-card)] border border-[var(--border)] rounded-xl shadow-2xl w-[600px] max-h-[80vh] flex flex-col" onClick={(e) => e.stopPropagation()}>
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-[var(--border)]">
          <h2 className="text-sm font-medium text-[var(--text-primary)]">Manage Personas</h2>
          <div className="flex items-center gap-2">
            <button onClick={resetPersonas} className="flex items-center gap-1 text-xs text-[var(--text-muted)] hover:text-[var(--text-primary)] px-2 py-1 rounded hover:bg-[var(--bg-tertiary)]" title="Reset to defaults">
              <RotateCcw className="w-3 h-3" /> Reset
            </button>
            <button onClick={startNew} className="flex items-center gap-1 text-xs text-[var(--accent)] hover:text-[var(--accent-hover)] px-2 py-1 rounded hover:bg-[var(--accent)]/10">
              <Plus className="w-3 h-3" /> Add Persona
            </button>
            <button onClick={onClose} className="w-6 h-6 rounded flex items-center justify-center text-[var(--text-muted)] hover:text-[var(--text-primary)]">
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>

        {/* Persona list / editor */}
        <div className="flex-1 overflow-y-auto p-4 space-y-3">
          {editingId && (
            <div className="border border-[var(--accent)]/30 rounded-lg p-4 bg-[var(--bg-secondary)] space-y-3">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-[10px] text-[var(--text-muted)] uppercase tracking-wider">Name</label>
                  <input
                    value={draft.name || ''}
                    onChange={(e) => setDraft({ ...draft, name: e.target.value })}
                    placeholder="e.g. PM"
                    className="w-full mt-1 text-sm bg-[var(--bg-primary)] text-[var(--text-primary)] border border-[var(--border)] rounded-md px-2.5 py-1.5 outline-none focus:border-[var(--accent)]"
                  />
                </div>
                <div>
                  <label className="text-[10px] text-[var(--text-muted)] uppercase tracking-wider">Role</label>
                  <input
                    value={draft.role || ''}
                    onChange={(e) => setDraft({ ...draft, role: e.target.value })}
                    placeholder="e.g. Product Manager"
                    className="w-full mt-1 text-sm bg-[var(--bg-primary)] text-[var(--text-primary)] border border-[var(--border)] rounded-md px-2.5 py-1.5 outline-none focus:border-[var(--accent)]"
                  />
                </div>
              </div>

              <div>
                <label className="text-[10px] text-[var(--text-muted)] uppercase tracking-wider">System Prompt</label>
                <textarea
                  value={draft.systemPrompt || ''}
                  onChange={(e) => setDraft({ ...draft, systemPrompt: e.target.value })}
                  placeholder="Describe this persona's focus, expertise, and how they should respond..."
                  rows={3}
                  className="w-full mt-1 text-sm bg-[var(--bg-primary)] text-[var(--text-primary)] border border-[var(--border)] rounded-md px-2.5 py-1.5 outline-none focus:border-[var(--accent)] resize-none"
                />
              </div>

              <div className="flex items-center gap-4">
                <div>
                  <label className="text-[10px] text-[var(--text-muted)] uppercase tracking-wider">Color</label>
                  <div className="flex gap-1.5 mt-1">
                    {PRESET_COLORS.map((c) => (
                      <button
                        key={c}
                        onClick={() => setDraft({ ...draft, color: c })}
                        className={cn('w-5 h-5 rounded-full border-2 transition-transform', draft.color === c ? 'border-white scale-110' : 'border-transparent')}
                        style={{ backgroundColor: c }}
                      />
                    ))}
                  </div>
                </div>
                <div>
                  <label className="text-[10px] text-[var(--text-muted)] uppercase tracking-wider">Icon</label>
                  <div className="flex gap-1.5 mt-1">
                    {AVAILABLE_ICONS.map((iconName) => {
                      const Icon = getPersonaIcon(iconName);
                      return (
                        <button
                          key={iconName}
                          onClick={() => setDraft({ ...draft, icon: iconName })}
                          className={cn(
                            'w-6 h-6 rounded flex items-center justify-center transition-colors',
                            draft.icon === iconName ? 'bg-[var(--accent)]/20 text-[var(--accent)]' : 'text-[var(--text-muted)] hover:text-[var(--text-primary)] hover:bg-[var(--bg-tertiary)]',
                          )}
                        >
                          <Icon className="w-3.5 h-3.5" />
                        </button>
                      );
                    })}
                  </div>
                </div>
              </div>

              <div className="flex justify-end gap-2">
                <button onClick={() => { setEditingId(null); setDraft({}); }} className="text-xs text-[var(--text-muted)] hover:text-[var(--text-primary)] px-3 py-1.5 rounded hover:bg-[var(--bg-tertiary)]">
                  Cancel
                </button>
                <button
                  onClick={handleSave}
                  disabled={!draft.name || !draft.role || !draft.systemPrompt}
                  className="flex items-center gap-1 text-xs text-white bg-[var(--accent)] hover:bg-[var(--accent-hover)] px-3 py-1.5 rounded disabled:opacity-50"
                >
                  <Save className="w-3 h-3" /> Save
                </button>
              </div>
            </div>
          )}

          {personas.map((p) => (
            <div
              key={p.id}
              className={cn(
                'flex items-center gap-3 px-3 py-2.5 rounded-lg border border-[var(--border)] hover:bg-[var(--bg-tertiary)] transition-colors cursor-pointer',
                editingId === p.id && 'ring-1 ring-[var(--accent)]',
              )}
              onClick={() => editingId !== p.id && startEdit(p)}
            >
              <PersonaBadge persona={p} size="md" showName={false} />
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2">
                  <span className="text-sm font-medium" style={{ color: p.color }}>{p.name}</span>
                  <span className="text-[10px] text-[var(--text-muted)]">{p.role}</span>
                </div>
                <p className="text-[11px] text-[var(--text-muted)] truncate mt-0.5">{p.systemPrompt}</p>
              </div>
              <button
                onClick={(e) => { e.stopPropagation(); handleDelete(p.id); }}
                className="w-6 h-6 rounded flex items-center justify-center text-[var(--text-muted)] hover:text-[var(--error)] hover:bg-[var(--error)]/10 opacity-0 group-hover:opacity-100 transition-all shrink-0"
                title="Delete"
              >
                <Trash2 className="w-3 h-3" />
              </button>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
