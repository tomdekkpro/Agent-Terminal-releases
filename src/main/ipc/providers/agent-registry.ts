import type { AgentProviderId, AgentProviderMeta } from '../../../shared/types';
import type { IAgentProvider } from './agent-types';
import { toAgentProviderMeta } from './agent-types';

class AgentRegistry {
  private providers = new Map<AgentProviderId, IAgentProvider>();

  register(provider: IAgentProvider): void {
    this.providers.set(provider.id, provider);
  }

  get(id: AgentProviderId): IAgentProvider | undefined {
    return this.providers.get(id);
  }

  getAll(): IAgentProvider[] {
    return Array.from(this.providers.values());
  }

  getAllMeta(): AgentProviderMeta[] {
    return this.getAll().map(toAgentProviderMeta);
  }
}

/** Singleton agent registry — populated at startup via registerAllAgents() */
export const agentRegistry = new AgentRegistry();
