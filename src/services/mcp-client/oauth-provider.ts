/**
 * MCP OAuth 2.1 客户端提供者
 *
 * 实现 @modelcontextprotocol/sdk 的 OAuthClientProvider 接口，
 * 使用 @capacitor/browser 打开授权页面，通过 Zustand + SQLite 持久化令牌。
 *
 * 参考 RikkaHub McpOAuthClient.kt 设计模式。
 */

import type { OAuthClientProvider } from '@modelcontextprotocol/sdk/client/auth.js';
import type { OAuthClientInformationMixed, OAuthTokens, OAuthClientMetadata } from '@modelcontextprotocol/sdk/shared/auth.js';
import { Browser } from '@capacitor/browser';
import { useSettingsStore } from '../../store/settings-store';

const REDIRECT_URI = 'bananamilkphone://oauth-callback';

interface OAuthPersistedState {
  clientInfo?: OAuthClientInformationMixed;
  tokens?: OAuthTokens;
  codeVerifier?: string;
}

/**
 * 为单个 MCP 服务器创建 OAuthClientProvider 实例
 */
export function createOAuthProvider(serverId: string): OAuthClientProvider {

  function loadState(): OAuthPersistedState {
    try {
      const raw = useSettingsStore.getState().mcpOAuthState?.[serverId];
      return raw ? JSON.parse(raw) : {};
    } catch { return {}; }
  }

  function saveState(state: OAuthPersistedState): void {
    useSettingsStore.getState().setMCPOAuthState?.(serverId, JSON.stringify(state));
  }

  return {
    get redirectUrl(): string | URL {
      return REDIRECT_URI;
    },

    get clientMetadata(): OAuthClientMetadata {
      return {
        client_name: '香蕉牛奶机',
        redirect_uris: [REDIRECT_URI],
        token_endpoint_auth_method: 'none', // PKCE 不需要 client_secret
        grant_types: ['authorization_code', 'refresh_token'],
        response_types: ['code'],
      };
    },

    async clientInformation(): Promise<OAuthClientInformationMixed | undefined> {
      return loadState().clientInfo;
    },

    async saveClientInformation(info: OAuthClientInformationMixed): Promise<void> {
      const state = loadState();
      state.clientInfo = info;
      saveState(state);
    },

    async tokens(): Promise<OAuthTokens | undefined> {
      return loadState().tokens;
    },

    async saveTokens(tokens: OAuthTokens): Promise<void> {
      const state = loadState();
      state.tokens = tokens;
      saveState(state);
    },

    async redirectToAuthorization(authorizationUrl: URL): Promise<void> {
      // 使用 @capacitor/browser 打开授权页面
      await Browser.open({ url: authorizationUrl.toString() });
    },

    async saveCodeVerifier(codeVerifier: string): Promise<void> {
      const state = loadState();
      state.codeVerifier = codeVerifier;
      saveState(state);
    },

    async codeVerifier(): Promise<string> {
      return loadState().codeVerifier || '';
    },
  };
}

/**
 * 清除指定服务器的 OAuth 状态（重新授权时调用）
 */
export function clearOAuthState(serverId: string): void {
  useSettingsStore.getState().setMCPOAuthState?.(serverId, '{}');
}
