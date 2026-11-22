# PocketFerry website

Marketing site for PocketFerry (photos and videos between an Android phone and a computer, in either direction).
A static site for GitHub Pages: `build.js` writes plain HTML into `dist/`, and a workflow publishes it on every push
to `main`. No dependencies. Download numbers come from GitHub Releases.

## Run it locally

Requires Node.js 20 or newer.

```
npm run preview     # builds for localhost and serves it on http://localhost:8080
npm test            # builds into a temporary folder and checks the output
```

## Publish on GitHub Pages

1. On GitHub, open the repository's **Settings → Pages** and set **Source** to **GitHub Actions**.
2. Push to `main`. `.github/workflows/pages.yml` runs the tests, builds and deploys. The address appears in the
   workflow run and in Settings → Pages.
3. **Custom domain (recommended).** Add it in Settings → Pages, follow GitHub's DNS instructions and tick
   **Enforce HTTPS**. Then put the address in `siteUrl` (e.g. `https://pocketferry.app`).
   Without a custom domain the site lives at `https://<user>.github.io/<repo>/`; every link is built with that
   prefix and it works, but search engines only read `robots.txt` at the root of a domain, so the site's own
   `robots.txt` and `llms.txt` are ignored there.

If `siteUrl` is empty, the workflow uses the address GitHub Pages reports.

## Before going live

1. **Publish the installers as GitHub Releases**, in this repository or another public one. Upload the files to a
   release (Releases → Draft a new release → attach the files).
2. **`site.config.json`**
   - `downloads.mac.url` / `windows.url` / `linux.url`: the link to each installer. Use GitHub's "latest" form so
     the link never has to change, as long as each release uses the same file name:
     `https://github.com/<owner>/<repo>/releases/latest/download/PocketFerry.dmg`.
     A platform with an empty `url` shows "Coming soon".
   - `downloads.*.requires`: minimum system version, shown on the download page (e.g. `macOS 12 or later`).
   - `siteUrl`: your public address (used in canonical links, sitemap, social previews).
   - `publisher`, `contactEmail`, `sourceUrl`: optional; shown and added to structured data when filled in.
   - `version` and `updated`: change these with every release. Visible "updated" dates matter to search engines and AI assistants.
3. **Read the copy.** The pages describe what the app does today. If you change the app (file types, default folder,
   limits), change `lib/pages.js` to match. Do not add ratings, user counts or testimonials you do not have.

## Download numbers

The download buttons link straight to the release files, and GitHub counts every download of each file.

```
npm run downloads                   # repository taken from the download links in site.config.json
npm run downloads -- owner/repo     # or name it
```

It prints each release with its files and download counts, then totals for Mac, Windows and Linux. For a private
repository, or to avoid GitHub's limit of 60 requests an hour, run it with a token:
`GITHUB_TOKEN=$(gh auth token) npm run downloads`.

What the number means: completed or started downloads of the file from anywhere: this site, the Releases page,
links shared elsewhere, and scripts. It is not split by which page or which visitor sent it. GitHub keeps only the
running total, so to see a trend, note the totals now and then (for example monthly).

There are no visitor statistics. The site sets no cookies and loads no third-party scripts, and the privacy page
says so. If you add an analytics service later, update the privacy page and the `Content-Security-Policy` in
`lib/layout.js`.

## SEO and GEO: what is built in

- One clear topic per page with a direct answer in the first paragraph; question-style headings
- Unique titles (60 characters or fewer) and descriptions, canonical links, Open Graph and social preview image
- Structured data: `SoftwareApplication` (free), `HowTo`, `FAQPage`, `TechArticle`, `BreadcrumbList`
- `sitemap.xml`, `robots.txt` that welcomes AI crawlers, `llms.txt` with key facts
- A facts table and a balanced comparison page (including when not to use PocketFerry), which assistants quote readily
- Fast pages: no framework, one small CSS file, one self-hosted font, WebP images with sizes
- Correct 404 page and a content security policy (GitHub Pages adds HTTPS and compression)

`llms.txt` costs nothing to serve, but there is no solid evidence yet that the major AI services read it. Treat it as a bonus.

## SEO and GEO: what only you can do after launch

1. Add the site to **Google Search Console** and **Bing Webmaster Tools** and submit `/sitemap.xml`.
   Bing matters more than its market share suggests: its index feeds Copilot and ChatGPT search.
2. Get the app listed where assistants and people look for alternatives: AlternativeTo, Product Hunt, a GitHub
   repository whose README links to the site, the Microsoft Store, Homebrew and winget if you publish there.
3. Answer real questions on Reddit and forums ("how do I get videos from Android to my Mac") honestly, with a link
   where it helps. Assistants lean heavily on these discussions for "best way to…" questions.
4. Keep the name, one-line description and facts identical everywhere. Consistency is how assistants learn what PocketFerry is.
5. Check the download numbers monthly (`npm run downloads`) and Search Console for the questions people search for.
   Write a new guide page for each question people actually arrive with (add a function in `lib/pages.js`).
6. Validate structured data once with Google's Rich Results Test and validator.schema.org after the domain is live.

## Layout

```
build.js                     writes the site into dist/: pages, assets, robots.txt, sitemap.xml, llms.txt, 404.html
lib/pages.js                 all page content, FAQ, llms.txt
lib/layout.js                HTML shell, meta tags, structured data
lib/config.js                reads site.config.json
public/                      CSS, scripts, images, font (published under /assets/)
site.config.json             name, address, version, download links
scripts/downloads.js         download counts from GitHub Releases
scripts/preview.js           local preview server
test/smoke.js                checks the built output
.github/workflows/pages.yml  builds and deploys to GitHub Pages
```

The font is Bricolage Grotesque (SIL Open Font License, see `public/fonts/LICENSE-bricolage.txt`).
