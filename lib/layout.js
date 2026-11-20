'use strict';
const config = require('./config');

const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
// JSON inside <script> must not be able to close the tag.
const jsonLd = (obj) => `<script type="application/ld+json">${JSON.stringify(obj).replace(/</g, '\\u003c')}</script>`;

const MARK = `<svg class="mark" viewBox="0 0 28 28" width="28" height="28" aria-hidden="true"><rect x="2" y="2" width="24" height="24" rx="6" fill="none" stroke="currentColor" stroke-width="4"/><rect x="10" y="10" width="8" height="8" rx="2" fill="currentColor"/></svg>`;

const NAV = [
  ['/android-to-mac', 'Android to Mac'],
  ['/android-to-windows', 'Android to Windows'],
  ['/computer-to-android', 'Computer to Android'],
  ['/compare', 'Compare'],
  ['/faq', 'FAQ'],
];

function softwareSchema(base) {
  const s = {
    '@context': 'https://schema.org',
    '@type': 'SoftwareApplication',
    '@id': base + '/#app',
    name: config.name,
    description: 'Free desktop app that moves photos and videos between an Android phone and a computer over Wi-Fi, in either direction. Scan a QR code with the phone, then send files to the computer or save files the computer offers, in original quality.',
    applicationCategory: 'UtilitiesApplication',
    operatingSystem: 'macOS, Windows, Linux',
    url: base + '/',
    downloadUrl: base + '/download',
    image: base + '/assets/img/og.png',
    screenshot: [base + '/assets/img/computer.webp', base + '/assets/img/phone.webp', base + '/assets/img/computer-send.webp'],
    isAccessibleForFree: true,
    offers: { '@type': 'Offer', price: '0', priceCurrency: 'USD' },
    featureList: [
      'Send photos and videos from an Android phone to a computer over Wi-Fi',
      'Send photos and videos from a computer to an Android phone over Wi-Fi',
      'No app to install on the phone: works in the phone browser after scanning a QR code',
      'Original quality, no compression, no file size limit',
      'Files travel directly between the two devices, not through a cloud service',
      'Skips files that were already copied to the computer',
    ],
  };
  if (config.version) s.softwareVersion = config.version;
  if (config.updated) s.dateModified = config.updated;
  if (config.publisher) s.publisher = { '@type': 'Organization', name: config.publisher };
  return s;
}

function breadcrumbSchema(base, page) {
  return {
    '@context': 'https://schema.org',
    '@type': 'BreadcrumbList',
    itemListElement: [
      { '@type': 'ListItem', position: 1, name: config.name, item: base + '/' },
      { '@type': 'ListItem', position: 2, name: page.crumb || page.h1, item: base + page.path },
    ],
  };
}

/**
 * page: { path, title, description, body, schema?: object[], crumb?, noindex?, wide? }
 * ctx:  { base, asset(file) }
 */
function render(page, ctx) {
  const { base, asset } = ctx;
  const url = base + (page.path === '/' ? '/' : page.path);
  const schema = [...(page.schema || [])];
  if (page.path !== '/' && !page.noindex) schema.push(breadcrumbSchema(base, page));

  const head = [
    '<meta charset="utf-8">',
    '<meta name="viewport" content="width=device-width, initial-scale=1">',
    `<title>${esc(page.title)}</title>`,
    `<meta name="description" content="${esc(page.description)}">`,
    page.noindex
      ? '<meta name="robots" content="noindex">'
      : `<link rel="canonical" href="${esc(url)}">\n<meta name="robots" content="index, follow, max-image-preview:large, max-snippet:-1">`,
    `<meta property="og:type" content="website">`,
    `<meta property="og:site_name" content="${esc(config.name)}">`,
    `<meta property="og:title" content="${esc(page.ogTitle || page.title)}">`,
    `<meta property="og:description" content="${esc(page.description)}">`,
    `<meta property="og:url" content="${esc(url)}">`,
    `<meta property="og:image" content="${esc(base)}/assets/img/og.png">`,
    '<meta property="og:image:width" content="1200">',
    '<meta property="og:image:height" content="630">',
    `<meta property="og:image:alt" content="${esc(config.name)}: move photos and videos between an Android phone and a computer over Wi-Fi">`,
    '<meta name="twitter:card" content="summary_large_image">',
    '<meta name="theme-color" content="#101b33">',
    `<link rel="icon" href="${asset('img/favicon.svg')}" type="image/svg+xml">`,
    '<link rel="icon" href="/favicon.ico" sizes="32x32">',
    `<link rel="apple-touch-icon" href="${asset('img/apple-touch-icon.png')}">`,
    '<link rel="preload" href="/assets/fonts/bricolage-grotesque-latin-wght-normal.woff2" as="font" type="font/woff2" crossorigin>',
    `<link rel="stylesheet" href="${asset('site.css')}">`,
    ...schema.map(jsonLd),
    `<script src="${asset('site.js')}" defer></script>`,
  ].join('\n');

  const nav = NAV.map(([href, label]) =>
    `<a href="${href}"${href === page.path ? ' aria-current="page"' : ''}>${label}</a>`).join('');

  const footLinks = [
    ['/download', 'Download'], ['/android-to-mac', 'Android to Mac'], ['/android-to-windows', 'Android to Windows'], ['/computer-to-android', 'Computer to Android'],
    ['/compare', 'Ways to transfer, compared'], ['/troubleshooting', 'Troubleshooting'], ['/faq', 'FAQ'], ['/privacy', 'Privacy'],
  ].map(([h, l]) => `<li><a href="${h}">${l}</a></li>`).join('');

  return `<!doctype html>
<html lang="en">
<head>
${head}
</head>
<body>
<a class="skip" href="#main">Skip to content</a>
<header class="top">
  <div class="wrap top-in">
    <a class="brand" href="/" aria-label="${esc(config.name)} home">${MARK}<span>${esc(config.name)}</span></a>
    <nav aria-label="Main">${nav}</nav>
    <a class="btn btn-small" href="/download">Download</a>
  </div>
</header>
<main id="main"${page.wide ? ' class="wide"' : ''}>
${page.body}
</main>
<footer class="foot">
  <div class="wrap foot-in">
    <div>
      <a class="brand" href="/">${MARK}<span>${esc(config.name)}</span></a>
      <p>Free app that moves photos and videos between an Android phone and a Mac, Windows or Linux computer over Wi-Fi, in either direction.</p>
      ${config.sourceUrl ? `<p><a href="${esc(config.sourceUrl)}" rel="noopener">Source code</a></p>` : ''}
      ${config.contactEmail ? `<p><a href="mailto:${esc(config.contactEmail)}">${esc(config.contactEmail)}</a></p>` : ''}
    </div>
    <ul>${footLinks}</ul>
  </div>
  <div class="wrap fine">
    <p>${config.version ? `Version ${esc(config.version)}. ` : ''}Page updated <time datetime="${esc(config.updated)}">${esc(niceDate(config.updated))}</time>.</p>
    <p>${esc(config.name)} is independent software. Android is a trademark of Google LLC. Mac and macOS are trademarks of Apple Inc. Windows is a trademark of Microsoft Corporation.</p>
  </div>
</footer>
</body>
</html>`;
}

function niceDate(iso) {
  const d = new Date(iso + 'T12:00:00Z');
  return isNaN(d) ? iso : d.toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric', timeZone: 'UTC' });
}

module.exports = { render, esc, jsonLd, softwareSchema, niceDate, MARK };
