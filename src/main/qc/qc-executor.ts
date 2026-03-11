import { spawn, execSync, type ChildProcess } from 'child_process';
import { v4 as uuidv4 } from 'uuid';
import type { BrowserWindow } from 'electron';
import { IPC_CHANNELS } from '../../shared/constants';
import type { QCTask, QCTestCase, QCTestStep, QCCredential, InsightsModel } from '../../shared/types';
import { getSession, saveSession } from '../insights/session-storage';
import { DEFAULT_PERSONAS } from '../../shared/types';
import { agentRegistry } from '../ipc/providers/agent-registry';
import { loadPersonas } from '../insights/persona-storage';

/** Load the QC persona's systemPrompt (falls back to default if not found) */
async function getQCPersonaPrompt(): Promise<string> {
  try {
    const personas = await loadPersonas();
    const qcPersona = personas.find((p) => p.id === 'qc');
    if (qcPersona?.systemPrompt) return qcPersona.systemPrompt;
  } catch { /* fall through to default */ }
  const defaultQC = DEFAULT_PERSONAS.find((p) => p.id === 'qc');
  return defaultQC?.systemPrompt ?? '';
}

/** Kill a process and its entire tree (important on Windows where SIGTERM doesn't cascade) */
function killProcessTree(child: ChildProcess): void {
  if (!child.pid) return;
  try {
    if (process.platform === 'win32') {
      execSync(`taskkill /pid ${child.pid} /T /F`, { stdio: 'ignore' });
    } else {
      // Send SIGTERM to process group
      process.kill(-child.pid, 'SIGTERM');
    }
  } catch {
    // Fallback: direct kill
    try { child.kill('SIGKILL'); } catch { /* already dead */ }
  }
}

const activeProcesses = new Map<string, ChildProcess>();
const abortedSessions = new Set<string>();

export interface QCEvent {
  type: 'generating' | 'test-start' | 'step-update' | 'test-done' | 'screenshot' | 'all-done' | 'error';
  sessionId: string;
  taskId: string;
  testCaseId?: string;
  stepId?: string;
  stepOrder?: number;
  status?: string;
  message?: string;
  screenshot?: string;
  testCase?: QCTestCase;
  summary?: string;
}

function sendQCEvent(getWindow: () => BrowserWindow | null, event: QCEvent): void {
  const win = getWindow();
  if (win && !win.isDestroyed()) {
    win.webContents.send(IPC_CHANNELS.QC_EVENT, event);
  }
}

/**
 * Generate test cases from a task description using AI.
 * The AI analyzes the task and produces structured test cases.
 */
export async function generateTestCases(
  _sessionId: string,
  taskTitle: string,
  taskDescription: string,
  targetUrl: string,
  model: InsightsModel,
  _getWindow: () => BrowserWindow | null,
): Promise<QCTestCase[]> {
  const claude = agentRegistry.get('claude');
  if (!claude || !claude.isAvailable()) {
    throw new Error('Claude CLI is required for QC testing');
  }

  const personaPrompt = await getQCPersonaPrompt();

  const prompt = `${personaPrompt}

Generate manual test cases for the following task.

TASK: ${taskTitle}
DESCRIPTION: ${taskDescription}
TARGET URL: ${targetUrl}

Generate test cases as a JSON array. Each test case should have practical, executable browser-based steps.
Focus on user-visible behavior that can be verified visually.

RESPOND WITH ONLY valid JSON in this exact format (no markdown, no explanation):
[
  {
    "name": "Test case name",
    "description": "Brief description of what this tests",
    "steps": [
      {
        "action": "Navigate to ${targetUrl}",
        "expected": "Page loads showing the main dashboard"
      },
      {
        "action": "Click on the 'Login' button",
        "expected": "Login form appears with email and password fields"
      }
    ]
  }
]

Generate 3-8 test cases covering:
- Happy path / main flow
- Edge cases and error handling
- UI/UX validation
- Form validation (if applicable)
- Navigation and routing
- Responsive behavior`;

  const modelId = model === 'opus' ? 'claude-opus-4-6' : model === 'sonnet' ? 'claude-sonnet-4-6' : 'claude-haiku-4-5-20251001';

  return new Promise((resolve, reject) => {
    const env = { ...process.env };
    delete env.CLAUDECODE;

    const child = spawn('claude', [
      '-p',
      '--output-format', 'stream-json',
      '--verbose',
      '--model', modelId,
      '--dangerously-skip-permissions',
    ], {
      env,
      shell: true,
      stdio: ['pipe', 'pipe', 'pipe'],
    });

    child.stdin?.write(prompt);
    child.stdin?.end();

    let fullText = '';
    let buffer = '';
    let stderrOutput = '';

    child.stderr?.on('data', (chunk: Buffer) => {
      stderrOutput += chunk.toString();
    });

    child.stdout?.on('data', (chunk: Buffer) => {
      buffer += chunk.toString();
      const lines = buffer.split('\n');
      buffer = lines.pop() || '';
      for (const line of lines) {
        const trimmed = line.trim();
        if (!trimmed) continue;
        try {
          const parsed = JSON.parse(trimmed);
          if (parsed.type === 'content_block_delta' && parsed.delta?.text) {
            fullText += parsed.delta.text;
          }
          if (parsed.type === 'result' && parsed.result) {
            const text = typeof parsed.result === 'string'
              ? parsed.result
              : parsed.result.content?.filter((b: any) => b.type === 'text').map((b: any) => b.text).join('') || '';
            if (text) fullText += text;
          }
          if (parsed.type === 'assistant' && parsed.content) {
            fullText += parsed.content.filter((b: any) => b.type === 'text').map((b: any) => b.text).join('');
          }
        } catch {
          // ignore non-JSON lines
        }
      }
    });

    child.on('close', () => {
      try {
        // Extract JSON from response (handle markdown code blocks)
        let jsonStr = fullText.trim();
        const jsonMatch = jsonStr.match(/\[[\s\S]*\]/);
        if (jsonMatch) jsonStr = jsonMatch[0];

        const raw = JSON.parse(jsonStr) as Array<{
          name: string;
          description: string;
          steps: Array<{ action: string; expected: string }>;
        }>;

        const testCases: QCTestCase[] = raw.map((tc) => ({
          id: uuidv4(),
          name: tc.name,
          description: tc.description,
          steps: tc.steps.map((s, i) => ({
            id: uuidv4(),
            order: i + 1,
            action: s.action,
            expected: s.expected,
            status: 'pending' as const,
          })),
          status: 'pending' as const,
        }));

        resolve(testCases);
      } catch (err) {
        reject(new Error(`Failed to parse test cases: ${err instanceof Error ? err.message : 'Unknown error'}\n\nRaw output:\n${fullText.slice(0, 500)}\n\nStderr:\n${stderrOutput.slice(0, 500)}`));
      }
    });

    child.on('error', reject);

    // 2 minute timeout for generation
    setTimeout(() => {
      killProcessTree(child);
      reject(new Error('Test case generation timed out'));
    }, 120_000);
  });
}

/**
 * Execute a single test case using Claude CLI with Playwright MCP tools.
 * Claude navigates the browser, performs actions, takes screenshots, and evaluates pass/fail.
 */
export async function runTestCase(
  sessionId: string,
  taskId: string,
  testCase: QCTestCase,
  targetUrl: string,
  credentials: QCCredential[] | undefined,
  model: InsightsModel,
  getWindow: () => BrowserWindow | null,
): Promise<QCTestCase> {
  const claude = agentRegistry.get('claude');
  if (!claude || !claude.isAvailable()) {
    throw new Error('Claude CLI is required for QC testing');
  }

  const tcStartedAt = new Date().toISOString();
  testCase.startedAt = tcStartedAt;

  sendQCEvent(getWindow, {
    type: 'test-start',
    sessionId,
    taskId,
    testCaseId: testCase.id,
    message: `Starting: ${testCase.name}`,
  });

  const personaPrompt = await getQCPersonaPrompt();

  const stepsDescription = testCase.steps
    .map((s, i) => `  Step ${i + 1}: ACTION: ${s.action} | EXPECTED: ${s.expected}`)
    .join('\n');

  const credentialsBlock = credentials && credentials.length > 0
    ? `\nLOGIN CREDENTIALS (use these whenever login/authentication is needed):\n${credentials.map(c => `  ${c.label}: ${c.value}`).join('\n')}\n`
    : '';

  const prompt = `${personaPrompt}

You are executing a manual test case using a real browser.
You MUST use the Playwright browser tools (MCP) to perform each step.

TEST CASE: ${testCase.name}
DESCRIPTION: ${testCase.description}
TARGET URL: ${targetUrl}
${credentialsBlock}
STEPS TO EXECUTE:
${stepsDescription}

INSTRUCTIONS:
1. Use browser_navigate to open the target URL
2. For each step:
   a. Perform the action described (click, type, navigate, etc.) using the appropriate browser tool
   b. Take a screenshot using browser_take_screenshot after the action
   c. Evaluate if the actual result matches the expected result
3. After all steps, provide a summary

RESPOND WITH ONLY valid JSON (no markdown):
{
  "steps": [
    {
      "order": 1,
      "actual": "What actually happened after performing the action",
      "status": "passed" or "failed",
      "screenshot": "description of what the screenshot shows"
    }
  ],
  "overallStatus": "passed" or "failed",
  "summary": "Brief summary of test execution"
}

IMPORTANT: Actually use the browser tools to navigate and interact with the page. Do NOT just imagine the results. Use browser_navigate, browser_click, browser_type, browser_take_screenshot, browser_snapshot, etc.`;

  const modelId = model === 'opus' ? 'claude-opus-4-6' : model === 'sonnet' ? 'claude-sonnet-4-6' : 'claude-haiku-4-5-20251001';

  return new Promise((resolve, reject) => {
    const env = { ...process.env };
    delete env.CLAUDECODE;

    const child = spawn('claude', [
      '-p',
      '--output-format', 'stream-json',
      '--verbose',
      '--model', modelId,
      '--allowedTools', 'mcp__playwright__*',
      '--dangerously-skip-permissions',
    ], {
      env,
      shell: true,
      stdio: ['pipe', 'pipe', 'pipe'],
    });

    activeProcesses.set(`${sessionId}:${testCase.id}`, child);

    child.stdin?.write(prompt);
    child.stdin?.end();

    let fullText = '';
    let buffer = '';
    let stderrOutput = '';
    let currentStepOrder = 0;
    let lastReportedStep = 0;
    let recentText = ''; // Accumulate recent text for step detection across fragments
    const screenshotPaths: Map<number, string> = new Map(); // stepOrder -> file path

    child.stderr?.on('data', (chunk: Buffer) => {
      stderrOutput += chunk.toString();
    });

    // Detect which step is being executed from accumulated recent text
    const detectStep = (): void => {
      // Search all occurrences of step patterns in recent text, take the highest
      const matches = [...recentText.matchAll(/\b[Ss]tep\s+(\d+)\b/g)];
      if (matches.length > 0) {
        const stepNum = parseInt(matches[matches.length - 1][1], 10);
        if (stepNum >= 1 && stepNum <= testCase.steps.length && stepNum !== lastReportedStep) {
          currentStepOrder = stepNum;
          lastReportedStep = stepNum;
          const step = testCase.steps.find(s => s.order === stepNum);
          sendQCEvent(getWindow, {
            type: 'step-update',
            sessionId,
            taskId,
            testCaseId: testCase.id,
            stepOrder: stepNum,
            stepId: step?.id,
            status: 'running',
            message: `Running step ${stepNum}: ${step?.action || ''}`,
          });
          // Reset recent text after detecting a step to avoid re-detecting
          recentText = '';
        }
      }
      // Keep recent text manageable
      if (recentText.length > 500) recentText = recentText.slice(-200);
    };

    // Extract screenshot file path from tool_result content
    const extractScreenshotPath = (content: string): string | undefined => {
      // Match paths like .playwright-mcp\page-xxx.png or absolute paths
      const match = content.match(/\.(playwright-mcp[\\/][^\s)]+\.png)/i)
        || content.match(/([A-Za-z]:[\\/][^\s)]+\.png)/i)
        || content.match(/([\\/][^\s)]+\.png)/i);
      return match ? match[0] : undefined;
    };

    child.stdout?.on('data', (chunk: Buffer) => {
      buffer += chunk.toString();
      const lines = buffer.split('\n');
      buffer = lines.pop() || '';
      for (const line of lines) {
        const trimmed = line.trim();
        if (!trimmed) continue;
        try {
          const parsed = JSON.parse(trimmed);
          if (parsed.type === 'content_block_delta' && parsed.delta?.text) {
            fullText += parsed.delta.text;
            recentText += parsed.delta.text;
            detectStep();
          }
          if (parsed.type === 'result' && parsed.result) {
            const text = typeof parsed.result === 'string'
              ? parsed.result
              : parsed.result.content?.filter((b: any) => b.type === 'text').map((b: any) => b.text).join('') || '';
            if (text) fullText += text;
          }
          if (parsed.type === 'assistant' && parsed.content) {
            const text = parsed.content.filter((b: any) => b.type === 'text').map((b: any) => b.text).join('');
            fullText += text;
            recentText += text;
            detectStep();
          }
          // Detect tool_use events - browser interactions
          if (parsed.type === 'tool_use') {
            const toolName: string = parsed.name || '';
            if (toolName.includes('screenshot')) {
              sendQCEvent(getWindow, {
                type: 'screenshot',
                sessionId,
                taskId,
                testCaseId: testCase.id,
                stepOrder: currentStepOrder,
                message: `Step ${currentStepOrder}: Taking screenshot...`,
              });
            }
            // If no step detected yet, default to step 1 on first browser tool
            if (currentStepOrder === 0 && (toolName.includes('navigate') || toolName.includes('click') || toolName.includes('type') || toolName.includes('fill'))) {
              currentStepOrder = 1;
              lastReportedStep = 1;
              const step = testCase.steps[0];
              sendQCEvent(getWindow, {
                type: 'step-update',
                sessionId,
                taskId,
                testCaseId: testCase.id,
                stepOrder: 1,
                stepId: step?.id,
                status: 'running',
                message: `Running step 1: ${step?.action || ''}`,
              });
            }
          }
          // Capture screenshot file paths from tool results
          if (parsed.type === 'tool_result') {
            const resultText = typeof parsed.output === 'string' ? parsed.output
              : Array.isArray(parsed.content) ? parsed.content.map((b: any) => b.text || '').join('') : '';
            const screenshotPath = extractScreenshotPath(resultText);
            if (screenshotPath && currentStepOrder > 0) {
              screenshotPaths.set(currentStepOrder, screenshotPath);
            }
          }
        } catch {
          // ignore
        }
      }
    });

    child.on('close', () => {
      activeProcesses.delete(`${sessionId}:${testCase.id}`);

      try {
        let jsonStr = fullText.trim();
        const jsonMatch = jsonStr.match(/\{[\s\S]*\}/);
        if (jsonMatch) jsonStr = jsonMatch[0];

        const result = JSON.parse(jsonStr) as {
          steps: Array<{ order: number; actual: string; status: string; screenshot?: string }>;
          overallStatus: string;
          summary: string;
        };

        // Merge results into test case
        const updatedSteps: QCTestStep[] = testCase.steps.map((step) => {
          const resultStep = result.steps.find((rs) => rs.order === step.order);
          if (resultStep) {
            // Prefer captured file path over AI description, fall back to description
            const screenshotFile = screenshotPaths.get(step.order);
            return {
              ...step,
              actual: resultStep.actual,
              status: resultStep.status === 'passed' ? 'passed' as const : 'failed' as const,
              screenshot: screenshotFile || resultStep.screenshot,
            };
          }
          return { ...step, status: 'skipped' as const };
        });

        const tcCompletedAt = new Date().toISOString();
        const updatedTestCase: QCTestCase = {
          ...testCase,
          steps: updatedSteps,
          status: result.overallStatus === 'passed' ? 'passed' : 'failed',
          completedAt: tcCompletedAt,
          durationMs: testCase.startedAt
            ? new Date(tcCompletedAt).getTime() - new Date(testCase.startedAt).getTime()
            : undefined,
        };

        sendQCEvent(getWindow, {
          type: 'test-done',
          sessionId,
          taskId,
          testCaseId: testCase.id,
          status: updatedTestCase.status,
          testCase: updatedTestCase,
          message: result.summary,
        });

        resolve(updatedTestCase);
      } catch {
        // If JSON parsing fails, try to extract useful info from the text
        const tcErrCompletedAt = new Date().toISOString();
        const updatedTestCase: QCTestCase = {
          ...testCase,
          status: 'error',
          errorMessage: fullText.slice(0, 500) || stderrOutput.slice(0, 500) || 'Failed to parse test results',
          completedAt: tcErrCompletedAt,
          durationMs: testCase.startedAt
            ? new Date(tcErrCompletedAt).getTime() - new Date(testCase.startedAt).getTime()
            : undefined,
        };

        sendQCEvent(getWindow, {
          type: 'test-done',
          sessionId,
          taskId,
          testCaseId: testCase.id,
          status: 'error',
          testCase: updatedTestCase,
          message: 'Test execution completed but results could not be parsed',
        });

        resolve(updatedTestCase);
      }
    });

    child.on('error', (err) => {
      activeProcesses.delete(`${sessionId}:${testCase.id}`);
      reject(err);
    });

    // 5 minute timeout per test case
    setTimeout(() => {
      killProcessTree(child);
    }, 5 * 60_000);
  });
}

/**
 * Run all test cases in a QC task sequentially.
 */
export async function runAllTests(
  sessionId: string,
  task: QCTask,
  model: InsightsModel,
  getWindow: () => BrowserWindow | null,
): Promise<QCTask> {
  const updatedCases: QCTestCase[] = [];
  abortedSessions.delete(sessionId);

  for (const tc of task.testCases) {
    // Check if abort was requested — stop the loop and mark remaining as pending
    if (abortedSessions.has(sessionId)) {
      // Add remaining test cases as-is (still pending)
      const completedIds = new Set(updatedCases.map(c => c.id));
      for (const remaining of task.testCases) {
        if (!completedIds.has(remaining.id)) {
          updatedCases.push(remaining);
        }
      }
      abortedSessions.delete(sessionId);
      break;
    }

    try {
      const result = await runTestCase(sessionId, task.id, tc, task.targetUrl, task.credentials, model, getWindow);
      updatedCases.push(result);
    } catch (err) {
      // If aborted mid-test, mark as pending (not error) so it can be re-run
      if (abortedSessions.has(sessionId)) {
        updatedCases.push({ ...tc, status: 'pending' });
        const completedIds = new Set(updatedCases.map(c => c.id));
        for (const remaining of task.testCases) {
          if (!completedIds.has(remaining.id)) {
            updatedCases.push(remaining);
          }
        }
        abortedSessions.delete(sessionId);
        break;
      }
      const errAt = new Date().toISOString();
      updatedCases.push({
        ...tc,
        status: 'error',
        errorMessage: err instanceof Error ? err.message : 'Unknown error',
        completedAt: errAt,
        durationMs: tc.startedAt
          ? new Date(errAt).getTime() - new Date(tc.startedAt).getTime()
          : undefined,
      });
    }

    // Persist after each test case so results survive app close
    try {
      const session = await getSession(sessionId);
      if (session?.qcTask) {
        // Merge completed cases with remaining pending ones
        const completedIds = new Set(updatedCases.map(c => c.id));
        session.qcTask.testCases = session.qcTask.testCases.map(existing =>
          completedIds.has(existing.id)
            ? updatedCases.find(c => c.id === existing.id)!
            : existing,
        );
        session.qcTask.updatedAt = new Date().toISOString();
        await saveSession(session);
      }
    } catch {
      // Non-fatal — continue running tests
    }
  }

  const passed = updatedCases.filter((tc) => tc.status === 'passed').length;
  const failed = updatedCases.filter((tc) => tc.status === 'failed').length;
  const errors = updatedCases.filter((tc) => tc.status === 'error').length;

  const completedAt = new Date().toISOString();
  const durationMs = task.startedAt
    ? new Date(completedAt).getTime() - new Date(task.startedAt).getTime()
    : undefined;

  const summary = `Test Results: ${passed} passed, ${failed} failed, ${errors} errors out of ${updatedCases.length} total`;

  sendQCEvent(getWindow, {
    type: 'all-done',
    sessionId,
    taskId: task.id,
    summary,
    message: summary,
  });

  return {
    ...task,
    testCases: updatedCases,
    status: 'completed',
    summary,
    completedAt,
    durationMs,
    updatedAt: new Date().toISOString(),
  };
}

export function abortQC(sessionId: string): void {
  abortedSessions.add(sessionId);
  for (const [key, child] of activeProcesses) {
    if (key.startsWith(sessionId)) {
      killProcessTree(child);
      activeProcesses.delete(key);
    }
  }
}

/** Kill all active QC processes — call on app quit */
export function cleanupAllQC(): void {
  for (const [key, child] of activeProcesses) {
    killProcessTree(child);
    activeProcesses.delete(key);
  }
}
