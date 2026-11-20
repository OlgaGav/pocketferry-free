'use strict';
/*
 * PocketFerry website: public pages, download counter and admin statistics.
 * No runtime dependencies. Requires Node.js 22.13 or newer (built-in SQLite).
 */
const http = require('http');
const fs = require('fs');
const path = require('path');
const zlib = require('zlib');
const crypto = require('crypto');

const config = require('./lib/config');
const analytics = require('./lib/analytics');
const { render } = require('./lib/layout');
const pages = require('./lib/pages');
const admin = require('./lib/admin');

const PUBLIC = path.join(config.root, 'public');
const TYPES = {
  '.css': 'text/css; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.svg': 'image/svg+xml',
  '.png': 'image/png', '.webp': 'image/webp', '.ico': 'image/x-icon', '.woff2': 'font/woff2', '.txt': 'text/plain; charset=utf-8',
};

function createApp(overrides = {}) {
  Object.assign(config, overrides);
  const stats = analytics.open(config.dataDir, config.timezone);

  // ---------- static files, fingerprinted so they can be cached for a year ----------
  const files = new Map();
  (function walk(dir, prefix) {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) walk(full, prefix + entry.name + '/');
      else {
        const data = fs.readFileSync(full);
        const type = TYPES[path.extname(entry.name)] || 'application/octet-stream';
        files.set(prefix + entry.name, {
          data, type,
          hash: crypto.createHash('sha256').update(data).digest('hex').slice(0, 10),
        });
      }
    }
  })(PUBLIC, '');
  const asset = (file) => `/assets/${file}?v=${files.get(file) ? files.get(file).hash : '0'}`;

  // ---------- helpers ----------
  const builders = new Map(pages.builders.map((b) => [b({ base: '', asset }).path, b]));
  const cache = new Map();

  const hostOf = (req) => {
    const h = String(req.headers.host || '');
    return /^[a-z0-9.-]+(:\d+)?$/i.test(h) ? h.toLowerCase() : 'localhost';
  };
  const isHttps = (req) => config.siteUrl.startsWith('https://')
    || (config.trustProxy > 0 && String(req.headers['x-forwarded-proto'] || '').split(',')[0].trim() === 'https');
  const baseOf = (req) => config.siteUrl || `${isHttps(req) ? 'https' : 'http'}://${hostOf(req)}`;
  const ipOf = (req) => {
    const direct = req.socket.remoteAddress || '';
    if (!config.trustProxy) return direct;
    const list = String(req.headers['x-forwarded-for'] || '').split(',').map((s) => s.trim()).filter(Boolean);
    return list[list.length - config.trustProxy] || list[0] || direct;
  };

  function send(req, res, status, body, headers = {}) {
    const h = {
      'X-Content-Type-Options': 'nosniff',
      'Referrer-Policy': 'strict-origin-when-cross-origin',
      'X-Frame-Options': 'DENY',
      'Content-Security-Policy': "default-src 'self'; img-src 'self' data:; style-src 'self'; script-src 'self'; base-uri 'none'; frame-ancestors 'none'; form-action 'self'",
      ...headers,
    };
    if (isHttps(req)) h['Strict-Transport-Security'] = 'max-age=31536000';
    let out = Buffer.isBuffer(body) ? body : Buffer.from(body || '');
    if (out.length > 800 && /text|json|xml|javascript/.test(h['Content-Type'] || '') && /\bgzip\b/.test(req.headers['accept-encoding'] || '')) {
      out = zlib.gzipSync(out);
      h['Content-Encoding'] = 'gzip';
      h.Vary = 'Accept-Encoding';
    }
    h['Content-Length'] = out.length;
    res.writeHead(status, h);
    res.end(req.method === 'HEAD' ? undefined : out);
  }
  const html = (req, res, status, body, headers = {}) =>
    send(req, res, status, body, { 'Content-Type': 'text/html; charset=utf-8', ...headers });
  const redirect = (req, res, status, to, headers = {}) => send(req, res, status, '', { Location: to, ...headers });

  function pageHtml(base, pathname) {
    const key = base + '|' + pathname;
    if (!cache.has(key)) {
      const ctx = { base, asset };
      const build = builders.get(pathname);
      cache.set(key, render(build ? build(ctx) : pages.notFound(), ctx));
      if (cache.size > 200) cache.delete(cache.keys().next().value);
    }
    return cache.get(key);
  }

  // ---------- statistics ----------
  function track(req, url, type, extra = {}) {
    try {
      if (req.method !== 'GET') return;
      if (/prefetch|prerender/i.test(String(req.headers['sec-purpose'] || req.headers.purpose || ''))) return;
      const ua = String(req.headers['user-agent'] || '');
      const bot = analytics.findBot(ua);
      if (bot) return stats.recordBot(bot, url.pathname);
      stats.record({
        type,
        path: url.pathname,
        ip: ipOf(req),
        ua,
        referrer: String(req.headers.referer || ''),
        utmSource: url.searchParams.get('utm_source') || url.searchParams.get('ref') || '',
        utmMedium: url.searchParams.get('utm_medium') || '',
        utmCampaign: url.searchParams.get('utm_campaign') || '',
        ownHost: hostOf(req),
        lang: String(req.headers['accept-language'] || '').split(',')[0].split(';')[0],
        country: req.headers['cf-ipcountry'] || req.headers['x-vercel-ip-country'] || req.headers['x-country-code'] || '',
        ...extra,
      });
    } catch (e) {
      console.error('stats:', e.message); // statistics must never break a page
    }
  }

  // ---------- admin sign-in ----------
  const secret = () => {
    let s = config.sessionSecret || stats.getMeta('secret');
    if (!s) {
      s = crypto.randomBytes(32).toString('hex');
      stats.setMeta('secret', s);
    }
    return s + '|' + config.adminPassword; // changing the password signs everyone out
  };
  const sign = (exp) => crypto.createHmac('sha256', secret()).update(String(exp)).digest('hex');
  const safeEqual = (a, b) => {
    const x = crypto.createHash('sha256').update(String(a)).digest();
    const y = crypto.createHash('sha256').update(String(b)).digest();
    return crypto.timingSafeEqual(x, y);
  };
  const adminReady = () => config.adminPassword.length >= 10;
  function signedIn(req) {
    const m = /(?:^|;\s*)pd_admin=(\d+)\.([a-f0-9]{64})/.exec(String(req.headers.cookie || ''));
    return !!m && Number(m[1]) > Date.now() && safeEqual(m[2], sign(m[1]));
  }
  const cookie = (req, value, maxAge) =>
    `pd_admin=${value}; Path=/admin; HttpOnly; SameSite=Strict; Max-Age=${maxAge}${isHttps(req) ? '; Secure' : ''}`;
  const sameOrigin = (req) => {
    const o = req.headers.origin;
    if (!o) return true;
    try { return new URL(o).host.toLowerCase() === hostOf(req); } catch { return false; }
  };
  const attempts = new Map(); // ip -> { n, until }
  const readForm = (req) => new Promise((resolve) => {
    let body = '';
    req.on('data', (c) => { body += c; if (body.length > 4096) req.destroy(); });
    req.on('end', () => resolve(new URLSearchParams(body)));
    req.on('error', () => resolve(new URLSearchParams()));
  });
  const PRIVATE = { 'Cache-Control': 'no-store', 'X-Robots-Tag': 'noindex, nofollow' };

  async function handleAdmin(req, res, url) {
    const p = url.pathname;
    if (!adminReady()) return html(req, res, 503, admin.loginPage(asset, { setup: true }), PRIVATE);

    if (req.method === 'POST') {
      if (!sameOrigin(req)) return html(req, res, 403, admin.loginPage(asset, { error: 'Request refused.' }), PRIVATE);
      if (p === '/admin/logout') return redirect(req, res, 303, '/admin', { ...PRIVATE, 'Set-Cookie': cookie(req, 'x', 0) });
      if (p === '/admin/login') {
        const ip = ipOf(req);
        const a = attempts.get(ip) || { n: 0, until: 0 };
        if (a.until > Date.now()) {
          req.resume();
          return html(req, res, 429, admin.loginPage(asset, { error: 'Too many attempts. Try again in 15 minutes.' }), PRIVATE);
        }
        const form = await readForm(req);
        if (safeEqual(form.get('password') || '', config.adminPassword)) {
          attempts.delete(ip);
          const exp = Date.now() + 7 * 864e5;
          return redirect(req, res, 303, '/admin', { ...PRIVATE, 'Set-Cookie': cookie(req, `${exp}.${sign(exp)}`, 7 * 86400) });
        }
        a.n += 1;
        if (a.n >= 8) { a.n = 0; a.until = Date.now() + 15 * 60000; }
        attempts.set(ip, a);
        if (attempts.size > 5000) attempts.clear();
        return html(req, res, 401, admin.loginPage(asset, { error: 'That password is not correct.' }), PRIVATE);
      }
      return html(req, res, 404, admin.loginPage(asset), PRIVATE);
    }

    if (!signedIn(req)) return html(req, res, p === '/admin' ? 200 : 401, admin.loginPage(asset), PRIVATE);
    const days = [7, 30, 90, 365].includes(Number(url.searchParams.get('days'))) ? Number(url.searchParams.get('days')) : 30;
    const report = stats.report(days);
    if (p === '/admin/export.csv') {
      return send(req, res, 200, admin.csv(report), {
        ...PRIVATE, 'Content-Type': 'text/csv; charset=utf-8',
        'Content-Disposition': `attachment; filename="pocketferry-stats-${report.from}-to-${report.to}.csv"`,
      });
    }
    if (p === '/admin') return html(req, res, 200, admin.dashboard(report, asset), PRIVATE);
    return redirect(req, res, 302, '/admin', PRIVATE);
  }

  // ---------- text files for crawlers ----------
  const AI_AGENTS = ['GPTBot', 'OAI-SearchBot', 'ChatGPT-User', 'ClaudeBot', 'Claude-SearchBot', 'Claude-User', 'PerplexityBot',
    'Perplexity-User', 'Google-Extended', 'Applebot-Extended', 'Amazonbot', 'meta-externalagent', 'DuckAssistBot', 'MistralAI-User', 'CCBot'];
  const robots = (base) => [
    '# Everyone is welcome, including AI assistants and AI search.',
    'User-agent: *',
    ...AI_AGENTS.map((a) => `User-agent: ${a}`),
    'Allow: /',
    'Disallow: /admin',
    'Disallow: /download/',
    '',
    `Sitemap: ${base}/sitemap.xml`,
    '',
  ].join('\n');
  const sitemap = (base) => `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${[...builders.keys()].map((p) => `  <url><loc>${base}${p === '/' ? '/' : p}</loc><lastmod>${config.updated}</lastmod></url>`).join('\n')}
</urlset>
`;

  // ---------- router ----------
  async function route(req, res) {
    if (!['GET', 'HEAD', 'POST'].includes(req.method)) return send(req, res, 405, 'Method not allowed', { Allow: 'GET, HEAD, POST' });
    let url;
    try { url = new URL(req.url, 'http://x'); } catch { return send(req, res, 400, 'Bad request'); }
    let p;
    try { p = decodeURIComponent(url.pathname); } catch { return send(req, res, 400, 'Bad request'); }
    const base = baseOf(req);

    if (p === '/admin' || p.startsWith('/admin/')) return handleAdmin(req, res, url);
    if (req.method === 'POST') return send(req, res, 405, 'Method not allowed', { Allow: 'GET, HEAD' });

    if (p.startsWith('/assets/') || p === '/favicon.ico') {
      const name = p === '/favicon.ico' ? 'img/favicon.ico' : p.slice(8);
      const f = files.get(name);
      if (!f) return send(req, res, 404, 'Not found', { 'Content-Type': 'text/plain; charset=utf-8' });
      const fresh = url.searchParams.get('v') === f.hash || name.startsWith('fonts/');
      const etag = `"${f.hash}"`;
      const h = { 'Content-Type': f.type, ETag: etag, 'Cache-Control': fresh ? 'public, max-age=31536000, immutable' : 'public, max-age=3600' };
      if (req.headers['if-none-match'] === etag) return send(req, res, 304, '', h);
      if (name.startsWith('fonts/')) h['Access-Control-Allow-Origin'] = '*';
      return send(req, res, 200, f.data, h);
    }

    if (p === '/healthz') return send(req, res, 200, 'ok', { 'Content-Type': 'text/plain; charset=utf-8', 'Cache-Control': 'no-store' });
    const text = { 'Content-Type': 'text/plain; charset=utf-8', 'Cache-Control': 'public, max-age=3600' };
    if (p === '/robots.txt') return send(req, res, 200, robots(base), text);
    if (p === '/llms.txt') { track(req, url, 'file'); return send(req, res, 200, pages.llmsTxt(base), { ...text, 'Content-Type': 'text/markdown; charset=utf-8' }); }
    if (p === '/sitemap.xml') return send(req, res, 200, sitemap(base), { ...text, 'Content-Type': 'application/xml; charset=utf-8' });

    // Counted download links: /download/mac, /download/windows, /download/linux
    const dl = /^\/download\/([a-z]+)$/.exec(p);
    if (dl && config.downloads[dl[1]]) {
      const d = config.downloads[dl[1]];
      const h = { 'Cache-Control': 'no-store', 'X-Robots-Tag': 'noindex' };
      if (!d.url) return redirect(req, res, 302, '/download', h);
      let from = '(direct link)';
      try {
        const r = new URL(String(req.headers.referer || ''));
        if (r.host.toLowerCase() === hostOf(req)) from = r.pathname;
      } catch { /* no referrer */ }
      track(req, url, 'download', { platform: d.label, path: from });
      return redirect(req, res, 302, d.url, h);
    }

    if (p.length > 1 && p.endsWith('/')) return redirect(req, res, 301, p.replace(/\/+$/, '') + url.search);
    if (p !== p.toLowerCase() && builders.has(p.toLowerCase())) return redirect(req, res, 301, p.toLowerCase() + url.search);

    if (builders.has(p)) {
      track(req, url, 'view');
      return html(req, res, 200, pageHtml(base, p), { 'Cache-Control': 'public, max-age=300' });
    }
    try { if (req.method === 'GET') stats.recordNotFound(p); } catch { /* ignore */ }
    return html(req, res, 404, pageHtml(base, '/404'), { 'Cache-Control': 'no-store' });
  }

  const server = http.createServer((req, res) => {
    route(req, res).catch((e) => {
      console.error(e);
      if (!res.headersSent) res.writeHead(500, { 'Content-Type': 'text/plain; charset=utf-8' });
      res.end('Something went wrong.');
    });
  });
  server.on('close', () => stats.close());
  return { server, stats };
}

if (require.main === module) {
  const { server } = createApp();
  server.listen(config.port, () => {
    console.log(`PocketFerry site running on http://localhost:${config.port}`);
    if (!config.siteUrl) console.log('Note: SITE_URL is not set. Set it to your public address (https://…) before going live.');
    if (config.adminPassword.length < 10) console.log('Note: ADMIN_PASSWORD is not set (10+ characters). The /admin page is switched off.');
  });
  for (const sig of ['SIGINT', 'SIGTERM']) process.on(sig, () => server.close(() => process.exit(0)));
}

module.exports = { createApp };
