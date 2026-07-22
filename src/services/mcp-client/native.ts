/**
 * MCP 原生 HTTP 插件接口
 *
 * 桥接到 Android 端的 McpNativePlugin，绕过 CapacitorHttp bridge 的
 * body 二次编码和 SSE 流限制。仅在 isNative() 环境可用。
 *
 * 参考 RikkaHub McpManager.kt：独立 OkHttp 客户端处理 MCP 传输。
 */
import { registerPlugin } from '@capacitor/core';

export interface McpNativePlugin {
  /**
   * 发送 MCP HTTP 请求（原生 OkHttp）。
   *
   * @param options.method  - HTTP 方法（POST/GET）
   * @param options.url     - 完整 URL
   * @param options.headers - 请求头 { "Key": "Value" }
   * @param options.body    - JSON-RPC 请求体（可选）
   */
  request(options: {
    method: string;
    url: string;
    headers: Record<string, string>;
    body?: string;
  }): Promise<{
    status: number;
    headers: Record<string, string>;
    body: string;
  }>;
}

const McpNative = registerPlugin<McpNativePlugin>('McpNative');

export default McpNative;
