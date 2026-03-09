import { useState, useEffect, useCallback } from 'react';
import { v4 as uuidv4 } from 'uuid';
import {
  Play, Square, CheckCircle, XCircle, AlertTriangle, Clock, ChevronDown, ChevronRight,
  RefreshCw, Loader2, Globe, FileText, ShieldCheck, Plus, Trash2, Pencil,
  Save, X,
} from 'lucide-react';
import type { QCTask, QCTestCase, QCTestStep } from '../../../shared/types';
import { cn } from '../../../shared/utils';

interface QCTestPanelProps {
  sessionId: string;
  qcTask: QCTask | undefined;
  model: string;
  onTaskUpdate: (task: QCTask) => void;
}

function StepStatusIcon({ status }: { status: QCTestStep['status'] }) {
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
  onSave,
  onDelete,
  onStartEdit,
  onCancel,
}: {
  step: QCTestStep;
  editing: boolean;
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
    <div className="flex gap-2 text-xs group/step">
      <div className="shrink-0 mt-0.5">
        <StepStatusIcon status={step.status} />
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
              <p className="text-blue-400 mt-0.5 text-[10px]">Screenshot: {step.screenshot}</p>
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
  onUpdate,
  onDelete,
}: {
  testCase: QCTestCase;
  sessionId: string;
  model: string;
  onUpdate: (tc: QCTestCase) => void;
  onDelete: () => void;
}) {
  const [expanded, setExpanded] = useState(false);
  const [running, setRunning] = useState(false);
  const [editingName, setEditingName] = useState(false);
  const [editingStepId, setEditingStepId] = useState<string | null>(null);
  const [nameText, setNameText] = useState(testCase.name);
  const [descText, setDescText] = useState(testCase.description);
  const [addingStep, setAddingStep] = useState(false);

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
        <span className="text-[10px] text-[var(--text-muted)]">{testCase.steps.length} steps</span>
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

export function QCTestPanel({ sessionId, qcTask, model, onTaskUpdate }: QCTestPanelProps) {
  const [showCreateForm, setShowCreateForm] = useState(!qcTask);
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [targetUrl, setTargetUrl] = useState('');
  const [generating, setGenerating] = useState(false);
  const [runningAll, setRunningAll] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [addingTestCase, setAddingTestCase] = useState(false);

  // Listen for QC events
  useEffect(() => {
    const cleanup = window.electronAPI.onQCEvent((event: any) => {
      if (event.sessionId !== sessionId) return;
      if (event.type === 'test-done' && event.testCase && qcTask) {
        const updated: QCTask = {
          ...qcTask,
          testCases: qcTask.testCases.map((tc: QCTestCase) =>
            tc.id === event.testCaseId ? event.testCase! : tc,
          ),
        };
        onTaskUpdate(updated);
      }
      if (event.type === 'all-done' && event.summary && qcTask) {
        onTaskUpdate({ ...qcTask, status: 'completed', summary: event.summary });
        setRunningAll(false);
      }
    });
    return () => { cleanup(); };
  }, [sessionId, qcTask, onTaskUpdate]);

  const handleGenerate = useCallback(async () => {
    if (!title.trim() || !targetUrl.trim()) return;
    setGenerating(true);
    setError(null);
    try {
      const result = await window.electronAPI.qcGenerateTests(sessionId, title, description, targetUrl, model);
      if (result.success) {
        onTaskUpdate(result.data);
        setShowCreateForm(false);
      } else {
        setError(result.error || 'Failed to generate tests');
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to generate tests');
    } finally {
      setGenerating(false);
    }
  }, [sessionId, title, description, targetUrl, model, onTaskUpdate]);

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
  const pending = qcTask?.testCases.filter((tc) => tc.status === 'pending').length || 0;
  const total = qcTask?.testCases.length || 0;

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="px-4 py-3 border-b border-[var(--border)] bg-[var(--bg-secondary)]">
        <div className="flex items-center gap-2">
          <ShieldCheck className="w-4 h-4 text-amber-400" />
          <h3 className="text-sm font-medium text-[var(--text-primary)]">QC Testing</h3>
          {qcTask && (
            <div className="flex items-center gap-2 ml-auto text-[10px]">
              {passed > 0 && <span className="text-emerald-400">{passed} passed</span>}
              {failed > 0 && <span className="text-red-400">{failed} failed</span>}
              {pending > 0 && <span className="text-[var(--text-muted)]">{pending} pending</span>}
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
              <div className="flex items-center justify-between mb-1">
                <h4 className="text-sm font-medium text-[var(--text-primary)]">{qcTask.title}</h4>
                <button
                  onClick={() => setShowCreateForm(true)}
                  className="text-[10px] text-[var(--text-muted)] hover:text-[var(--text-primary)]"
                >
                  New task
                </button>
              </div>
              {qcTask.description && (
                <p className="text-xs text-[var(--text-muted)] mb-1">{qcTask.description}</p>
              )}
              <div className="flex items-center gap-2 text-[10px] text-[var(--text-muted)]">
                <Globe className="w-3 h-3" />
                <span className="truncate">{qcTask.targetUrl}</span>
              </div>
            </div>

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
