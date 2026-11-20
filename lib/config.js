'use strict';
// Settings come from site.config.json; environment variables override them
// so secrets and per-host values never need to be committed.
const fs = require('fs');
const path = require('path');

const root = path.join(__dirname, '..');
const file = JSON.parse(fs.readFileSync(path.join(root, 'site.config.json'), 'utf8'));
const env = process.env;

const httpUrl = (u) => (/^https?:\/\//i.test(u || '') ? u : '');

const config = {
  root,
  name: file.name || 'PocketFerry',
  siteUrl: (env.SITE_URL || file.siteUrl || '').replace(/\/+$/, ''),
  version: file.version || '',
  updated: file.updated || new Date().toISOString().slice(0, 10),
  timezone: env.SITE_TIMEZONE || file.timezone || 'UTC',
  publisher: file.publisher || '',
  contactEmail: file.contactEmail || '',
  sourceUrl: httpUrl(file.sourceUrl),
  downloads: {},
  port: Number(env.PORT) || 3000,
  dataDir: env.DATA_DIR || path.join(root, 'data'),
  adminPassword: env.ADMIN_PASSWORD || '',
  sessionSecret: env.SESSION_SECRET || '',
  // Number of reverse proxies in front of the app (0 = none, 1 = most hosts,
  // 2 = a CDN such as Cloudflare in front of the host's own proxy).
  trustProxy: Number(env.TRUST_PROXY) || 0,
};

const labels = { mac: 'Mac', windows: 'Windows', linux: 'Linux' };
const files = { mac: '.dmg', windows: '.exe installer', linux: '.AppImage' };
for (const key of Object.keys(labels)) {
  const d = (file.downloads && file.downloads[key]) || {};
  config.downloads[key] = {
    key,
    label: labels[key],
    fileType: files[key],
    url: httpUrl(env['DOWNLOAD_' + key.toUpperCase()] || d.url),
    requires: d.requires || '',
  };
}

module.exports = config;
