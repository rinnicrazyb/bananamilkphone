/** 设置 APP 类型定义 */

/** MCP 服务器传输协议 */
export type MCPProtocol = 'sse' | 'streamable-http';

/** MCP 服务器连接状态 */
export type MCPServerStatus = 'stopped' | 'connecting' | 'connected' | 'error';

/** MCP 已发现工具 */
export interface MCPDiscoveredTool {
  name: string;
  description: string;
  inputSchema: Record<string, unknown>;
  enabled: boolean;
  needsApproval: boolean;
}

/** MCP 服务器配置 */
export interface MCPServer {
  id: string;
  name: string;
  url: string;
  /** 自定义 HTTP 请求头 */
  headers: Record<string, string>;
  protocol: MCPProtocol;
  enabled: boolean;
  status: MCPServerStatus;
  lastError?: string;
  /** 连接后通过 tools/list 发现的工具 */
  discoveredTools: MCPDiscoveredTool[];
}

/** 搜索供应商配置 */
export interface SearchProviderConfig {
  apiKey: string;
  maxResults: number;
}

/** 搜索供应商集合 */
export interface SearchProviders {
  tavily: SearchProviderConfig;
  firecrawl: SearchProviderConfig;
  tinyfish: SearchProviderConfig;
}

/** 默认搜索配置 */
export const DEFAULT_SEARCH_PROVIDERS: SearchProviders = {
  tavily: { apiKey: '', maxResults: 5 },
  firecrawl: { apiKey: '', maxResults: 5 },
  tinyfish: { apiKey: '', maxResults: 5 },
};

/** LLM 预设 */
export interface LLMPreset {
  id: string;
  name: string;
  baseUrl: string;
  apiKey: string;
  model: string;
  temperature: number;
  topP: number;
}

/** 子页面类型 */
export type SettingsSubPage =
  | 'api'
  | 'network-search'
  | 'mcp'
  | 'backup'
  | 'restore'
  | null;
