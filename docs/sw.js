// Offline support: app screens load instantly from cache; data is always
// fetched fresh when online and falls back to the last saved copy offline.
const SHELL = "law-updates-shell-v1";
const DATA = "law-updates-data";
const SHELL_FILES = ["./", "index.html", "styles.css", "app.js", "manifest.webmanifest",
  "icons/icon-192.png", "icons/icon-512.png"];

self.addEventListener("install", (e) => {
  e.waitUntil(caches.open(SHELL).then((c) => c.addAll(SHELL_FILES)).then(() => self.skipWaiting()));
});

self.addEventListener("activate", (e) => {
  e.waitUntil(caches.keys().then((keys) =>
    Promise.all(keys.filter((k) => k !== SHELL && k !== DATA).map((k) => caches.delete(k))))
    .then(() => self.clients.claim()));
});

self.addEventListener("fetch", (e) => {
  const url = new URL(e.request.url);
  if (e.request.method !== "GET" || url.origin !== location.origin) return;

  if (url.pathname.includes("/data/")) {
    const key = url.origin + url.pathname; // ignore cache-busting query
    e.respondWith(
      fetch(e.request).then((res) => {
        if (res.ok) caches.open(DATA).then((c) => c.put(key, res.clone()));
        return res;
      }).catch(() => caches.match(key).then((r) => r || Response.error()))
    );
    return;
  }

  e.respondWith(
    caches.match(e.request).then((cached) => {
      const network = fetch(e.request).then((res) => {
        if (res.ok) caches.open(SHELL).then((c) => c.put(e.request, res.clone()));
        return res;
      }).catch(() => cached);
      return cached || network;
    })
  );
});
