// Small local-only static server for chart browser regression tests.
import http from 'node:http';
import fs from 'node:fs/promises';
import path from 'node:path';
const root = process.cwd();
const types = { '.html': 'text/html', '.mjs': 'text/javascript', '.js': 'text/javascript', '.css': 'text/css', '.png': 'image/png', '.svg': 'image/svg+xml', '.json': 'application/json' };
const headers = {
  'Access-Control-Allow-Origin': '*',
  'Cache-Control': 'no-store',
  'Referrer-Policy': 'strict-origin-when-cross-origin',
};
http.createServer(async (req, res) => {
  try {
    const pathname = decodeURIComponent(new URL(req.url, 'http://localhost').pathname);
    // Cloudflare serves index.html for navigation routes and sends permissive
    // CORS on /assets/*; the sandboxed admin preview needs both.
    const requested = pathname === '/' ? '/index.html' : pathname;
    const file = path.resolve(root, '.' + requested);
    if (!file.startsWith(root + path.sep)) { res.writeHead(403).end(); return; }
    let data = await fs.readFile(file);
    let contentType = types[path.extname(file)] || 'application/octet-stream';
    if (!path.extname(file) && pathname !== '/') {
      data = await fs.readFile(path.join(root, 'index.html'));
      contentType = 'text/html';
    }
    res.writeHead(200, { ...headers, 'Content-Type': contentType });
    res.end(data);
  } catch { res.writeHead(404, headers).end(); }
}).listen(Number(process.argv[2]) || 4181, '127.0.0.1', () => console.log('Chart test server ready'));
