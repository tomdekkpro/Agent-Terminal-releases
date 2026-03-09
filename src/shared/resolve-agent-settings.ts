import type { AgentProviderId, AppSettings, Project } from './types';

export interface ResolvedAgentSettings {
  agentProvider: AgentProviderId;
  agentModel: string | undefined;
  agentConfig: Record<string, string>;
}

export function resolveAgentSettings(
  project: Project | undefined,
  appSettings: AppSettings,
): ResolvedAgentSettings {
  const agentProvider = project?.agentProvider || appSettings.defaultAgentProvider || 'claude';
  const agentModel = project?.agentModel || appSettings.agentModels?.[agentProvider] || undefined;
  const agentConfig = {
    ...(appSettings.agentConfig?.[agentProvider] || {}),
    ...(project?.agentConfig || {}),
  };

  return { agentProvider, agentModel, agentConfig };
}
