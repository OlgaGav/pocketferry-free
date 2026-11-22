'use strict';
// Builds the site into temporary folders and checks the output: npm test
const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');

const config = require('../lib/config');
config.downloads.mac.url = 'https://github.com/example/app/releases/latest/download/PocketFerry.dmg';
config.downloads.windows.url = '';
const { build } = require('../build');

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'pfsite-'));
const results = [];
const check = (name, fn) => {
  try { fn(); results.push(`ok   ${name}`); }
  catch (e) { results.push(`FAIL ${name}\n     ${e.message}`); process.exitCode = 1; }
};

const site = build({ outDir: path.join(tmp, 'domain'), siteUrl: 'https://example.test' });
const read = (p, dir = site.outDir) => fs.readFileSync(path.join(dir, p === '/' ? 'index.html' : p.slice(1) + (path.extname(p) ? '' : '.html')), 'utf8');
const paths = ['/', '/download', '/android-to-mac', '/android-to-windows', '/computer-to-android', '/compare', '/faq', '/troubleshooting', '/privacy'];

check('every page: one h1, title <= 60, description 70-160, canonical, valid JSON-LD, known links', () => {
  assert.deepStrictEqual(site.paths, paths);
  const titles = new Set();
  for (const p of paths) {
    const body = read(p);
    assert.strictEqual((body.match(/<h1[ >]/g) || []).length, 1, `${p} h1 count`);
    const title = /<title>(.*?)<\/title>/.exec(body)[1].replace(/&amp;/g, '&');
    assert.ok(title.length <= 60, `${p} title is ${title.length} chars`);
    assert.ok(!titles.has(title), `${p} duplicate title`);
    titles.add(title);
    const desc = /<meta name="description" content="(.*?)">/.exec(body)[1];
    assert.ok(desc.length >= 70 && desc.length <= 160, `${p} description is ${desc.length} chars`);
    assert.ok(body.includes(`<link rel="canonical" href="https://example.test${p === '/' ? '/' : p}">`), `${p} canonical`);
    assert.ok(body.includes('http-equiv="Content-Security-Policy"'), `${p} CSP`);
    for (const m of body.matchAll(/<script type="application\/ld\+json">(.*?)<\/script>/gs)) JSON.parse(m[1]);
    for (const m of body.matchAll(/<img [^>]*>/g)) assert.ok(/alt="[^"]+"/.test(m[0]) && /width=/.test(m[0]), `${p} image alt/size`);
    for (const m of body.matchAll(/href="(\/[a-z-]*)(#[a-z]+)?"/g)) {
      assert.ok(paths.includes(m[1]) || m[1] === '/favicon', `${p} links to unknown page ${m[1]}`);
    }
    for (const m of body.matchAll(/(?:href|src)="\/assets\/([^"?]+)/g)) assert.ok(fs.existsSync(path.join(site.outDir, 'assets', m[1])), `${p} missing asset ${m[1]}`);
  }
});

check('home has SoftwareApplication (free), HowTo and FAQ structured data', () => {
  const types = [...read('/').matchAll(/<script type="application\/ld\+json">(.*?)<\/script>/gs)].map((m) => JSON.parse(m[1]));
  const app = types.find((t) => t['@type'] === 'SoftwareApplication');
  assert.strictEqual(app.offers.price, '0');
  assert.ok(types.some((t) => t['@type'] === 'HowTo') && types.some((t) => t['@type'] === 'FAQPage'));
  assert.ok(!JSON.stringify(types).includes('aggregateRating'), 'no invented ratings');
});

check('download buttons go straight to the installer; missing ones say Coming soon', () => {
  const dl = read('/download');
  assert.ok(dl.includes('href="https://github.com/example/app/releases/latest/download/PocketFerry.dmg"'));
  assert.ok(/data-platform="windows"[\s\S]*?Coming soon/.test(dl));
  assert.ok(read('/android-to-mac').includes('href="https://github.com/example/app/releases/latest/download/PocketFerry.dmg"'));
  assert.ok(read('/android-to-windows').includes('<a class="btn" href="/download">Download for Windows'));
  assert.ok(read('/').includes('data-download data-mac="https://github.com/example/app/releases/latest/download/PocketFerry.dmg"'));
  for (const p of paths) assert.ok(!/href="\/download\/[a-z]/.test(read(p)), `${p} still uses /download/<system>`);
});

check('robots.txt, sitemap.xml, llms.txt, 404.html, favicon, font', () => {
  const robots = read('/robots.txt');
  assert.ok(robots.includes('Sitemap: https://example.test/sitemap.xml') && robots.includes('User-agent: GPTBot'));
  const map = read('/sitemap.xml');
  for (const p of paths) assert.ok(map.includes(`<loc>https://example.test${p === '/' ? '/' : p}</loc>`), p);
  assert.ok(read('/llms.txt').startsWith('# PocketFerry') && read('/llms.txt').includes('Price: free'));
  assert.ok(read('/404').includes('<meta name="robots" content="noindex">'));
  assert.ok(fs.existsSync(path.join(site.outDir, 'favicon.ico')) && fs.existsSync(path.join(site.outDir, '.nojekyll')));
  assert.ok(read('/assets/site.css').includes('url("fonts/bricolage'), 'font path is relative to the stylesheet');
});

check('nothing from the old server is published', () => {
  for (const p of paths) assert.ok(!read(p).includes('/admin'), p);
  assert.ok(!fs.existsSync(path.join(site.outDir, 'assets', 'admin.js')));
});

check('project site at <user>.github.io/<repo>: every root link gets the repo prefix', () => {
  const proj = build({ outDir: path.join(tmp, 'project'), siteUrl: 'https://someone.github.io/pocketferry/' });
  assert.strictEqual(proj.base, 'https://someone.github.io/pocketferry');
  for (const p of [...paths, '/404']) {
    const body = read(p, proj.outDir);
    const bad = body.match(/(?:href|src)="\/(?!\/|pocketferry\/)[^"]*"/g);
    assert.ok(!bad, `${p}: ${bad && bad[0]}`);
  }
  assert.ok(read('/faq', proj.outDir).includes('<link rel="canonical" href="https://someone.github.io/pocketferry/faq">'));
  assert.ok(read('/', proj.outDir).includes('href="/pocketferry/faq"'));
  assert.ok(read('/robots.txt', proj.outDir).includes('Sitemap: https://someone.github.io/pocketferry/sitemap.xml'));
});

check('a build without an address is refused', () => {
  assert.throws(() => build({ outDir: path.join(tmp, 'none'), siteUrl: '' }), /site address/);
});

fs.rmSync(tmp, { recursive: true, force: true });
console.log(results.join('\n'));
console.log(process.exitCode ? '\nSome checks failed.' : `\nAll ${results.length} checks passed.`);
