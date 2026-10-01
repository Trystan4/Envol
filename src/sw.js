// Envol offline support.
// Everything is served from the copy kept on the phone first, so the app opens at once, without
// network or on a very slow one (a network-first strategy waits for every file in turn).
// - Code: from the phone only. A new version arrives as a new sw.js (VERSION changes), which downloads
//   every file again; the page then shows the "Nouvelle version" bar. Two versions are never mixed.
//   Any published change to the code therefore needs a new version number.
// - Fiches and images: from the phone, then refreshed in the background, so a corrected fiche shows up
//   at the next opening even without a new version.
//
// ASSETS must list every published file except sw.js itself and the fiches, which are read
// from fiches/index.json at install time. tests/unit/sw.test.js checks the list.

// Equal to APP_VERSION in js/config.js: bumping it changes this file, so phones install the new version.
const VERSION = "2.7.0";
const CACHE = "envol-v2";
const ASSETS = [
  "./",
  "index.html",
  "manifest.json",
  "icon.png",
  "css/tokens.css",
  "css/base.css",
  "css/components.css",
  "css/screens.css",
  "js/app.js",
  "js/config.js",
  "js/course.js",
  "js/deck.js",
  "js/engine.js",
  "js/qr.js",
  "js/qrscan.js",
  "js/session.js",
  "js/storage.js",
  "js/summary.js",
  "js/transfer.js",
  "js/util.js",
  "js/screens/backup.js",
  "js/screens/chart.js",
  "js/screens/common.js",
  "js/screens/course.js",
  "js/screens/guide.js",
  "js/screens/help.js",
  "js/screens/home.js",
  "js/screens/question.js",
  "js/screens/results.js",
  "js/screens/settings.js",
  "js/screens/transfer.js",
  "js/screens/summary.js",
  "fiches/index.json",
  "img/ccat-p07-cerveau.webp",
  "img/ccat-p07-systeme-nerveux.webp",
  "img/ccat-p08-circulation.webp",
  "img/ccat-p08-coeur.webp",
  "img/ccat-p09-appareil-digestif.webp",
  "img/ccat-p09-regions-abdomen.webp",
  "img/ccat-p10-appareil-respiratoire.webp",
  "img/ccat-p11-bassin.webp",
  "img/ccat-p11-membre-inferieur.webp",
  "img/ccat-p11-membre-superieur.webp",
  "img/ccat-p11-thorax.webp",
];
// "reload": straight from the server, never from the browser's HTTP cache, which may still hold the
// previous version's files for a few minutes after a release.
const fresh = url => new Request(url, { cache: "reload" });

async function precache() {
  const cache = await caches.open(CACHE);
  await cache.addAll(ASSETS.map(fresh));
  const index = await (await cache.match("fiches/index.json")).json();
  await cache.addAll(index.themes.map(t => fresh(`fiches/${t.file}`)));
}

self.addEventListener("install", e => {
  e.waitUntil(precache().then(() => self.skipWaiting()));
});

self.addEventListener("activate", e => {
  e.waitUntil(
    caches.keys()
      .then(keys => Promise.all(keys.filter(k => k.startsWith("envol-") && k !== CACHE).map(k => caches.delete(k))))
      .then(() => self.clients.claim()),
  );
});

const isContent = url => /\/(fiches|img)\//.test(url.pathname);

self.addEventListener("fetch", e => {
  const req = e.request;
  const url = new URL(req.url);
  if (req.method !== "GET" || url.origin !== location.origin) return;
  e.respondWith((async () => {
    const cache = await caches.open(CACHE);
    const copy = await cache.match(req, { ignoreSearch: true })
      || (req.mode === "navigate" ? await cache.match("index.html") : null);
    if (copy && !isContent(url)) return copy;
    // no-cache: revalidate with GitHub Pages rather than trust the browser's HTTP cache.
    const network = fetch(req, { cache: "no-cache" }).then(res => {
      if (res && res.ok) cache.put(req, res.clone());
      return res;
    });
    if (!copy) return network; // not kept yet (first visit, new fiche): the network alone
    e.waitUntil(network.catch(() => { /* offline: the copy stays as it is */ }));
    return copy;
  })());
});
