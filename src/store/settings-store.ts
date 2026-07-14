import { create } from 'zustand';
import type { LLMConfig } from '../services/llm/types';

interface SettingsState {
  llmConfig: LLMConfig;
  updateLLMConfig: (config: Partial<LLMConfig>) => void;
}

export const useSettingsStore = create<SettingsState>((set) => ({
  llmConfig: {
    baseUrl: '',
    apiKey: '',
    model: '',
    temperature: 0.7,
    topP: 1,
  },

  updateLLMConfig: (config) =>
    set((state) => ({
      llmConfig: { ...state.llmConfig, ...config },
    })),
}));
