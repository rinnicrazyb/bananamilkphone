/**
 * WebDAV 原生 HTTP 插件接口
 *
 * 桥接到 Android 端的 WebDavNativePlugin，绕过 CapacitorHttp 的方法白名单限制。
 * 仅在 isNative() 环境可用，浏览器环境走 Vite proxy / fetch fallback。
 *
 * 参考 RikkaHub WebDavClient.kt：独立 HTTP 客户端，与项目其他 HTTP 请求解耦。
 */
import { registerPlugin } from '@capacitor/core';

export interface WebDavNativePlugin {
  /**
   * 发送任意 HTTP 请求（原生 OkHttp）。
   *
   * @param options.method  - HTTP 方法（支持 PROPFIND、MKCOL 等非标准方法）
   * @param options.url     - 完整 URL
   * @param options.headers - 请求头 { "Key": "Value" }
   * @param options.body    - 请求体字符串（可选）
   *
   * @returns status / headers / body
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

const WebDavNative = registerPlugin<WebDavNativePlugin>('WebDavNative');

export default WebDavNative;
