/**
 * MCP 客户端服务 —— 基于 @modelcontextprotocol/sdk
 *
 * 管理 MCP 服务器连接的生命周期：
 * - connect/disconnect
 * - initialize 握手（SDK 自动处理）
 * - listTools 工具发现
 * - callTool 工具调用
 *
 * 参考 RikkaHub McpManager.kt 设计模式。
 * 状态机：Idle → Connecting → Connected → Error → Reconnecting → ...
 */

import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js';
import { SSEClientTransport } from '@modelcontextprotocol/sdk/client/sse.js';
  import type { Tool } from '@modelcontextprotocol/sdk/types.js';
  import type { MCPServer, MCPServerStatus } from '../../apps/settings/types';
import { isNative, isViteDev } from '../../utils/platform';
import { McpError, ErrorCode, getErrorMessage } from '../../types/errors';
import { createOAuthProvider } from './oauth-provider';
import { connectWithKotlin, disconnectWithKotlin, callToolWithKotlin } from './kotlin-bridge';

// ─── 类型 ──────────────────────────────────────────

export interface MCPConnectionStatus {
  state: MCPServerStatus;
  tools: Tool[];
  error?: string;
}

export interface MCPToolCallResult {
  content: Array<{ type: string; text?: string }>;
  isError?: boolean;
}

// ─── 连接池 ────────────────────────────────────────

interface ConnectionEntry {
  client: Client;
  transport: StreamableHTTPClientTransport | SSEClientTransport;
  status: MCPConnectionStatus;
}

const connections = new Map<string, ConnectionEntry>();

// 独立的 sessionId 存储（替代 transport._sessionId 私有字段访问）
const sessionIdMap = new Map<string, string>();

// 默认超时（毫秒）
const DEFAULT_CONNECT_TIMEOUT = 30000;
const DEFAULT_TOOL_CALL_TIMEOUT = 120000;

// ─── CORS 代理 Fetch ──────────────────────────────

function createProxiedFetch(_serverUrl: string, serverHeaders: Record<string, string>): typeof fetch {
  return async (input: RequestInfo | URL, init?: RequestInit): Promise<Response> => {
    const url = typeof input === 'string' ? input : input instanceof URL ? input.href : input.url;

    if (isNative()) {
      // 走统一 HttpNative 服务（base64 body，对齐 RikkaHub Ktor/OkHttp）
      const { nativeFetch } = await import('../http-native');
      const nativeHeaders: Record<string, string> = { ...serverHeaders };
      if (init?.headers) {
        if (init.headers instanceof Headers) {
          init.headers.forEach((v, k) => { nativeHeaders[k] = v; });
        } else if (Array.isArray(init.headers)) {
          for (const [k, v] of init.headers) { nativeHeaders[k] = v; }
        } else {
          Object.assign(nativeHeaders, init.headers);
        }
      }
      let bodyStr: string | undefined;
      if (init?.body instanceof ReadableStream) {
        const reader = init.body.getReader();
        const chunks: string[] = [];
        while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          chunks.push(new TextDecoder().decode(value));
        }
        bodyStr = chunks.join('');
      } else if (typeof init?.body === 'string') {
        bodyStr = init.body;
      }
      return nativeFetch(init?.method || 'POST', url, nativeHeaders, bodyStr);
    }

    if (isViteDev()) {
      // 透传原始 HTTP 方法（SDK 需要 GET 建立 SSE 通知流，POST 用于请求/响应）
      const originalMethod = (init?.method || 'POST').toUpperCase();
      const proxyRes = await fetch('/mcp-proxy', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          target: url,
          method: originalMethod,
          headers: { ...serverHeaders, ...(init?.headers instanceof Headers ? Object.fromEntries(init.headers) : (init?.headers || {})) },
          body: init?.body?.toString() || '',
        }),
      });
      return proxyRes;
    }

    return fetch(url, init);
  };
}

// ─── 状态管理 ──────────────────────────────────────

function setStatus(serverId: string, state: MCPServerStatus, error?: string): void {
  const entry = connections.get(serverId);
  if (!entry) return;
  entry.status = { state, tools: entry.status.tools, error };
  // 同步到事件总线或 store（由调用方通过回调处理）
  notifyStateChange(serverId, entry.status);
}

type StateChangeListener = (serverId: string, status: MCPConnectionStatus) => void;
const stateChangeListeners = new Set<StateChangeListener>();

export function onStateChange(listener: StateChangeListener): () => void {
  stateChangeListeners.add(listener);
  return () => stateChangeListeners.delete(listener);
}

function notifyStateChange(serverId: string, status: MCPConnectionStatus): void {
  for (const listener of stateChangeListeners) {
    try { listener(serverId, status); } catch { /* 单个 listener 异常不影响其他 */ }
  }
}

// ─── 客户端 API ────────────────────────────────────

export async function connectToServer(server: MCPServer): Promise<MCPConnectionStatus> {
  const existing = connections.get(server.id);
  if (existing?.status.state === 'connected' || existing?.status.state === 'connecting') {
    return existing.status;
  }

  // 先清理残留连接
  if (existing) {
    await disconnectFromServer(server.id);
  }

  cancelReconnect(server.id);

  const status: MCPConnectionStatus = { state: 'connecting', tools: [] };
  connections.set(server.id, { client: null!, transport: null!, status });

  try {
    // ── 手机端：走 Kotlin MCP SDK（对齐 RikkaHub）──
    if (isNative()) {
      const { tools: toolsJson } = await connectWithKotlin(server);
      let tools: Tool[] = [];
      try {
        tools = JSON.parse(toolsJson) as Tool[];
      } catch { /* empty tools */ }
      connections.set(server.id, {
        client: null!, transport: null!,
        status: { state: 'connected', tools },
      });
      return { state: 'connected', tools };
    }

    // ── 浏览器端：走 JS MCP SDK ──
    const headers: Record<string, string> = {};
    for (const [k, v] of Object.entries(server.headers)) {
      if (k.trim()) headers[k.trim()] = v;
    }

    let transport: StreamableHTTPClientTransport | SSEClientTransport;
    const proxiedFetch = createProxiedFetch(server.url, headers);
    const savedSessionId = sessionIdMap.get(server.id);

    const transportOpts: Record<string, any> = {
      requestInit: { headers },
      fetch: proxiedFetch,
      authProvider: createOAuthProvider(server.id),
    };
    if (savedSessionId) {
      transportOpts.sessionId = savedSessionId;
    }
    if (server.protocol === 'sse') {
      transport = new SSEClientTransport(new URL(server.url), transportOpts);
    } else {
      transport = new StreamableHTTPClientTransport(new URL(server.url), transportOpts);
    }

    const connectTimeout = server.timeout || DEFAULT_CONNECT_TIMEOUT;
    const client = new Client(
      { name: 'bananamilkphone', version: '0.2.0' },
      { capabilities: {} }
    );

    await withTimeout(client.connect(transport), connectTimeout, 'MCP 连接超时');

    const transportAny = transport as any;
    if (transportAny.sessionId) {
      sessionIdMap.set(server.id, transportAny.sessionId);
    } else if (transportAny._sessionId) {
      sessionIdMap.set(server.id, transportAny._sessionId);
    }

    const toolsResult = await client.listTools();
    const tools = toolsResult.tools as Tool[];

    connections.set(server.id, {
      client, transport,
      status: { state: 'connected', tools },
    });

    transportAny.onclose = () => {
      console.log(`[MCP] ${server.name} 连接关闭`);
      handleTransportDisconnect(server.id, server);
    };
    transportAny.onerror = (err: any) => {
      console.error(`[MCP] ${server.name} 连接错误:`, err);
      handleTransportDisconnect(server.id, server);
    };

    return { state: 'connected', tools };

  } catch (err) {
    const errorMsg = getErrorMessage(err);
    const status: MCPConnectionStatus = { state: 'error', tools: [], error: errorMsg };
    connections.set(server.id, { client: null!, transport: null!, status });
    return status;
  }
}

/** 处理传输层意外断开（区分 SSE 流到期和真断线） */
function handleTransportDisconnect(serverId: string, server: MCPServer): void {
  const entry = connections.get(serverId);
  if (!entry) return;

  // 检查是否为 SSE 流到期（仅 Streamable HTTP 有此情况）
  if (entry.transport && !('close' in entry.transport)) {
    // 传输层已关闭但连接池还有记录 → 真断线，触发重连
    if (server.autoReconnect !== false) {
      setStatus(serverId, 'error', '连接已断开');
      scheduleReconnect(serverId, server);
    }
    return;
  }

  // 一般断线
  if (server.autoReconnect !== false) {
    setStatus(serverId, 'error', '连接已断开');
    scheduleReconnect(serverId, server);
  }
}

/** 带超时的 Promise 包装 */
async function withTimeout<T>(promise: Promise<T>, ms: number, message: string): Promise<T> {
  let timer: ReturnType<typeof setTimeout>;
  const timeoutPromise = new Promise<never>((_, reject) => {
    timer = setTimeout(() => reject(new McpError(message, ErrorCode.TIMEOUT)), ms);
  });
  try {
    const result = await Promise.race([promise, timeoutPromise]);
    return result;
  } finally {
    clearTimeout(timer!);
  }
}

/**
 * 断开 MCP 服务器连接
 */
export async function disconnectFromServer(serverId: string): Promise<void> {
  const entry = connections.get(serverId);
  if (!entry) return;

  cancelReconnect(serverId);

  // 手机端：Kotlin SDK 断开
  if (isNative()) {
    try { await disconnectWithKotlin(serverId); } catch { /* ignore */ }
    connections.delete(serverId);
    return;
  }

  // 浏览器端：JS SDK 断开
  try {
    const transportAny = entry.transport as any;
    if (typeof transportAny.terminateSession === 'function') {
      await transportAny.terminateSession();
    } else if (typeof transportAny.close === 'function') {
      await transportAny.close();
    }
    await entry.client.close();
  } catch {
    // 忽略关闭错误
  }

  sessionIdMap.delete(serverId);
  connections.delete(serverId);
}

/**
 * 调用 MCP 工具
 */
export async function callToolOnServer(
  serverId: string,
  toolName: string,
  args: Record<string, unknown>
): Promise<MCPToolCallResult> {
  const entry = connections.get(serverId);
  if (!entry || entry.status.state !== 'connected') {
    throw new McpError('服务器未连接', ErrorCode.MCP_NOT_CONNECTED);
  }

  // 手机端：Kotlin SDK 调用
  if (isNative()) {
    const resultJson = await callToolWithKotlin(serverId, toolName, args);
    let parsed: Array<{ text: string }> = [];
    try { parsed = JSON.parse(resultJson); } catch { /* empty */ }
    return { content: parsed.map((r) => ({ type: 'text' as const, text: r.text })) };
  }

  // 浏览器端：JS SDK 调用
  const toolTimeout = DEFAULT_TOOL_CALL_TIMEOUT;
  const result = await withTimeout(
    entry.client.callTool({ name: toolName, arguments: args }),
    toolTimeout,
    `工具调用超时: ${toolName}`
  );

  return {
    content: (result.content as Array<{ type: string; text?: string }>) || [],
    isError: result.isError as boolean | undefined,
  };
}

/**
 * 获取服务器已发现的工具列表
 */
export function getDiscoveredTools(serverId: string): Tool[] {
  return connections.get(serverId)?.status.tools || [];
}

/**
 * 获取服务器连接状态
 */
export function getConnectionStatus(serverId: string): MCPConnectionStatus {
  return connections.get(serverId)?.status || { state: 'stopped', tools: [] };
}

// ─── F5: 配置同步 ──────────────────────────────────

/**
 * 同步当前连接池与配置列表。
 * 对新增/已启用的服务器自动连接，对已移除/已禁用的自动断开。
 */
export async function syncServerConfig(mcpServers: MCPServer[]): Promise<void> {
  const currentIds = new Set(connections.keys());
  const configIds = new Set(mcpServers.filter((s) => s.enabled).map((s) => s.id));

  // 断开已禁用/已删除的
  for (const id of currentIds) {
    if (!configIds.has(id)) {
      await disconnectFromServer(id);
    }
  }

  // 连接新增的/已启用但未连接的
  for (const server of mcpServers) {
    if (server.enabled && !connections.has(server.id)) {
      try {
        await connectToServer(server);
      } catch {
        // 单个连接失败不影响其他服务器
      }
    }
  }
}

// ─── F6: 自动重连 ──────────────────────────────────

const RECONNECT_DELAYS = [1000, 2000, 4000, 8000, 16000];
const MAX_RECONNECT_ATTEMPTS = 5;

interface ReconnectState {
  attempt: number;
  timer: ReturnType<typeof setTimeout> | null;
}

const reconnectStates = new Map<string, ReconnectState>();

function scheduleReconnect(serverId: string, server: MCPServer): void {
  const state = reconnectStates.get(serverId) || { attempt: 0, timer: null };
  state.attempt += 1;

  if (state.attempt > (server.retryCount || MAX_RECONNECT_ATTEMPTS)) {
    setStatus(serverId, 'error', '已达最大重连次数');
    reconnectStates.delete(serverId);
    return;
  }

  const delay = RECONNECT_DELAYS[Math.min(state.attempt - 1, RECONNECT_DELAYS.length - 1)];
  state.timer = setTimeout(async () => {
    try {
      await connectToServer(server);
      reconnectStates.delete(serverId);
    } catch {
      scheduleReconnect(serverId, server);
    }
  }, delay);

  reconnectStates.set(serverId, state);
}

function cancelReconnect(serverId: string): void {
  const state = reconnectStates.get(serverId);
  if (state?.timer) {
    clearTimeout(state.timer);
  }
  reconnectStates.delete(serverId);
}

// ─── F7: Session 持久化 ────────────────────────────

let _persistenceStore: { getItem: (key: string) => Promise<string | null>; setItem: (key: string, value: string) => Promise<void> } | null = null;

export function initSessionPersistence(store: { getItem: (key: string) => Promise<string | null>; setItem: (key: string, value: string) => Promise<void> }): void {
  _persistenceStore = store;
}

const SESSION_STORAGE_KEY = 'mcp_session_ids';

async function saveSessionIds(): Promise<void> {
  if (!_persistenceStore) return;
  if (sessionIdMap.size === 0) return;
  const raw = JSON.stringify(Object.fromEntries(sessionIdMap));
  await _persistenceStore.setItem(SESSION_STORAGE_KEY, raw);
}

if (typeof window !== 'undefined') {
  window.addEventListener('beforeunload', () => { saveSessionIds(); });
}

// ─── F8: 工具发现 diff 合并 ────────────────────────

/**
 * 合并新发现的工具列表与已有配置。
 * - 保留用户设置的 enabled/needsApproval 标志
 * - 删除服务端已不存在的工具（RikkaHub 标准行为）
 * - 新增工具默认启用
 */
export function mergeDiscoveredTools(
  existing: Array<{ name: string; enabled: boolean; needsApproval: boolean }> | undefined,
  newTools: Tool[]
): Array<{ name: string; description: string; inputSchema: Record<string, unknown>; enabled: boolean; needsApproval: boolean }> {
  const existingMap = new Map((existing || []).map((t) => [t.name, t]));

  // 只保留服务端仍存在的工具
  return newTools.map((tool) => {
    const existingTool = existingMap.get(tool.name);
    return {
      name: tool.name,
      description: (tool as any).description || '',
      inputSchema: (tool as any).inputSchema || {},
      // 新增工具默认启用
      enabled: existingTool?.enabled ?? true,
      needsApproval: existingTool?.needsApproval ?? false,
    };
  });
}
