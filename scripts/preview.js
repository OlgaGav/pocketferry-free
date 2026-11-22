'use strict';
// Builds for localhost and serves dist/ the way GitHub Pages does
// (/faq -> faq.html, 404.html for the rest): npm run preview
const http = require('http');
const fs = require('fs');
const path = require('path');
const { build } = require('../build');

const DIST = path.join(__dirname, '..', 'dist');
const PORT = Number(process.env.PORT) || 8080;
build({ outDir: DIST, siteUrl: `http://localhost:${PORT}` });
const TYPES = {
  '.html': 'text/html; charset=utf-8', '.css': 'text/css; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.svg': 'image/svg+xml',
  '.png': 'image/png', '.webp': 'image/webp', '.ico': 'image/x-icon', '.woff2': 'font/woff2', '.txt': 'text/plain; charset=utf-8',
  '.xml': 'application/xml; charset=utf-8',
};

http.createServer((req, res) => {
  let p;
  try { p = decodeURIComponent(new URL(req.url, 'http://x').pathname); } catch { p = '/'; }
  const tries = [p, p + '.html', path.join(p, 'index.html')].map((t) => path.join(DIST, path.normalize(t)));
  const file = tries.find((f) => f.startsWith(DIST) && fs.existsSync(f) && fs.statSync(f).isFile());
  const status = file ? 200 : 404;
  const out = file || path.join(DIST, '404.html');
  res.writeHead(status, { 'Content-Type': TYPES[path.extname(out)] || 'application/octet-stream' });
  fs.createReadStream(out).pipe(res);
}).listen(PORT, () => console.log(`Previewing dist/ on http://localhost:${PORT}`));
