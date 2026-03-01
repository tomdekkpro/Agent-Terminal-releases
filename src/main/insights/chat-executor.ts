import { spawn, execSync, type ChildProcess } from 'child_process';
import type { BrowserWindow } from 'electron';
import { IPC_CHANNELS } from '../../shared/constants';
import type { CopilotProvider, InsightsMessage, InsightsModel, InsightsStreamEvent } from '../../shared/types';

const MODEL_MAP: Record<InsightsModel, string> = {
  opus: 'claude-opus-4-6',
  sonnet: 'claude-sonnet-4-6',
  haiku: 'claude-haiku-4-5-20251001',
};

const activeStreams = new Map<string, ChildProcess>();

function isCommandAvailable(command: string): boolean {
  try {
    const check = process.platform === 'win32' ? `where ${command}` : `which ${command}`;
    execSync(check, { stdio: 'ignore' });
    return true;
  } catch {
    return false;
  }
}

function buildClaudePrompt(messages: InsightsMessage[], userMessage: string): string {
  const history = messages
    .map((m) => `${m.role === 'user' ? 'Human' : 'Assistant'}: ${m.content}`)
    .join('\n\n');

  if (history) {
    return `${history}\n\nHuman: ${userMessage}`;
  }
  return userMessage;
}

function buildCopilotPrompt(messages: InsightsMessage[], userMessage: string): string {
  if (messages.length === 0) {
    return userMessage;
  }

  const history = messages
    .map((m) => `<${m.role}>\n${m.content}\n</${m.role}>`)
    .join('\n\n');

  return `Here is our conversation so far:\n\n${history}\n\n<user>\n${userMessage}\n</user>\n\nPlease respond to the latest user message, taking the full conversation history into account.`;
}

export function sendMessage(
  sessionId: string,
  messages: InsightsMessage[],
  userMessage: string,
  model: InsightsModel,
  projectPath: string | undefined,
  getWindow: () => BrowserWindow | null,
  provider?: CopilotProvider,
  copilotModel?: string,
): Promise<string> {
  console.log('[insights] sendMessage — provider:', provider || 'claude', 'model:', provider === 'copilot' ? copilotModel : model, 'history:', messages.length, 'msgs', 'projectPath:', projectPath);
  if (provider === 'copilot') {
    return sendCopilotMessage(sessionId, messages, userMessage, copilotModel, projectPath, getWindow);
  }
  return sendClaudeMessage(sessionId, messages, userMessage, model, projectPath, getWindow);
}

function sendClaudeMessage(
  sessionId: string,
  messages: InsightsMessage[],
  userMessage: string,
  model: InsightsModel,
  projectPath: string | undefined,
  getWindow: () => BrowserWindow | null,
): Promise<string> {
  return new Promise((resolve, reject) => {
    if (!isCommandAvailable('claude')) {
      reject(new Error('Claude Code CLI is not installed. Install it from https://docs.anthropic.com/en/docs/claude-code'));
      return;
    }

    const prompt = buildClaudePrompt(messages, userMessage);
    console.log('[insights] Claude prompt:\n', prompt.slice(0, 500), prompt.length > 500 ? `... (${prompt.length} chars total)` : '');
    console.log('[insights] Claude args:', ['claude', '--output-format', 'stream-json', '--verbose', '--model', MODEL_MAP[model]].join(' '));

    const args = ['--output-format', 'stream-json', '--verbose', '--model', MODEL_MAP[model]];

    if (projectPath) {
      args.push('--add-dir', projectPath);
    }

    const env = { ...process.env };
    delete env.CLAUDECODE;

    const child = spawn('claude', args, {
      env,
      shell: true,
      stdio: ['pipe', 'pipe', 'pipe'],
    });

    child.stdin?.write(prompt);
    child.stdin?.end();

    activeStreams.set(sessionId, child);
    let fullText = '';
    let stderrText = '';
    let buffer = '';

    const sendEvent = (event: InsightsStreamEvent) => {
      const win = getWindow();
      if (win && !win.isDestroyed()) {
        win.webContents.send(IPC_CHANNELS.INSIGHTS_STREAM_EVENT, event);
      }
    };

    const processLine = (line: string) => {
      const trimmed = line.trim();
      if (!trimmed) return;
      try {
        const parsed = JSON.parse(trimmed);
        if (parsed.type === 'content_block_delta' && parsed.delta?.text) {
          fullText += parsed.delta.text;
          sendEvent({ type: 'text', sessionId, text: parsed.delta.text });
        } else if (parsed.type === 'result' && parsed.result && !fullText) {
          const text =
            typeof parsed.result === 'string'
              ? parsed.result
              : parsed.result.content
                  ?.filter((b: any) => b.type === 'text')
                  .map((b: any) => b.text)
                  .join('') || '';
          if (text) {
            fullText = text;
            sendEvent({ type: 'text', sessionId, text });
          }
        } else if (parsed.type === 'assistant' && parsed.content) {
          const text = parsed.content
            .filter((b: any) => b.type === 'text')
            .map((b: any) => b.text)
            .join('');
          if (text && !fullText) {
            fullText = text;
            sendEvent({ type: 'text', sessionId, text });
          }
        }
      } catch {
        if (trimmed && !trimmed.startsWith('{')) {
          fullText += trimmed + '\n';
          sendEvent({ type: 'text', sessionId, text: trimmed + '\n' });
        }
      }
    };

    child.stdout?.on('data', (chunk: Buffer) => {
      buffer += chunk.toString();
      const lines = buffer.split('\n');
      buffer = lines.pop() || '';
      for (const line of lines) {
        processLine(line);
      }
    });

    child.stderr?.on('data', (chunk: Buffer) => {
      stderrText += chunk.toString();
    });

    child.on('close', (code) => {
      activeStreams.delete(sessionId);
      if (buffer.trim()) {
        processLine(buffer);
      }
      if (code !== 0 && !fullText) {
        const errorMsg = stderrText.trim() || `Claude exited with code ${code}`;
        console.error('[insights] error:', errorMsg);
        sendEvent({ type: 'error', sessionId, error: errorMsg });
        reject(new Error(errorMsg));
      } else {
        sendEvent({ type: 'done', sessionId });
        resolve(fullText);
      }
    });

    child.on('error', (err) => {
      activeStreams.delete(sessionId);
      sendEvent({ type: 'error', sessionId, error: err.message });
      reject(err);
    });
  });
}

function sendCopilotMessage(
  sessionId: string,
  messages: InsightsMessage[],
  userMessage: string,
  copilotModel: string | undefined,
  projectPath: string | undefined,
  getWindow: () => BrowserWindow | null,
): Promise<string> {
  return new Promise((resolve, reject) => {
    if (!isCommandAvailable('copilot')) {
      reject(new Error('GitHub Copilot CLI is not installed. Install it with: npm install -g @github/copilot'));
      return;
    }

    const prompt = buildCopilotPrompt(messages, userMessage);
    console.log('[insights] Copilot prompt:\n', prompt.slice(0, 500), prompt.length > 500 ? `... (${prompt.length} chars total)` : '');

    // Pipe prompt via stdin — copilot auto-detects piped input
    const args = ['-s', '--allow-all-tools'];
    console.log('[insights] Copilot args:', ['copilot', ...args, ...(copilotModel ? ['--model', copilotModel] : [])].join(' '), '| cwd:', projectPath);
    if (copilotModel) {
      args.push('--model', copilotModel);
    }

    const child = spawn('copilot', args, {
      cwd: projectPath || undefined,
      shell: true,
      stdio: ['pipe', 'pipe', 'pipe'],
    });

    child.stdin?.write(prompt);
    child.stdin?.end();

    activeStreams.set(sessionId, child);
    let fullText = '';
    let stderrText = '';

    const sendEvent = (event: InsightsStreamEvent) => {
      const win = getWindow();
      if (win && !win.isDestroyed()) {
        win.webContents.send(IPC_CHANNELS.INSIGHTS_STREAM_EVENT, event);
      }
    };

    child.stdout?.on('data', (chunk: Buffer) => {
      const text = chunk.toString();
      fullText += text;
      sendEvent({ type: 'text', sessionId, text });
    });

    child.stderr?.on('data', (chunk: Buffer) => {
      stderrText += chunk.toString();
    });

    child.on('close', (code) => {
      activeStreams.delete(sessionId);
      if (code !== 0 && !fullText) {
        const errorMsg = stderrText.trim() || `Copilot exited with code ${code}`;
        console.error('[insights] copilot error:', errorMsg);
        sendEvent({ type: 'error', sessionId, error: errorMsg });
        reject(new Error(errorMsg));
      } else {
        sendEvent({ type: 'done', sessionId });
        resolve(fullText);
      }
    });

    child.on('error', (err) => {
      activeStreams.delete(sessionId);
      sendEvent({ type: 'error', sessionId, error: err.message });
      reject(err);
    });
  });
}

export function abortStream(sessionId: string): void {
  const child = activeStreams.get(sessionId);
  if (child) {
    child.kill('SIGTERM');
    activeStreams.delete(sessionId);
  }
}

export function abortAllStreams(): void {
  for (const [id, child] of activeStreams) {
    child.kill('SIGTERM');
    activeStreams.delete(id);
  }
}
