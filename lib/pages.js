'use strict';
/*
 * All public page content lives here. Each page starts with a direct answer to
 * the question in its title: that is what search engines show as a snippet and
 * what AI assistants quote.
 */
const config = require('./config');
const { esc, softwareSchema, niceDate } = require('./layout');

const N = config.name;

// ---------- shared pieces ----------

const FAQ = [
  [`What is ${N}?`,
    `${N} is a free app for Mac, Windows and Linux that moves photos and videos between an Android phone and a computer over Wi-Fi, in either direction. The computer shows a QR code, you scan it with the phone's camera, and a page opens in the phone's browser. From there you can send photos and videos to the computer, or save the ones the computer is offering.`],
  [`Is ${N} free?`,
    `Yes. ${N} is free to download and use. There is no account, no subscription and no paid version.`],
  ['Do I need to install an app on my Android phone?',
    `No. The phone only needs its camera and its web browser. Scanning the QR code opens a page that is served by ${N} on your own computer.`],
  ['Can I send photos from the computer to the phone?',
    `Yes. In ${N} on the computer, open "To phone" and add photos and videos with the button or by dragging them into the window. On the phone, open "Get from computer" and tap Save, or Save all. The files stay where they are on the computer; the phone saves a copy.`],
  ['Does it need an internet connection?',
    `No. The phone and the computer only need to be on the same Wi-Fi network. Files travel directly between the two devices inside that network and are never uploaded to a cloud server.`],
  [`Does ${N} reduce photo or video quality?`,
    `No. In both directions ${N} copies each file exactly as it is, with no compression or resizing. Files sent to the computer keep their original date. Note that Android may remove the GPS location from a photo when it is shared through a browser.`],
  ['Is there a file size limit?',
    `${N} has no file size limit. Long videos are streamed straight to and from disk, so the only limit is free storage space on the receiving device.`],
  ['Where are photos from the phone saved on the computer?',
    `By default in a folder called ${N} inside your Pictures folder. You can choose any other folder with the Change button, and Open folder shows the files.`],
  ['Where are files from the computer saved on the phone?',
    `In the phone's Downloads folder, because they are saved by the phone's browser. Most gallery apps show them in an album called Download, and the Files app shows them under Downloads.`],
  ['Which file types can I transfer?',
    `Photos and videos, in both directions: JPEG, PNG, HEIC/HEIF, WebP, GIF, AVIF, BMP, TIFF, DNG (RAW), MP4, MOV, M4V, MKV, WebM, 3GP, AVI and MTS. Other kinds of files are refused.`],
  ['What happens if I send the same photos to the computer twice?',
    `Files that are already in the folder with the same name and size are skipped, so you can select your whole camera roll again without creating duplicates. A different file that happens to have the same name is saved with a number, such as IMG_0001 (1).jpg.`],
  ['What if a transfer is interrupted?',
    `An incomplete file sent to the computer is discarded, never left half-written, and the phone page has a "Try the failed ones again" button. A download to the phone can be resumed from the browser's downloads list.`],
  [`Is ${N} secure?`,
    `The link in the QR code contains a long random code, and nothing can be sent or fetched without it. The phone can fetch only the files you added to the "To phone" list, never anything else on the computer. "Make a new code" cancels the old link at any time. Transfers stay inside your local network but are not encrypted there, so use ${N} on Wi-Fi you trust, such as home or office Wi-Fi, and not on public Wi-Fi.`],
  ['Which computers does it run on?',
    `${N} runs on macOS, Windows and Linux. The phone side is made for Android.`],
  ['Does it back up or sync my photos automatically?',
    `No. ${N} moves the photos and videos you choose, when you choose. It does not run in the background and does not keep two devices in sync.`],
  ['My phone cannot open the page. What should I check?',
    `Make sure the phone is on the same Wi-Fi as the computer (not mobile data or a guest network), and that the computer's firewall allows ${N}. The <a href="/troubleshooting">troubleshooting page</a> lists every fix.`],
];

const strip = (html) => html.replace(/<[^>]+>/g, '');

const faqSchema = (items) => ({
  '@context': 'https://schema.org',
  '@type': 'FAQPage',
  mainEntity: items.map(([q, a]) => ({ '@type': 'Question', name: q, acceptedAnswer: { '@type': 'Answer', text: strip(a) } })),
});

const faqHtml = (items, tag = 'h2') =>
  `<div class="qa">${items.map(([q, a]) => `<section><${tag}>${esc(q)}</${tag}><p>${a}</p></section>`).join('')}</div>`;

const articleSchema = (base, page) => ({
  '@context': 'https://schema.org',
  '@type': 'TechArticle',
  headline: page.h1,
  description: page.description,
  dateModified: config.updated,
  datePublished: config.updated,
  mainEntityOfPage: base + page.path,
  image: base + '/assets/img/og.png',
  about: { '@id': base + '/#app' },
  ...(config.publisher ? { author: { '@type': 'Organization', name: config.publisher }, publisher: { '@type': 'Organization', name: config.publisher } } : {}),
});

const howToSchema = (base, name, steps) => ({
  '@context': 'https://schema.org',
  '@type': 'HowTo',
  name,
  totalTime: 'PT2M',
  tool: [{ '@type': 'HowToTool', name: `${N} (free)` }, { '@type': 'HowToTool', name: 'Wi-Fi network' }],
  step: steps.map(([n, text], i) => ({ '@type': 'HowToStep', position: i + 1, name: n, text, url: `${base}/#how` })),
});

const STEPS = [
  [`Open ${N} on your computer`, 'The window shows a QR code.'],
  ['Scan the code with your phone', "Point the Android camera at the QR code and tap the link. A page opens in the phone's browser. Nothing is installed."],
  ['Choose a direction', 'Tap "Send to computer" to copy photos and videos from the phone to a folder on the computer. Tap "Get from computer" to save the ones you added on the computer. Either way, files arrive in original quality.'],
];

const stepsHtml = (steps) =>
  `<ol class="steps">${steps.map(([n, t]) => `<li><h3>${esc(n)}</h3><p>${esc(t)}</p></li>`).join('')}</ol>`;

const cta = (text = 'Download free', platform = '') =>
  `<p class="cta"><a class="btn" href="/download${platform ? '/' + platform : ''}"${platform ? ' rel="nofollow"' : ' data-download'}>${text}</a><span class="cta-note" data-phone-note hidden>${N} installs on your computer. Open this page there, or <button type="button" class="linklike" data-share>send yourself the link</button>.</span></p>`;

const ctaBoth = () => {
  const btn = (key, label) => {
    const d = config.downloads[key] || {};
    return d.url
      ? `<a class="btn" href="/download/${key}" rel="nofollow" data-platform-btn="${key}">Download for ${label}</a>`
      : `<a class="btn" href="/download" data-platform-btn="${key}">Download for ${label}</a>`;
  };
  return `<p class="cta">${btn('mac', 'macOS')}${btn('windows', 'Windows')}<span class="cta-note" data-phone-note hidden>${N} installs on your computer. Open this page there, or <button type="button" class="linklike" data-share>send yourself the link</button>.</span></p>`;
};

const updatedLine = () => `<p class="updated">Updated <time datetime="${esc(config.updated)}">${esc(niceDate(config.updated))}</time></p>`;

const SHOTS = {
  computer: ['img/computer.webp', 1040, 720, `${N} on a computer: a QR code to scan, the folder where files are saved, and a list of photos and videos just received from the phone`],
  send: ['img/computer-send.webp', 1040, 720, `The "To phone" tab of ${N} on a computer: photos and a video added to the list, each marked as saved to the phone`],
  phone: ['img/phone.webp', 390, 780, `The ${N} page in an Android phone's browser: the "Get from computer" tab lists photos and a video with Save buttons and a "Save all" button`],
};
const shot = (asset, which, eager) => {
  const [file, w, h, alt] = SHOTS[which];
  return `<img src="${asset(file)}" width="${w}" height="${h}" alt="${esc(alt)}"${eager ? (which === 'computer' ? ' fetchpriority="high"' : '') : ' loading="lazy" decoding="async"'}>`;
};

// ---------- pages ----------

function home({ base, asset }) {
  const page = {
    path: '/',
    title: `${N}: Move Photos Between Android and Your Computer`,
    description: `Free app for Mac, Windows and Linux. Scan a QR code with your Android phone and move photos and videos to or from your computer over Wi-Fi, in full quality.`,
    h1: 'Move photos and videos between your Android phone and your computer',
    wide: true,
  };
  const top = FAQ.filter(([q]) => /free|install an app|from the computer to the phone|internet|quality|secure/i.test(q));
  page.schema = [
    softwareSchema(base),
    { '@context': 'https://schema.org', '@type': 'WebSite', '@id': base + '/#site', name: N, url: base + '/' },
    howToSchema(base, `How to move photos and videos between an Android phone and a computer with ${N}`, STEPS),
    faqSchema(top),
  ];
  page.body = `
<section class="hero">
  <div class="wrap hero-in">
    <div class="hero-text">
      <h1>${page.h1}</h1>
      <p class="lede">${N} is a free app for Mac, Windows and Linux. Scan a QR code with your phone, then send photos and videos to your computer or save ones from your computer to the phone. It works over Wi-Fi in original quality, with no cable, no account, and nothing to install on the phone.</p>
      ${cta()}
      <p class="quiet"><a href="#how">See how it works</a></p>
    </div>
    <div class="hero-shot">
      <div class="shot-computer">${shot(asset, 'computer', true)}</div>
      <div class="shot-phone">${shot(asset, 'phone', true)}</div>
    </div>
  </div>
</section>

<section class="band" id="how">
  <div class="wrap">
    <h2>How it works</h2>
    <p class="sub">Three steps, about two minutes the first time. One QR code covers both directions.</p>
    ${stepsHtml(STEPS)}
  </div>
</section>

<section class="wrap split">
  <div>
    <h2>${N} at a glance</h2>
    <table class="facts">
      <tbody>
        <tr><th scope="row">Price</th><td>Free. No account, no subscription.</td></tr>
        <tr><th scope="row">Direction</th><td>Both: phone to computer, and computer to phone.</td></tr>
        <tr><th scope="row">Computer</th><td>macOS, Windows or Linux</td></tr>
        <tr><th scope="row">Phone</th><td>Android. Nothing to install: it uses the camera and the browser.</td></tr>
        <tr><th scope="row">Connection</th><td>Phone and computer on the same Wi-Fi. No internet needed.</td></tr>
        <tr><th scope="row">Quality</th><td>Original files. No compression or resizing.</td></tr>
        <tr><th scope="row">File size limit</th><td>None. Limited only by free storage space.</td></tr>
        <tr><th scope="row">Where files go</th><td>On the computer, a folder you choose. On the phone, the Downloads folder. Never a cloud server.</td></tr>
        <tr><th scope="row">File types</th><td>Photos and videos, including HEIC, RAW (DNG), MP4 and MOV</td></tr>
        ${config.version ? `<tr><th scope="row">Current version</th><td>${esc(config.version)}</td></tr>` : ''}
      </tbody>
    </table>
  </div>
  <div class="why">
    <h2>Why use it</h2>
    <dl>
      <dt>One tool for both directions</dt>
      <dd>Empty the phone's camera roll onto the computer, or put edited photos and finished videos back on the phone, from the same page.</dd>
      <dt>Videos arrive at full quality</dt>
      <dd>Messaging apps and email shrink videos or refuse large ones. ${N} copies the exact file, however long the video is.</dd>
      <dt>Nothing goes through the cloud</dt>
      <dd>Files travel straight between the phone and your computer inside your own Wi-Fi. There is no upload to wait for and no storage plan to fill.</dd>
      <dt>No cable and no phone app</dt>
      <dd>Useful when the cable is missing, the computer does not show the phone, or the phone belongs to a guest.</dd>
    </dl>
  </div>
</section>

<section class="band band-plain">
  <div class="wrap narrow">
    <h2>Good to know before you start</h2>
    <ul class="plain">
      <li>The phone and the computer must be on the same Wi-Fi network. Mobile data and guest networks do not work.</li>
      <li>The first time, your computer may ask whether ${N} may accept connections on the network. Choose Allow.</li>
      <li>Files saved from the computer land in the phone's Downloads folder, not directly in the camera roll.</li>
      <li>Keep the phone's screen on during long video transfers.</li>
      <li>Use Wi-Fi you trust, such as home or office Wi-Fi. Transfers are protected by a random code but are not encrypted inside the network.</li>
    </ul>
  </div>
</section>

<section class="wrap guides">
  <h2>Guides</h2>
  <ul>
    <li><a href="/android-to-mac">Transfer photos from Android to a Mac without a cable</a></li>
    <li><a href="/android-to-windows">Transfer photos from Android to a Windows PC over Wi-Fi</a></li>
    <li><a href="/computer-to-android">Send photos and videos from a computer to an Android phone</a></li>
    <li><a href="/compare">Five ways to move photos between Android and a computer, compared</a></li>
    <li><a href="/troubleshooting">What to check when the phone cannot connect</a></li>
  </ul>
</section>

<section class="wrap narrow">
  <h2>Common questions</h2>
  ${faqHtml(top, 'h3')}
  <p><a href="/faq">All questions and answers</a></p>
</section>

<section class="band band-ink">
  <div class="wrap final">
    <h2>Move your photos where you need them</h2>
    ${cta(`Download ${N} free`)}
  </div>
</section>`;
  return page;
}

function download({ base }) {
  const page = {
    path: '/download',
    title: `Download ${N} for Mac, Windows and Linux (Free)`,
    description: `Download ${N} free for macOS, Windows or Linux. It moves photos and videos between your Android phone and computer over Wi-Fi. No account needed.`,
    h1: `Download ${N}`,
    crumb: 'Download',
  };
  page.schema = [softwareSchema(base)];
  const rows = Object.values(config.downloads).map((d) => `
    <li data-platform="${d.key}">
      <div>
        <h2>${N} for ${d.label}</h2>
        <p>${d.url ? `${esc(d.fileType)}${config.version ? `, version ${esc(config.version)}` : ''}${d.requires ? `. Requires ${esc(d.requires)}` : ''}` : 'Not available yet'}</p>
      </div>
      ${d.url
        ? `<a class="btn" href="/download/${d.key}" rel="nofollow">Download for ${d.label}</a>`
        : `<span class="btn btn-off" aria-disabled="true">Coming soon</span>`}
    </li>`).join('');
  page.body = `
<article class="wrap narrow doc">
  <h1>${page.h1}</h1>
  <p class="lede">${N} is free. Install it on your computer. Your Android phone needs nothing installed, for either direction.</p>
  <p class="cta-note" data-phone-note hidden>You are on a phone. ${N} installs on your computer: open this page there, or <button type="button" class="linklike" data-share>send yourself the link</button>.</p>
  <ul class="dl">${rows}</ul>

  <h2>After you install it</h2>
  <ol class="plain">
    <li>Open ${N}. If your computer asks whether it may accept network connections, choose Allow.</li>
    <li>Connect your phone to the same Wi-Fi as the computer.</li>
    <li>Scan the QR code with the phone's camera.</li>
    <li>On the phone, tap "Send to computer" to copy photos and videos to the computer, or "Get from computer" to save ones you added in the app's "To phone" tab.</li>
  </ol>
  <p>Files from the phone are saved in Pictures, in a folder called ${N}, unless you choose another folder. Files from the computer are saved in the phone's Downloads folder.</p>
  <p>Something not working? See <a href="/troubleshooting">troubleshooting</a>. Questions about what the app does with your files are answered on the <a href="/privacy">privacy page</a>.</p>
  ${updatedLine()}
</article>`;
  return page;
}

function toMac({ base, asset }) {
  const steps = [
    [`Install ${N} on the Mac`, `Download ${N} for Mac from the download page, open it, and drag it to Applications.`],
    [`Open ${N}`, 'A QR code appears. If macOS asks whether the app may accept incoming connections or find devices on your local network, choose Allow.'],
    ['Put the phone on the same Wi-Fi', 'The Android phone must use the same Wi-Fi network as the Mac, not mobile data.'],
    ['Scan the QR code', "Point the phone's camera at the code and tap the link that appears."],
    ['Choose photos and videos', 'On the "Send to computer" tab, tap "Choose photos & videos", select them, and wait for "All done".'],
  ];
  const page = {
    path: '/android-to-mac',
    title: 'Transfer Photos from Android to Mac Without a Cable (Free)',
    description: `Send photos and videos from an Android phone to a Mac over Wi-Fi with ${N}: scan a QR code, pick files, done. Free, original quality, no phone app.`,
    h1: 'How to transfer photos and videos from Android to a Mac without a cable',
    crumb: 'Android to Mac',
  };
  page.schema = [articleSchema(base, page), howToSchema(base, page.h1, steps)];
  page.body = `
<article class="wrap narrow doc">
  <h1>${page.h1}</h1>
  <p class="lede">The quickest way to move photos from an Android phone to a Mac without a cable is over Wi-Fi: open ${N} on the Mac, scan its QR code with the phone, and choose the photos and videos to send. They are saved in original quality to a folder on the Mac. ${N} is free and nothing is installed on the phone.</p>
  ${cta('Download for Mac, free', 'mac')}

  <h2>Why this is awkward on a Mac</h2>
  <p>When you plug an Android phone into a Mac, it does not appear in Finder the way a camera card or USB drive does. People usually end up emailing photos to themselves, waiting for a cloud backup, or installing extra software. Sending over Wi-Fi avoids all three.</p>

  <h2>Step by step</h2>
  ${stepsHtml(steps)}
  <figure>${shot(asset, 'computer')}<figcaption>${N} on the computer: the QR code on the left, received files on the right.</figcaption></figure>

  <h2>Where the files are on the Mac</h2>
  <p>In Finder, open Pictures and then the ${N} folder, or click Open folder in the app. To add them to Apple Photos, open Photos, choose File, then Import, and select that folder.</p>

  <h2>What gets copied</h2>
  <p>Each photo and video is copied exactly as the phone provides it: no compression, no resizing, and the original date is kept so the files sort correctly. HEIC photos, RAW (DNG) files and long 4K videos are all supported. There is no file size limit.</p>

  <h2>Going the other way: Mac to Android</h2>
  <p>The same app sends photos and videos from the Mac to the phone. See <a href="/computer-to-android">how to send photos from a computer to an Android phone</a>.</p>

  <h2>Other ways to do it, and when they are better</h2>
  <ul class="plain">
    <li><strong>A USB cable</strong> can be faster for hundreds of gigabytes, but the Mac needs extra software or the phone must be switched to its camera (PTP) mode to be recognised.</li>
    <li><strong>A cloud backup</strong> such as Google Photos is better if you want every photo copied automatically, at the cost of upload time and storage space.</li>
  </ul>
  <p>The <a href="/compare">comparison page</a> covers each method in detail.</p>

  <h2>If the phone cannot open the page</h2>
  <p>Check that both devices are on the same Wi-Fi and that the Mac's firewall allows ${N}. More fixes are on the <a href="/troubleshooting">troubleshooting page</a>.</p>
  ${updatedLine()}
</article>`;
  return page;
}

function toWindows({ base, asset }) {
  const steps = [
    [`Install ${N} on the PC`, `Download ${N} for Windows from the download page and run the installer.`],
    [`Open ${N}`, 'A QR code appears. If Windows Security asks whether to allow the app on your network, choose Allow for private networks.'],
    ['Put the phone on the same Wi-Fi', 'The Android phone must use the same Wi-Fi network as the PC, not mobile data.'],
    ['Scan the QR code', "Point the phone's camera at the code and tap the link that appears."],
    ['Choose photos and videos', 'On the "Send to computer" tab, tap "Choose photos & videos", select them, and wait for "All done".'],
  ];
  const page = {
    path: '/android-to-windows',
    title: 'Transfer Photos from Android to Windows PC over Wi-Fi',
    description: `Send photos and videos from Android to a Windows PC without a USB cable. ${N} uses Wi-Fi and a QR code. Free, full quality, no phone app.`,
    h1: 'How to transfer photos and videos from Android to a Windows PC over Wi-Fi',
    crumb: 'Android to Windows',
  };
  page.schema = [articleSchema(base, page), howToSchema(base, page.h1, steps)];
  page.body = `
<article class="wrap narrow doc">
  <h1>${page.h1}</h1>
  <p class="lede">To move photos from an Android phone to a Windows PC without a USB cable, open ${N} on the PC, scan its QR code with the phone, and choose the photos and videos to send. They are saved in original quality to a folder on the PC over your Wi-Fi. ${N} is free and nothing is installed on the phone.</p>
  ${cta('Download for Windows, free', 'windows')}

  <h2>Step by step</h2>
  ${stepsHtml(steps)}
  <figure>${shot(asset, 'computer')}<figcaption>${N} on the computer: the QR code on the left, received files on the right.</figcaption></figure>

  <h2>Where the files are on the PC</h2>
  <p>Open File Explorer, go to Pictures, then the ${N} folder, or click Open folder in the app. Use the Change button to save somewhere else, for example an external drive.</p>

  <h2>Wi-Fi or USB cable?</h2>
  <p>A USB cable works on Windows: unlock the phone, set USB mode to File transfer, and browse the phone's DCIM folder in File Explorer. It is a good choice for a very large one-time copy. Wi-Fi with ${N} is easier when you have no cable to hand, when the PC does not show the phone, or when you only want to pick certain photos from the phone's gallery instead of digging through folders.</p>

  <h2>What gets copied</h2>
  <p>Each photo and video is copied exactly as the phone provides it: no compression, no resizing, and the original date is kept. There is no file size limit, so long videos are fine. Files that are already in the folder are skipped if you select them again.</p>

  <h2>Going the other way: PC to Android</h2>
  <p>The same app sends photos and videos from the PC to the phone. See <a href="/computer-to-android">how to send photos from a computer to an Android phone</a>.</p>

  <h2>If the phone cannot open the page</h2>
  <p>The usual cause on Windows is the firewall or a Wi-Fi network marked as Public. Open Settings, then Network &amp; internet, select your Wi-Fi network and set it to Private, and allow ${N} when Windows asks. More fixes are on the <a href="/troubleshooting">troubleshooting page</a>.</p>

  <p>The <a href="/compare">comparison page</a> looks at cloud backup, messaging apps and Bluetooth as well.</p>
  ${updatedLine()}
</article>`;
  return page;
}

function toAndroid({ base, asset }) {
  const steps = [
    [`Open ${N} on the computer`, 'It runs on Mac, Windows and Linux. A QR code appears.'],
    ['Open the "To phone" tab and add files', 'Click "Add photos & videos" or drag them into the window. On a Mac you can also add a whole folder. The files stay where they are on the computer.'],
    ['Scan the QR code with the phone', "With the phone on the same Wi-Fi, point its camera at the code and tap the link."],
    ['Tap "Get from computer"', 'The phone lists the files you added, with thumbnails for photos.'],
    ['Tap Save or Save all', 'The phone downloads a full-quality copy of each file. The computer shows "Saved to phone" when a file has been delivered.'],
  ];
  const page = {
    path: '/computer-to-android',
    title: 'Send Photos from a Computer to an Android Phone (Free)',
    description: `Send photos and videos from a Mac or Windows PC to an Android phone over Wi-Fi with ${N}. Add files, scan a QR code, tap Save. Free, full quality.`,
    h1: 'How to send photos and videos from a computer to an Android phone',
    crumb: 'Computer to Android',
  };
  page.schema = [articleSchema(base, page), howToSchema(base, page.h1, steps)];
  page.body = `
<article class="wrap narrow doc">
  <h1>${page.h1}</h1>
  <p class="lede">To send photos or videos from a Mac or PC to an Android phone without a cable, open ${N} on the computer, add the files to its "To phone" list, scan the QR code with the phone, and tap Save. The phone downloads full-quality copies over your Wi-Fi. ${N} is free and nothing is installed on the phone.</p>
  ${ctaBoth()}

  <h2>Step by step</h2>
  ${stepsHtml(steps)}
  <figure>${shot(asset, 'send')}<figcaption>The "To phone" tab on the computer. Each file is marked once the phone has saved it.</figcaption></figure>

  <h2>Where the files are on the phone</h2>
  <p>The phone's browser saves them in the Downloads folder. Most gallery apps show them in an album called Download, and the Files app shows them under Downloads. A web page cannot write straight into the camera roll, so this is the same place any downloaded photo goes.</p>

  <h2>What to expect from the phone's browser</h2>
  <ul class="plain">
    <li>After "Save all", the browser may ask whether this page may download several files. Choose Allow, then tap the button again if only one file was saved.</li>
    <li>The browser may warn that a download is not secure, because the file travels over your own Wi-Fi without encryption. The file comes from your own computer; choose Keep.</li>
    <li>Large videos can be paused and resumed from the browser's downloads list.</li>
  </ul>

  <h2>What the phone can and cannot reach</h2>
  <p>The phone can fetch only the files you added to the "To phone" list, and only through the link in the QR code. It cannot browse the computer, and it is never told where the files are stored. Remove a file from the list, clear the list, or close ${N}, and it is no longer available.</p>

  <h2>When this is useful</h2>
  <ul class="plain">
    <li>Putting edited photos or a finished video back on the phone to post or share.</li>
    <li>Giving a guest or relative a set of photos without creating a shared album or sending compressed copies by chat.</li>
    <li>Moving old photos from a computer onto a new phone.</li>
  </ul>

  <h2>Going the other way</h2>
  <p>The same page on the phone sends photos and videos to the computer. See the guides for <a href="/android-to-mac">Android to Mac</a> and <a href="/android-to-windows">Android to Windows</a>.</p>
  ${updatedLine()}
</article>`;
  return page;
}

function compare({ base }) {
  const page = {
    path: '/compare',
    title: '5 Ways to Move Photos Between Android and a Computer',
    description: `Wi-Fi transfer, USB cable, cloud backup, messaging apps and Bluetooth compared for speed, quality and effort, and when ${N} is the right choice.`,
    h1: 'Five ways to move photos and videos between Android and a computer, compared',
    crumb: 'Compare',
  };
  page.schema = [articleSchema(base, page)];
  page.body = `
<article class="wrap doc doc-wide">
  <h1>${page.h1}</h1>
  <p class="lede">For a handful of photos, almost any method works. For many photos or long videos, the realistic choices are a direct Wi-Fi transfer, a USB cable, or a cloud backup. Messaging apps and email reduce quality or reject large files, and Bluetooth is too slow for video.</p>

  <div class="scroll">
  <table class="cmp">
    <thead>
      <tr><th scope="col">Method</th><th scope="col">What you need</th><th scope="col">Quality</th><th scope="col">Main limit</th><th scope="col">Best when</th></tr>
    </thead>
    <tbody>
      <tr><th scope="row">Wi-Fi transfer with ${N}</th><td>Free app on the computer; same Wi-Fi; nothing on the phone</td><td>Original, both directions</td><td>Both devices must be on the same Wi-Fi; you start each transfer yourself</td><td>You want chosen photos and videos on the other device now, at full quality</td></tr>
      <tr><th scope="row">USB cable</th><td>A data cable; on a Mac, extra software or camera (PTP) mode</td><td>Original, both directions</td><td>Phone must be unlocked and set to File transfer; you browse folders instead of the gallery</td><td>A very large one-time copy</td></tr>
      <tr><th scope="row">Cloud backup, such as Google Photos</th><td>An account and an internet connection</td><td>Original, or reduced if a storage-saving setting is on</td><td>Upload time and storage space; a Google account includes 15 GB free</td><td>You want every photo backed up and available everywhere automatically</td></tr>
      <tr><th scope="row">Messaging apps or email to yourself</th><td>Nothing extra</td><td>Often reduced, especially video</td><td>Attachment size limits; one file at a time is tedious</td><td>One or two photos where quality does not matter</td></tr>
      <tr><th scope="row">Bluetooth</th><td>Bluetooth on both devices; pairing</td><td>Original</td><td>Slow; impractical for videos</td><td>A few photos with no Wi-Fi available</td></tr>
    </tbody>
  </table>
  </div>

  <div class="narrow-in">
  <h2>When ${N} is the right choice</h2>
  <ul class="plain">
    <li>You want specific photos or videos on the other device in the next few minutes, in either direction.</li>
    <li>Quality matters: videos for editing, photos for printing.</li>
    <li>You would rather not upload personal photos to a cloud service.</li>
    <li>The phone belongs to someone else, such as a guest or a relative, and installing an app on it is not an option.</li>
    <li>The cable is missing or the computer does not recognise the phone.</li>
  </ul>

  <h2>When something else is better</h2>
  <ul class="plain">
    <li><strong>You want automatic backup or sync.</strong> ${N} only moves what you choose, when you choose. A cloud backup runs by itself.</li>
    <li><strong>The devices are not on the same network.</strong> ${N} needs both on the same Wi-Fi. Across the internet, use a cloud service.</li>
    <li><strong>You are copying an entire phone.</strong> For hundreds of gigabytes, a USB cable is usually faster than Wi-Fi.</li>
    <li><strong>You need files other than photos and videos.</strong> ${N} moves photos and videos only. For documents, use a cable or a cloud drive.</li>
    <li><strong>Photos must land directly in the phone's camera roll.</strong> Files saved from ${N} go to the phone's Downloads folder, as with any browser download.</li>
  </ul>

  <h2>A note on nearby sharing</h2>
  <p>Android's built-in nearby sharing can also move files to and from some computers. Whether it works depends on the phone model, the computer and the software installed on it, so check what your devices support. ${N} only needs a browser on the phone, so it works the same way with any Android phone.</p>
  ${cta(`Download ${N} free`)}
  ${updatedLine()}
  </div>
</article>`;
  return page;
}

function faq({ base }) {
  const page = {
    path: '/faq',
    title: `${N} FAQ: Price, Quality, Privacy and Setup`,
    description: `Answers about ${N}: is it free, both directions, does it compress photos, does it need internet, is it secure, which files it supports.`,
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

function troubleshooting({ base }) {
  const fixes = [
    ['The phone says the page cannot be reached',
      `<ul class="plain">
        <li><strong>Same Wi-Fi.</strong> The phone must be on the same Wi-Fi network as the computer. Turn off mobile data for a moment to be sure the phone is not using it.</li>
        <li><strong>Not a guest network.</strong> Guest Wi-Fi usually blocks devices from reaching each other. Use the main network for both.</li>
        <li><strong>Firewall.</strong> Allow ${N} in the computer's firewall. On Windows, also set the Wi-Fi network to Private in Settings, Network &amp; internet.</li>
        <li><strong>VPN.</strong> A VPN on the phone or the computer can hide them from each other. Pause it during the transfer.</li>
        <li><strong>Several networks.</strong> If the computer has more than one connection, ${N} shows a "Try another network" menu under the QR code. Pick the Wi-Fi one and scan again.</li>
      </ul>`],
    ['The camera does not react to the QR code',
      `Clean the lens, move back so the whole code is visible, and raise the computer's screen brightness. You can also type the address shown under the QR code into the phone's browser.`],
    ['"This link is no longer valid"',
      `The code was renewed or the computer's address changed. Scan the QR code that is on the computer's screen now.`],
    ['Sending to the computer stops partway',
      `Android may pause a browser upload when the screen locks. Keep the screen on and the page open, then tap "Try the failed ones again". Files that already arrived are skipped. Also check that the computer did not go to sleep.`],
    ['"Save all" saves only one file on the phone',
      `The phone's browser is asking whether this page may download several files. Choose Allow, then tap the button again. Files that already started are not repeated.`],
    ['The phone warns that a download is not secure',
      `The file travels from your own computer over your own Wi-Fi without encryption, and the browser flags that. Choose Keep. Only use ${N} on Wi-Fi you trust.`],
    ['Saved photos do not show in the phone\'s gallery',
      `Files from the computer are saved in the phone's Downloads folder. Open the Files app and look under Downloads, or look for an album called Download in the gallery app.`],
    ['"Get from computer" is empty',
      `Nothing has been added yet. On the computer, open the "To phone" tab and add photos or videos. The phone's list updates by itself within a few seconds. The list is also emptied when ${N} is closed.`],
    ['"Only photos and videos can be sent"',
      `${N} accepts photo and video files only, in both directions. Documents, music and other files are refused.`],
    ['"The computer is out of disk space"',
      `Free up space or click Change in ${N} and pick a folder on a drive with more room, then try the failed files again.`],
    ['The QR code is missing and the app says the computer is not connected',
      `Connect the computer to Wi-Fi or a wired network. The code appears by itself within a few seconds.`],
    ['The location is missing from photos sent to the computer',
      `Android can remove GPS location from photos that are shared through a web browser. This is an Android privacy feature and is not something ${N} changes.`],
  ];
  const page = {
    path: '/troubleshooting',
    title: `${N} Troubleshooting: Phone Cannot Connect, Fixes`,
    description: `Fixes for ${N}: phone cannot open the page, QR code not scanning, link no longer valid, transfers that stop, downloads on the phone, firewall settings.`,
    h1: `${N} troubleshooting`,
    crumb: 'Troubleshooting',
  };
  page.schema = [articleSchema(base, page)];
  page.body = `
<article class="wrap narrow doc">
  <h1>${page.h1}</h1>
  <p class="lede">Almost every connection problem has one of two causes: the phone and the computer are not on the same Wi-Fi network, or the computer's firewall is blocking ${N}.</p>
  <div class="qa">${fixes.map(([q, a]) => `<section><h2>${esc(q)}</h2>${a.startsWith('<ul') ? a : `<p>${a}</p>`}</section>`).join('')}</div>
  ${updatedLine()}
</article>`;
  return page;
}

function privacy({ base }) {
  const page = {
    path: '/privacy',
    title: `${N} Privacy: Your Photos Stay on Your Devices`,
    description: `${N} moves files directly between your phone and your computer on your own Wi-Fi. No account, no cloud upload. This website uses no cookies.`,
    h1: 'Privacy',
    crumb: 'Privacy',
  };
  page.body = `
<article class="wrap narrow doc">
  <h1>${page.h1}</h1>
  <p class="lede">Your photos and videos travel between your phone and your computer inside your own Wi-Fi network. They are not uploaded to us or to anyone else, and ${N} has no accounts.</p>

  <h2>The app</h2>
  <ul class="plain">
    <li>Files move directly between the phone and the computer over the local network, in whichever direction you choose.</li>
    <li>${N} does not create an account, does not show ads and does not send your files, file names or usage data anywhere.</li>
    <li>The page your phone opens is served by your own computer, not by this website.</li>
    <li>The link in the QR code contains a random code. Without it, nothing can be sent or fetched. "Make a new code" cancels the old link.</li>
    <li>The phone can fetch only the files you added to the "To phone" list. It cannot browse the computer, and the list is forgotten when the app closes.</li>
    <li>Transfers are not encrypted inside your network, so use ${N} on Wi-Fi you trust and not on public Wi-Fi.</li>
  </ul>

  <h2>This website</h2>
  <ul class="plain">
    <li>No cookies and no advertising or third-party trackers.</li>
    <li>We count page views and downloads to see whether the site is useful. For each view we keep the page, the site you came from, your browser and operating system family, your browser language, and your country when our hosting provider reports it.</li>
    <li>We do not store your IP address. To count visitors we use a scrambled value made from your IP address, your browser name and a random key. The key is replaced and destroyed every day, so a visitor cannot be recognised from one day to the next and the value cannot be turned back into an IP address.</li>
    <li>Installer files may be hosted by a file hosting service, which keeps its own access logs.</li>
  </ul>
  ${config.contactEmail ? `<h2>Contact</h2><p>Questions about privacy: <a href="mailto:${esc(config.contactEmail)}">${esc(config.contactEmail)}</a></p>` : ''}
  ${updatedLine()}
</article>`;
  return page;
}

function notFound() {
  return {
    path: '/404',
    noindex: true,
    title: `Page not found | ${N}`,
    description: 'This page does not exist.',
    body: `
<article class="wrap narrow doc">
  <h1>This page does not exist</h1>
  <p class="lede">The address may be mistyped, or the page may have moved.</p>
  <ul class="plain">
    <li><a href="/">What ${N} does</a></li>
    <li><a href="/download">Download</a></li>
    <li><a href="/faq">Questions and answers</a></li>
    <li><a href="/troubleshooting">Troubleshooting</a></li>
  </ul>
</article>`,
  };
}

const builders = [home, download, toMac, toWindows, toAndroid, compare, faq, troubleshooting, privacy];

/** Plain-language summary for AI assistants: /llms.txt */
function llmsTxt(base) {
  const pages = builders.map((b) => b({ base, asset: (f) => '/assets/' + f }));
  const lines = [
    `# ${N}`,
    '',
    `> ${N} is a free desktop app for macOS, Windows and Linux that moves photos and videos between an Android phone and a computer over Wi-Fi, in either direction. The computer shows a QR code; the phone scans it and opens a page in its browser, where it can send files to a folder on the computer or save files the computer is offering. Files are copied in original quality. Nothing is installed on the phone and files never pass through a cloud server.`,
    '',
    '## Key facts',
    '',
    '- Price: free; no account, no subscription, no ads',
    '- Direction: both; phone to computer, and computer to phone',
    '- Computer: macOS, Windows, Linux',
    '- Phone: Android; no app to install (uses the camera and web browser)',
    '- Connection: phone and computer on the same Wi-Fi network; no internet required',
    '- Quality: original files, no compression or resizing',
    '- File size limit: none (limited by free storage space)',
    '- File types: photos and videos only, including JPEG, PNG, HEIC, WebP, DNG (RAW), MP4, MOV, MKV',
    '- Where files go: on the computer, a folder the user chooses (default Pictures/' + N + '); on the phone, the Downloads folder',
    '- Manual transfers only; not an automatic backup or sync',
    '- Duplicates: files already copied to the computer (same name and size) are skipped',
    '- Security: the link contains a random code; the phone can fetch only files the user added to the "To phone" list; transfers stay on the local network and are not encrypted there, so trusted Wi-Fi is recommended',
    ...(config.version ? [`- Current version: ${config.version}`] : []),
    `- Information last updated: ${config.updated}`,
    '',
    '## Pages',
    '',
    ...pages.map((p) => `- [${p.title}](${base}${p.path === '/' ? '/' : p.path}): ${p.description}`),
    '',
    '## Questions and answers',
    '',
    ...FAQ.flatMap(([q, a]) => [`### ${q}`, '', strip(a), '']),
  ];
  return lines.join('\n');
}

module.exports = { builders, notFound, llmsTxt };
