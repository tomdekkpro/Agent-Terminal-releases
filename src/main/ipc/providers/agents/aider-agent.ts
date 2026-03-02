import { execSync } from 'child_process';
import type { IAgentProvider } from '../agent-types';
import type {
  AgentCapabilities,
  AgentModelOption,
  AgentInvokeOptions,
  AgentSettingsField,
  AgentUsageData,
} from '../../../../shared/types';

export class AiderAgentProvider implements IAgentProvider {
  readonly id = 'aider' as const;
  readonly displayName = 'Aider';
  readonly command = 'aider';
  readonly iconName = 'Wrench';
  readonly color = '#f59e0b';
  readonly installHint = 'Install with: pip install aider-chat';
  readonly capabilities: AgentCapabilities = {
    resume: false,
    continue: false,
    yolo: false,
    sessionDetection: false,
    remoteControl: false,
    insights: false,
  };

  isAvailable(): boolean {
    try {
      const check = process.platform === 'win32' ? `where ${this.command}` : `which ${this.command}`;
      execSync(check, { stdio: 'ignore' });
      return true;
    } catch {
      return false;
    }
  }

  buildInvokeCommand(options: AgentInvokeOptions): string {
    let cmd = this.command;
    if (options.model) cmd += ` --model ${options.model}`;
    return cmd;
  }

  buildResumeCommand(_options: AgentInvokeOptions): string {
    // Aider doesn't support resume/continue
    return this.command;
  }

  parseUsageFromOutput(data: string): AgentUsageData | null {
    // Aider displays cost like: Tokens: 1.2k sent, 500 received. Cost: $0.01
    const costMatch = data.match(/Cost:\s*\$([0-9.]+)/i);
    if (!costMatch) return null;
    return { cost: parseFloat(costMatch[1]) };
  }

  detectExit(data: string): boolean {
    return /Goodbye/i.test(data);
  }

  getModels(): AgentModelOption[] {
    return [
      { id: '', label: 'Default (auto-detect)' },
    ];
  }

  getDefaultModel(): string {
    return '';
  }

  getSettingsFields(): AgentSettingsField[] {
    return [
      {
        key: 'apiKey',
        label: 'API Key',
        type: 'password',
        placeholder: 'sk-...',
        description: 'API key for the model provider (set as OPENAI_API_KEY or ANTHROPIC_API_KEY env var)',
      },
    ];
  }
}
