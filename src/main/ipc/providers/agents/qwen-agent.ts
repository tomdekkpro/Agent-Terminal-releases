import { execSync } from 'child_process';
import type { IAgentProvider } from '../agent-types';
import type {
  AgentCapabilities,
  AgentModelOption,
  AgentInvokeOptions,
  AgentSettingsField,
  AgentUsageData,
} from '../../../../shared/types';

export class QwenAgentProvider implements IAgentProvider {
  readonly id = 'qwen' as const;
  readonly displayName = 'Qwen Code';
  readonly command = 'qwen';
  readonly iconName = 'Cpu';
  readonly color = '#7c3aed';
  readonly installHint = 'Install with: npm install -g qwen-code';
  readonly capabilities: AgentCapabilities = {
    resume: true,
    continue: true,
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

  buildResumeCommand(options: AgentInvokeOptions): string {
    if (options.sessionId) {
      return `${this.command} --resume`;
    }
    return `${this.command} --continue`;
  }

  parseUsageFromOutput(_data: string): AgentUsageData | null {
    return null;
  }

  detectExit(data: string): boolean {
    return /Goodbye/i.test(data);
  }

  getModels(): AgentModelOption[] {
    return [
      { id: 'qwen3-coder', label: 'Qwen3 Coder' },
    ];
  }

  getDefaultModel(): string {
    return 'qwen3-coder';
  }

  getSettingsFields(): AgentSettingsField[] {
    return [];
  }
}
