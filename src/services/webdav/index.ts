/**
 * WebDAV 客户端 —— 用于远程备份同步
 *
 * 参考 RikkaHub WebDavClient.kt 实现。
 * CORS 处理策略（三路方案）：
 *   Vite 开发模式 → 通过本地代理转发（/webdav-proxy）
 *   Capacitor 原生 → CapacitorHttp 原生 HTTP（无 CORS）
 *   纯浏览器（fallback）→ fetch（可能因 CORS 失败）
 */

import { Capacitor } from '@capacitor/core';
import type { WebDAVConfig } from '../../apps/settings/types';

/** WebDAV 远程文件信息 */
export interface WebDAVFileInfo {
  name: string;
  size: number;
  lastModified: string;
}

// ─── 平台检测 ──────────────────────────────────

/** 是否运行在 Capacitor 原生环境中 */
function isNative(): boolean {
  try {
    return Capacitor.getPlatform() !== 'web';
  } catch {
    return false;
  }
}

/** 是否运行在 Vite 开发模式下 */
function isViteDev(): boolean {
  return typeof window !== 'undefined' && window.location.hostname === 'localhost';
}

// ─── HTTP 请求抽象层 ────────────────────────────

interface ProxyResponse {
  status: number;
  statusText?: string;
  headers?: Record<string, string>;
  body?: string;       // base64
  bodyText?: string;   // 小响应的纯文本
  error?: string;
}

/**
 * 发送 WebDAV HTTP 请求（自动选择通道）
 * - 原生环境 → CapacitorHttp
 * - Vite 开发 → 本地代理转发
 * - fallback  → fetch
 */
async function request(
  url: string,
  method: string,
  headers: Record<string, string>,
  body?: Blob | string | null
): Promise<{ status: number; body: string; headers: Record<string, string> }> {
  // ── 方案一：Capacitor 原生 → CapacitorHttp ──
  if (isNative()) {
    const { CapacitorHttp } = await import('@capacitor/core');
    const res = await CapacitorHttp.request({
      method,
      url,
      headers,
      data: body,
    });
    return {
      status: res.status,
      body: typeof res.data === 'string' ? res.data : JSON.stringify(res.data),
      headers: res.headers as Record<string, string>,
    };
  }

  // ── 方案二：Vite 开发模式 → 本地代理 ──
  if (isViteDev()) {
    const proxyUrl = `/webdav-proxy?target=${encodeURIComponent(url)}&method=${encodeURIComponent(method)}`;
    let requestBody: string | undefined;
    let contentType = headers['Content-Type'] || '';

    if (body instanceof Blob) {
      // Blob → base64
      const buffer = await body.arrayBuffer();
      requestBody = btoa(String.fromCharCode(...new Uint8Array(buffer)));
      contentType = body.type || 'application/octet-stream';
    } else if (typeof body === 'string') {
      requestBody = body;
    }

    const proxyHeaders: Record<string, string> = { ...headers, 'Content-Type': contentType };
    if (requestBody) {
      proxyHeaders['X-Body-Base64'] = '1';
    }

    const res = await fetch(proxyUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ headers: proxyHeaders, body: requestBody }),
    });
    const data: ProxyResponse = await res.json();

    if (data.error) throw new Error(data.error);

    let responseBody = '';
    if (data.bodyText) {
      responseBody = data.bodyText;
    } else if (data.body) {
      // base64 → 文本
      try {
        responseBody = atob(data.body);
      } catch {
        responseBody = `[binary: ${data.body.length} bytes]`;
      }
    }

    return {
      status: data.status,
      body: responseBody,
      headers: data.headers ?? {},
    };
  }

  // ── 方案三：纯浏览器 fallback → fetch ──
  const res = await fetch(url, { method, headers, body });
  return {
    status: res.status,
    body: await res.text(),
    headers: Object.fromEntries(res.headers.entries()),
  };
}

/** 生成基础认证 header */
function authHeader(config: WebDAVConfig): string {
  return 'Basic ' + btoa(`${config.username}:${config.password}`);
}

/** 构建完整远程路径 */
function fullUrl(config: WebDAVConfig, filename?: string): string {
  const base = config.url.replace(/\/+$/, '');
  const path = config.remotePath.replace(/^\/+|\/+$/g, '');
  if (filename) {
    return `${base}/${path}/${filename}`;
  }
  return `${base}/${path}/`;
}

/** 解析 PROPFIND 响应的 XML，提取文件列表 */
function parsePropfindResponse(xmlText: string): WebDAVFileInfo[] {
  const files: WebDAVFileInfo[] = [];
  const responseRegex = /<d:response>([\s\S]*?)<\/d:response>/gi;
  let match;
  while ((match = responseRegex.exec(xmlText)) !== null) {
    const block = match[1];
    const hrefMatch = block.match(/<d:href>([^<]+)<\/d:href>/i);
    if (!hrefMatch) continue;
    const href = decodeURIComponent(hrefMatch[1].trim());
    if (href.endsWith('/')) continue;
    const name = href.split('/').pop() || '';
    if (!name) continue;
    let size = 0;
    const sizeMatch = block.match(/<d:getcontentlength[^>]*>(\d+)<\/d:getcontentlength>/i);
    if (sizeMatch) size = parseInt(sizeMatch[1], 10);
    let lastModified = '';
    const modMatch = block.match(/<d:getlastmodified[^>]*>([^<]+)<\/d:getlastmodified>/i);
    if (modMatch) lastModified = modMatch[1].trim();
    files.push({ name, size, lastModified });
  }
  return files;
}

// ─── API ──────────────────────────────────────────

/** 测试 WebDAV 连接（PROPFIND depth=0） */
export async function testConnection(config: WebDAVConfig): Promise<{ ok: boolean; error?: string }> {
  try {
    const url = fullUrl(config);
    const res = await request(url, 'PROPFIND', { 'Authorization': authHeader(config), 'Depth': '0' });
    if (res.status === 207 || res.status < 300) return { ok: true };
    return { ok: false, error: `HTTP ${res.status}` };
  } catch (err) {
    return { ok: false, error: (err as Error).message };
  }
}

/** 确保远程目录存在（MKCOL） */
async function ensureDirectory(config: WebDAVConfig): Promise<void> {
  const url = fullUrl(config);
  const res = await request(url, 'MKCOL', { 'Authorization': authHeader(config) });
  if (res.status !== 201 && res.status !== 405 && res.status >= 300) {
    throw new Error(`创建远程目录失败: HTTP ${res.status}`);
  }
}

/** 列出远程备份文件（PROPFIND depth=1） */
export async function listBackups(config: WebDAVConfig): Promise<WebDAVFileInfo[]> {
  const url = fullUrl(config);
  const res = await request(url, 'PROPFIND', { 'Authorization': authHeader(config), 'Depth': '1' });

  if (res.status === 404) return [];
  if (res.status !== 207 && res.status >= 300) {
    throw new Error(`列出备份失败: HTTP ${res.status}`);
  }
  return parsePropfindResponse(res.body);
}

/** 上传备份到 WebDAV */
export async function uploadBackup(config: WebDAVConfig, filename: string, data: Blob): Promise<void> {
  await ensureDirectory(config);
  const url = fullUrl(config, filename);
  const res = await request(url, 'PUT', { 'Authorization': authHeader(config), 'Content-Type': 'application/zip' }, data);
  if (res.status >= 300) throw new Error(`上传失败: HTTP ${res.status}`);
}

/** 从 WebDAV 下载备份（仅 CapacitorHttp 或 proxy 模式能生效） */
export async function downloadBackup(config: WebDAVConfig, filename: string): Promise<Blob> {
  const url = fullUrl(config, filename);
  // 原生 Capacitor 或 Vite proxy 模式：通过 request 获取 base64 数据
  if (isNative() || isViteDev()) {
    const res = await request(url, 'GET', { 'Authorization': authHeader(config) });
    if (res.status >= 300) throw new Error(`下载失败: HTTP ${res.status}`);
    // 将 base64 转为 Blob
    const byteStr = atob(res.body);
    const bytes = new Uint8Array(byteStr.length);
    for (let i = 0; i < byteStr.length; i++) bytes[i] = byteStr.charCodeAt(i);
    return new Blob([bytes], { type: 'application/zip' });
  }
  // fallback：直接 fetch
  const res = await fetch(url, { method: 'GET', headers: { 'Authorization': authHeader(config) } });
  if (!res.ok) throw new Error(`下载失败: HTTP ${res.status}`);
  return res.blob();
}

/** 删除远程备份文件 */
export async function deleteBackup(config: WebDAVConfig, filename: string): Promise<void> {
  const url = fullUrl(config, filename);
  const res = await request(url, 'DELETE', { 'Authorization': authHeader(config) });
  if (res.status >= 300) throw new Error(`删除失败: HTTP ${res.status}`);
}
