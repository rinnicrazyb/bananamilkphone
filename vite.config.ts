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
  ],
  test: {
    environment: 'node',
    include: ['src/**/*.test.ts'],
  },
})
