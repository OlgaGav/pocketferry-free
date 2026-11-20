'use strict';
// Server-rendered admin pages: sign-in and the statistics dashboard.
const config = require('./config');
const { esc, MARK } = require('./layout');

const num = (n) => Number(n || 0).toLocaleString('en-US');
const pct = (x) => (x == null ? '–' : (x * 100).toFixed(x < 0.1 ? 1 : 0) + '%');
const shortDay = (iso) => new Date(iso + 'T12:00:00Z').toLocaleDateString('en-US', { month: 'short', day: 'numeric', timeZone: 'UTC' });

function shell(title, body, asset) {
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="robots" content="noindex, nofollow">
<title>${esc(title)}</title>
<link rel="icon" href="${asset('img/favicon.svg')}" type="image/svg+xml">
<link rel="stylesheet" href="${asset('admin.css')}">
<script src="${asset('admin.js')}" defer></script>
</head>
<body>
${body}
</body>
</html>`;
}

function loginPage(asset, { error = '', setup = false } = {}) {
  const body = setup
    ? `<main class="login"><div class="brand">${MARK}<span>${esc(config.name)} admin</span></div>
        <h1>Set an admin password first</h1>
        <p>The statistics page is switched off until the <code>ADMIN_PASSWORD</code> environment variable is set to a password of at least 10 characters. Set it in your hosting provider's settings and restart the site.</p></main>`
    : `<main class="login"><div class="brand">${MARK}<span>${esc(config.name)} admin</span></div>
        <h1>Sign in</h1>
        <form method="post" action="/admin/login">
          <label for="pw">Password</label>
          <input id="pw" name="password" type="password" autocomplete="current-password" required autofocus>
          ${error ? `<p class="error" role="alert">${esc(error)}</p>` : ''}
          <button>Sign in</button>
        </form></main>`;
  return shell(`${config.name} admin`, body, asset);
}

// ---------- charts ----------

function niceMax(v) {
  if (v <= 4) return 4;
  const p = Math.pow(10, Math.floor(Math.log10(v)));
  for (const m of [1, 2, 4, 5, 8, 10]) if (v <= m * p) return m * p;
  return 10 * p;
}

/** One measure per chart (never two scales on one plot). */
function barChart(daily, key, cls, unit) {
  // Weekly buckets keep long ranges readable.
  let points = daily.map((d) => ({ label: shortDay(d.day), value: d[key] }));
  let per = 'day';
  if (daily.length > 120) {
    per = 'week';
    points = [];
    for (let i = 0; i < daily.length; i += 7) {
      const chunk = daily.slice(i, i + 7);
      points.push({
        label: `${shortDay(chunk[0].day)} to ${shortDay(chunk[chunk.length - 1].day)}`,
        value: chunk.reduce((a, d) => a + d[key], 0),
      });
    }
  }
  const total = points.reduce((a, p) => a + p.value, 0);
  if (!total) return `<p class="empty">No ${esc(unit)} in this period yet.</p>`;

  const W = 720, H = 200, L = 40, R = 8, T = 12, B = 26;
  const pw = W - L - R, ph = H - T - B;
  const max = niceMax(Math.max(...points.map((p) => p.value)));
  const band = pw / points.length;
  const bw = Math.max(1, Math.min(band - 2, 40));
  const y = (v) => T + ph - (v / max) * ph;

  const grid = [0, max / 2, max].map((v) =>
    `<line class="grid" x1="${L}" x2="${W - R}" y1="${y(v)}" y2="${y(v)}"/><text class="tick" x="${L - 8}" y="${y(v) + 4}" text-anchor="end">${num(v)}</text>`).join('');

  const bars = points.map((p, i) => {
    const x = L + i * band + (band - bw) / 2;
    const top = y(p.value);
    const h = T + ph - top;
    const r = Math.min(4, bw / 2, h);
    const shape = h > 0
      ? `<path class="bar ${cls}" d="M${x.toFixed(1)},${T + ph} V${(top + r).toFixed(1)} Q${x.toFixed(1)},${top.toFixed(1)} ${(x + r).toFixed(1)},${top.toFixed(1)} H${(x + bw - r).toFixed(1)} Q${(x + bw).toFixed(1)},${top.toFixed(1)} ${(x + bw).toFixed(1)},${(top + r).toFixed(1)} V${T + ph} Z"/>`
      : '';
    return `<g class="col">${shape}<rect class="hit" x="${(L + i * band).toFixed(1)}" y="${T}" width="${band.toFixed(1)}" height="${ph}" data-tip="${esc(p.label)}: ${num(p.value)} ${esc(unit)}"/></g>`;
  }).join('');

  const marks = [0, Math.floor((points.length - 1) / 2), points.length - 1].filter((v, i, a) => a.indexOf(v) === i);
  const xl = marks.map((i) => {
    const anchor = i === 0 ? 'start' : i === points.length - 1 ? 'end' : 'middle';
    const x = i === 0 ? L : i === points.length - 1 ? W - R : L + i * band + band / 2;
    return `<text class="tick" x="${x.toFixed(1)}" y="${H - 6}" text-anchor="${anchor}">${esc(points[i].label.split(' to ')[0])}</text>`;
  }).join('');

  return `<svg class="chart" viewBox="0 0 ${W} ${H}" role="img" aria-label="${esc(unit)} per ${per}: ${num(total)} in total">${grid}${bars}${xl}</svg>`;
}

// ---------- dashboard ----------

function delta(now, before, days) {
  if (!before && !now) return '';
  if (!before) return `<span class="delta">new this period</span>`;
  const d = (now - before) / before;
  const arrow = d > 0.005 ? '▲' : d < -0.005 ? '▼' : '●';
  return `<span class="delta">${arrow} ${Math.abs(d * 100).toFixed(0)}% vs previous ${days} days</span>`;
}

function table(caption, head, rows, empty) {
  if (!rows.length) return `<section class="card"><h2>${esc(caption)}</h2><p class="empty">${esc(empty)}</p></section>`;
  return `<section class="card"><h2>${esc(caption)}</h2><div class="scroll"><table>
    <thead><tr>${head.map((h, i) => `<th scope="col"${i ? ' class="n"' : ''}>${esc(h)}</th>`).join('')}</tr></thead>
    <tbody>${rows.map((r) => `<tr>${r.map((c, i) => (i ? `<td class="n">${c}</td>` : `<th scope="row">${c}</th>`)).join('')}</tr>`).join('')}</tbody>
  </table></div></section>`;
}

const ago = (ts) => {
  const m = Math.round((Date.now() - ts) / 60000);
  if (m < 60) return `${Math.max(m, 1)} min ago`;
  if (m < 1440) return `${Math.round(m / 60)} h ago`;
  return `${Math.round(m / 1440)} d ago`;
};

function dashboard(r, asset) {
  const n = r.now, b = r.before;
  const ranges = [7, 30, 90, 365].map((d) =>
    `<a href="/admin?days=${d}"${d === r.days ? ' aria-current="true"' : ''}>${d === 365 ? '12 months' : d + ' days'}</a>`).join('');

  const kpi = (label, value, extra, hint) =>
    `<div class="kpi"><div class="kpi-l">${label}</div><div class="kpi-v">${value}</div>${extra || ''}${hint ? `<div class="kpi-h">${hint}</div>` : ''}</div>`;

  const kpis = [
    kpi('Visitors', num(n.visitors), delta(n.visitors, b.visitors, r.days), `${num(n.views)} page views`),
    kpi('Downloads', num(n.downloads), delta(n.downloads, b.downloads, r.days), `by ${num(n.downloaders)} visitors`),
    kpi('Download rate', pct(n.downloadRate), '', 'visitors who downloaded'),
    kpi('Visitors from AI assistants', num(n.aiVisitors), delta(n.aiVisitors, b.aiVisitors, r.days), 'ChatGPT, Perplexity, Claude and others'),
    kpi('AI crawler visits', num(n.aiCrawlerHits), delta(n.aiCrawlerHits, b.aiCrawlerHits, r.days), 'pages read by AI bots'),
    kpi('Left after one page', pct(n.onePageShare), '', n.pagesPerVisitor ? `${n.pagesPerVisitor.toFixed(1)} pages per visitor` : ''),
  ].join('');

  const botRows = (kind) => r.bots.filter((x) => x.kind === kind).map((x) => [esc(x.name), num(x.hits), num(x.pages), ago(x.last)]);
  const phones = r.systems.filter((s) => s.device !== 'Computer').reduce((a, s) => a + s.visitors, 0);
  const phoneNote = n.visitors && phones / n.visitors > 0.3
    ? `<p class="note">${pct(phones / n.visitors)} of visitors are on a phone or tablet and cannot install the app from there. The site offers them a "send yourself the link" option.</p>` : '';

  const body = `
<header class="bar">
  <div class="brand">${MARK}<span>${esc(config.name)} statistics</span></div>
  <nav class="ranges" aria-label="Period">${ranges}</nav>
  <div class="tools">
    <a href="/admin/export.csv?days=${r.days}">Download CSV</a>
    <a href="/" target="_blank" rel="noopener">View site</a>
    <form method="post" action="/admin/logout"><button class="plainbtn">Sign out</button></form>
  </div>
</header>
<main>
  <p class="period">${shortDay(r.from)} to ${shortDay(r.to)} (${esc(config.timezone)} time). Automated traffic is counted separately and is not included in visitors.</p>
  <section class="kpis">${kpis}</section>

  <div class="two">
    <section class="card"><h2>Visitors</h2>${barChart(r.daily, 'visitors', 's1', 'visitors')}</section>
    <section class="card"><h2>Downloads</h2>${barChart(r.daily, 'downloads', 's2', 'downloads')}</section>
  </div>

  <div class="two">
    ${table('Where visitors come from', ['Source', 'Type', 'Visitors', 'Downloaded', 'Rate'],
      r.sources.map((s) => [esc(s.source || '–'), esc(s.channel), num(s.visitors), num(s.downloaders), pct(s.visitors ? s.downloaders / s.visitors : null)]),
      'No visitors in this period yet.')}
    ${table('Pages', ['Page', 'Views', 'Visitors'], r.pages.map((p) => [esc(p.path), num(p.views), num(p.visitors)]), 'No page views in this period yet.')}
  </div>

  <div class="three">
    ${table('Downloads by system', ['System', 'Downloads'], r.platforms.map((p) => [esc(p.platform), num(p.downloads)]), 'No downloads in this period yet.')}
    ${table('Download button used on', ['Page', 'Downloads'], r.downloadPages.map((p) => [esc(p.path), num(p.downloads)]), 'No downloads in this period yet.')}
    ${table('Campaign links', ['Campaign', 'Source', 'Visitors'], r.campaigns.map((c) => [esc(c.campaign), esc(c.source), num(c.visitors)]),
      'Add ?utm_source=newsletter&utm_campaign=launch to links you share to see them here.')}
  </div>

  <h2 class="group">AI and search visibility</h2>
  <div class="two">
    ${table('AI crawlers', ['Bot', 'Visits', 'Pages', 'Last seen'], botRows('ai'), 'No AI crawlers have visited in this period.')}
    ${table('Search engine crawlers', ['Bot', 'Visits', 'Pages', 'Last seen'], botRows('search'), 'No search engine crawlers have visited in this period.')}
  </div>
  <div class="two">
    ${table('Pages AI crawlers read most', ['Page', 'Visits'], r.aiPages.map((p) => [esc(p.path), num(p.hits)]), 'Nothing yet.')}
    ${table('Link previews (your link was shared in)', ['App', 'Previews', 'Pages', 'Last seen'], botRows('share'), 'No link previews in this period.')}
  </div>

  <h2 class="group">Audience</h2>
  ${phoneNote}
  <div class="three">
    ${table('Devices', ['System', 'Device', 'Visitors'], r.systems.map((s) => [esc(s.os), esc(s.device), num(s.visitors)]), 'Nothing yet.')}
    ${table('Browsers', ['Browser', 'Visitors'], r.browsers.map((s) => [esc(s.browser), num(s.visitors)]), 'Nothing yet.')}
    ${r.countries.length
      ? table('Countries', ['Country', 'Visitors'], r.countries.map((s) => [esc(s.country), num(s.visitors)]), '')
      : table('Browser languages', ['Language', 'Visitors'], r.languages.map((s) => [esc(s.lang), num(s.visitors)]), 'Nothing yet.')}
  </div>

  <h2 class="group">Site health</h2>
  <div class="two">
    ${table('Addresses that do not exist', ['Address', 'Requests'], r.notFound.map((p) => [esc(p.path), num(p.hits)]), 'No broken addresses requested.')}
    <section class="card"><h2>Daily numbers</h2><div class="scroll tall"><table>
      <thead><tr><th scope="col">Day</th><th scope="col" class="n">Visitors</th><th scope="col" class="n">Views</th><th scope="col" class="n">Downloads</th></tr></thead>
      <tbody>${[...r.daily].reverse().map((d) => `<tr><th scope="row">${esc(d.day)}</th><td class="n">${num(d.visitors)}</td><td class="n">${num(d.views)}</td><td class="n">${num(d.downloads)}</td></tr>`).join('')}</tbody>
    </table></div></section>
  </div>
</main>
<div id="tip" class="tip" hidden></div>`;
  return shell(`${config.name} statistics`, body, asset);
}

function csv(r) {
  return 'day,visitors,page_views,downloads\n' + r.daily.map((d) => `${d.day},${d.visitors},${d.views},${d.downloads}`).join('\n') + '\n';
}

module.exports = { loginPage, dashboard, csv };
