import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';
import type { LLMConfig } from '../services/llm/types';
import type { MCPServer, SearchProviders, LLMPreset, WebDAVConfig } from '../apps/settings/types';
import { DEFAULT_SEARCH_PROVIDERS, DEFAULT_WEBDAV_CONFIG } from '../apps/settings/types';
import { sqliteStorageAdapter } from '../services/sqlite/index';

export interface SettingsState {
  llmConfig: LLMConfig;
  llmPresets: LLMPreset[];
  searchProviders: SearchProviders;
  mcpServers: MCPServer[];
  notificationsEnabled: boolean;
  webdavConfig: WebDAVConfig;
  /** MCP OAuth 持久化状态（serverId → JSON） */
  mcpOAuthState: Record<string, string>;
}

export interface SettingsActions {
  updateLLMConfig: (config: Partial<LLMConfig>) => void;
  addPreset: (preset: LLMPreset) => void;
  updatePreset: (id: string, data: Partial<LLMPreset>) => void;
  removePreset: (id: string) => void;
  updateSearchProvider: (
    provider: keyof SearchProviders,
    config: Partial<SearchProviders[keyof SearchProviders]>
  ) => void;
  addMCPServer: (server: MCPServer) => void;
  updateMCPServer: (id: string, data: Partial<MCPServer>) => void;
  removeMCPServer: (id: string) => void;
  setNotificationsEnabled: (enabled: boolean) => void;
  updateWebDAVConfig: (config: Partial<WebDAVConfig>) => void;
  /** 保存 MCP OAuth 状态 */
  setMCPOAuthState: (serverId: string, state: string) => void;
}

export const useSettingsStore = create<SettingsState & SettingsActions>()(
  persist(
    (set) => ({
      // ---- State ----
      llmConfig: {
        baseUrl: '',
        apiKey: '',
        model: '',
        temperature: 0.7,
        topP: 1,
      },
      llmPresets: [],
      searchProviders: { ...DEFAULT_SEARCH_PROVIDERS },
      mcpServers: [],
      notificationsEnabled: false,
      webdavConfig: { ...DEFAULT_WEBDAV_CONFIG },
      mcpOAuthState: {},

      // ---- Actions ----
      updateLLMConfig: (config) =>
        set((state) => ({
          llmConfig: { ...state.llmConfig, ...config },
        })),

      addPreset: (preset) =>
        set((state) => ({
          llmPresets: [...state.llmPresets, preset],
        })),

      updatePreset: (id, data) =>
        set((state) => ({
          llmPresets: state.llmPresets.map((p) =>
            p.id === id ? { ...p, ...data } : p
          ),
        })),

      removePreset: (id) =>
        set((state) => ({
          llmPresets: state.llmPresets.filter((p) => p.id !== id),
        })),

      updateSearchProvider: (provider, config) =>
        set((state) => ({
          searchProviders: {
            ...state.searchProviders,
            [provider]: { ...state.searchProviders[provider], ...config },
          },
        })),

      addMCPServer: (server) =>
        set((state) => ({
          mcpServers: [...state.mcpServers, server],
        })),

      updateMCPServer: (id, data) =>
        set((state) => ({
          mcpServers: state.mcpServers.map((s) =>
            s.id === id ? { ...s, ...data } : s
          ),
        })),

      removeMCPServer: (id) =>
        set((state) => ({
          mcpServers: state.mcpServers.filter((s) => s.id !== id),
        })),

      setNotificationsEnabled: (enabled) =>
        set({ notificationsEnabled: enabled }),
      updateWebDAVConfig: (config) =>
        set((state) => ({
          webdavConfig: { ...state.webdavConfig, ...config },
        })),
      setMCPOAuthState: (serverId, state) =>
        set((prev) => ({
          mcpOAuthState: { ...prev.mcpOAuthState, [serverId]: state },
        })),
    }),
    {
      name: 'settings-store',
      storage: createJSONStorage(() => sqliteStorageAdapter),
      version: 1,
      migrate: (persistedState: any, _version: number) => {
        let state = { ...persistedState };
        // 从旧版本迁移：补全 MCPServer 新字段
        if (state.mcpServers) {
          state.mcpServers = state.mcpServers.map((s: any) => ({
            ...s,
            headers: s.headers ?? {},
            discoveredTools: s.discoveredTools ?? [],
          }));
        }
        // 补全 searchProviders 默认值
        if (state.searchProviders) {
          const defaults = { tavily: { apiKey: '', maxResults: 5 }, firecrawl: { apiKey: '', maxResults: 5 }, tinyfish: { apiKey: '', maxResults: 5 } };
          for (const key of ['tavily', 'firecrawl', 'tinyfish']) {
            state.searchProviders[key] = { ...defaults[key as keyof typeof defaults], ...state.searchProviders[key] };
          }
        }
        // 补全 webdavConfig 默认值
        if (!state.webdavConfig) {
          state.webdavConfig = { url: '', username: '', password: '', remotePath: 'bananamilkphone_backups/' };
        }
        return state;
      },
    }
  )
);
