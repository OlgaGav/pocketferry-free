'use strict';
// Settings come from site.config.json; environment variables override them
// so per-build values never need to be committed.
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
  publisher: file.publisher || '',
  contactEmail: file.contactEmail || '',
  sourceUrl: httpUrl(file.sourceUrl),
  googleSiteVerification: file.googleSiteVerification || '',
  downloads: {},
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
