import http from 'node:http';
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { scan } from './src/scan.js';
import { MARKETS } from './src/markets.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PUBLIC = path.join(__dirname, 'public');
const PORT = Number(process.env.PORT || 4173);

const MIME = { '.html': 'text/html; charset=utf-8', '.css': 'text/css; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.svg': 'image/svg+xml', '.json': 'application/json; charset=utf-8', '.png': 'image/png', '.ico': 'image/x-icon' };

function json(res, code, data) {
  const body = JSON.stringify(data);
  res.writeHead(code, { 'content-type': 'application/json; charset=utf-8', 'content-length': Buffer.byteLength(body) });
  res.end(body);
}

async function serveStatic(res, urlPath) {
  const rel = urlPath === '/' ? 'index.html' : urlPath.replace(/^\/+/, '');
  const file = path.join(PUBLIC, rel);
  if (!file.startsWith(PUBLIC)) return json(res, 403, { error: 'forbidden' });
  try {
    const data = await fs.readFile(file);
    res.writeHead(200, { 'content-type': MIME[path.extname(file)] || 'application/octet-stream', 'cache-control': 'no-cache' });
    res.end(data);
  } catch {
    res.writeHead(404, { 'content-type': 'text/plain' });
    res.end('Not found');
  }
}

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, `http://${req.headers.host}`);

  if (url.pathname === '/api/markets') {
    return json(res, 200, Object.values(MARKETS).map((m) => ({ code: m.code, name: m.name, currency: m.currency })));
  }

  // Streaming scan: progress events then the final report.
  if (url.pathname === '/api/scan') {
    const target = url.searchParams.get('url');
    const market = url.searchParams.get('market') || undefined;
    const render = url.searchParams.get('render') !== '0';
    if (!target) return json(res, 400, { error: 'Missing url parameter' });

    res.writeHead(200, {
      'content-type': 'text/event-stream; charset=utf-8',
      'cache-control': 'no-cache',
      connection: 'keep-alive',
    });
    const send = (event, data) => res.write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`);
    const keepAlive = setInterval(() => res.write(': ping\n\n'), 15000);
    try {
      const report = await scan(target, { market, render, onProgress: (p) => send('progress', p) });
      send('report', report);
    } catch (err) {
      send('error', { error: String(err.message || err) });
    } finally {
      clearInterval(keepAlive);
      res.end();
    }
    return;
  }

  if (url.pathname.startsWith('/api/')) return json(res, 404, { error: 'unknown endpoint' });
  return serveStatic(res, url.pathname);
});

server.listen(PORT, () => {
  console.log(`Agent Visibility Tester running at http://localhost:${PORT}`);
});
