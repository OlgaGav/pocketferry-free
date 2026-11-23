# How pages work

This site is built by a small static site generator written for this project. You write each page once as a
JavaScript function; `build.js` wraps it in the shared layout and writes plain HTML files to `dist/`, which GitHub
Pages publishes. No framework and no dependencies, only Node.js.

This guide explains how to edit, add and remove pages, and how to preview and publish them.

## The big picture

```
YOU EDIT                                          GENERATED (in dist/, not in git)
site.config.json   name, version, download links ─┐
lib/pages.js       the content of every page     ─┼─► node build.js ─► index.html, faq.html, …, 404.html
lib/layout.js      <head>, header, nav, footer   ─┤                    sitemap.xml, robots.txt, llms.txt
public/            CSS, JS, images, font         ─┘                    assets/ (copy of public/)
```

| File | What it holds |
|---|---|
| `lib/pages.js` | One function per page, the shared FAQ list, small helpers (buttons, steps, screenshots), `llms.txt` |
| `lib/layout.js` | `render()`: the HTML around every page — meta tags, header and nav, footer. Also `esc()` and the app's structured data |
| `lib/config.js` | Reads `site.config.json` (and `SITE_URL`) into the `config` object |
| `build.js` | Calls every page function, writes the files, copies `public/`, makes the sitemap |
| `public/` | Static files, published under `/assets/` |
| `test/smoke.js` | Checks the built site; runs before every deploy |

Never edit `dist/`. It is deleted and rebuilt on every build.

## Commands

| Command | What it does |
|---|---|
| `npm run preview` | Builds for `http://localhost:8080` and serves it like GitHub Pages does. Open the address in a browser. Stop with Ctrl+C. It builds once at start, so restart it after each change. Use `PORT=8081 npm run preview` if 8080 is busy. |
| `npm run build` | Builds the real site into `dist/` (for the address in `siteUrl`). You rarely need this; GitHub does it on deploy. |
| `npm test` | Builds into a temporary folder and checks it. If it fails, the deploy stops. |

Publishing: commit and push to `main`. The workflow in `.github/workflows/pages.yml` runs the tests, builds and
deploys. It takes 1–2 minutes; watch it in the repository's Actions tab.

Opening `dist/index.html` directly from disk does not work properly: links point to the real site address. Use
`npm run preview`.

## Anatomy of a page

A page is a function that receives `{ base, asset }` and returns an object. This is the FAQ page, slightly shortened:

```js
function faq({ base }) {
  const page = {
    path: '/faq',                                   // address; the file becomes dist/faq.html
    title: `${N} FAQ: Price, Quality, Privacy and Setup`,
    description: `Answers about ${N}: is it free, both directions, does it compress photos, …`,
    h1: `${N} questions and answers`,
    crumb: 'FAQ',
  };
  page.schema = [faqSchema(FAQ)];
  page.body = `
<article class="wrap narrow doc">
  <h1>${page.h1}</h1>
  ${faqHtml(FAQ)}
  ${cta()}
  ${updatedLine()}
</article>`;
  return page;
}
```

The function arguments:

- `base` — the site address without a trailing slash, e.g. `https://olgagav.github.io/pocketferry-free`.
  Use it only for full URLs in structured data. Normal links do not need it.
- `asset(file)` — returns the address of a file in `public/`, with a version hash: `asset('img/phone.webp')` →
  `/assets/img/phone.webp?v=3f2a…`.

### Page fields

| Field | Required | Used for |
|---|---|---|
| `path` | yes | The address: `'/'` for the home page, otherwise `'/some-name'` (lowercase, dashes, no trailing slash). |
| `title` | yes | `<title>`, the search result title, social previews. **At most 60 characters** and unique (the test checks). |
| `description` | yes | Meta description, the text under the title in search results. **70–160 characters** (the test checks). |
| `body` | yes | The page's HTML, placed inside `<main>`. It must contain **exactly one `<h1>`**. |
| `h1` | usually | The heading text. The layout does not print it for you; write `<h1>${page.h1}</h1>` in the body. It is also used by the breadcrumb and article data. |
| `crumb` | no | Short name for the breadcrumb in Google results (e.g. `'FAQ'`). Falls back to `h1`. |
| `schema` | no | List of structured-data objects (see below). |
| `wide` | no | `true` gives `<main class="wide">` for full-width layouts like the home page. |
| `ogTitle` | no | A different title for social previews. |
| `noindex` | no | `true` tells search engines not to index the page (used by the 404 page). |

### Writing the body

The body is a JavaScript template literal: HTML between backticks, with `${…}` to insert values.

```js
page.body = `
<article class="wrap narrow doc">
  <h1>${page.h1}</h1>
  <p class="lede">${N} is free.</p>          <!-- N is the app name from site.config.json -->
  ${config.version ? `<p>Version ${esc(config.version)}</p>` : ''}   <!-- show only if set -->
</article>`;
```

- A backtick or `${` in your text must be written as `` \` `` or `\${`.
- `${…}` inserts text as-is. Wrap values that are not your own HTML in `esc()` so characters like `&` and `<`
  are escaped, especially inside attributes: `alt="${esc(text)}"`. Text you type directly in the HTML needs no
  escaping, except writing `&amp;` for `&`.
- The usual wrapper for text pages is `<article class="wrap narrow doc">`. Other classes in use: `lede`
  (intro paragraph), `plain` (simple lists), `band` (full-width coloured section), `qa` (questions),
  `steps`, `facts` (table). They are all in `public/site.css`.

### Links

Write every internal link from the site root, as if the site were at the top of a domain:

```html
<a href="/download">Download</a>     <!-- correct -->
<a href="/faq#free">…</a>            <!-- anchors are fine -->
<a href="download.html">…</a>        <!-- wrong -->
```

`build.js` adds `/pocketferry-free` in front of every `href="/…"` and `src="/…"` when the site lives in a
subfolder, and leaves them alone on a custom domain. The test fails if a link points to a page that does not exist.

External links are normal full URLs. Add `rel="noopener"` when they open other sites.

### Images and other files

1. Put the file in `public/`, e.g. `public/img/settings.webp`. WebP is smallest.
2. Use `asset()` for the address, and always give `width`, `height` and `alt` (the test checks):

```js
`<img src="${asset('img/settings.webp')}" width="1040" height="720" alt="${esc('The settings window of ' + N)}" loading="lazy" decoding="async">`
```

`width` and `height` are the image's real pixel size; CSS scales it. Use `loading="lazy"` for images below the
first screen. The screenshots used on several pages are listed once in `SHOTS` in `lib/pages.js`; add yours there
if more than one page shows it, and insert it with `shot(asset, 'name')`.

### What the security policy blocks

Every page carries a Content-Security-Policy (GitHub Pages cannot send it as a header). It allows only files from
the site itself, so:

- No inline styles: `<p style="color:red">` is ignored. Add a class to `public/site.css` instead.
- No inline scripts or `onclick="…"`. Put JavaScript in `public/site.js`.
- No images, fonts or scripts from other sites (CDNs, YouTube embeds, Google Fonts). Download the file into
  `public/` instead, or change the policy in `lib/layout.js` if you really need the outside source.

## Shared pieces you can reuse

All in `lib/pages.js`:

| Helper | Produces |
|---|---|
| `N` | The app name |
| `cta(text, platform)` | Download button. Without `platform` it picks the visitor's system; `'mac'`, `'windows'` or `'linux'` links that installer |
| `ctaBoth()` | Mac and Windows buttons side by side |
| `stepsHtml(steps)` | Numbered steps from `[[heading, text], …]` |
| `faqHtml(items, tag)` | Questions and answers from `[[question, answerHtml], …]` |
| `FAQ` | The shared question list (FAQ page, home page, `llms.txt`) |
| `shot(asset, name)` | One of the screenshots in `SHOTS` |
| `updatedLine()` | "Updated <date>" from `updated` in `site.config.json` |
| `esc(text)` | Escapes text for HTML (from `lib/layout.js`) |

Change the FAQ answer in `FAQ` once and it updates the FAQ page, the home page and `llms.txt`.

## Structured data (`schema`)

Structured data is JSON that tells Google what a page is about, which can give richer search results. Each object
in `page.schema` becomes a `<script type="application/ld+json">` block. Ready-made builders:

| Builder | Use on |
|---|---|
| `articleSchema(base, page)` | Guides and help pages |
| `howToSchema(base, name, steps)` | Pages with step-by-step instructions |
| `faqSchema(items)` | Pages with questions and answers |
| `softwareSchema(base)` | Pages about the app itself (home, download) |

A breadcrumb is added automatically to every page except the home page. Only describe what is actually on the page,
and never add ratings or reviews you do not have.

## Common tasks

### Change text on a page

Find the page's function in `lib/pages.js` (search for its `path`, e.g. `'/faq'`), edit the HTML in `body`,
then `npm run preview` to check.

### Add a page

1. Write the function in `lib/pages.js`, above the `builders` line. Copy a similar page as a starting point;
   `privacy` is the simplest.

   ```js
   function pricing({ base }) {
     const page = {
       path: '/pricing',
       title: `${N} Pricing: Free, No Account, No Ads`,
       description: `${N} is completely free for Mac, Windows and Linux: no account, no subscription, no paid version and no ads.`,
       h1: `${N} pricing`,
       crumb: 'Pricing',
     };
     page.schema = [articleSchema(base, page)];
     page.body = `
   <article class="wrap narrow doc">
     <h1>${page.h1}</h1>
     <p class="lede">${N} is free. There is nothing to buy.</p>
     ${cta()}
     ${updatedLine()}
   </article>`;
     return page;
   }
   ```

2. Add it to the list; the order is the order in the sitemap and `llms.txt`:

   ```js
   const builders = [home, download, toMac, toWindows, toAndroid, compare, faq, troubleshooting, privacy, pricing];
   ```

3. Link to it so people and search engines can find it: the footer list (`footLinks`) and, if it belongs there,
   the top menu (`NAV`) in `lib/layout.js`, or a link from a related page.

4. Add its path to the `paths` list near the top of `test/smoke.js`. The test compares the built pages with that
   list, so without this step `npm test` fails and the deploy stops.

5. `npm test`, `npm run preview`, then commit and push. The sitemap updates by itself.

### Remove a page

Remove the function and its name from `builders`, remove its links (search the project for its path, e.g.
`/pricing`), and remove it from `paths` in `test/smoke.js`. The old address will show the 404 page.

### Rename a page's address

Change `path`, update every link to it and the test's `paths`. Search engines treat it as a new page; avoid
renaming pages that are already indexed.

### Change the header, menu or footer

`lib/layout.js`: `NAV` is the top menu, `footLinks` the footer list, and the HTML at the end of `render()` is the
frame around every page. Meta tags are the `head` list in `render()`.

### Change the look

`public/site.css` for styles, `public/site.js` for browser behaviour (it picks the right download for the visitor's
system and shows the "open this on your computer" note on phones). Changes reach visitors immediately because file
links include a version hash.

### New release

In `site.config.json`, update `version`, `updated` (the date, `YYYY-MM-DD`) and the download URLs if they changed.
`updated` appears on the pages and in the sitemap, which tells search engines to look again.

## When something goes wrong

| Message | Cause |
|---|---|
| `Set the site address: siteUrl in site.config.json, or SITE_URL.` | `siteUrl` is empty. Set it, or run `SITE_URL=https://… node build.js`. |
| `EADDRINUSE … 8080` on preview | A preview is already running (maybe in another terminal). Stop it with Ctrl+C there, or use `PORT=8081 npm run preview`. |
| `FAIL every page: …` from `npm test` | The message names the page and the rule: title too long, description length, more or fewer than one `<h1>`, a link to an unknown page, an image without `alt`/size, or a missing file under `/assets/`. |
| `SyntaxError` when building | Usually an unescaped backtick in page text, or a missing `` ` ``, `}` or `,` in `lib/pages.js`. The error shows the line number. |
| A style or script has no effect | The security policy blocks inline `style=""`, `<script>` and outside files; see above. |
| The live site did not change | Check the Actions tab on GitHub: a failed test stops the deploy. Then reload the page without cache (Cmd+Shift+R). |

## Reusing this for another site

Copy the project without `dist/`, `node_modules/` and `.git/`, then:

1. Set `name`, `siteUrl` and the other fields in `site.config.json`; clear `googleSiteVerification`.
2. Replace the pages in `lib/pages.js` and the `paths` in `test/smoke.js`; remove app-specific checks from the test.
3. Update `NAV`, `footLinks`, the footer text and `softwareSchema` in `lib/layout.js`.
4. Replace the images, colours and font in `public/`.
5. Create a GitHub repository, push, and set **Settings → Pages → Source: GitHub Actions**.
