/**
 * 网络搜索服务 — 支持 Tavily / Firecrawl / Tinyfish
 */
import type { SearchProviderConfig } from '../../apps/settings/types';

export interface SearchResult {
  title: string;
  url: string;
  content: string;
}

/** 搜索供应商实现 */
type SearchImpl = (config: SearchProviderConfig, query: string) => Promise<SearchResult[]>;

/** Tavily 搜索 */
const tavilySearch: SearchImpl = async (config, query) => {
  const res = await fetch('https://api.tavily.com/search', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      api_key: config.apiKey,
      query,
      max_results: config.maxResults,
      include_answer: false,
    }),
  });
  if (!res.ok) throw new Error(`Tavily HTTP ${res.status}`);
  const data = await res.json();
  return (data.results || []).map((r: any) => ({
    title: r.title || '',
    url: r.url || '',
    content: r.content || r.snippet || '',
  }));
};

/** Firecrawl 搜索 */
const firecrawlSearch: SearchImpl = async (config, query) => {
  const res = await fetch('https://api.firecrawl.dev/v1/search', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${config.apiKey}`,
    },
    body: JSON.stringify({
      query,
      maxResults: config.maxResults,
    }),
  });
  if (!res.ok) throw new Error(`Firecrawl HTTP ${res.status}`);
  const data = await res.json();
  return (data.data || []).map((r: any) => ({
    title: r.title || r.name || '',
    url: r.url || '',
    content: r.description || r.text || '',
  }));
};

/** Tinyfish 搜索 */
const tinyfishSearch: SearchImpl = async (config, query) => {
  const res = await fetch('https://api.tinyfish.io/v1/search', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${config.apiKey}`,
    },
    body: JSON.stringify({
      q: query,
      count: config.maxResults,
    }),
  });
  if (!res.ok) throw new Error(`Tinyfish HTTP ${res.status}`);
  const data = await res.json();
  return (data.results || []).map((r: any) => ({
    title: r.title || '',
    url: r.url || '',
    content: r.snippet || r.text || '',
  }));
};

const SEARCH_IMPLS: Record<string, SearchImpl> = {
  tavily: tavilySearch,
  firecrawl: firecrawlSearch,
  tinyfish: tinyfishSearch,
};

/**
 * 执行搜索
 * @param provider 供应商名称 'tavily' | 'firecrawl' | 'tinyfish'
 * @param config 该供应商的配置
 * @param query 搜索关键词
 */
export async function searchWeb(
  provider: string,
  config: SearchProviderConfig,
  query: string
): Promise<SearchResult[]> {
  const impl = SEARCH_IMPLS[provider];
  if (!impl) throw new Error(`不支持的搜索供应商: ${provider}`);
  if (!config.apiKey) throw new Error(`${provider} API Key 未配置`);
  return impl(config, query);
}

/**
 * 搜索工具定义（给 LLM 用）
 */
export const SEARCH_TOOL_DEFINITION = {
  type: 'function' as const,
  function: {
    name: 'search_web',
    description: '搜索网络获取实时信息。当用户问最新消息、天气、新闻等需要实时数据的问题时使用。',
    parameters: {
      type: 'object',
      properties: {
        query: {
          type: 'string',
          description: '搜索关键词，简洁明确',
        },
      },
      required: ['query'],
    },
  },
};
