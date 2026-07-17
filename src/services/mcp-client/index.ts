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
 */

import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js';
import type { Tool } from '@modelcontextprotocol/sdk/types.js';
import { Capacitor } from '@capacitor/core';
import type { MCPServer } from '../../apps/settings/types';

// ─── 类型 ──────────────────────────────────────────

export interface MCPConnectionStatus {
  connected: boolean;
  tools: Tool[];
  error?: string;
}

export interface MCPToolCallResult {
  content: Array<{ type: string; text?: string }>;
  isError?: boolean;
}

// ─── 平台检测 ──────────────────────────────────

function isNative(): boolean {
  try { return Capacitor.getPlatform() !== 'web'; } catch { return false; }
}

function isViteDev(): boolean {
  return typeof window !== 'undefined' && window.location.hostname === 'localhost';
}

// ─── 连接池 ────────────────────────────────────────

interface ConnectionEntry {
  client: Client;
  transport: StreamableHTTPClientTransport;
  status: MCPConnectionStatus;
}

const connections = new Map<string, ConnectionEntry>();

// ─── CORS 代理 Fetch ──────────────────────────────

/**
 * 创建代理 fetch 函数，用于绕过 CORS
 * - Capacitor 原生 → CapacitorHttp
 * - Vite 开发 → /mcp-proxy
 * - fallback → 原生 fetch
 */
function createProxiedFetch(_serverUrl: string, serverHeaders: Record<string, string>): typeof fetch {
  return async (input: RequestInfo | URL, init?: RequestInit): Promise<Response> => {
    const url = typeof input === 'string' ? input : input instanceof URL ? input.href : input.url;

    if (isNative()) {
      // Capacitor 原生 → CapacitorHttp
      const { CapacitorHttp } = await import('@capacitor/core');
      const res = await CapacitorHttp.request({
        method: init?.method?.toString() || 'GET',
        url,
        headers: { ...serverHeaders, ...(init?.headers as Record<string, string> || {}) },
        data: init?.body,
      });
      return new Response(res.data ? JSON.stringify(res.data) : null, {
        status: res.status,
      });
    }

    if (isViteDev()) {
      // Vite 开发 → 本地代理
      const proxyRes = await fetch('/mcp-proxy', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          target: url,
          headers: { ...serverHeaders, ...(init?.headers || {}) },
          body: init?.body?.toString() || '',
        }),
      });
      return proxyRes;
    }

    // 直连
    return fetch(url, init);
  };
}

// ─── 客户端 API ────────────────────────────────────

/**
 * 连接到 MCP 服务器
 * 自动执行 initialize 握手（SDK 处理）+ 获取工具列表
 */
export async function connectToServer(server: MCPServer): Promise<MCPConnectionStatus> {
  const existing = connections.get(server.id);
  if (existing?.status.connected) {
    return existing.status;
  }

  try {
    // 创建传输层
    const headers: Record<string, string> = {};
    for (const [k, v] of Object.entries(server.headers)) {
      if (k.trim()) headers[k.trim()] = v;
    }

    let transport: StreamableHTTPClientTransport;
    const proxiedFetch = createProxiedFetch(server.url, headers);

    // Streamable HTTP（同时兼容 SSE 服务，如 Nocturne Memory 同时支持两种协议）
    transport = new StreamableHTTPClientTransport(
        new URL(server.url),
        {
          requestInit: { headers },
          fetch: proxiedFetch,
        }
      );

    // 创建客户端
    const client = new Client(
      { name: 'bananamilkphone', version: '0.2.0' },
      { capabilities: {} }
    );

    // 连接 + 自动握手
    await client.connect(transport);

    // 获取工具列表
    const toolsResult = await client.listTools();
    const tools = toolsResult.tools as Tool[];

    const status: MCPConnectionStatus = {
      connected: true,
      tools,
    };

    connections.set(server.id, { client, transport, status });
    return status;

  } catch (err) {
    const error = (err as Error).message;
    const status: MCPConnectionStatus = { connected: false, tools: [], error };
    connections.set(server.id, { client: null!, transport: null!, status });
    return status;
  }
}

/**
 * 断开 MCP 服务器连接
 */
export async function disconnectFromServer(serverId: string): Promise<void> {
  const entry = connections.get(serverId);
  if (!entry) return;

  try {
    // 关闭 transport
    await entry.transport.close();
  } catch {
    // 忽略关闭错误
  }

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
  if (!entry || !entry.status.connected) {
    throw new Error('服务器未连接');
  }

  const result = await entry.client.callTool({
    name: toolName,
    arguments: args,
  });

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
  return connections.get(serverId)?.status || { connected: false, tools: [] };
}
