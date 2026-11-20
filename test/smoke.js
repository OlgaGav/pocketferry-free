'use strict';
// End-to-end checks against a real server with a temporary database: npm test
const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const http = require('http');
const { createApp } = require('../server');
const { findBot, findSource } = require('../lib/analytics');

const CHROME = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/140.0.0.0 Safari/537.36';
const ANDROID = 'Mozilla/5.0 (Linux; Android 15; Pixel 9) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/140.0.0.0 Mobile Safari/537.36';

(async () => {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'pdsite-'));
  const { server, stats } = createApp({
    dataDir: tmp, siteUrl: 'https://example.test', adminPassword: 'correct-horse-battery', sessionSecret: 'test', trustProxy: 1,
  });
  require('../lib/config').downloads.mac.url = 'https://files.example.test/PocketFerry.dmg';
  await new Promise((r) => server.listen(0, '127.0.0.1', r));
  const port = server.address().port;

  // fetch() cannot set Host/Referer freely, so use http directly.
  const get = (p, headers = {}, method = 'GET', body) => new Promise((resolve, reject) => {
    const req = http.request({ host: '127.0.0.1', port, path: p, method, headers: { 'User-Agent': CHROME, Host: 'example.test', ...headers } }, (res) => {
      let data = '';
      res.setEncoding('utf8');
      res.on('data', (c) => { data += c; });
      res.on('end', () => resolve({ status: res.statusCode, headers: res.headers, body: data }));
    });
    req.on('error', reject);
    req.end(body);
  });

  const results = [];
  const check = async (name, fn) => {
    try { await fn(); results.push(`ok   ${name}`); }
    catch (e) { results.push(`FAIL ${name}\n     ${e.message}`); process.exitCode = 1; }
  };

  const paths = ['/', '/download', '/android-to-mac', '/android-to-windows', '/computer-to-android', '/compare', '/faq', '/troubleshooting', '/privacy'];

  await check('every page: 200, one h1, title <= 60, description 70-160, canonical, valid JSON-LD', async () => {
    const titles = new Set();
    for (const p of paths) {
      const r = await get(p, { 'X-Forwarded-For': '10.9.9.9' });
      assert.strictEqual(r.status, 200, p);
      assert.strictEqual((r.body.match(/<h1[ >]/g) || []).length, 1, `${p} h1 count`);
      const title = /<title>(.*?)<\/title>/.exec(r.body)[1].replace(/&amp;/g, '&');
      assert.ok(title.length <= 60, `${p} title is ${title.length} chars`);
      assert.ok(!titles.has(title), `${p} duplicate title`);
      titles.add(title);
      const desc = /<meta name="description" content="(.*?)">/.exec(r.body)[1];
      assert.ok(desc.length >= 70 && desc.length <= 160, `${p} description is ${desc.length} chars`);
      assert.ok(r.body.includes(`<link rel="canonical" href="https://example.test${p === '/' ? '/' : p}">`), `${p} canonical`);
      for (const m of r.body.matchAll(/<script type="application\/ld\+json">(.*?)<\/script>/gs)) JSON.parse(m[1]);
      for (const m of r.body.matchAll(/<img [^>]*>/g)) assert.ok(/alt="[^"]+"/.test(m[0]) && /width=/.test(m[0]), `${p} image alt/size`);
      for (const m of r.body.matchAll(/href="(\/[a-z-]*)(#[a-z]+)?"/g)) {
        assert.ok(paths.includes(m[1]) || m[1] === '/favicon', `${p} links to unknown page ${m[1]}`);
      }
    }
  });

  await check('home has SoftwareApplication (free), HowTo and FAQ structured data', async () => {
    const r = await get('/', { 'X-Forwarded-For': '10.9.9.9' });
    const types = [...r.body.matchAll(/<script type="application\/ld\+json">(.*?)<\/script>/gs)].map((m) => JSON.parse(m[1]));
    const app = types.find((t) => t['@type'] === 'SoftwareApplication');
    assert.strictEqual(app.offers.price, '0');
    assert.ok(types.some((t) => t['@type'] === 'HowTo') && types.some((t) => t['@type'] === 'FAQPage'));
    assert.ok(!JSON.stringify(types).includes('aggregateRating'), 'no invented ratings');
  });

  await check('robots.txt, sitemap.xml and llms.txt', async () => {
    const robots = (await get('/robots.txt')).body;
    assert.ok(robots.includes('Sitemap: https://example.test/sitemap.xml') && robots.includes('Disallow: /admin') && robots.includes('User-agent: GPTBot'));
    const map = (await get('/sitemap.xml')).body;
    for (const p of paths) assert.ok(map.includes(`<loc>https://example.test${p === '/' ? '/' : p}</loc>`), p);
    assert.ok(!map.includes('admin'));
    const llms = await get('/llms.txt');
    assert.ok(llms.body.startsWith('# PocketFerry') && llms.body.includes('Price: free'));
  });

  await check('404 status for unknown pages; trailing slash redirects', async () => {
    assert.strictEqual((await get('/nope')).status, 404);
    const r = await get('/faq/');
    assert.strictEqual(r.status, 301);
    assert.strictEqual(r.headers.location, '/faq');
  });

  await check('security headers and compression', async () => {
    const r = await get('/', { 'Accept-Encoding': 'gzip', 'User-Agent': 'curl/8' });
    assert.ok(r.headers['content-security-policy'].includes("script-src 'self'"));
    assert.strictEqual(r.headers['content-encoding'], 'gzip');
    assert.strictEqual(r.headers['x-content-type-options'], 'nosniff');
  });

  await check('assets are fingerprinted and cached for a year', async () => {
    const home = (await get('/', { 'User-Agent': 'curl/8' })).body;
    const css = /href="(\/assets\/site\.css\?v=[a-f0-9]+)"/.exec(home)[1];
    const r = await get(css);
    assert.strictEqual(r.status, 200);
    assert.ok(r.headers['cache-control'].includes('immutable'));
    assert.strictEqual((await get('/assets/../server.js')).status, 404);
  });

  // ---- statistics ----
  await check('visitors, sources, downloads and bots are counted correctly', async () => {
    // Visitor A: from ChatGPT, views 2 pages, downloads for Mac.
    const a = { 'X-Forwarded-For': '10.0.0.1' };
    await get('/?utm_source=chatgpt.com', a);
    await get('/android-to-mac', { ...a, Referer: 'https://example.test/' });
    const d = await get('/download/mac', { ...a, Referer: 'https://example.test/android-to-mac' });
    assert.strictEqual(d.status, 302);
    assert.strictEqual(d.headers.location, 'https://files.example.test/PocketFerry.dmg');
    // Visitor B: from Google on an Android phone, one page.
    await get('/android-to-windows', { 'X-Forwarded-For': '10.0.0.2', 'User-Agent': ANDROID, Referer: 'https://www.google.com/' });
    // Visitor C: campaign link.
    await get('/?utm_source=newsletter&utm_medium=email&utm_campaign=launch', { 'X-Forwarded-For': '10.0.0.3' });
    // Bots: not visitors.
    await get('/', { 'User-Agent': 'Mozilla/5.0 AppleWebKit/537.36 (KHTML, like Gecko; compatible; GPTBot/1.2; +https://openai.com/gptbot)' });
    await get('/faq', { 'User-Agent': 'Mozilla/5.0 (compatible; Googlebot/2.1; +http://www.google.com/bot.html)' });
    await get('/download/mac', { 'User-Agent': 'Mozilla/5.0 (compatible; bingbot/2.0)' });
    // Prefetch: ignored. Unconfigured platform: back to the download page.
    await get('/', { 'X-Forwarded-For': '10.0.0.4', 'Sec-Purpose': 'prefetch' });
    assert.strictEqual((await get('/download/windows', a)).headers.location, '/download');

    const r = stats.report(7);
    // 9 page checks above came from one address (10.9.9.9) = 1 visitor, plus A, B, C.
    assert.strictEqual(r.now.visitors, 4, 'visitors');
    assert.strictEqual(r.now.downloads, 1, 'downloads');
    assert.strictEqual(r.now.aiVisitors, 1, 'AI visitors');
    assert.strictEqual(r.now.aiCrawlerHits, 1, 'AI crawler hits');
    const src = (name) => r.sources.find((s) => s.source === name);
    assert.deepStrictEqual([src('ChatGPT').visitors, src('ChatGPT').downloaders], [1, 1]);
    assert.strictEqual(src('Google').channel, 'Search engine');
    assert.strictEqual(src('newsletter').channel, 'Email');
    assert.deepStrictEqual(r.platforms.map((p) => [p.platform, p.downloads]), [['Mac', 1]]);
    assert.strictEqual(r.downloadPages[0].path, '/android-to-mac');
    assert.ok(r.systems.some((s) => s.os === 'Android' && s.device === 'Phone'));
    assert.ok(r.campaigns.some((c) => c.campaign === 'launch'));
    assert.ok(r.bots.some((b) => b.kind === 'search' && b.name.startsWith('Googlebot')));
    assert.ok(r.notFound.some((n) => n.path === '/nope'));
  });

  await check('no IP address or full browser string is stored', async () => {
    const { DatabaseSync } = require('node:sqlite');
    const db = new DatabaseSync(path.join(tmp, 'stats.sqlite'));
    const dump = JSON.stringify(db.prepare('SELECT * FROM events').all());
    db.close();
    assert.ok(!dump.includes('10.0.0.') && !dump.includes('AppleWebKit'));
  });

  await check('bot and source recognition', async () => {
    assert.strictEqual(findBot(CHROME), null);
    assert.strictEqual(findBot(ANDROID), null);
    assert.strictEqual(findBot('Mozilla/5.0 (compatible; ClaudeBot/1.0; +claudebot@anthropic.com)').kind, 'ai');
    assert.strictEqual(findBot('Mozilla/5.0 AppleWebKit/537.36 (KHTML, like Gecko); compatible; OAI-SearchBot/1.0').kind, 'ai');
    assert.strictEqual(findBot('facebookexternalhit/1.1').kind, 'share');
    assert.strictEqual(findBot('').kind, 'other');
    assert.strictEqual(findSource({ referrer: 'https://www.perplexity.ai/search/x', ownHost: 'a.com' }).source, 'Perplexity');
    assert.strictEqual(findSource({ referrer: 'https://old.reddit.com/r/android', ownHost: 'a.com' }).channel, 'Social');
    assert.strictEqual(findSource({ referrer: 'https://a.com/faq', ownHost: 'a.com' }).channel, 'internal');
    assert.strictEqual(findSource({ referrer: '', ownHost: 'a.com' }).channel, 'Direct');
  });

  // ---- admin ----
  const form = { 'Content-Type': 'application/x-www-form-urlencoded', Origin: 'http://example.test' };
  await check('admin is closed without sign-in and never indexable', async () => {
    const r = await get('/admin');
    assert.ok(r.body.includes('Sign in') && !r.body.includes('Where visitors come from'));
    assert.ok(r.headers['x-robots-tag'].includes('noindex'));
    assert.strictEqual((await get('/admin/export.csv')).status, 401);
    assert.strictEqual((await get('/admin', { Cookie: 'pd_admin=99999999999999.' + 'a'.repeat(64) })).body.includes('Sign in'), true);
  });

  let session = '';
  await check('wrong password is refused; right password opens the dashboard', async () => {
    assert.strictEqual((await get('/admin/login', form, 'POST', 'password=wrong')).status, 401);
    const cross = await get('/admin/login', { ...form, Origin: 'https://evil.test' }, 'POST', 'password=correct-horse-battery');
    assert.strictEqual(cross.status, 403);
    const ok = await get('/admin/login', form, 'POST', 'password=correct-horse-battery');
    assert.strictEqual(ok.status, 303);
    const set = ok.headers['set-cookie'][0];
    assert.ok(/HttpOnly/.test(set) && /SameSite=Strict/.test(set) && /Secure/.test(set));
    session = set.split(';')[0];
    const dash = await get('/admin?days=7', { Cookie: session });
    assert.ok(dash.body.includes('Where visitors come from') && dash.body.includes('ChatGPT') && dash.body.includes('<svg class="chart"'));
    const csv = await get('/admin/export.csv?days=7', { Cookie: session });
    assert.ok(csv.body.startsWith('day,visitors,page_views,downloads'));
  });

  await check('repeated wrong passwords are locked out', async () => {
    const h = { ...form, 'X-Forwarded-For': '10.7.7.7' };
    for (let i = 0; i < 8; i++) await get('/admin/login', h, 'POST', 'password=guess' + i);
    assert.strictEqual((await get('/admin/login', h, 'POST', 'password=correct-horse-battery')).status, 429);
  });

  await new Promise((r) => server.close(r));
  fs.rmSync(tmp, { recursive: true, force: true });
  console.log(results.join('\n'));
  console.log(process.exitCode ? '\nSome checks failed.' : `\nAll ${results.length} checks passed.`);
})();
