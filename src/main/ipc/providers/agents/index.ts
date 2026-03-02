import { agentRegistry } from '../agent-registry';
import { ClaudeAgentProvider } from './claude-agent';
import { CopilotAgentProvider } from './copilot-agent';
import { GeminiAgentProvider } from './gemini-agent';
import { QwenAgentProvider } from './qwen-agent';
import { AiderAgentProvider } from './aider-agent';

export { ClaudeAgentProvider } from './claude-agent';
export { CopilotAgentProvider } from './copilot-agent';
export { GeminiAgentProvider } from './gemini-agent';
export { QwenAgentProvider } from './qwen-agent';
export { AiderAgentProvider } from './aider-agent';

/** Register all built-in agent providers — call once at startup */
export function registerAllAgents(): void {
  agentRegistry.register(new ClaudeAgentProvider());
  agentRegistry.register(new CopilotAgentProvider());
  agentRegistry.register(new GeminiAgentProvider());
  agentRegistry.register(new QwenAgentProvider());
  agentRegistry.register(new AiderAgentProvider());
}
