# PocketFerry website

Marketing site for PocketFerry (photos and videos between an Android phone and a computer, in either direction) with built-in visitor and download statistics and a
password-protected admin page. One Node.js process, no dependencies, one SQLite file.

## Run it

Requires Node.js 22.13 or newer.

```
ADMIN_PASSWORD="choose-a-long-password" npm start
```

Open http://localhost:3000 for the site and http://localhost:3000/admin for statistics.
`npm test` runs the end-to-end checks.

## Before going live

1. **`site.config.json`**
   - `siteUrl`: your public address, e.g. `https://yourdomain.com` (used in canonical links, sitemap, social previews).
   - `downloads.mac.url` / `windows.url` / `linux.url`: where each installer file lives (for example a GitHub Releases
     link). A platform with an empty `url` shows "Coming soon".
   - `downloads.*.requires`: minimum system version, shown on the download page (e.g. `macOS 12 or later`).
   - `publisher`, `contactEmail`, `sourceUrl`: optional; shown and added to structured data when filled in.
   - `version` and `updated`: change these with every release. Visible "updated" dates matter to search engines and AI assistants.
2. **Environment variables** (set them at your host, never in the repository)
   - `ADMIN_PASSWORD`: 10+ characters. Without it `/admin` is switched off.
   - `SITE_URL`: overrides `siteUrl`.
   - `TRUST_PROXY`: number of proxies in front of the app. `1` on most hosts, `2` if a CDN such as Cloudflare sits
     in front of the host. Needed for correct visitor counts and for HTTPS detection.
   - `DATA_DIR`: folder for `stats.sqlite`. **It must be on a persistent disk**, otherwise statistics are lost on every deploy.
   - `PORT`, `SESSION_SECRET` (optional), `DOWNLOAD_MAC` / `DOWNLOAD_WINDOWS` / `DOWNLOAD_LINUX` (override the config).
3. **Read the copy.** The pages describe what the app does today. If you change the app (file types, default folder,
   limits), change `lib/pages.js` to match. Do not add ratings, user counts or testimonials you do not have.

## Hosting

Any host that runs a long-lived Node.js process with a persistent disk works: a small VPS, Fly.io or Railway with a
volume, Render with a disk. Static hosts (GitHub Pages, Netlify static) will not work because statistics need a server.
Put the domain on HTTPS; the site then sends HSTS and secure cookies automatically.

## What the admin page shows

- Visitors, page views, downloads, download rate, each compared with the previous period
- Where visitors come from (search engines, AI assistants, social, other sites, email, campaign links) and how many
  from each source went on to download
- Downloads by system (Mac, Windows, Linux) and which page's button was used
- Visitors sent by AI assistants (ChatGPT, Perplexity, Claude, Gemini, Copilot and others)
- AI crawler and search crawler visits by bot, pages they read, and when each was last seen
- Link previews (your link shared in WhatsApp, Slack, Facebook and so on)
- Devices, browsers, languages or countries; addresses that returned "not found"; daily numbers with CSV export

Tag links you share so they show up by name: `https://yourdomain.com/?utm_source=reddit&utm_campaign=launch`.

### How counting works

- Counted on the server, so ad blockers do not hide visitors. Only real page loads count; recognised bots are
  counted separately.
- No cookies, no stored IP addresses. A visitor is a hash of IP + browser + a random key that is replaced every day,
  so "visitors" means unique visitors per day, added up over the period.
- A download is a click on a `/download/<system>` link, which records the click and redirects to the installer.
  It measures intent to download, not completed installs.
- If you put a CDN in front of the site, do not let it cache HTML pages, or views served from its cache will not be counted.

## SEO and GEO: what is built in

- One clear topic per page with a direct answer in the first paragraph; question-style headings
- Unique titles (60 characters or fewer) and descriptions, canonical links, Open Graph and social preview image
- Structured data: `SoftwareApplication` (free), `HowTo`, `FAQPage`, `TechArticle`, `BreadcrumbList`
- `sitemap.xml`, `robots.txt` that welcomes AI crawlers and keeps `/admin` out, `llms.txt` with key facts
- A facts table and a balanced comparison page (including when not to use PocketFerry), which assistants quote readily
- Fast pages: no framework, one small CSS file, one self-hosted font, WebP images with sizes, gzip, year-long asset caching
- Correct 404 status, trailing-slash redirects, security headers

`llms.txt` costs nothing to serve, but there is no solid evidence yet that the major AI services read it. Treat it as a bonus.

## SEO and GEO: what only you can do after launch

1. Add the site to **Google Search Console** and **Bing Webmaster Tools** and submit `/sitemap.xml`.
   Bing matters more than its market share suggests: its index feeds Copilot and ChatGPT search.
2. Get the app listed where assistants and people look for alternatives: AlternativeTo, Product Hunt, a GitHub
   repository whose README links to the site, the Microsoft Store, Homebrew and winget if you publish there.
3. Answer real questions on Reddit and forums ("how do I get videos from Android to my Mac") honestly, with a link
   where it helps. Assistants lean heavily on these discussions for "best way to…" questions.
4. Keep the name, one-line description and facts identical everywhere. Consistency is how assistants learn what PocketFerry is.
5. Check the admin page monthly: which AI crawlers visit, which assistants send visitors, and which pages convert.
   Write a new guide page for each question people actually arrive with (add a function in `lib/pages.js`).
6. Validate structured data once with Google's Rich Results Test and validator.schema.org after the domain is live.

## Layout

```
server.js            routing, caching, security headers, download counter, admin sign-in
lib/pages.js         all page content, FAQ, llms.txt
lib/layout.js        HTML shell, meta tags, structured data
lib/analytics.js     tracking, bot and source recognition, report queries
lib/admin.js         sign-in page, dashboard, charts
public/              CSS, scripts, images, font
site.config.json     name, address, version, download links
test/smoke.js        end-to-end checks
```

The font is Bricolage Grotesque (SIL Open Font License, see `public/fonts/LICENSE-bricolage.txt`).
