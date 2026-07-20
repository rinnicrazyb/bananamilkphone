/**
 * 统一原生 HTTP 服务 — 对标 RikkaHub Ktor HttpClient。
 *
 * 所有 HTTP 请求通过此模块走 Android 原生 OkHttp。
 * Body 以 base64 编码传输，彻底避免 Capacitor Bridge JSON 序列化损坏。
 *
 * 使用方式：
 *   const res = await httpRequest({ method: 'POST', url: '...', headers: {...}, body: '...' });
 *   // res.body 是解码后的文本字符串
 */
import { registerPlugin } from '@capacitor/core';

export interface HttpNativePlugin {
  request(options: {
    method: string;
    url: string;
    headers: Record<string, string>;
    /** base64 编码的请求体，或 null/空 = 无 body */
    body?: string;
  }): Promise<{
    status: number;
    headers: Record<string, string>;
    /** base64 编码的响应体 */
    body: string;
  }>;
}

const HttpNative = registerPlugin<HttpNativePlugin>('HttpNative');

/** 发起原生 HTTP 请求。body 自动 base64 编码，响应 body 自动解码 */
export async function httpRequest(options: {
  method: string;
  url: string;
  headers: Record<string, string>;
  body?: string;
}): Promise<{ status: number; headers: Record<string, string>; body: string }> {
  const { body, ...rest } = options;
  const res = await HttpNative.request({
    ...rest,
    body: body ? btoa(unescape(encodeURIComponent(body))) : undefined,
  });
  // 响应 body 解码（base64 → 文本）
  let decodedBody = '';
  if (res.body) {
    try {
      decodedBody = decodeURIComponent(escape(atob(res.body)));
    } catch {
      // 非 UTF-8 文本，直接返回 base64
      decodedBody = res.body;
    }
  }
  return { status: res.status, headers: res.headers, body: decodedBody };
}

/** 快速调用：method + url + headers → Response 兼容对象（用于替换 fetch） */
export async function nativeFetch(
  method: string,
  url: string,
  headers: Record<string, string>,
  body?: string
): Promise<Response> {
  const res = await httpRequest({ method, url, headers, body });
  return new Response(res.body || null, {
    status: res.status,
    headers: res.headers,
  });
}

export default HttpNative;
