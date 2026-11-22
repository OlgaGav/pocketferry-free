'use strict';
/*
 * PocketFerry website: builds the static site for GitHub Pages.
 *   node build.js [outDir]     (default: dist/)
 * No dependencies. The address comes from SITE_URL, siteUrl in site.config.json,
 * or PAGES_BASE_URL (set by the GitHub Pages workflow).
 */
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const config = require('./lib/config');
const { render } = require('./lib/layout');
const pages = require('./lib/pages');

const PUBLIC = path.join(config.root, 'public');

const AI_AGENTS = ['GPTBot', 'OAI-SearchBot', 'ChatGPT-User', 'ClaudeBot', 'Claude-SearchBot', 'Claude-User', 'PerplexityBot',
  'Perplexity-User', 'Google-Extended', 'Applebot-Extended', 'Amazonbot', 'meta-externalagent', 'DuckAssistBot', 'MistralAI-User', 'CCBot'];
const robots = (base) => [
  '# Everyone is welcome, including AI assistants and AI search.',
  'User-agent: *',
  ...AI_AGENTS.map((a) => `User-agent: ${a}`),
  'Allow: /',
  '',
  `Sitemap: ${base}/sitemap.xml`,
  '',
].join('\n');
const sitemap = (base, paths) => `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${paths.map((p) => `  <url><loc>${base}${p === '/' ? '/' : p}</loc><lastmod>${config.updated}</lastmod></url>`).join('\n')}
</urlset>
`;

function build({ outDir = path.join(config.root, 'dist'), siteUrl = config.siteUrl || process.env.PAGES_BASE_URL || '' } = {}) {
  if (!/^https?:\/\//.test(siteUrl)) throw new Error('Set the site address: siteUrl in site.config.json, or SITE_URL.');
  const base = siteUrl.replace(/\/+$/, '');
  // '' on a custom domain; '/<repo>' on https://<user>.github.io/<repo>
  const prefix = new URL(base).pathname.replace(/\/+$/, '');

  fs.rmSync(outDir, { recursive: true, force: true });
  fs.mkdirSync(outDir, { recursive: true });
  const write = (name, data) => {
    fs.mkdirSync(path.dirname(path.join(outDir, name)), { recursive: true });
    fs.writeFileSync(path.join(outDir, name), data);
  };

  // ---------- static files; ?v=<hash> makes browsers fetch a changed file at once ----------
  fs.cpSync(PUBLIC, path.join(outDir, 'assets'), { recursive: true });
  fs.copyFileSync(path.join(PUBLIC, 'img/favicon.ico'), path.join(outDir, 'favicon.ico'));
  const asset = (file) => {
    const full = path.join(PUBLIC, file);
    const hash = fs.existsSync(full) ? crypto.createHash('sha256').update(fs.readFileSync(full)).digest('hex').slice(0, 10) : '0';
    return `/assets/${file}?v=${hash}`;
  };

  // Pages link with root paths such as /faq; on a project site everything lives under the prefix.
  const withPrefix = (html) => (prefix ? html.replace(/\b(href|src)="\/(?!\/)/g, `$1="${prefix}/`) : html);

  // ---------- pages: /faq is served from faq.html ----------
  const ctx = { base, asset };
  const paths = [];
  for (const b of pages.builders) {
    const page = b(ctx);
    paths.push(page.path);
    write(page.path === '/' ? 'index.html' : page.path.slice(1) + '.html', withPrefix(render(page, ctx)));
  }
  write('404.html', withPrefix(render(pages.notFound(), ctx)));

  // ---------- text files for crawlers ----------
  write('robots.txt', robots(base));
  write('sitemap.xml', sitemap(base, paths));
  write('llms.txt', pages.llmsTxt(base));
  write('.nojekyll', ''); // serve files as they are, without Jekyll processing

  return { outDir, base, paths };
}

if (require.main === module) {
  let result;
  try { result = build(process.argv[2] ? { outDir: path.resolve(process.argv[2]) } : undefined); }
  catch (e) { console.error(e.message); process.exit(1); }
  const { outDir, base, paths } = result;
  console.log(`Built ${paths.length} pages for ${base} into ${path.relative(process.cwd(), outDir) || '.'}`);
  const missing = Object.values(config.downloads).filter((d) => !d.url).map((d) => d.label);
  if (missing.length) console.log(`Note: no installer link for ${missing.join(', ')}; those buttons show "Coming soon".`);
}

module.exports = { build };
