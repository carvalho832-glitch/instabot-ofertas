/* InstaBot PWA service worker: static-only cache, never intercept API or webhooks. */
const CACHE = "instabot-static-v1";
const STATIC = new Set([
  "/style.css", "/script.js", "/backend-simulation.js",
  "/pwa-install.js", "/manifest.webmanifest",
  "/icons/instabot-192.png", "/icons/instabot-512.png"
]);
self.addEventListener("install", event => {
  event.waitUntil(self.skipWaiting());
});
self.addEventListener("activate", event => {
  event.waitUntil((async () => {
    const keys = await caches.keys();
    await Promise.all(keys.filter(key => key.startsWith("instabot-static-") && key !== CACHE)
      .map(key => caches.delete(key)));
    await self.clients.claim();
  })());
});
self.addEventListener("fetch", event => {
  const req = event.request;
  if (req.method !== "GET" || req.mode === "navigate" || req.headers.has("authorization")) return;
  const url = new URL(req.url);
  if (url.origin !== self.location.origin || !STATIC.has(url.pathname)) return;
  event.respondWith((async () => {
    try {
      const response = await fetch(req, { cache: "no-cache" });
      if (response.ok && response.type === "basic") {
        const cache = await caches.open(CACHE);
        await cache.put(req, response.clone());
      }
      return response;
    } catch (error) {
      const saved = await caches.match(req);
      if (saved) return saved;
      throw error;
    }
  })());
});
