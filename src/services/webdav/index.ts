/**
 * WebDAV 客户端 —— 用于远程备份同步
 *
 * 参考 RikkaHub WebDavClient.kt 实现。
 * CORS 处理策略（三路方案）：
 *   Vite 开发模式 → 通过本地代理转发（/webdav-proxy）
 *   Capacitor 原生 → CapacitorHttp 原生 HTTP（无 CORS）
 *   纯浏览器（fallback）→ fetch（可能因 CORS 失败）
 */

import type { WebDAVConfig } from '../../apps/settings/types';
import { isNative, isViteDev } from '../../utils/platform';
import { WebDavError, ErrorCode, getErrorMessage } from '../../types/errors';

/** WebDAV 远程文件信息 */
export interface WebDAVFileInfo {
  name: string;
  size: number;
  lastModified: string;
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
 *
 * 返回包含 status / body / headers / responseBody 的结构，
 * 即使 HTTP 报错也返回 body 文本供调用方暴露给用户。
 */
async function request(
  url: string,
  method: string,
  headers: Record<string, string>,
  body?: Blob | string | null
): Promise<{ status: number; body: string; headers: Record<string, string> }> {
  // ── 方案一：Capacitor 原生 → WebDavNative（OkHttp） ──
  if (isNative()) {
    const { httpRequest } = await import('../http-native');
    // body → 字符串（Blob 先转 base64 再经 httpRequest 自动二次 base64 编码）
    let bodyStr: string | undefined;
    if (body instanceof Blob) {
      const buffer = await body.arrayBuffer();
      const bytes = new Uint8Array(buffer);
      let binary = '';
      const chunkSize = 8192;
      for (let i = 0; i < bytes.length; i += chunkSize) {
        binary += String.fromCharCode(...bytes.slice(i, i + chunkSize));
      }
      bodyStr = btoa(binary);
    } else if (typeof body === 'string') {
      bodyStr = body;
    }
    // httpRequest 内部对 body 做 base64 编码传给原生层，响应 body 自动解码
    const res = await httpRequest({ method, url, headers, body: bodyStr });
    return {
      status: res.status,
      body: res.body,
      headers: res.headers,
    };
  }

  // ── 方案二：Vite 开发模式 → 本地代理 ──
  if (isViteDev()) {
    const proxyUrl = `/webdav-proxy?target=${encodeURIComponent(url)}&method=${encodeURIComponent(method)}`;
    let requestBody: string | undefined;
    let contentType = headers['Content-Type'] || '';

    if (body instanceof Blob) {
      // Blob → base64（分块转换避免栈溢出）
      const buffer = await body.arrayBuffer();
      const bytes = new Uint8Array(buffer);
      let binary = '';
      const chunkSize = 8192;
      for (let i = 0; i < bytes.length; i += chunkSize) {
        binary += String.fromCharCode(...bytes.slice(i, i + chunkSize));
      }
      requestBody = btoa(binary);
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

    if (data.error) throw new WebDavError(data.error, ErrorCode.WEBDAV_CONNECTION_FAILED);

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

/** 解析 PROPFIND 响应的 XML，提取文件列表（使用 DOMParser 替代正则，支持任意 XML namespace） */
function parsePropfindResponse(xmlText: string): WebDAVFileInfo[] {
  const files: WebDAVFileInfo[] = [];
  let xmlDoc: Document;
  try {
    xmlDoc = new DOMParser().parseFromString(xmlText, 'text/xml');
    // 检测解析错误
    const parseError = xmlDoc.querySelector('parsererror');
    if (parseError) {
      throw new WebDavError(`XML 解析失败: ${parseError.textContent}`, ErrorCode.WEBDAV_XML_PARSE_ERROR);
    }
  } catch (err) {
    if (err instanceof WebDavError) throw err;
    throw new WebDavError(`XML 解析异常: ${getErrorMessage(err)}`, ErrorCode.WEBDAV_XML_PARSE_ERROR);
  }

  // 匹配任意 namespace 下的 response / href / getcontentlength / getlastmodified
  const responses = xmlDoc.querySelectorAll('response');
  for (const resp of responses) {
    const hrefEl = resp.querySelector('href');
    if (!hrefEl) continue;
    const href = decodeURIComponent(hrefEl.textContent?.trim() || '');
    if (!href || href.endsWith('/')) continue;
    const name = href.split('/').pop() || '';
    if (!name) continue;

    let size = 0;
    const sizeEl = resp.querySelector('getcontentlength');
    if (sizeEl) size = parseInt(sizeEl.textContent || '0', 10);

    let lastModified = '';
    const modEl = resp.querySelector('getlastmodified');
    if (modEl) lastModified = modEl.textContent?.trim() || '';

    files.push({ name, size, lastModified });
  }
  return files;
}

// ─── API ──────────────────────────────────────────

/** 测试 WebDAV 连接（PROPFIND depth=0） */
export async function testConnection(config: WebDAVConfig): Promise<{ ok: boolean; error?: string }> {
  try {
    const url = fullUrl(config);
    const res = await request(url, 'PROPFIND', { Authorization: authHeader(config), 'Depth': '0' });
    if (res.status === 207 || res.status < 300) return { ok: true };
    const detail = res.body ? res.body.slice(0, 200) : '';
    return { ok: false, error: `HTTP ${res.status}${detail ? ': ' + detail : ''}` };
  } catch (err) {
    return { ok: false, error: getErrorMessage(err) };
  }
}

/** 确保远程目录存在 — 递归创建多级目录 */
async function ensureDirectory(config: WebDAVConfig): Promise<void> {
  const base = config.url.replace(/\/+$/, '');
  const path = config.remotePath.replace(/^\/+|\/+$/g, '');
  const segments = path.split('/').filter(Boolean);
  let current = base;
  for (const seg of segments) {
    current += '/' + seg;
    const dirUrl = current + '/';
    const res = await request(dirUrl, 'MKCOL', { Authorization: authHeader(config) });
    if (res.status !== 201 && res.status !== 405 && res.status !== 301 && res.status !== 302 && res.status >= 300) {
      const detail = res.body ? res.body.slice(0, 200) : '';
      throw new WebDavError(`创建目录失败: HTTP ${res.status}${detail ? ': ' + detail : ''}`, ErrorCode.WEBDAV_CONNECTION_FAILED, res.status, res.body);
    }
  }
}

/** 列出远程备份文件（PROPFIND depth=1） */
export async function listBackups(config: WebDAVConfig): Promise<WebDAVFileInfo[]> {
  const url = fullUrl(config);
  const res = await request(url, 'PROPFIND', { Authorization: authHeader(config), 'Depth': '1' });

  if (res.status === 404) return [];
  if (res.status !== 207 && res.status >= 300) {
    const detail = res.body ? res.body.slice(0, 200) : '';
    throw new WebDavError(`列出备份失败: HTTP ${res.status}${detail ? ': ' + detail : ''}`, ErrorCode.WEBDAV_CONNECTION_FAILED, res.status, res.body);
  }
  return parsePropfindResponse(res.body);
}

/** 上传备份到 WebDAV */
export async function uploadBackup(config: WebDAVConfig, filename: string, data: Blob): Promise<void> {
  await ensureDirectory(config);
  const url = fullUrl(config, filename);
  const res = await request(url, 'PUT', { Authorization: authHeader(config), 'Content-Type': 'application/zip' }, data);
  if (res.status >= 300) {
    const detail = res.body ? res.body.slice(0, 200) : '';
    throw new WebDavError(`上传失败: HTTP ${res.status}${detail ? ': ' + detail : ''}`, ErrorCode.WEBDAV_CONNECTION_FAILED, res.status, res.body);
  }
}

/** 从 WebDAV 下载备份 */
export async function downloadBackup(config: WebDAVConfig, filename: string): Promise<Blob> {
  const url = fullUrl(config, filename);
  // 原生 Capacitor 或 Vite proxy 模式：通过 request 获取 base64 数据
  if (isNative() || isViteDev()) {
    const res = await request(url, 'GET', { Authorization: authHeader(config) });
    if (res.status >= 300) {
      const detail = res.body ? res.body.slice(0, 200) : '';
      throw new WebDavError(`下载失败: HTTP ${res.status}${detail ? ': ' + detail : ''}`, ErrorCode.WEBDAV_CONNECTION_FAILED, res.status, res.body);
    }
    // 将 base64 转为 Blob
    const byteStr = atob(res.body);
    const bytes = new Uint8Array(byteStr.length);
    for (let i = 0; i < byteStr.length; i++) bytes[i] = byteStr.charCodeAt(i);
    return new Blob([bytes], { type: 'application/zip' });
  }
  // fallback：直接 fetch
  const res = await fetch(url, { method: 'GET', headers: { Authorization: authHeader(config) } });
  if (!res.ok) throw new WebDavError(`下载失败: HTTP ${res.status}`, ErrorCode.WEBDAV_CONNECTION_FAILED, res.status);
  return res.blob();
}

/** 删除远程备份文件 */
export async function deleteBackup(config: WebDAVConfig, filename: string): Promise<void> {
  const url = fullUrl(config, filename);
  const res = await request(url, 'DELETE', { Authorization: authHeader(config) });
  if (res.status >= 300) {
    const detail = res.body ? res.body.slice(0, 200) : '';
    throw new WebDavError(`删除失败: HTTP ${res.status}${detail ? ': ' + detail : ''}`, ErrorCode.WEBDAV_CONNECTION_FAILED, res.status, res.body);
  }
}
