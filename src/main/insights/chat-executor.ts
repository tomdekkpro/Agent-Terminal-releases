import { spawn, type ChildProcess } from 'child_process';
import type { BrowserWindow } from 'electron';
import { IPC_CHANNELS } from '../../shared/constants';
import type { InsightsMessage, InsightsModel, InsightsStreamEvent } from '../../shared/types';

const MODEL_MAP: Record<InsightsModel, string> = {
  opus: 'claude-opus-4-6',
  sonnet: 'claude-sonnet-4-6',
  haiku: 'claude-haiku-4-5-20251001',
};

const activeStreams = new Map<string, ChildProcess>();

function buildPrompt(messages: InsightsMessage[], userMessage: string): string {
  const history = messages
    .map((m) => `${m.role === 'user' ? 'Human' : 'Assistant'}: ${m.content}`)
    .join('\n\n');

  if (history) {
    return `${history}\n\nHuman: ${userMessage}`;
  }
  return userMessage;
}

export function sendMessage(
  sessionId: string,
  messages: InsightsMessage[],
  userMessage: string,
  model: InsightsModel,
  projectPath: string | undefined,
  getWindow: () => BrowserWindow | null,
): Promise<string> {
  return new Promise((resolve, reject) => {
    const prompt = buildPrompt(messages, userMessage);

    // Pipe prompt via stdin — Claude auto-detects piped input as print mode.
    // Avoids Windows command-line length limits.
    const args = ['--output-format', 'stream-json', '--verbose', '--model', MODEL_MAP[model]];

    if (projectPath) {
      args.push('--add-dir', projectPath);
    }

    // Build env without CLAUDECODE to avoid nested session errors
    const env = { ...process.env };
    delete env.CLAUDECODE;

    const child = spawn('claude', args, {
      env,
      shell: true,
      stdio: ['pipe', 'pipe', 'pipe'],
    });

    // Write prompt to stdin and close — Claude reads it as the prompt
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
        // Handle streaming content_block_delta events
        if (parsed.type === 'content_block_delta' && parsed.delta?.text) {
          fullText += parsed.delta.text;
          sendEvent({ type: 'text', sessionId, text: parsed.delta.text });
        }
        // Handle final result with content array (non-streaming fallback)
        else if (parsed.type === 'result' && parsed.result && !fullText) {
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
        }
        // Handle message_start / content blocks for non-delta streaming
        else if (parsed.type === 'assistant' && parsed.content) {
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
        // Not JSON — could be plain text output from --print mode
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

      // Process remaining buffer
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
