import { useState, useEffect, useCallback, useRef } from 'react';
import { v4 as uuidv4 } from 'uuid';
import {
  Play, Square, CheckCircle, XCircle, AlertTriangle, Clock, ChevronDown, ChevronRight,
  RefreshCw, Loader2, Globe, FileText, ShieldCheck, Plus, Trash2, Pencil,
  Save, X, Image, KeyRound, Eye, EyeOff,
} from 'lucide-react';
import type { QCTask, QCTestCase, QCTestStep, QCCredential } from '../../../shared/types';
import { cn } from '../../../shared/utils';

interface QCTestPanelProps {
  sessionId: string;
  qcTask: QCTask | undefined;
  model: string;
  onTaskUpdate: (task: QCTask) => void | Promise<void>;
  onNewTask?: () => void;
  onRenameSession?: (title: string) => void | Promise<void>;
}

function StepStatusIcon({ status, running }: { status: QCTestStep['status']; running?: boolean }) {
  if (running) {
    return <Loader2 className="w-3.5 h-3.5 text-blue-400 animate-spin" />;
  }
  switch (status) {
    case 'passed':
      return <CheckCircle className="w-3.5 h-3.5 text-emerald-400" />;
    case 'failed':
      return <XCircle className="w-3.5 h-3.5 text-red-400" />;
    case 'skipped':
      return <AlertTriangle className="w-3.5 h-3.5 text-yellow-400" />;
    default:
      return <Clock className="w-3.5 h-3.5 text-[var(--text-muted)]" />;
  }
}

function TestCaseStatusIcon({ status }: { status: QCTestCase['status'] }) {
  switch (status) {
    case 'passed':
      return <CheckCircle className="w-4 h-4 text-emerald-400" />;
    case 'failed':
      return <XCircle className="w-4 h-4 text-red-400" />;
    case 'error':
      return <AlertTriangle className="w-4 h-4 text-red-400" />;
    case 'running':
      return <Loader2 className="w-4 h-4 text-blue-400 animate-spin" />;
    default:
      return <Clock className="w-4 h-4 text-[var(--text-muted)]" />;
  }
}

// ─── Editable Step Row ───────────────────────────────────────────

function EditableStep({
  step,
  editing,
  running,
  onSave,
  onDelete,
  onStartEdit,
  onCancel,
}: {
  step: QCTestStep;
  editing: boolean;
  running?: boolean;
  onSave: (step: QCTestStep) => void;
  onDelete: () => void;
  onStartEdit: () => void;
  onCancel: () => void;
}) {
  const [action, setAction] = useState(step.action);
  const [expected, setExpected] = useState(step.expected);

  useEffect(() => {
    setAction(step.action);
    setExpected(step.expected);
  }, [step, editing]);

  if (editing) {
    return (
      <div className="flex gap-2 text-xs border border-[var(--accent)]/30 rounded-md p-2 bg-[var(--bg-primary)]">
        <span className="text-[var(--text-muted)] shrink-0 mt-1">#{step.order}</span>
        <div className="flex-1 space-y-1.5">
          <input
            value={action}
            onChange={(e) => setAction(e.target.value)}
            placeholder="Action to perform..."
            className="w-full text-xs bg-[var(--bg-secondary)] text-[var(--text-primary)] border border-[var(--border)] rounded px-2 py-1 outline-none focus:border-[var(--accent)]"
            autoFocus
          />
          <input
            value={expected}
            onChange={(e) => setExpected(e.target.value)}
            placeholder="Expected result..."
            className="w-full text-xs bg-[var(--bg-secondary)] text-[var(--text-primary)] border border-[var(--border)] rounded px-2 py-1 outline-none focus:border-[var(--accent)]"
          />
          <div className="flex gap-1">
            <button
              onClick={() => onSave({ ...step, action, expected })}
              disabled={!action.trim() || !expected.trim()}
              className="flex items-center gap-1 text-[10px] px-2 py-0.5 rounded bg-emerald-500/20 text-emerald-400 hover:bg-emerald-500/30 disabled:opacity-50"
            >
              <Save className="w-2.5 h-2.5" /> Save
            </button>
            <button
              onClick={onCancel}
              className="flex items-center gap-1 text-[10px] px-2 py-0.5 rounded bg-[var(--bg-tertiary)] text-[var(--text-muted)] hover:text-[var(--text-primary)]"
            >
              <X className="w-2.5 h-2.5" /> Cancel
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className={cn("flex gap-2 text-xs group/step", running && "bg-blue-500/5 rounded-md px-1.5 py-1 -mx-1.5")}>
      <div className="shrink-0 mt-0.5">
        <StepStatusIcon status={step.status} running={running} />
      </div>
      <div className="flex-1 min-w-0">
        <div className="flex items-start gap-2">
          <span className="text-[var(--text-muted)] shrink-0">#{step.order}</span>
          <div className="flex-1">
            <p className="text-[var(--text-primary)]">{step.action}</p>
            <p className="text-[var(--text-muted)] mt-0.5">Expected: {step.expected}</p>
            {step.actual && (
              <p className={cn('mt-0.5', step.status === 'passed' ? 'text-emerald-400' : 'text-red-400')}>
                Actual: {step.actual}
              </p>
            )}
            {step.screenshot && (
              <button
                className={cn(
                  "flex items-center gap-1 mt-1 text-[10px] px-1.5 py-0.5 rounded",
                  step.screenshot.includes('.png') || step.screenshot.includes('.jpg')
                    ? "text-blue-400 hover:text-blue-300 hover:bg-blue-500/10 cursor-pointer"
                    : "text-blue-400/70 cursor-default"
                )}
                onClick={() => {
                  if (step.screenshot && (step.screenshot.includes('.png') || step.screenshot.includes('.jpg'))) {
                    window.electronAPI.openPath(step.screenshot);
                  }
                }}
                title={step.screenshot.includes('.png') ? 'Click to open screenshot' : undefined}
              >
                <Image className="w-3 h-3" />
                {step.screenshot.includes('.png') || step.screenshot.includes('.jpg')
                  ? 'View Screenshot'
                  : step.screenshot}
              </button>
            )}
          </div>
          <div className="flex items-center gap-0.5 opacity-0 group-hover/step:opacity-100 transition-opacity shrink-0">
            <button
              onClick={onStartEdit}
              className="w-5 h-5 rounded flex items-center justify-center text-[var(--text-muted)] hover:text-[var(--accent)] transition-colors"
              title="Edit step"
            >
              <Pencil className="w-2.5 h-2.5" />
            </button>
            <button
              onClick={onDelete}
              className="w-5 h-5 rounded flex items-center justify-center text-[var(--text-muted)] hover:text-red-400 transition-colors"
              title="Remove step"
            >
              <Trash2 className="w-2.5 h-2.5" />
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

// ─── Test Case Card ──────────────────────────────────────────────

function TestCaseCard({
  testCase,
  sessionId,
  model,
  runningStepOrder,
  onUpdate,
  onDelete,
}: {
  testCase: QCTestCase;
  sessionId: string;
  model: string;
  runningStepOrder?: number;
  onUpdate: (tc: QCTestCase) => void;
  onDelete: () => void;
}) {
  const isRunning = testCase.status === 'running';
  const [expanded, setExpanded] = useState(false);
  const [running, setRunning] = useState(false);
  const [editingName, setEditingName] = useState(false);
  const [editingStepId, setEditingStepId] = useState<string | null>(null);
  const [nameText, setNameText] = useState(testCase.name);
  const [descText, setDescText] = useState(testCase.description);
  const [addingStep, setAddingStep] = useState(false);

  // Auto-expand when test case starts running
  useEffect(() => {
    if (isRunning) setExpanded(true);
  }, [isRunning]);

  const handleRunSingle = async () => {
    setRunning(true);
    try {
      const result = await window.electronAPI.qcRunSingleTest(sessionId, testCase.id, model);
      if (result.success) {
        onUpdate(result.data);
      }
    } finally {
      setRunning(false);
    }
  };

  const handleSaveName = () => {
    if (nameText.trim()) {
      onUpdate({ ...testCase, name: nameText.trim(), description: descText.trim() });
    }
    setEditingName(false);
  };

  const handleSaveStep = (updatedStep: QCTestStep) => {
    const newSteps = testCase.steps.map((s) => s.id === updatedStep.id ? updatedStep : s);
    onUpdate({ ...testCase, steps: newSteps, status: 'pending' });
    setEditingStepId(null);
  };

  const handleDeleteStep = (stepId: string) => {
    const newSteps = testCase.steps
      .filter((s) => s.id !== stepId)
      .map((s, i) => ({ ...s, order: i + 1 }));
    onUpdate({ ...testCase, steps: newSteps });
  };

  const handleAddStep = (action: string, expected: string) => {
    const newStep: QCTestStep = {
      id: uuidv4(),
      order: testCase.steps.length + 1,
      action,
      expected,
      status: 'pending',
    };
    onUpdate({ ...testCase, steps: [...testCase.steps, newStep], status: 'pending' });
    setAddingStep(false);
  };

  return (
    <div className="border border-[var(--border)] rounded-lg overflow-hidden">
      {/* Header */}
      <div
        className="flex items-center gap-2 px-3 py-2 bg-[var(--bg-secondary)] cursor-pointer hover:bg-[var(--bg-tertiary)] transition-colors group/card"
        onClick={() => setExpanded(!expanded)}
      >
        {expanded ? <ChevronDown className="w-3.5 h-3.5 text-[var(--text-muted)]" /> : <ChevronRight className="w-3.5 h-3.5 text-[var(--text-muted)]" />}
        <TestCaseStatusIcon status={testCase.status} />
        <span className="text-sm text-[var(--text-primary)] flex-1 truncate">{testCase.name}</span>
        {isRunning && runningStepOrder ? (
          <span className="text-[10px] text-blue-400 flex items-center gap-1">
            <Loader2 className="w-2.5 h-2.5 animate-spin" />
            Step {runningStepOrder}/{testCase.steps.length}
          </span>
        ) : (
          <span className="text-[10px] text-[var(--text-muted)]">{testCase.steps.length} steps</span>
        )}
        <div className="flex items-center gap-1 opacity-0 group-hover/card:opacity-100 transition-opacity">
          <button
            onClick={(e) => { e.stopPropagation(); setExpanded(true); setEditingName(true); }}
            className="w-5 h-5 rounded flex items-center justify-center text-[var(--text-muted)] hover:text-[var(--accent)] transition-colors"
            title="Edit test case"
          >
            <Pencil className="w-3 h-3" />
          </button>
          <button
            onClick={(e) => { e.stopPropagation(); onDelete(); }}
            className="w-5 h-5 rounded flex items-center justify-center text-[var(--text-muted)] hover:text-red-400 transition-colors"
            title="Remove test case"
          >
            <Trash2 className="w-3 h-3" />
          </button>
          {testCase.status !== 'running' && (
            <button
              onClick={(e) => { e.stopPropagation(); handleRunSingle(); }}
              disabled={running}
              className="flex items-center gap-1 text-[10px] px-2 py-0.5 rounded bg-[var(--accent)]/10 text-[var(--accent)] hover:bg-[var(--accent)]/20 transition-colors disabled:opacity-50"
            >
              {running ? <Loader2 className="w-3 h-3 animate-spin" /> : <Play className="w-3 h-3" />}
              {running ? 'Running' : 'Run'}
            </button>
          )}
        </div>
      </div>

      {/* Expanded content */}
      {expanded && (
        <div className="px-3 py-2 space-y-2">
          {/* Editable name/description */}
          {editingName ? (
            <div className="space-y-1.5 p-2 border border-[var(--accent)]/30 rounded-md bg-[var(--bg-primary)]">
              <input
                value={nameText}
                onChange={(e) => setNameText(e.target.value)}
                placeholder="Test case name"
                className="w-full text-sm bg-[var(--bg-secondary)] text-[var(--text-primary)] border border-[var(--border)] rounded px-2 py-1 outline-none focus:border-[var(--accent)]"
                autoFocus
              />
              <textarea
                value={descText}
                onChange={(e) => setDescText(e.target.value)}
                placeholder="Description..."
                rows={2}
                className="w-full text-xs bg-[var(--bg-secondary)] text-[var(--text-primary)] border border-[var(--border)] rounded px-2 py-1 outline-none focus:border-[var(--accent)] resize-none"
              />
              <div className="flex gap-1">
                <button onClick={handleSaveName} className="flex items-center gap-1 text-[10px] px-2 py-0.5 rounded bg-emerald-500/20 text-emerald-400 hover:bg-emerald-500/30">
                  <Save className="w-2.5 h-2.5" /> Save
                </button>
                <button onClick={() => { setEditingName(false); setNameText(testCase.name); setDescText(testCase.description); }} className="flex items-center gap-1 text-[10px] px-2 py-0.5 rounded bg-[var(--bg-tertiary)] text-[var(--text-muted)]">
                  <X className="w-2.5 h-2.5" /> Cancel
                </button>
              </div>
            </div>
          ) : (
            <p className="text-xs text-[var(--text-muted)]">{testCase.description}</p>
          )}

          {testCase.errorMessage && (
            <div className="text-xs text-red-400 bg-red-500/10 rounded px-2 py-1">
              {testCase.errorMessage}
            </div>
          )}

          {/* Steps */}
          <div className="space-y-1.5">
            {testCase.steps.map((step) => (
              <EditableStep
                key={step.id}
                step={step}
                editing={editingStepId === step.id}
                running={isRunning && runningStepOrder === step.order}
                onSave={handleSaveStep}
                onDelete={() => handleDeleteStep(step.id)}
                onStartEdit={() => setEditingStepId(step.id)}
                onCancel={() => setEditingStepId(null)}
              />
            ))}
          </div>

          {/* Add step */}
          {addingStep ? (
            <NewStepForm
              order={testCase.steps.length + 1}
              onAdd={handleAddStep}
              onCancel={() => setAddingStep(false)}
            />
          ) : (
            <button
              onClick={() => setAddingStep(true)}
              className="flex items-center gap-1.5 text-[10px] text-[var(--text-muted)] hover:text-[var(--accent)] transition-colors px-1 py-0.5"
            >
              <Plus className="w-3 h-3" /> Add step
            </button>
          )}
        </div>
      )}
    </div>
  );
}

// ─── Credentials Section ─────────────────────────────────────────

function CredentialsSection({
  credentials,
  onChange,
}: {
  credentials: QCCredential[];
  onChange: (creds: QCCredential[]) => void;
}) {
  const [expanded, setExpanded] = useState(credentials.length > 0);
  const [visibleValues, setVisibleValues] = useState<Record<number, boolean>>({});

  const handleAdd = () => {
    onChange([...credentials, { label: '', value: '' }]);
    setExpanded(true);
  };

  const handleUpdate = (index: number, field: 'label' | 'value', val: string) => {
    const updated = credentials.map((c, i) => i === index ? { ...c, [field]: val } : c);
    onChange(updated);
  };

  const handleRemove = (index: number) => {
    onChange(credentials.filter((_, i) => i !== index));
  };

  const toggleVisible = (index: number) => {
    setVisibleValues(prev => ({ ...prev, [index]: !prev[index] }));
  };

  return (
    <div className="border border-[var(--border)] rounded-lg overflow-hidden">
      <div
        className="flex items-center gap-2 px-3 py-2 bg-[var(--bg-secondary)] cursor-pointer hover:bg-[var(--bg-tertiary)] transition-colors"
        onClick={() => setExpanded(!expanded)}
      >
        {expanded ? <ChevronDown className="w-3 h-3 text-[var(--text-muted)]" /> : <ChevronRight className="w-3 h-3 text-[var(--text-muted)]" />}
        <KeyRound className="w-3.5 h-3.5 text-amber-400" />
        <span className="text-xs font-medium text-[var(--text-primary)]">Login Credentials</span>
        {credentials.length > 0 && (
          <span className="text-[10px] text-[var(--text-muted)]">{credentials.length} field{credentials.length !== 1 ? 's' : ''}</span>
        )}
        <button
          onClick={(e) => { e.stopPropagation(); handleAdd(); }}
          className="ml-auto w-5 h-5 rounded flex items-center justify-center text-[var(--text-muted)] hover:text-[var(--accent)] transition-colors"
          title="Add credential"
        >
          <Plus className="w-3 h-3" />
        </button>
      </div>
      {expanded && (
        <div className="px-3 py-2 space-y-2">
          {credentials.length === 0 && (
            <p className="text-[10px] text-[var(--text-muted)] italic">No credentials configured. Add login info so tests can authenticate automatically.</p>
          )}
          {credentials.map((cred, i) => (
            <div key={i} className="flex items-center gap-1.5">
              <input
                value={cred.label}
                onChange={(e) => handleUpdate(i, 'label', e.target.value)}
                placeholder="Label (e.g. Email)"
                className="w-24 text-[11px] bg-[var(--bg-primary)] text-[var(--text-primary)] border border-[var(--border)] rounded px-2 py-1 outline-none focus:border-[var(--accent)]"
              />
              <div className="flex-1 relative">
                <input
                  type={visibleValues[i] ? 'text' : 'password'}
                  value={cred.value}
                  onChange={(e) => handleUpdate(i, 'value', e.target.value)}
                  placeholder="Value"
                  className="w-full text-[11px] bg-[var(--bg-primary)] text-[var(--text-primary)] border border-[var(--border)] rounded px-2 py-1 pr-7 outline-none focus:border-[var(--accent)]"
                />
                <button
                  onClick={() => toggleVisible(i)}
                  className="absolute right-1.5 top-1/2 -translate-y-1/2 text-[var(--text-muted)] hover:text-[var(--text-primary)]"
                >
                  {visibleValues[i] ? <EyeOff className="w-3 h-3" /> : <Eye className="w-3 h-3" />}
                </button>
              </div>
              <button
                onClick={() => handleRemove(i)}
                className="w-5 h-5 rounded flex items-center justify-center text-[var(--text-muted)] hover:text-red-400 transition-colors shrink-0"
              >
                <Trash2 className="w-3 h-3" />
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ─── New Step Form ───────────────────────────────────────────────

function NewStepForm({
  order,
  onAdd,
  onCancel,
}: {
  order: number;
  onAdd: (action: string, expected: string) => void;
  onCancel: () => void;
}) {
  const [action, setAction] = useState('');
  const [expected, setExpected] = useState('');

  return (
    <div className="flex gap-2 text-xs border border-[var(--accent)]/30 rounded-md p-2 bg-[var(--bg-primary)]">
      <span className="text-[var(--text-muted)] shrink-0 mt-1">#{order}</span>
      <div className="flex-1 space-y-1.5">
        <input
          value={action}
          onChange={(e) => setAction(e.target.value)}
          placeholder="Action to perform..."
          className="w-full text-xs bg-[var(--bg-secondary)] text-[var(--text-primary)] border border-[var(--border)] rounded px-2 py-1 outline-none focus:border-[var(--accent)]"
          autoFocus
        />
        <input
          value={expected}
          onChange={(e) => setExpected(e.target.value)}
          placeholder="Expected result..."
          className="w-full text-xs bg-[var(--bg-secondary)] text-[var(--text-primary)] border border-[var(--border)] rounded px-2 py-1 outline-none focus:border-[var(--accent)]"
          onKeyDown={(e) => {
            if (e.key === 'Enter' && action.trim() && expected.trim()) onAdd(action.trim(), expected.trim());
            if (e.key === 'Escape') onCancel();
          }}
        />
        <div className="flex gap-1">
          <button
            onClick={() => onAdd(action.trim(), expected.trim())}
            disabled={!action.trim() || !expected.trim()}
            className="flex items-center gap-1 text-[10px] px-2 py-0.5 rounded bg-emerald-500/20 text-emerald-400 hover:bg-emerald-500/30 disabled:opacity-50"
          >
            <Plus className="w-2.5 h-2.5" /> Add
          </button>
          <button
            onClick={onCancel}
            className="flex items-center gap-1 text-[10px] px-2 py-0.5 rounded bg-[var(--bg-tertiary)] text-[var(--text-muted)] hover:text-[var(--text-primary)]"
          >
            <X className="w-2.5 h-2.5" /> Cancel
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── New Test Case Form ──────────────────────────────────────────

function NewTestCaseForm({
  onAdd,
  onCancel,
}: {
  onAdd: (tc: QCTestCase) => void;
  onCancel: () => void;
}) {
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');

  const handleAdd = () => {
    if (!name.trim()) return;
    const tc: QCTestCase = {
      id: uuidv4(),
      name: name.trim(),
      description: description.trim(),
      steps: [],
      status: 'pending',
    };
    onAdd(tc);
  };

  return (
    <div className="space-y-2 p-3 border border-[var(--accent)]/30 rounded-lg bg-[var(--bg-primary)]">
      <input
        value={name}
        onChange={(e) => setName(e.target.value)}
        placeholder="Test case name *"
        className="w-full text-sm bg-[var(--bg-secondary)] text-[var(--text-primary)] border border-[var(--border)] rounded px-2.5 py-1.5 outline-none focus:border-[var(--accent)]"
        autoFocus
      />
      <input
        value={description}
        onChange={(e) => setDescription(e.target.value)}
        placeholder="Description (optional)"
        className="w-full text-xs bg-[var(--bg-secondary)] text-[var(--text-primary)] border border-[var(--border)] rounded px-2.5 py-1.5 outline-none focus:border-[var(--accent)]"
        onKeyDown={(e) => { if (e.key === 'Enter' && name.trim()) handleAdd(); if (e.key === 'Escape') onCancel(); }}
      />
      <div className="flex gap-1">
        <button
          onClick={handleAdd}
          disabled={!name.trim()}
          className="flex items-center gap-1 text-xs px-2.5 py-1 rounded bg-emerald-500/20 text-emerald-400 hover:bg-emerald-500/30 disabled:opacity-50"
        >
          <Plus className="w-3 h-3" /> Add Test Case
        </button>
        <button
          onClick={onCancel}
          className="flex items-center gap-1 text-xs px-2.5 py-1 rounded bg-[var(--bg-tertiary)] text-[var(--text-muted)] hover:text-[var(--text-primary)]"
        >
          Cancel
        </button>
      </div>
    </div>
  );
}

// ─── Main Panel ──────────────────────────────────────────────────

export function QCTestPanel({ sessionId, qcTask, model, onTaskUpdate, onNewTask, onRenameSession }: QCTestPanelProps) {
  const [showCreateForm, setShowCreateForm] = useState(!qcTask);
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [targetUrl, setTargetUrl] = useState('');
  const [generating, setGenerating] = useState(false);
  const [runningAll, setRunningAll] = useState(
    () => qcTask?.status === 'running' || (qcTask?.testCases.some(tc => tc.status === 'running') ?? false),
  );
  const [error, setError] = useState<string | null>(null);
  const [addingTestCase, setAddingTestCase] = useState(false);
  const [editingTask, setEditingTask] = useState(false);
  const [editTitle, setEditTitle] = useState('');
  const [editDescription, setEditDescription] = useState('');
  const [editUrl, setEditUrl] = useState('');
  // Track which step is currently running per test case: { [testCaseId]: stepOrder }
  const [runningSteps, setRunningSteps] = useState<Record<string, number>>({});

  // Ref to always access the latest qcTask inside event listeners (avoids stale closures)
  const qcTaskRef = useRef(qcTask);
  qcTaskRef.current = qcTask;
  const onTaskUpdateRef = useRef(onTaskUpdate);
  onTaskUpdateRef.current = onTaskUpdate;

  // Keep runningAll in sync with persisted task/test-case status
  useEffect(() => {
    const isRunning = qcTask?.status === 'running' || (qcTask?.testCases.some(tc => tc.status === 'running') ?? false);
    setRunningAll(isRunning);
  }, [qcTask?.status, qcTask?.testCases]);

  // Listen for QC events — uses refs to always read the latest qcTask/onTaskUpdate
  // so that completed test cases keep their final status (passed/failed) instead of
  // being reverted to 'running' by a stale closure.
  useEffect(() => {
    const cleanup = window.electronAPI.onQCEvent((event: any) => {
      if (event.sessionId !== sessionId) return;
      const task = qcTaskRef.current;
      const update = onTaskUpdateRef.current;

      // Track step progress
      if (event.type === 'step-update' && event.testCaseId && event.stepOrder) {
        setRunningSteps(prev => ({ ...prev, [event.testCaseId!]: event.stepOrder! }));
        if (task) {
          const tc = task.testCases.find(t => t.id === event.testCaseId);
          if (tc && tc.status !== 'running') {
            update({
              ...task,
              testCases: task.testCases.map(t =>
                t.id === event.testCaseId ? { ...t, status: 'running' as const } : t,
              ),
            });
          }
        }
      }

      if (event.type === 'test-start' && event.testCaseId && task) {
        setRunningSteps(prev => ({ ...prev, [event.testCaseId!]: 0 }));
        update({
          ...task,
          status: 'running',
          testCases: task.testCases.map(tc =>
            tc.id === event.testCaseId ? { ...tc, status: 'running' as const } : tc,
          ),
        });
      }

      if (event.type === 'test-done' && event.testCase && task) {
        setRunningSteps(prev => {
          const next = { ...prev };
          delete next[event.testCaseId!];
          return next;
        });
        update({
          ...task,
          testCases: task.testCases.map((tc: QCTestCase) =>
            tc.id === event.testCaseId ? event.testCase! : tc,
          ),
        });
      }

      if (event.type === 'all-done' && event.summary) {
        setRunningSteps({});
        setRunningAll(false);
      }
    });
    return () => { cleanup(); };
  }, [sessionId]);

  const handleGenerate = useCallback(async () => {
    // Use current task values when regenerating, form values when creating
    const genTitle = qcTask?.title || title;
    const genDesc = qcTask?.description || description;
    const genUrl = qcTask?.targetUrl || targetUrl;
    if (!genTitle.trim() || !genUrl.trim()) return;
    setGenerating(true);
    setError(null);
    try {
      const result = await window.electronAPI.qcGenerateTests(sessionId, genTitle, genDesc, genUrl, model);
      if (result.success) {
        await onTaskUpdate(result.data);
        setShowCreateForm(false);
        // Update session title AFTER onTaskUpdate has persisted qcTask to disk
        // to avoid concurrent file writes that can corrupt the session JSON.
        await onRenameSession?.(`QC: ${genTitle}`);
      } else {
        setError(result.error || 'Failed to generate tests');
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to generate tests');
    } finally {
      setGenerating(false);
    }
  }, [sessionId, qcTask, title, description, targetUrl, model, onTaskUpdate]);

  const handleRunAll = useCallback(async () => {
    setRunningAll(true);
    setError(null);
    try {
      const result = await window.electronAPI.qcRunTests(sessionId, model);
      if (result.success) {
        onTaskUpdate(result.data);
      } else {
        setError(result.error || 'Failed to run tests');
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to run tests');
    } finally {
      setRunningAll(false);
    }
  }, [sessionId, model, onTaskUpdate]);

  const handleAbort = useCallback(() => {
    window.electronAPI.qcAbort(sessionId);
    setRunningAll(false);
  }, [sessionId]);

  const handleTestCaseUpdate = useCallback((updatedTc: QCTestCase) => {
    if (!qcTask) return;
    onTaskUpdate({
      ...qcTask,
      testCases: qcTask.testCases.map((tc) => tc.id === updatedTc.id ? updatedTc : tc),
      updatedAt: new Date().toISOString(),
    });
  }, [qcTask, onTaskUpdate]);

  const handleDeleteTestCase = useCallback((tcId: string) => {
    if (!qcTask) return;
    onTaskUpdate({
      ...qcTask,
      testCases: qcTask.testCases.filter((tc) => tc.id !== tcId),
      updatedAt: new Date().toISOString(),
    });
  }, [qcTask, onTaskUpdate]);

  const handleAddTestCase = useCallback((tc: QCTestCase) => {
    if (!qcTask) return;
    onTaskUpdate({
      ...qcTask,
      testCases: [...qcTask.testCases, tc],
      status: 'ready',
      updatedAt: new Date().toISOString(),
    });
    setAddingTestCase(false);
  }, [qcTask, onTaskUpdate]);

  // Summary stats
  const passed = qcTask?.testCases.filter((tc) => tc.status === 'passed').length || 0;
  const failed = qcTask?.testCases.filter((tc) => tc.status === 'failed').length || 0;
  const errors = qcTask?.testCases.filter((tc) => tc.status === 'error').length || 0;
  const running = qcTask?.testCases.filter((tc) => tc.status === 'running').length || 0;
  const pending = qcTask?.testCases.filter((tc) => tc.status === 'pending').length || 0;
  const total = qcTask?.testCases.length || 0;

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="px-4 py-3 border-b border-[var(--border)] bg-[var(--bg-secondary)]">
        <div className="flex items-center gap-2">
          <ShieldCheck className="w-4 h-4 text-amber-400" />
          <h3 className="text-sm font-medium text-[var(--text-primary)]">QC Testing</h3>
          {qcTask && onNewTask && (
            <button
              onClick={onNewTask}
              className="ml-2 flex items-center gap-1 text-[10px] text-amber-400 bg-amber-500/10 hover:bg-amber-500/20 px-2 py-0.5 rounded transition-colors"
              title="Create a new QC testing session"
            >
              <Plus className="w-3 h-3" /> New Task
            </button>
          )}
          {qcTask && total > 0 && (
            <div className="flex items-center gap-2 ml-auto text-[10px]">
              {running > 0 && <span className="flex items-center gap-0.5 text-blue-400"><Loader2 className="w-2.5 h-2.5 animate-spin" />{running} running</span>}
              {passed > 0 && <span className="flex items-center gap-0.5 text-emerald-400"><CheckCircle className="w-2.5 h-2.5" />{passed}</span>}
              {failed > 0 && <span className="flex items-center gap-0.5 text-red-400"><XCircle className="w-2.5 h-2.5" />{failed}</span>}
              {errors > 0 && <span className="flex items-center gap-0.5 text-red-400"><AlertTriangle className="w-2.5 h-2.5" />{errors}</span>}
              {pending > 0 && <span className="flex items-center gap-0.5 text-[var(--text-muted)]"><Clock className="w-2.5 h-2.5" />{pending}</span>}
            </div>
          )}
        </div>
      </div>

      <div className="flex-1 overflow-y-auto p-4 space-y-3">
        {error && (
          <div className="flex items-center gap-2 text-xs text-red-400 bg-red-500/10 rounded-lg px-3 py-2">
            <AlertTriangle className="w-3.5 h-3.5 shrink-0" />
            <span className="flex-1">{error}</span>
            <button onClick={() => setError(null)} className="text-[var(--text-muted)] hover:text-[var(--text-primary)]">&times;</button>
          </div>
        )}

        {/* Create form */}
        {showCreateForm && (
          <div className="space-y-3 p-4 border border-[var(--border)] rounded-lg bg-[var(--bg-card)]">
            <div>
              <label className="text-xs text-[var(--text-muted)] block mb-1">Task Title *</label>
              <input
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                placeholder="e.g., Login page validation"
                className="w-full text-sm bg-[var(--bg-primary)] text-[var(--text-primary)] border border-[var(--border)] rounded-md px-3 py-1.5 outline-none focus:border-[var(--accent)]"
              />
            </div>
            <div>
              <label className="text-xs text-[var(--text-muted)] block mb-1">Description</label>
              <textarea
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                placeholder="Describe the feature to test..."
                rows={3}
                className="w-full text-sm bg-[var(--bg-primary)] text-[var(--text-primary)] border border-[var(--border)] rounded-md px-3 py-1.5 outline-none focus:border-[var(--accent)] resize-none"
              />
            </div>
            <div>
              <label className="text-xs text-[var(--text-muted)] block mb-1">Target URL *</label>
              <div className="relative">
                <Globe className="w-3.5 h-3.5 absolute left-2.5 top-1/2 -translate-y-1/2 text-[var(--text-muted)]" />
                <input
                  value={targetUrl}
                  onChange={(e) => setTargetUrl(e.target.value)}
                  placeholder="https://example.com"
                  className="w-full text-sm bg-[var(--bg-primary)] text-[var(--text-primary)] border border-[var(--border)] rounded-md pl-8 pr-3 py-1.5 outline-none focus:border-[var(--accent)]"
                />
              </div>
            </div>
            <button
              onClick={handleGenerate}
              disabled={generating || !title.trim() || !targetUrl.trim()}
              className="w-full flex items-center justify-center gap-2 text-sm font-medium px-4 py-2 rounded-lg bg-amber-500/20 text-amber-400 hover:bg-amber-500/30 transition-colors disabled:opacity-50"
            >
              {generating ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin" />
                  Generating test cases...
                </>
              ) : (
                <>
                  <FileText className="w-4 h-4" />
                  Generate Test Cases
                </>
              )}
            </button>
          </div>
        )}

        {/* Task info */}
        {qcTask && !showCreateForm && (
          <>
            <div className="p-3 border border-[var(--border)] rounded-lg bg-[var(--bg-card)]">
              {editingTask ? (
                <div className="space-y-2">
                  <input
                    value={editTitle}
                    onChange={(e) => setEditTitle(e.target.value)}
                    placeholder="Task title"
                    className="w-full text-sm bg-[var(--bg-primary)] text-[var(--text-primary)] border border-[var(--border)] rounded px-2.5 py-1.5 outline-none focus:border-[var(--accent)]"
                    autoFocus
                  />
                  <textarea
                    value={editDescription}
                    onChange={(e) => setEditDescription(e.target.value)}
                    placeholder="Description..."
                    rows={3}
                    className="w-full text-xs bg-[var(--bg-primary)] text-[var(--text-primary)] border border-[var(--border)] rounded px-2.5 py-1.5 outline-none focus:border-[var(--accent)] resize-none"
                  />
                  <div className="relative">
                    <Globe className="w-3.5 h-3.5 absolute left-2 top-1/2 -translate-y-1/2 text-[var(--text-muted)]" />
                    <input
                      value={editUrl}
                      onChange={(e) => setEditUrl(e.target.value)}
                      placeholder="https://example.com"
                      className="w-full text-xs bg-[var(--bg-primary)] text-[var(--text-primary)] border border-[var(--border)] rounded pl-7 pr-2.5 py-1.5 outline-none focus:border-[var(--accent)]"
                    />
                  </div>
                  <div className="flex gap-1">
                    <button
                      onClick={() => {
                        if (editTitle.trim()) {
                          onTaskUpdate({ ...qcTask, title: editTitle.trim(), description: editDescription.trim(), targetUrl: editUrl.trim() || qcTask.targetUrl, updatedAt: new Date().toISOString() });
                        }
                        setEditingTask(false);
                      }}
                      disabled={!editTitle.trim()}
                      className="flex items-center gap-1 text-xs px-2.5 py-1 rounded bg-emerald-500/20 text-emerald-400 hover:bg-emerald-500/30 disabled:opacity-50"
                    >
                      <Save className="w-3 h-3" /> Save
                    </button>
                    <button
                      onClick={() => setEditingTask(false)}
                      className="flex items-center gap-1 text-xs px-2.5 py-1 rounded bg-[var(--bg-tertiary)] text-[var(--text-muted)] hover:text-[var(--text-primary)]"
                    >
                      Cancel
                    </button>
                  </div>
                </div>
              ) : (
                <div className="group/task">
                  <div className="flex items-center justify-between mb-1">
                    <h4 className="text-sm font-medium text-[var(--text-primary)]">{qcTask.title}</h4>
                    <div className="flex items-center gap-2">
                      <button
                        onClick={() => { setEditTitle(qcTask.title); setEditDescription(qcTask.description); setEditUrl(qcTask.targetUrl); setEditingTask(true); }}
                        className="opacity-0 group-hover/task:opacity-100 transition-opacity w-5 h-5 rounded flex items-center justify-center text-[var(--text-muted)] hover:text-[var(--accent)]"
                        title="Edit task"
                      >
                        <Pencil className="w-3 h-3" />
                      </button>
                    </div>
                  </div>
                  {qcTask.description && (
                    <p className="text-xs text-[var(--text-muted)] mb-1">{qcTask.description}</p>
                  )}
                  <div className="flex items-center gap-2 text-[10px] text-[var(--text-muted)]">
                    <Globe className="w-3 h-3" />
                    <span className="truncate">{qcTask.targetUrl}</span>
                  </div>
                </div>
              )}
            </div>

            {/* Credentials */}
            <CredentialsSection
              credentials={qcTask.credentials || []}
              onChange={(creds) => {
                onTaskUpdate({ ...qcTask, credentials: creds, updatedAt: new Date().toISOString() });
              }}
            />

            {/* Action buttons */}
            <div className="flex gap-2">
              {runningAll ? (
                <button
                  onClick={handleAbort}
                  className="flex-1 flex items-center justify-center gap-2 text-sm px-4 py-2 rounded-lg bg-red-500/20 text-red-400 hover:bg-red-500/30 transition-colors"
                >
                  <Square className="w-3.5 h-3.5" />
                  Stop
                </button>
              ) : (
                <button
                  onClick={handleRunAll}
                  disabled={total === 0}
                  className="flex-1 flex items-center justify-center gap-2 text-sm px-4 py-2 rounded-lg bg-emerald-500/20 text-emerald-400 hover:bg-emerald-500/30 transition-colors disabled:opacity-50"
                >
                  <Play className="w-3.5 h-3.5" />
                  Run All Tests ({total})
                </button>
              )}
              <button
                onClick={handleGenerate}
                disabled={generating}
                className="flex items-center gap-1.5 text-sm px-3 py-2 rounded-lg bg-[var(--bg-tertiary)] text-[var(--text-secondary)] hover:bg-[var(--bg-tertiary)]/80 transition-colors disabled:opacity-50"
              >
                <RefreshCw className={cn('w-3.5 h-3.5', generating && 'animate-spin')} />
                Regenerate
              </button>
            </div>

            {/* Summary */}
            {qcTask.summary && (
              <div className={cn(
                'text-xs px-3 py-2 rounded-lg',
                failed > 0 ? 'bg-red-500/10 text-red-400' : 'bg-emerald-500/10 text-emerald-400',
              )}>
                {qcTask.summary}
              </div>
            )}

            {/* Test case list */}
            <div className="space-y-2">
              {qcTask.testCases.map((tc) => (
                <TestCaseCard
                  key={tc.id}
                  testCase={tc}
                  sessionId={sessionId}
                  model={model}
                  runningStepOrder={runningSteps[tc.id]}
                  onUpdate={handleTestCaseUpdate}
                  onDelete={() => handleDeleteTestCase(tc.id)}
                />
              ))}
            </div>

            {/* Add test case */}
            {addingTestCase ? (
              <NewTestCaseForm onAdd={handleAddTestCase} onCancel={() => setAddingTestCase(false)} />
            ) : (
              <button
                onClick={() => setAddingTestCase(true)}
                className="flex items-center gap-1.5 w-full justify-center text-xs text-[var(--text-muted)] hover:text-[var(--accent)] border border-dashed border-[var(--border)] hover:border-[var(--accent)]/50 rounded-lg py-2.5 transition-colors"
              >
                <Plus className="w-3.5 h-3.5" /> Add Test Case
              </button>
            )}
          </>
        )}

        {/* Empty state */}
        {!qcTask && !showCreateForm && (
          <div className="text-center py-12">
            <ShieldCheck className="w-10 h-10 text-amber-400/30 mx-auto mb-3" />
            <p className="text-sm text-[var(--text-muted)] mb-3">No QC task assigned yet</p>
            <button
              onClick={() => setShowCreateForm(true)}
              className="text-sm text-amber-400 hover:text-amber-300 transition-colors"
            >
              Create a test task
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
