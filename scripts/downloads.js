'use strict';
/*
 * Download counts from GitHub Releases.
 *   npm run downloads                  (repository taken from the download links in site.config.json)
 *   npm run downloads -- owner/repo    (or name it yourself)
 * Set GITHUB_TOKEN for a private repository or to avoid the 60-requests-an-hour limit.
 *
 * GitHub counts every download of a release file: from this website, from the
 * Releases page, from links shared elsewhere, and from scripts.
 */
const config = require('../lib/config');

const platformOf = (name) => {
  const n = name.toLowerCase();
  if (/\.(dmg|pkg)$/.test(n) || /mac|darwin/.test(n)) return 'Mac';
  if (/\.(exe|msi|msix)$/.test(n) || /win/.test(n)) return 'Windows';
  if (/\.(appimage|deb|rpm|flatpak|snap)$/.test(n) || /linux/.test(n)) return 'Linux';
  return 'Other';
};

function repoFromConfig() {
  for (const d of Object.values(config.downloads)) {
    const m = /^https:\/\/github\.com\/([^/]+\/[^/]+)\/releases\//.exec(d.url);
    if (m) return m[1];
  }
  return '';
}

async function main() {
  const repo = process.argv[2] || repoFromConfig();
  if (!/^[\w.-]+\/[\w.-]+$/.test(repo)) {
    console.error('Which repository? Run: npm run downloads -- owner/repo\n(or put GitHub Releases links in site.config.json)');
    process.exit(1);
  }
  const headers = { Accept: 'application/vnd.github+json', 'User-Agent': 'pocketferry-site' };
  if (process.env.GITHUB_TOKEN) headers.Authorization = `Bearer ${process.env.GITHUB_TOKEN}`;

  const releases = [];
  for (let page = 1; ; page++) {
    const res = await fetch(`https://api.github.com/repos/${repo}/releases?per_page=100&page=${page}`, { headers });
    if (!res.ok) {
      console.error(`GitHub answered ${res.status} for ${repo}: ${(await res.json().catch(() => ({}))).message || res.statusText}`);
      process.exit(1);
    }
    const batch = await res.json();
    releases.push(...batch);
    if (batch.length < 100) break;
  }
  if (!releases.length) return console.log(`${repo} has no releases yet.`);

  const totals = {};
  let all = 0;
  console.log(`Downloads for ${repo}\n`);
  for (const r of releases) {
    const date = (r.published_at || r.created_at || '').slice(0, 10);
    console.log(`${r.tag_name}${r.name && r.name !== r.tag_name ? ` (${r.name})` : ''}  ${date}${r.draft ? '  draft' : ''}${r.prerelease ? '  pre-release' : ''}`);
    if (!r.assets.length) console.log('  no files');
    for (const a of r.assets) {
      const p = platformOf(a.name);
      totals[p] = (totals[p] || 0) + a.download_count;
      all += a.download_count;
      console.log(`  ${String(a.download_count).padStart(8)}  ${a.name}`);
    }
    console.log('');
  }
  console.log('All releases');
  for (const [p, n] of Object.entries(totals).sort((x, y) => y[1] - x[1])) console.log(`  ${String(n).padStart(8)}  ${p}`);
  console.log(`  ${String(all).padStart(8)}  Total`);
}

main().catch((e) => { console.error(e.message); process.exit(1); });
