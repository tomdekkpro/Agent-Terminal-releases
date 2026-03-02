import { create } from 'zustand';
import type { UsageSnapshot, UsageCostData, CopilotUsageData, AgentProviderId } from '../../shared/types';

interface AgentAccumulatedUsage {
  cost: number;
  inputTokens: number;
  outputTokens: number;
  premiumRequests: number;
  durationApi: string;
  durationWall: string;
  linesAdded: number;
  linesRemoved: number;
}

function emptyUsage(): AgentAccumulatedUsage {
  return {
    cost: 0,
    inputTokens: 0,
    outputTokens: 0,
    premiumRequests: 0,
    durationApi: '',
    durationWall: '',
    linesAdded: 0,
    linesRemoved: 0,
  };
}

interface UsageState {
  usage: UsageSnapshot | null;
  isLoading: boolean;
  isAvailable: boolean;

  // Per-agent accumulated usage
  agentUsage: Record<string, AgentAccumulatedUsage>;

  // Legacy flat accessors (computed from agentUsage)
  totalSessionCost: number;
  totalInputTokens: number;
  totalOutputTokens: number;
  copilotPremiumRequests: number;
  copilotTotalTurns: number;
  copilotModels: string[];
  copilotTokenLimit: number;
  copilotTokensUsed: number;
  copilotInputTokens: number;
  copilotOutputTokens: number;
  copilotSessionCost: number;
  copilotDurationApi: string;
  copilotDurationWall: string;
  copilotLinesAdded: number;
  copilotLinesRemoved: number;

  setUsage: (usage: UsageSnapshot) => void;
  setLoading: (loading: boolean) => void;
  setAvailable: (available: boolean) => void;
  addCostData: (data: UsageCostData) => void;
  setCopilotUsage: (data: CopilotUsageData) => void;
  resetCosts: () => void;
  getAgentUsage: (agentId: AgentProviderId) => AgentAccumulatedUsage;
}

export const useUsageStore = create<UsageState>((set, get) => ({
  usage: null,
  isLoading: true,
  isAvailable: false,
  agentUsage: {},

  // Legacy flat fields — kept for backward compat with UsageIndicator
  totalSessionCost: 0,
  totalInputTokens: 0,
  totalOutputTokens: 0,
  copilotPremiumRequests: 0,
  copilotTotalTurns: 0,
  copilotModels: [],
  copilotTokenLimit: 0,
  copilotTokensUsed: 0,
  copilotInputTokens: 0,
  copilotOutputTokens: 0,
  copilotSessionCost: 0,
  copilotDurationApi: '',
  copilotDurationWall: '',
  copilotLinesAdded: 0,
  copilotLinesRemoved: 0,

  setUsage: (usage) => set({ usage, isAvailable: true, isLoading: false }),
  setLoading: (isLoading) => set({ isLoading }),
  setAvailable: (isAvailable) => set({ isAvailable }),

  addCostData: (data) =>
    set((state) => {
      const provider: AgentProviderId = data.provider || 'claude';
      const prev = state.agentUsage[provider] || emptyUsage();
      const updated: AgentAccumulatedUsage = {
        cost: prev.cost + (data.cost || 0),
        inputTokens: prev.inputTokens + (data.inputTokens || 0),
        outputTokens: prev.outputTokens + (data.outputTokens || 0),
        premiumRequests: data.premiumRequests ?? prev.premiumRequests,
        durationApi: data.durationApi || prev.durationApi,
        durationWall: data.durationWall || prev.durationWall,
        linesAdded: data.linesAdded ?? prev.linesAdded,
        linesRemoved: data.linesRemoved ?? prev.linesRemoved,
      };

      const newAgentUsage = { ...state.agentUsage, [provider]: updated };

      // Compute legacy flat fields
      const claude = newAgentUsage.claude || emptyUsage();
      const copilot = newAgentUsage.copilot || emptyUsage();

      return {
        agentUsage: newAgentUsage,
        totalSessionCost: claude.cost,
        totalInputTokens: claude.inputTokens,
        totalOutputTokens: claude.outputTokens,
        copilotSessionCost: copilot.cost,
        copilotInputTokens: copilot.inputTokens,
        copilotOutputTokens: copilot.outputTokens,
        copilotPremiumRequests: copilot.premiumRequests,
        copilotDurationApi: copilot.durationApi,
        copilotDurationWall: copilot.durationWall,
        copilotLinesAdded: copilot.linesAdded,
        copilotLinesRemoved: copilot.linesRemoved,
      };
    }),

  setCopilotUsage: (data) =>
    set({
      copilotTotalTurns: data.totalTurns,
      copilotModels: data.models,
      copilotTokenLimit: data.tokenLimit || 0,
      copilotTokensUsed: data.tokensUsed || 0,
    }),

  resetCosts: () =>
    set({
      agentUsage: {},
      totalSessionCost: 0,
      totalInputTokens: 0,
      totalOutputTokens: 0,
      copilotPremiumRequests: 0,
      copilotTotalTurns: 0,
      copilotModels: [],
      copilotTokenLimit: 0,
      copilotTokensUsed: 0,
      copilotInputTokens: 0,
      copilotOutputTokens: 0,
      copilotSessionCost: 0,
      copilotDurationApi: '',
      copilotDurationWall: '',
      copilotLinesAdded: 0,
      copilotLinesRemoved: 0,
    }),

  getAgentUsage: (agentId) => get().agentUsage[agentId] || emptyUsage(),
}));
