/* Saves the app on the phone so it opens without a connection. Bump VERSION when files change. */
const VERSION = "botb-v2";
const FILES = [
  "./", "index.html", "manifest.webmanifest", "data/products.json", "fonts/fonts.css",
  "fonts/archivo-normal-latin.woff2", "fonts/archivo-normal-latin-ext.woff2",
  "fonts/fraunces-normal-latin.woff2", "fonts/fraunces-normal-latin-ext.woff2",
  "fonts/fraunces-italic-latin.woff2", "fonts/fraunces-italic-latin-ext.woff2",
  "icons/icon-192.png", "icons/icon-512.png", "icons/icon-maskable-512.png",
  "icons/apple-touch-icon.png", "icons/favicon-32.png"
];

self.addEventListener("install", (e) => {
  e.waitUntil(caches.open(VERSION).then((c) => c.addAll(FILES)).then(() => self.skipWaiting()));
});

self.addEventListener("activate", (e) => {
  e.waitUntil(caches.keys().then((keys) => Promise.all(keys.filter((k) => k !== VERSION).map((k) => caches.delete(k))))
    .then(() => self.clients.claim()));
});

/* Network first so updates show up when online; fall back to the saved copy offline. */
self.addEventListener("fetch", (e) => {
  if (e.request.method !== "GET") return;
  e.respondWith(
    fetch(e.request).then((res) => {
      const copy = res.clone();
      caches.open(VERSION).then((c) => c.put(e.request, copy));
      return res;
    }).catch(() => caches.match(e.request, { ignoreSearch: true }).then((r) => r || caches.match("index.html")))
  );
});
