/// <reference types="vitest" />
import { defineConfig } from 'vitest/config'
import react from '@vitejs/plugin-react'
import http from 'http';
import https from 'https';
import { URL } from 'url';

export default defineConfig({
  plugins: [
    react(),
    {
      name: 'mcp-cors-proxy',
      configureServer(server) {
        server.middlewares.use('/mcp-proxy', (req, res) => {
          const setCORS = () => {
            res.setHeader('Access-Control-Allow-Origin', '*');
            res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
            res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
          };

          if (req.method === 'OPTIONS') { setCORS(); res.writeHead(204); res.end(); return; }
          if (req.method !== 'POST') { setCORS(); res.writeHead(405); res.end('Method Not Allowed'); return; }

          let body = '';
          req.on('data', (chunk: Buffer) => { body += chunk.toString(); });
          req.on('end', () => {
            setCORS();
            let parsed: { target?: string; headers?: Record<string, string>; body?: string };
            try { parsed = JSON.parse(body); } catch {
              res.writeHead(400, { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' });
              res.end(JSON.stringify({ error: 'Invalid JSON' })); return;
            }

            const { target, headers, body: requestBody } = parsed;
            if (!target) {
              res.writeHead(400, { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' });
              res.end(JSON.stringify({ error: 'Missing target' })); return;
            }

            let targetUrl: URL;
            try { targetUrl = new URL(target); } catch {
              res.writeHead(400, { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' });
              res.end(JSON.stringify({ error: 'Invalid target URL' })); return;
            }

            const transport = targetUrl.protocol === 'https:' ? https : http;
            const reqHeaders: Record<string, string> = { 'Content-Type': 'application/json', ...headers };
            const port = parseInt(targetUrl.port) || (targetUrl.protocol === 'https:' ? 443 : 80);

            const proxyReq = transport.request(
              { hostname: targetUrl.hostname, port, path: targetUrl.pathname + targetUrl.search, method: 'POST', headers: reqHeaders, timeout: 30000 },
              (proxyRes) => {
                let data = '';
                proxyRes.on('data', (chunk: Buffer) => { data += chunk.toString(); });
                proxyRes.on('end', () => {
                  // 透传原始 Content-Type，让 SDK 正确识别 JSON vs SSE
                  const ct = proxyRes.headers['content-type'] || 'application/json';
                  res.writeHead(proxyRes.statusCode ?? 502, { 'Content-Type': ct as string, 'Access-Control-Allow-Origin': '*' });
                  res.end(data);
                });
              }
            );

            proxyReq.setTimeout(30000, () => { proxyReq.destroy(new Error('连接超时')); });
            proxyReq.on('error', (err: any) => {
              console.error('[MCP Proxy] 请求失败:', { target, message: err.message, code: err.code });
              res.writeHead(502, { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' });
              res.end(JSON.stringify({ error: `目标服务器不可达: ${err.message}`, code: 'PROXY_ERROR' }));
            });

            if (requestBody) proxyReq.write(requestBody);
            proxyReq.end();
          });
        });
      },
    },
    // WebDAV CORS 代理 — 转发所有 HTTP 方法（PROPFIND/MKCOL/PUT/GET/DELETE）
    {
      name: 'webdav-cors-proxy',
      configureServer(server) {
        server.middlewares.use('/webdav-proxy', (req, res) => {
          // CORS 头
          res.setHeader('Access-Control-Allow-Origin', '*');
          res.setHeader('Access-Control-Allow-Methods', 'PROPFIND, MKCOL, PUT, GET, DELETE, POST, OPTIONS');
          res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization, Depth, Destination');

          if (req.method === 'OPTIONS') { res.writeHead(204); res.end(); return; }

          // 从 query 参数读取目标 URL 和方法
          const urlParam = new URL(req.url ?? '', `http://${req.headers.host}`).searchParams;
          const target = urlParam.get('target');
          const method = urlParam.get('method') || req.method;
          if (!target) {
            res.writeHead(400, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ error: 'Missing target parameter' }));
            return;
          }

          let targetUrl: URL;
          try { targetUrl = new URL(target); } catch {
            res.writeHead(400, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ error: 'Invalid target URL' }));
            return;
          }

          const transport = targetUrl.protocol === 'https:' ? https : http;

          const port = parseInt(targetUrl.port) || (targetUrl.protocol === 'https:' ? 443 : 80);
          const bodyChunks: Buffer[] = [];

          req.on('data', (chunk: Buffer) => bodyChunks.push(chunk));
          req.on('end', () => {
            const body = Buffer.concat(bodyChunks);

            // 从 JSON body 中解析出 headers 和 body 数据
            let parsedBody: { headers?: Record<string, string>; body?: string } = {};
            try { parsedBody = JSON.parse(body.toString()); } catch { /* 无 body 或非 JSON */ }

            // 构建请求头：优先从 body 中取，其次从 POST 请求头中取
            const reqHeaders: Record<string, string> = { ...(parsedBody.headers || {}) };
            const excludeHeaders = ['host', 'connection', 'content-length', 'content-type'];
            for (const [k, v] of Object.entries(req.headers)) {
              if (k && v && !excludeHeaders.includes(k.toLowerCase()) && !reqHeaders[k]) {
                reqHeaders[k] = Array.isArray(v) ? v[0] : v;
              }
            }

            // 如果 body 是 base64 编码的二进制数据，解码
            let requestBody: Buffer | undefined;
            const isBase64Body = parsedBody.body && (reqHeaders['X-Body-Base64'] === '1' || parsedBody.headers?.['X-Body-Base64'] === '1');
            if (isBase64Body && parsedBody.body) {
              requestBody = Buffer.from(parsedBody.body, 'base64');
            }

            const proxyReq = transport.request(
              { hostname: targetUrl.hostname, port, path: targetUrl.pathname + targetUrl.search, method, headers: reqHeaders, timeout: 30000 },
              (proxyRes) => {
                const chunks: Buffer[] = [];
                proxyRes.on('data', (chunk: Buffer) => chunks.push(chunk));
                proxyRes.on('end', () => {
                  const responseBody = Buffer.concat(chunks);
                  // 统一返回 JSON 信封，WebDAV 客户端 request() 期望此格式
                  res.setHeader('Content-Type', 'application/json');
                  res.setHeader('Access-Control-Allow-Origin', '*');
                  res.writeHead(200);
                  res.end(JSON.stringify({
                    status: proxyRes.statusCode,
                    statusText: proxyRes.statusMessage,
                    headers: proxyRes.headers,
                    body: responseBody.toString('base64'),
                    bodyText: responseBody.length < 1024 * 100 ? responseBody.toString('utf-8') : undefined,
                  }));
                });
              }
            );

            proxyReq.setTimeout(60000, () => { proxyReq.destroy(new Error('连接超时')); });
            proxyReq.on('error', (err: any) => {
              console.error('[WebDAV Proxy] 请求失败:', { target, method, message: err.message });
              res.writeHead(200, { 'Content-Type': 'application/json' });
              res.end(JSON.stringify({ error: `请求失败: ${err.message}` }));
            });

            if (requestBody && requestBody.length > 0) proxyReq.write(requestBody);
            proxyReq.end();
          });
        });
      },
    },
  ],
  test: {
    environment: 'node',
    include: ['src/**/*.test.ts'],
  },
})
