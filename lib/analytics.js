'use strict';
/*
 * Cookieless, first-party statistics stored in one SQLite file.
 *
 * Privacy model: no cookies, no IP addresses and no full user-agent strings are
 * stored. A "visitor" is a hash of (IP + browser + a random salt that changes
 * every day), so the same person cannot be followed from one day to the next
 * and the hash cannot be turned back into an IP address once the salt is gone.
 */
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { DatabaseSync } = require('node:sqlite');

// ---------- who is asking ----------

const AI_BOTS = [
  ['OAI-SearchBot', 'OAI-SearchBot — ChatGPT search index'],
  ['ChatGPT-User', 'ChatGPT-User — ChatGPT reading a page for a user'],
  ['GPTBot', 'GPTBot — OpenAI model training'],
  ['Claude-SearchBot', 'Claude-SearchBot — Claude search index'],
  ['Claude-User', 'Claude-User — Claude reading a page for a user'],
  ['ClaudeBot', 'ClaudeBot — Anthropic model training'],
  ['anthropic-ai', 'anthropic-ai — Anthropic'],
  ['Perplexity-User', 'Perplexity-User — Perplexity reading a page for a user'],
  ['PerplexityBot', 'PerplexityBot — Perplexity search index'],
  ['Google-CloudVertexBot', 'Google-CloudVertexBot — Google Vertex AI'],
  ['GoogleOther', 'GoogleOther — Google research and AI'],
  ['Applebot-Extended', 'Applebot-Extended — Apple AI'],
  ['Amazonbot', 'Amazonbot — Amazon / Alexa'],
  ['meta-externalagent', 'meta-externalagent — Meta AI'],
  ['meta-externalfetcher', 'Meta-ExternalFetcher — Meta AI reading a page for a user'],
  ['DuckAssistBot', 'DuckAssistBot — DuckDuckGo AI answers'],
  ['MistralAI-User', 'MistralAI-User — Le Chat reading a page for a user'],
  ['cohere-ai', 'cohere-ai — Cohere'],
  ['Bytespider', 'Bytespider — ByteDance'],
  ['CCBot', 'CCBot — Common Crawl (used to train many models)'],
  ['YouBot', 'YouBot — You.com'],
  ['Diffbot', 'Diffbot'],
];
const SEARCH_BOTS = [
  ['Googlebot', 'Googlebot — Google Search'],
  ['bingbot', 'Bingbot — Bing (also feeds Copilot and ChatGPT search)'],
  ['DuckDuckBot', 'DuckDuckBot — DuckDuckGo'],
  ['YandexBot', 'YandexBot — Yandex'],
  ['Applebot', 'Applebot — Siri and Spotlight'],
  ['Baiduspider', 'Baiduspider — Baidu'],
  ['Slurp', 'Slurp — Yahoo'],
  ['SeznamBot', 'SeznamBot — Seznam'],
  ['PetalBot', 'PetalBot — Petal Search'],
  ['Bravebot', 'Bravebot — Brave Search'],
];
const SHARE_BOTS = [
  ['facebookexternalhit', 'Facebook / Instagram / Messenger'],
  ['WhatsApp', 'WhatsApp'],
  ['TelegramBot', 'Telegram'],
  ['Twitterbot', 'X (Twitter)'],
  ['Slackbot', 'Slack'],
  ['Discordbot', 'Discord'],
  ['LinkedInBot', 'LinkedIn'],
  ['redditbot', 'Reddit'],
  ['Pinterest', 'Pinterest'],
  ['Mastodon', 'Mastodon'],
  ['Bluesky', 'Bluesky'],
  ['Viber', 'Viber'],
  ['SkypeUriPreview', 'Skype / Teams'],
  ['iMessage', 'iMessage'],
];
const OTHER_BOT = /bot\b|bot[\/;) ]|crawl|spider|scrape|fetch|monitor|preview|scan|headless|lighthouse|pagespeed|curl|wget|python|go-http|java\/|axios|node|okhttp|httpclient|libwww|ruby|php|pingdom|uptime|check|validator|feed|archive/i;

function findBot(ua) {
  if (!ua) return { kind: 'other', name: 'No browser name sent' };
  const low = ua.toLowerCase();
  for (const [kind, list] of [['ai', AI_BOTS], ['share', SHARE_BOTS], ['search', SEARCH_BOTS]]) {
    for (const [token, name] of list) if (low.includes(token.toLowerCase())) return { kind, name };
  }
  if (OTHER_BOT.test(ua) || !/mozilla|opera/i.test(ua)) return { kind: 'other', name: 'Other automated traffic' };
  return null;
}

function describeBrowser(ua) {
  const os = /Windows NT/.test(ua) ? 'Windows'
    : /Android/.test(ua) ? 'Android'
    : /iPhone|iPad|iPod/.test(ua) ? 'iOS'
    : /CrOS/.test(ua) ? 'ChromeOS'
    : /Mac OS X/.test(ua) ? 'macOS'
    : /Linux/.test(ua) ? 'Linux' : 'Other';
  const device = /iPad/.test(ua) || (/Android/.test(ua) && !/Mobile/.test(ua)) ? 'Tablet'
    : /Android|iPhone|iPod|Mobile/.test(ua) ? 'Phone' : 'Computer';
  const browser = /Edg\//.test(ua) ? 'Edge'
    : /OPR\//.test(ua) ? 'Opera'
    : /SamsungBrowser/.test(ua) ? 'Samsung Internet'
    : /Firefox\//.test(ua) ? 'Firefox'
    : /Chrome\//.test(ua) ? 'Chrome'
    : /Safari\//.test(ua) ? 'Safari' : 'Other';
  return { os, device, browser };
}

// ---------- where they came from ----------

const AI_SITES = {
  'chatgpt.com': 'ChatGPT', 'chat.openai.com': 'ChatGPT', 'openai.com': 'ChatGPT',
  'perplexity.ai': 'Perplexity', 'claude.ai': 'Claude', 'gemini.google.com': 'Gemini',
  'copilot.microsoft.com': 'Copilot', 'meta.ai': 'Meta AI', 'grok.com': 'Grok',
  'chat.mistral.ai': 'Le Chat', 'chat.deepseek.com': 'DeepSeek', 'you.com': 'You.com',
  'phind.com': 'Phind', 'poe.com': 'Poe',
};
const SEARCH_SITES = [
  [/^google\./, 'Google'], [/^bing\.com$/, 'Bing'], [/^duckduckgo\.com$/, 'DuckDuckGo'],
  [/yahoo\.(com|co\.jp)$/, 'Yahoo'], [/^yandex\./, 'Yandex'], [/^baidu\.com$/, 'Baidu'],
  [/^ecosia\.org$/, 'Ecosia'], [/^search\.brave\.com$/, 'Brave Search'], [/^startpage\.com$/, 'Startpage'],
  [/^kagi\.com$/, 'Kagi'], [/^qwant\.com$/, 'Qwant'], [/^search\.naver\.com$/, 'Naver'],
];
const SOCIAL_SITES = [
  [/facebook\.com$|^fb\.com$/, 'Facebook'], [/instagram\.com$/, 'Instagram'], [/^t\.co$|twitter\.com$|^x\.com$/, 'X (Twitter)'],
  [/reddit\.com$/, 'Reddit'], [/linkedin\.com$|^lnkd\.in$/, 'LinkedIn'], [/youtube\.com$|^youtu\.be$/, 'YouTube'],
  [/tiktok\.com$/, 'TikTok'], [/pinterest\./, 'Pinterest'], [/threads\.(net|com)$/, 'Threads'],
  [/bsky\.app$/, 'Bluesky'], [/news\.ycombinator\.com$/, 'Hacker News'], [/^t\.me$|telegram\.org$/, 'Telegram'],
  [/whatsapp\.com$/, 'WhatsApp'], [/^vk\.com$/, 'VK'],
];

const clean = (s, max = 80) => String(s || '').replace(/[\x00-\x1f\x7f]/g, '').trim().slice(0, max);

/** Turn a referrer and UTM tags into { channel, source, campaign }. */
function findSource({ referrer, utmSource, utmMedium, utmCampaign, ownHost }) {
  const campaign = clean(utmCampaign, 60);
  let host = '';
  try {
    host = new URL(referrer).hostname.toLowerCase().replace(/^www\./, '');
  } catch { /* no or invalid referrer */ }
  const own = String(ownHost || '').toLowerCase().replace(/^www\./, '').replace(/:\d+$/, '');

  const tag = clean(utmSource, 60).toLowerCase();
  if (tag) {
    const ai = AI_SITES[tag] || Object.values(AI_SITES).find((n) => n.toLowerCase() === tag);
    if (ai) return { channel: 'AI assistant', source: ai, campaign };
    const medium = clean(utmMedium, 30).toLowerCase();
    return { channel: medium === 'email' ? 'Email' : 'Campaign link', source: tag, campaign };
  }
  if (!host) return { channel: 'Direct', source: 'Typed, bookmarked or from an app', campaign };
  if (host === own) return { channel: 'internal', source: '', campaign };
  for (const [site, name] of Object.entries(AI_SITES)) {
    if (host === site || host.endsWith('.' + site)) return { channel: 'AI assistant', source: name, campaign };
  }
  for (const [re, name] of SEARCH_SITES) if (re.test(host)) return { channel: 'Search engine', source: name, campaign };
  for (const [re, name] of SOCIAL_SITES) if (re.test(host)) return { channel: 'Social', source: name, campaign };
  if (/^(mail\.|outlook\.|webmail\.)/.test(host)) return { channel: 'Email', source: host, campaign };
  return { channel: 'Other website', source: host, campaign };
}

// ---------- storage ----------

function open(dataDir, timezone = 'UTC') {
  fs.mkdirSync(dataDir, { recursive: true });
  const db = new DatabaseSync(path.join(dataDir, 'stats.sqlite'));
  db.exec(`
    PRAGMA journal_mode = WAL;
    PRAGMA synchronous = NORMAL;
    CREATE TABLE IF NOT EXISTS events (
      id INTEGER PRIMARY KEY, ts INTEGER NOT NULL, day TEXT NOT NULL, type TEXT NOT NULL,
      path TEXT, visitor TEXT, channel TEXT, source TEXT, campaign TEXT,
      device TEXT, os TEXT, browser TEXT, lang TEXT, country TEXT, platform TEXT
    );
    CREATE INDEX IF NOT EXISTS events_day ON events (day, type);
    CREATE TABLE IF NOT EXISTS bots (
      day TEXT NOT NULL, kind TEXT NOT NULL, name TEXT NOT NULL, path TEXT NOT NULL,
      hits INTEGER NOT NULL, last_ts INTEGER NOT NULL, PRIMARY KEY (day, name, path)
    );
    CREATE TABLE IF NOT EXISTS notfound (
      day TEXT NOT NULL, path TEXT NOT NULL, hits INTEGER NOT NULL, PRIMARY KEY (day, path)
    );
    CREATE TABLE IF NOT EXISTS salts (day TEXT PRIMARY KEY, salt TEXT NOT NULL);
    CREATE TABLE IF NOT EXISTS meta (k TEXT PRIMARY KEY, v TEXT NOT NULL);
  `);

  let dayFmt;
  try {
    dayFmt = new Intl.DateTimeFormat('en-CA', { timeZone: timezone, year: 'numeric', month: '2-digit', day: '2-digit' });
  } catch {
    dayFmt = new Intl.DateTimeFormat('en-CA', { timeZone: 'UTC', year: 'numeric', month: '2-digit', day: '2-digit' });
  }
  const dayOf = (ms) => dayFmt.format(new Date(ms));
  const shiftDay = (day, n) => {
    const d = new Date(day + 'T12:00:00Z');
    d.setUTCDate(d.getUTCDate() + n);
    return d.toISOString().slice(0, 10);
  };

  const q = {
    insert: db.prepare(`INSERT INTO events (ts, day, type, path, visitor, channel, source, campaign, device, os, browser, lang, country, platform)
                        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`),
    bot: db.prepare(`INSERT INTO bots (day, kind, name, path, hits, last_ts) VALUES (?, ?, ?, ?, 1, ?)
                     ON CONFLICT (day, name, path) DO UPDATE SET hits = hits + 1, last_ts = excluded.last_ts`),
    nf: db.prepare(`INSERT INTO notfound (day, path, hits) VALUES (?, ?, 1)
                    ON CONFLICT (day, path) DO UPDATE SET hits = hits + 1`),
    nfCount: db.prepare('SELECT COUNT(*) n FROM notfound WHERE day = ?'),
    salt: db.prepare('SELECT salt FROM salts WHERE day = ?'),
    saltPut: db.prepare('INSERT OR IGNORE INTO salts (day, salt) VALUES (?, ?)'),
    metaGet: db.prepare('SELECT v FROM meta WHERE k = ?'),
    metaPut: db.prepare('INSERT INTO meta (k, v) VALUES (?, ?) ON CONFLICT (k) DO UPDATE SET v = excluded.v'),
  };

  let saltDay = '';
  let salt = '';
  function visitorId(now, ip, ua) {
    const day = dayOf(now);
    if (day !== saltDay) {
      q.saltPut.run(day, crypto.randomBytes(24).toString('hex'));
      salt = q.salt.get(day).salt;
      saltDay = day;
      // Yesterday's salt is destroyed, which makes old visitor hashes irreversible.
      db.prepare('DELETE FROM salts WHERE day < ?').run(day);
      db.prepare('DELETE FROM events WHERE day < ?').run(shiftDay(day, -730));
      db.prepare('DELETE FROM bots WHERE day < ?').run(shiftDay(day, -730));
      db.prepare('DELETE FROM notfound WHERE day < ?').run(shiftDay(day, -180));
    }
    return crypto.createHash('sha256').update(salt + '|' + ip + '|' + ua).digest('hex').slice(0, 16);
  }

  /** info: { type: 'view'|'download', path, ip, ua, referrer, utm*, ownHost, lang, country, platform } */
  function record(info, now = Date.now()) {
    const b = describeBrowser(info.ua || '');
    const src = findSource(info);
    q.insert.run(
      now, dayOf(now), info.type, clean(info.path, 120), visitorId(now, info.ip || '', info.ua || ''),
      src.channel, src.source, src.campaign, b.device, b.os, b.browser,
      clean(info.lang, 12), clean(info.country, 2).toUpperCase(), info.platform || null,
    );
  }
  function recordBot(bot, pathname, now = Date.now()) {
    q.bot.run(dayOf(now), bot.kind, bot.name, clean(pathname, 120), now);
  }
  function recordNotFound(pathname, now = Date.now()) {
    const day = dayOf(now);
    if (q.nfCount.get(day).n < 500) q.nf.run(day, clean(pathname, 120));
    else db.prepare('UPDATE notfound SET hits = hits + 1 WHERE day = ? AND path = ?').run(day, clean(pathname, 120));
  }

  const all = (sql, ...p) => db.prepare(sql).all(...p);
  const one = (sql, ...p) => db.prepare(sql).get(...p);

  function totals(from, to) {
    const t = one(
      `SELECT
         COUNT(DISTINCT CASE WHEN type = 'view' THEN day || visitor END) visitors,
         SUM(type = 'view') views,
         SUM(type = 'download') downloads,
         COUNT(DISTINCT CASE WHEN type = 'download' THEN day || visitor END) downloaders,
         COUNT(DISTINCT CASE WHEN type = 'view' AND channel = 'AI assistant' THEN day || visitor END) aiVisitors
       FROM events WHERE day BETWEEN ? AND ?`, from, to);
    const bots = one(`SELECT COALESCE(SUM(hits), 0) n FROM bots WHERE kind = 'ai' AND day BETWEEN ? AND ?`, from, to);
    const single = one(
      `SELECT COUNT(*) n FROM (SELECT 1 FROM events WHERE type = 'view' AND day BETWEEN ? AND ?
       GROUP BY day, visitor HAVING COUNT(*) = 1)`, from, to);
    const v = t.visitors || 0;
    return {
      visitors: v,
      views: t.views || 0,
      downloads: t.downloads || 0,
      downloaders: t.downloaders || 0,
      downloadRate: v ? (t.downloaders || 0) / v : null,
      pagesPerVisitor: v ? (t.views || 0) / v : null,
      onePageShare: v ? single.n / v : null,
      aiVisitors: t.aiVisitors || 0,
      aiCrawlerHits: bots.n,
    };
  }

  function report(days, now = Date.now()) {
    const to = dayOf(now);
    const from = shiftDay(to, -(days - 1));
    const prevTo = shiftDay(from, -1);
    const prevFrom = shiftDay(prevTo, -(days - 1));
    const range = [from, to];

    const byDay = new Map(all(
      `SELECT day, COUNT(DISTINCT CASE WHEN type = 'view' THEN visitor END) visitors,
              SUM(type = 'view') views, SUM(type = 'download') downloads
       FROM events WHERE day BETWEEN ? AND ? GROUP BY day`, ...range).map((r) => [r.day, r]));
    const daily = [];
    for (let d = from; d <= to; d = shiftDay(d, 1)) {
      const r = byDay.get(d) || {};
      daily.push({ day: d, visitors: r.visitors || 0, views: r.views || 0, downloads: r.downloads || 0 });
    }

    // A visitor's source is where their first page view of the day came from.
    const sources = all(
      `WITH first AS (SELECT MIN(id) id FROM events WHERE type = 'view' AND day BETWEEN ? AND ? GROUP BY day, visitor),
            got AS (SELECT DISTINCT day, visitor FROM events WHERE type = 'download' AND day BETWEEN ? AND ?)
       SELECT CASE WHEN e.channel = 'internal' THEN 'Direct' ELSE e.channel END channel,
              CASE WHEN e.channel = 'internal' THEN 'Typed, bookmarked or from an app' ELSE e.source END source,
              COUNT(*) visitors, COUNT(got.visitor) downloaders
       FROM first JOIN events e ON e.id = first.id
       LEFT JOIN got ON got.day = e.day AND got.visitor = e.visitor
       GROUP BY 1, 2 ORDER BY visitors DESC LIMIT 40`, ...range, ...range);

    return {
      days, from, to,
      now: totals(from, to),
      before: totals(prevFrom, prevTo),
      daily,
      sources,
      campaigns: all(
        `SELECT campaign, source, COUNT(DISTINCT day || visitor) visitors FROM events
         WHERE type = 'view' AND campaign <> '' AND day BETWEEN ? AND ? GROUP BY 1, 2 ORDER BY visitors DESC LIMIT 20`, ...range),
      pages: all(
        `SELECT path, COUNT(*) views, COUNT(DISTINCT day || visitor) visitors FROM events
         WHERE type = 'view' AND day BETWEEN ? AND ? GROUP BY path ORDER BY views DESC LIMIT 20`, ...range),
      platforms: all(
        `SELECT platform, COUNT(*) downloads FROM events WHERE type = 'download' AND day BETWEEN ? AND ?
         GROUP BY platform ORDER BY downloads DESC`, ...range),
      downloadPages: all(
        `SELECT path, COUNT(*) downloads FROM events WHERE type = 'download' AND day BETWEEN ? AND ?
         GROUP BY path ORDER BY downloads DESC LIMIT 10`, ...range),
      systems: all(
        `SELECT os, device, COUNT(DISTINCT day || visitor) visitors FROM events
         WHERE type = 'view' AND day BETWEEN ? AND ? GROUP BY os, device ORDER BY visitors DESC LIMIT 12`, ...range),
      browsers: all(
        `SELECT browser, COUNT(DISTINCT day || visitor) visitors FROM events
         WHERE type = 'view' AND day BETWEEN ? AND ? GROUP BY browser ORDER BY visitors DESC LIMIT 8`, ...range),
      languages: all(
        `SELECT lang, COUNT(DISTINCT day || visitor) visitors FROM events
         WHERE type = 'view' AND lang <> '' AND day BETWEEN ? AND ? GROUP BY lang ORDER BY visitors DESC LIMIT 12`, ...range),
      countries: all(
        `SELECT country, COUNT(DISTINCT day || visitor) visitors FROM events
         WHERE type = 'view' AND country <> '' AND day BETWEEN ? AND ? GROUP BY country ORDER BY visitors DESC LIMIT 12`, ...range),
      bots: all(
        `SELECT kind, name, SUM(hits) hits, COUNT(DISTINCT path) pages, MAX(last_ts) last FROM bots
         WHERE day BETWEEN ? AND ? GROUP BY kind, name ORDER BY hits DESC`, ...range),
      aiPages: all(
        `SELECT path, SUM(hits) hits FROM bots WHERE kind = 'ai' AND day BETWEEN ? AND ?
         GROUP BY path ORDER BY hits DESC LIMIT 10`, ...range),
      notFound: all(
        `SELECT path, SUM(hits) hits FROM notfound WHERE day BETWEEN ? AND ? GROUP BY path ORDER BY hits DESC LIMIT 15`, ...range),
    };
  }

  return {
    record, recordBot, recordNotFound, report, dayOf,
    getMeta: (k) => (q.metaGet.get(k) || {}).v,
    setMeta: (k, v) => q.metaPut.run(k, String(v)),
    close: () => db.close(),
  };
}

module.exports = { open, findBot, findSource, describeBrowser };
