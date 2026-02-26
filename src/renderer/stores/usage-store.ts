import { create } from 'zustand';
import type { UsageSnapshot, UsageCostData } from '../../shared/types';

interface UsageState {
  usage: UsageSnapshot | null;
  isLoading: boolean;
  isAvailable: boolean;
  totalSessionCost: number;
  totalInputTokens: number;
  totalOutputTokens: number;

  setUsage: (usage: UsageSnapshot) => void;
  setLoading: (loading: boolean) => void;
  setAvailable: (available: boolean) => void;
  addCostData: (data: UsageCostData) => void;
  resetCosts: () => void;
}

export const useUsageStore = create<UsageState>((set) => ({
  usage: null,
  isLoading: true,
  isAvailable: false,
  totalSessionCost: 0,
  totalInputTokens: 0,
  totalOutputTokens: 0,

  setUsage: (usage) => set({ usage, isAvailable: true, isLoading: false }),
  setLoading: (isLoading) => set({ isLoading }),
  setAvailable: (isAvailable) => set({ isAvailable }),
  addCostData: (data) =>
    set((state) => ({
      totalSessionCost: state.totalSessionCost + (data.cost || 0),
      totalInputTokens: state.totalInputTokens + (data.inputTokens || 0),
      totalOutputTokens: state.totalOutputTokens + (data.outputTokens || 0),
    })),
  resetCosts: () =>
    set({ totalSessionCost: 0, totalInputTokens: 0, totalOutputTokens: 0 }),
}));
