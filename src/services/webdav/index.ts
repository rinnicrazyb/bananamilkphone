/**
 * WebDAV 客户端 —— 用于远程备份同步
 *
 * 参考 RikkaHub WebDavClient.kt 实现：
 * - PROPFIND: 列出备份文件
 * - PUT: 上传备份
 * - GET: 下载备份
 * - DELETE: 删除备份
 * - MKCOL: 创建目录
 *
 * 基于 HTTP 基础认证 + fetch API。
 */

import type { WebDAVConfig } from '../../apps/settings/types';

/** WebDAV 远程文件信息 */
export interface WebDAVFileInfo {
  name: string;
  size: number;
  lastModified: string;
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
  
  // 简单 XML 解析：提取 response 块
  const responseRegex = /<d:response>([\s\S]*?)<\/d:response>/gi;
  let match;
  
  while ((match = responseRegex.exec(xmlText)) !== null) {
    const block = match[1];
    
    // 提取 href
    const hrefMatch = block.match(/<d:href>([^<]+)<\/d:href>/i);
    if (!hrefMatch) continue;
    const href = decodeURIComponent(hrefMatch[1].trim());
    
    // 过滤掉目录本身和父目录
    if (href.endsWith('/')) continue;
    
    // 提取文件名
    const name = href.split('/').pop() || '';
    if (!name) continue;
    
    // 提取大小
    let size = 0;
    const sizeMatch = block.match(/<d:getcontentlength[^>]*>(\d+)<\/d:getcontentlength>/i);
    if (sizeMatch) size = parseInt(sizeMatch[1], 10);
    
    // 提取修改时间
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
    const res = await fetch(url, {
      method: 'PROPFIND',
      headers: {
        'Authorization': authHeader(config),
        'Depth': '0',
      },
    });
    if (res.ok || res.status === 207) {
      return { ok: true };
    }
    return { ok: false, error: `HTTP ${res.status}: ${res.statusText}` };
  } catch (err) {
    return { ok: false, error: (err as Error).message };
  }
}

/** 确保远程目录存在（MKCOL） */
async function ensureDirectory(config: WebDAVConfig): Promise<void> {
  const url = fullUrl(config);
  const res = await fetch(url, {
    method: 'MKCOL',
    headers: { 'Authorization': authHeader(config) },
  });
  // 405 = 已存在, 201 = 创建成功, 其他错误
  if (res.status !== 201 && res.status !== 405 && !res.ok) {
    throw new Error(`创建远程目录失败: HTTP ${res.status}`);
  }
}

/** 列出远程备份文件（PROPFIND depth=1） */
export async function listBackups(config: WebDAVConfig): Promise<WebDAVFileInfo[]> {
  const url = fullUrl(config);
  const res = await fetch(url, {
    method: 'PROPFIND',
    headers: {
      'Authorization': authHeader(config),
      'Depth': '1',
    },
  });
  
  if (res.status === 404) {
    return []; // 目录不存在，无备份
  }
  if (!res.ok && res.status !== 207) {
    throw new Error(`列出备份失败: HTTP ${res.status}`);
  }
  
  const xmlText = await res.text();
  return parsePropfindResponse(xmlText);
}

/** 上传备份到 WebDAV */
export async function uploadBackup(
  config: WebDAVConfig,
  filename: string,
  data: Blob
): Promise<void> {
  await ensureDirectory(config);
  const url = fullUrl(config, filename);
  const res = await fetch(url, {
    method: 'PUT',
    headers: {
      'Authorization': authHeader(config),
      'Content-Type': 'application/zip',
    },
    body: data,
  });
  
  if (!res.ok) {
    throw new Error(`上传失败: HTTP ${res.status}`);
  }
}

/** 从 WebDAV 下载备份 */
export async function downloadBackup(
  config: WebDAVConfig,
  filename: string
): Promise<Blob> {
  const url = fullUrl(config, filename);
  const res = await fetch(url, {
    method: 'GET',
    headers: { 'Authorization': authHeader(config) },
  });
  
  if (!res.ok) {
    throw new Error(`下载失败: HTTP ${res.status}`);
  }
  return res.blob();
}

/** 删除远程备份文件 */
export async function deleteBackup(
  config: WebDAVConfig,
  filename: string
): Promise<void> {
  const url = fullUrl(config, filename);
  const res = await fetch(url, {
    method: 'DELETE',
    headers: { 'Authorization': authHeader(config) },
  });
  
  if (!res.ok) {
    throw new Error(`删除失败: HTTP ${res.status}`);
  }
}
