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
                  res.writeHead(proxyRes.statusCode ?? 502, { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' });
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
          // 收集请求头，排除 host/connection 等
          const reqHeaders: Record<string, string> = {};
          const excludeHeaders = ['host', 'connection', 'content-length'];
          for (const [k, v] of Object.entries(req.headers)) {
            if (k && v && !excludeHeaders.includes(k.toLowerCase())) {
              reqHeaders[k] = Array.isArray(v) ? v[0] : v;
            }
          }

          const port = parseInt(targetUrl.port) || (targetUrl.protocol === 'https:' ? 443 : 80);
          const bodyChunks: Buffer[] = [];

          req.on('data', (chunk: Buffer) => bodyChunks.push(chunk));
          req.on('end', () => {
            const body = Buffer.concat(bodyChunks);
            const proxyReq = transport.request(
              { hostname: targetUrl.hostname, port, path: targetUrl.pathname + targetUrl.search, method, headers: reqHeaders, timeout: 30000 },
              (proxyRes) => {
                const chunks: Buffer[] = [];
                proxyRes.on('data', (chunk: Buffer) => chunks.push(chunk));
                proxyRes.on('end', () => {
                  const responseBody = Buffer.concat(chunks);
                  // 返回 JSON：包含状态码、头、base64 编码的响应体
                  res.setHeader('Content-Type', 'application/json');
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

            if (body.length > 0) proxyReq.write(body);
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
