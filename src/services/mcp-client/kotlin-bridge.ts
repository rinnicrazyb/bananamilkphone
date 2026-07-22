/**
 * MCP Kotlin 桥接 — 手机端走 Kotlin MCP SDK，对标 RikkaHub。
 *
 * 浏览器端继续用 JS MCP SDK。
 * 手机端通过此模块调用 Android 原生 McpKotlinService。
 */
import { registerPlugin } from '@capacitor/core';
import type { MCPServer } from '../../apps/settings/types';

export interface McpKotlinBridgePlugin {
  connect(options: { serverId: string; config: { url: string; headers: Record<string, string> } }): Promise<{ tools: string }>;
  disconnect(options: { serverId: string }): Promise<void>;
  callTool(options: { serverId: string; toolName: string; args: string }): Promise<{ content: string }>;
}

const McpKotlinBridge = registerPlugin<McpKotlinBridgePlugin>('McpKotlinBridge');

/** 用 Kotlin 原生 SDK 连接 MCP 服务器，返回工具列表 */
export async function connectWithKotlin(server: MCPServer): Promise<{ tools: string }> {
  return McpKotlinBridge.connect({
    serverId: server.id,
    config: { url: server.url, headers: server.headers || {} },
  });
}

/** 断开连接 */
export async function disconnectWithKotlin(serverId: string): Promise<void> {
  return McpKotlinBridge.disconnect({ serverId });
}

/** 调用工具 */
export async function callToolWithKotlin(
  serverId: string,
  toolName: string,
  args: Record<string, unknown>
): Promise<string> {
  const res = await McpKotlinBridge.callTool({
    serverId,
    toolName,
    args: JSON.stringify(args),
  });
  return res.content;
}

export default McpKotlinBridge;
