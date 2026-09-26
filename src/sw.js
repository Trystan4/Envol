// Envol offline support.
// Strategy: try the network first (to receive new fiches and updates); if it does not answer
// within 4 seconds or there is no network, serve the copy kept on the phone.
//
// ASSETS must list every published file except sw.js itself and the fiches, which are read
// from fiches/index.json at install time. tests/unit/sw.test.js checks the list.

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
  "js/deck.js",
  "js/engine.js",
  "js/storage.js",
  "js/summary.js",
  "js/util.js",
  "js/screens/backup.js",
  "js/screens/common.js",
  "js/screens/guide.js",
  "js/screens/home.js",
  "js/screens/question.js",
  "js/screens/results.js",
  "js/screens/settings.js",
  "js/screens/summary.js",
  "fiches/index.json",
];
const TIMEOUT = 4000;

async function precache() {
  const cache = await caches.open(CACHE);
  await cache.addAll(ASSETS);
  const index = await (await cache.match("fiches/index.json")).json();
  await cache.addAll(index.themes.map(t => `fiches/${t.file}`));
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

self.addEventListener("fetch", e => {
  const req = e.request;
  if (req.method !== "GET" || new URL(req.url).origin !== location.origin) return;
  e.respondWith((async () => {
    const cache = await caches.open(CACHE);
    // no-cache: revalidate with GitHub Pages so every file of a new version arrives together.
    const network = fetch(req, { cache: "no-cache" }).then(res => {
      if (res && res.ok) cache.put(req, res.clone());
      return res;
    });
    const timeout = new Promise(r => setTimeout(r, TIMEOUT));
    try {
      const res = await Promise.race([network, timeout]);
      if (res && res.ok) return res;
    } catch { /* offline */ }
    const copy = await cache.match(req, { ignoreSearch: true })
      || (req.mode === "navigate" ? await cache.match("index.html") : null);
    return copy || network; // last resort: wait for the network after all
  })());
});
