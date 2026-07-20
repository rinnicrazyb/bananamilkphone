/**
 * 网络搜索服务 — 支持 Tavily / Firecrawl / Tinyfish
 * 搜索 + 抓取（scrape）双能力
 */

import type { SearchProviderConfig } from '../../apps/settings/types';
import { isNative, isViteDev } from '../../utils/platform';

// ─── 原生环境 fetch 替代（走统一 HttpNative 服务，base64 body 杜绝 Bridge 损坏）───

async function fetchApi(input: RequestInfo | URL, init?: RequestInit): Promise<Response> {
  if (!isNative()) return fetch(input, init);

  const { nativeFetch } = await import('../http-native');
  const url = typeof input === 'string' ? input : input.toString();

  const headers: Record<string, string> = {};
  if (init?.headers instanceof Headers) {
    init.headers.forEach((v, k) => { headers[k] = v; });
  } else if (Array.isArray(init?.headers)) {
    for (const [k, v] of init.headers) { headers[k] = v; }
  } else if (init?.headers) {
    Object.assign(headers, init.headers);
  }

  return nativeFetch(init?.method || 'GET', url, headers,
    typeof init?.body === 'string' ? init.body : undefined);
}

/** 搜索结果条目 */
export interface SearchResultItem {
  title: string;
  url: string;
  content: string;
}

/** 搜索结果（含增强字段） */
export interface SearchResult {
  answer?: string;
  items: SearchResultItem[];
  images?: string[];
}

/** 抓取结果 */
export interface ScrapeResult {
  url: string;
  content: string;
  metadata?: { title?: string; description?: string };
}

// ─── 类型缩写 ───
type SearchImpl = (config: SearchProviderConfig, query: string) => Promise<SearchResult>;
type ScrapeImpl = (config: SearchProviderConfig, url: string) => Promise<ScrapeResult>;

// ─── Tavily ───

const tavilySearch: SearchImpl = async (config, query) => {
  const body = JSON.stringify({
    api_key: config.apiKey,
    query,
    max_results: config.maxResults,
    include_answer: 'advanced',
    include_images: true,
  });
  const res = await fetchApi('https://api.tavily.com/search', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body,
  });
  if (!res.ok) throw new Error(`Tavily HTTP ${res.status}`);
  const data = await res.json();
  return {
    answer: data.answer || undefined,
    items: (data.results || []).map((r: any) => ({
      title: r.title || '',
      url: r.url || '',
      content: r.content || r.snippet || '',
    })),
    images: data.images || undefined,
  };
};

const tavilyScrape: ScrapeImpl = async (config, url) => {
  // Tavily /extract 没有 CORS 头，开发环境走 Vite 代理 /mcp-proxy
  const body = JSON.stringify({ urls: [url], api_key: config.apiKey });
  const apiUrl = isViteDev() ? '/mcp-proxy' : 'https://api.tavily.com/extract';
  const reqBody = isViteDev()
    ? JSON.stringify({
        target: 'https://api.tavily.com/extract',
        headers: { 'Content-Type': 'application/json' },
        body,
      })
    : body;

  const res = await fetchApi(apiUrl, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: reqBody,
  });
  if (!res.ok) throw new Error(`Tavily extract HTTP ${res.status}`);
  const data = await res.json();
  const result = data.results?.[0];
  return {
    url,
    content: result?.raw_content || result?.content || '',
    metadata: result?.metadata,
  };
};

// ─── Firecrawl ───

const firecrawlSearch: SearchImpl = async (config, query) => {
  const res = await fetchApi('https://api.firecrawl.dev/v1/search', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${config.apiKey}`,
    },
    body: JSON.stringify({ query, maxResults: config.maxResults }),
  });
  if (!res.ok) throw new Error(`Firecrawl HTTP ${res.status}`);
  const data = await res.json();
  return {
    items: (data.data || []).map((r: any) => ({
      title: r.title || r.name || '',
      url: r.url || '',
      content: r.description || r.text || '',
    })),
  };
};

const firecrawlScrape: ScrapeImpl = async (config, url) => {
  const res = await fetchApi('https://api.firecrawl.dev/v1/scrape', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${config.apiKey}`,
    },
    body: JSON.stringify({ url, onlyMainContent: true }),
  });
  if (!res.ok) throw new Error(`Firecrawl scrape HTTP ${res.status}`);
  const data = await res.json();
  const d = data.data || {};
  return {
    url,
    content: d.markdown || d.content || '',
    metadata: d.metadata ? { title: d.metadata.title, description: d.metadata.description } : undefined,
  };
};

// ─── Tinyfish ───

const tinyfishSearch: SearchImpl = async (config, query) => {
  const res = await fetchApi('https://api.tinyfish.io/v1/search', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${config.apiKey}`,
    },
    body: JSON.stringify({ q: query, count: config.maxResults }),
  });
  if (!res.ok) throw new Error(`Tinyfish HTTP ${res.status}`);
  const data = await res.json();
  return {
    items: (data.results || []).map((r: any) => ({
      title: r.title || '',
      url: r.url || '',
      content: r.snippet || r.text || '',
    })),
  };
};

/** Tinyfish 无官方 scrape 接口，用通用 fetch 兜底 */
const tinyfishScrape: ScrapeImpl = async (_config, url) => {
  const res = await fetchApi(url, {
    headers: { 'User-Agent': 'Mozilla/5.0 (compatible; BananaMilkPhone/1.0)' },
  });
  if (!res.ok) throw new Error(`Fetch HTTP ${res.status}`);
  const content = await res.text();
  return { url, content };
};

// ─── 注册表 ───

interface ProviderImpls {
  search: SearchImpl;
  scrape: ScrapeImpl;
}

const PROVIDER_IMPLS: Record<string, ProviderImpls> = {
  tavily: { search: tavilySearch, scrape: tavilyScrape },
  firecrawl: { search: firecrawlSearch, scrape: firecrawlScrape },
  tinyfish: { search: tinyfishSearch, scrape: tinyfishScrape },
};

// ─── 导出函数 ───

/** 执行搜索 */
export async function searchWeb(
  provider: string,
  config: SearchProviderConfig,
  query: string
): Promise<SearchResult> {
  const impls = PROVIDER_IMPLS[provider];
  if (!impls) throw new Error(`不支持的搜索供应商: ${provider}`);
  if (!config.apiKey) throw new Error(`${provider} API Key 未配置`);
  return impls.search(config, query);
}

/** 抓取网页内容 */
export async function scrapeWeb(
  provider: string,
  config: SearchProviderConfig,
  url: string
): Promise<ScrapeResult> {
  const impls = PROVIDER_IMPLS[provider];
  if (!impls) throw new Error(`不支持的搜索供应商: ${provider}`);
  if (!config.apiKey) throw new Error(`${provider} API Key 未配置`);
  return impls.scrape(config, url);
}

/**
 * search_web 工具定义（给 LLM 用）
 */
export const SEARCH_TOOL_DEFINITION = {
  type: 'function' as const,
  function: {
    name: 'search_web',
    description: `搜索网络获取实时信息。当用户问最新消息、天气、新闻等需要实时数据的问题时使用。

返回格式:
- items[]: 搜索结果列表，每条含 title / url / content
- images[]: 与查询相关的图片 URL（可能为空）

引用规则:
- 引用搜索结果时，在句子后标注来源URL
- 允许同时引用多个结果

图片规则:
- 如果图片有助于用户理解答案，使用 Markdown 嵌入: ![](url)
- 嵌入 2-4 张图片，只使用 images[] 中的 URL（不得编造或修改 URL）`,
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

/**
 * scrape_web 工具定义
 */
export const SCRAPE_TOOL_DEFINITION = {
  type: 'function' as const,
  function: {
    name: 'scrape_web',
    description: `获取指定网页的完整内容。
当搜索结果摘要不足以回答用户问题时使用，或者用户明确要求阅读某个页面内容时使用。
避免在回答简单常识问题时使用。`,
    parameters: {
      type: 'object',
      properties: {
        url: {
          type: 'string',
          description: '要抓取的网页完整 URL',
        },
      },
      required: ['url'],
    },
  },
};
