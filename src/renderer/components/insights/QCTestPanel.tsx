import { useState, useEffect, useCallback } from 'react';
import {
  Play, Square, CheckCircle, XCircle, AlertTriangle, Clock, ChevronDown, ChevronRight,
  RefreshCw, Loader2, Globe, FileText, ShieldCheck,
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

function TestCaseCard({
  testCase,
  sessionId,
  model,
  onUpdate,
}: {
  testCase: QCTestCase;
  sessionId: string;
  model: string;
  onUpdate: (tc: QCTestCase) => void;
}) {
  const [expanded, setExpanded] = useState(false);
  const [running, setRunning] = useState(false);

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

  return (
    <div className="border border-[var(--border)] rounded-lg overflow-hidden">
      <div
        className="flex items-center gap-2 px-3 py-2 bg-[var(--bg-secondary)] cursor-pointer hover:bg-[var(--bg-tertiary)] transition-colors"
        onClick={() => setExpanded(!expanded)}
      >
        {expanded ? <ChevronDown className="w-3.5 h-3.5 text-[var(--text-muted)]" /> : <ChevronRight className="w-3.5 h-3.5 text-[var(--text-muted)]" />}
        <TestCaseStatusIcon status={testCase.status} />
        <span className="text-sm text-[var(--text-primary)] flex-1 truncate">{testCase.name}</span>
        <span className="text-[10px] text-[var(--text-muted)]">{testCase.steps.length} steps</span>
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

      {expanded && (
        <div className="px-3 py-2 space-y-2">
          <p className="text-xs text-[var(--text-muted)]">{testCase.description}</p>
          {testCase.errorMessage && (
            <div className="text-xs text-red-400 bg-red-500/10 rounded px-2 py-1">
              {testCase.errorMessage}
            </div>
          )}
          <div className="space-y-1.5">
            {testCase.steps.map((step) => (
              <div key={step.id} className="flex gap-2 text-xs">
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
                        <p className={cn(
                          'mt-0.5',
                          step.status === 'passed' ? 'text-emerald-400' : 'text-red-400',
                        )}>
                          Actual: {step.actual}
                        </p>
                      )}
                      {step.screenshot && (
                        <p className="text-blue-400 mt-0.5 text-[10px]">Screenshot: {step.screenshot}</p>
                      )}
                    </div>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

export function QCTestPanel({ sessionId, qcTask, model, onTaskUpdate }: QCTestPanelProps) {
  const [showCreateForm, setShowCreateForm] = useState(!qcTask);
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [targetUrl, setTargetUrl] = useState('');
  const [generating, setGenerating] = useState(false);
  const [runningAll, setRunningAll] = useState(false);
  const [error, setError] = useState<string | null>(null);

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
    const updated: QCTask = {
      ...qcTask,
      testCases: qcTask.testCases.map((tc) => tc.id === updatedTc.id ? updatedTc : tc),
    };
    onTaskUpdate(updated);
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
                  className="flex-1 flex items-center justify-center gap-2 text-sm px-4 py-2 rounded-lg bg-emerald-500/20 text-emerald-400 hover:bg-emerald-500/30 transition-colors"
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
                />
              ))}
            </div>
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
