import { create } from 'zustand';
import type { ServiceStatusSummary } from '../../shared/types';

interface ServiceStatusState {
  summary: ServiceStatusSummary | null;
  isLoading: boolean;
  setSummary: (summary: ServiceStatusSummary) => void;
  setLoading: (loading: boolean) => void;
}

export const useServiceStatusStore = create<ServiceStatusState>((set) => ({
  summary: null,
  isLoading: true,
  setSummary: (summary) => set({ summary, isLoading: false }),
  setLoading: (isLoading) => set({ isLoading }),
}));
