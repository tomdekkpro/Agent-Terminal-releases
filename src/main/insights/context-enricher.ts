/**
 * Context Enricher — fetches external context (ClickUp tasks, GitHub info)
 * based on references detected in the user's message and persona integrations.
 */
import { exec } from 'child_process';
import type { Persona, PersonaIntegrations, TaskManagerTask } from '../../shared/types';
import { getSettings } from '../ipc/settings-handlers';
import { ClickUpProvider } from '../ipc/providers/clickup';
import { JiraProvider } from '../ipc/providers/jira';
import { debugLog, debugError } from '../../shared/utils';

const clickUpProvider = new ClickUpProvider();
const jiraProvider = new JiraProvider();

// ─── Reference Detection ──────────────────────────────────────

/** ClickUp custom ID patterns: CU-abc123, #CU-abc123, or raw alphanumeric IDs like #86xxx */
const CLICKUP_ID_PATTERN = /(?:#?CU-[\w]+|#?(?:TASK-)?[a-z0-9]{6,})/gi;

/** GitHub patterns: PR #123, issue #123, gh pr #123, or full URLs */
const GITHUB_PR_PATTERN = /(?:PR\s*#|pull\s*#|gh\s+pr\s+(?:view\s+)?)(\d+)/gi;
const GITHUB_ISSUE_PATTERN = /(?:issue\s*#|gh\s+issue\s+(?:view\s+)?)(\d+)/gi;

export interface EnrichedContext {
  clickupTasks: string[];
  githubInfo: string[];
}

// ─── ClickUp Context ──────────────────────────────────────────

async function fetchClickUpTask(taskId: string): Promise<string | null> {
  const settings = getSettings();
  if (settings.taskManagerProvider === 'none') return null;

  try {
    const provider = settings.taskManagerProvider === 'jira' ? jiraProvider : clickUpProvider;
    const result = await provider.getTask(settings, taskId);
    if (!result.success || !result.data) return null;

    const task: TaskManagerTask = result.data;
    return formatTaskContext(task);
  } catch (err) {
    debugError('[ContextEnricher] Failed to fetch task:', taskId, err);
    return null;
  }
}

function formatTaskContext(task: TaskManagerTask): string {
  const parts = [
    `**Task: ${task.name}** (${task.id})`,
    `Status: ${task.status.name}`,
  ];
  if (task.priority) parts.push(`Priority: ${task.priority.name}`);
  if (task.assignees.length > 0) {
    parts.push(`Assignees: ${task.assignees.map((a) => a.username).join(', ')}`);
  }
  if (task.tags.length > 0) {
    parts.push(`Tags: ${task.tags.map((t) => t.name).join(', ')}`);
  }
  if (task.description) {
    // Truncate long descriptions
    const desc = task.description.length > 500
      ? task.description.slice(0, 500) + '...'
      : task.description;
    parts.push(`Description:\n${desc}`);
  }
  if (task.url) parts.push(`URL: ${task.url}`);
  return parts.join('\n');
}

// ─── GitHub Context ───────────────────────────────────────────

function ghExec(args: string, cwd?: string): Promise<string> {
  return new Promise((resolve, reject) => {
    const command = `gh ${args}`;
    exec(command, {
      cwd: cwd || undefined,
      encoding: 'utf-8',
      timeout: 15000,
      maxBuffer: 1024 * 1024,
    }, (error, stdout, stderr) => {
      if (error) {
        reject(new Error(stderr || error.message));
      } else {
        resolve(stdout.trim());
      }
    });
  });
}

async function fetchGitHubPR(prNumber: number, cwd?: string): Promise<string | null> {
  try {
    const json = await ghExec(
      `pr view ${prNumber} --json number,title,state,author,body,additions,deletions,changedFiles,headRefName,baseRefName,url`,
      cwd,
    );
    const pr = JSON.parse(json);
    const parts = [
      `**PR #${pr.number}: ${pr.title}**`,
      `State: ${pr.state} | Author: ${pr.author?.login || 'unknown'}`,
      `Branch: ${pr.headRefName} → ${pr.baseRefName}`,
      `Changes: +${pr.additions} -${pr.deletions} (${pr.changedFiles} files)`,
    ];
    if (pr.body) {
      const body = pr.body.length > 400 ? pr.body.slice(0, 400) + '...' : pr.body;
      parts.push(`Description:\n${body}`);
    }
    if (pr.url) parts.push(`URL: ${pr.url}`);
    return parts.join('\n');
  } catch (err) {
    debugError('[ContextEnricher] Failed to fetch PR:', prNumber, err);
    return null;
  }
}

async function fetchGitHubIssue(issueNumber: number, cwd?: string): Promise<string | null> {
  try {
    const json = await ghExec(
      `issue view ${issueNumber} --json number,title,state,author,body,labels,assignees,url`,
      cwd,
    );
    const issue = JSON.parse(json);
    const parts = [
      `**Issue #${issue.number}: ${issue.title}**`,
      `State: ${issue.state} | Author: ${issue.author?.login || 'unknown'}`,
    ];
    if (issue.assignees?.length > 0) {
      parts.push(`Assignees: ${issue.assignees.map((a: any) => a.login).join(', ')}`);
    }
    if (issue.labels?.length > 0) {
      parts.push(`Labels: ${issue.labels.map((l: any) => l.name).join(', ')}`);
    }
    if (issue.body) {
      const body = issue.body.length > 400 ? issue.body.slice(0, 400) + '...' : issue.body;
      parts.push(`Description:\n${body}`);
    }
    if (issue.url) parts.push(`URL: ${issue.url}`);
    return parts.join('\n');
  } catch (err) {
    debugError('[ContextEnricher] Failed to fetch issue:', issueNumber, err);
    return null;
  }
}

// ─── Main Enrichment Function ─────────────────────────────────

/**
 * Detect references in the user message and fetch external context
 * based on the persona's enabled integrations.
 */
export async function enrichContext(
  userMessage: string,
  persona: Persona | undefined,
  projectPath: string | undefined,
): Promise<string> {
  const integrations: PersonaIntegrations = persona?.integrations || {};

  // No integrations enabled — skip
  if (!integrations.clickup && !integrations.github) return '';

  const promises: Promise<string | null>[] = [];
  const labels: string[] = [];

  // ─── ClickUp task references ──────────────────────────────
  if (integrations.clickup) {
    const taskIds = extractClickUpIds(userMessage);
    for (const taskId of taskIds) {
      labels.push(`clickup:${taskId}`);
      promises.push(fetchClickUpTask(taskId));
    }
  }

  // ─── GitHub PR references ────────────────────────────────
  if (integrations.github) {
    const prNumbers = extractNumbers(userMessage, GITHUB_PR_PATTERN);
    for (const num of prNumbers) {
      labels.push(`pr:${num}`);
      promises.push(fetchGitHubPR(num, projectPath));
    }

    const issueNumbers = extractNumbers(userMessage, GITHUB_ISSUE_PATTERN);
    for (const num of issueNumbers) {
      labels.push(`issue:${num}`);
      promises.push(fetchGitHubIssue(num, projectPath));
    }
  }

  if (promises.length === 0) return '';

  debugLog(`[ContextEnricher] Fetching context for: ${labels.join(', ')}`);

  const results = await Promise.allSettled(promises);
  const contextBlocks: string[] = [];

  for (const result of results) {
    if (result.status === 'fulfilled' && result.value) {
      contextBlocks.push(result.value);
    }
  }

  if (contextBlocks.length === 0) return '';

  return [
    '--- EXTERNAL CONTEXT (auto-fetched from referenced IDs) ---',
    ...contextBlocks,
    '--- END EXTERNAL CONTEXT ---',
    '',
  ].join('\n\n');
}

// ─── Helpers ──────────────────────────────────────────────────

function extractClickUpIds(text: string): string[] {
  const matches = text.match(CLICKUP_ID_PATTERN);
  if (!matches) return [];
  // Clean up: remove leading # and CU- prefix for the API call
  return [...new Set(matches.map((m) => m.replace(/^#/, '').replace(/^CU-/i, '')))];
}

function extractNumbers(text: string, pattern: RegExp): number[] {
  const numbers: number[] = [];
  let match: RegExpExecArray | null;
  // Reset pattern state
  pattern.lastIndex = 0;
  while ((match = pattern.exec(text)) !== null) {
    numbers.push(parseInt(match[1], 10));
  }
  return [...new Set(numbers)];
}
