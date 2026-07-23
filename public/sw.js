// GemmaAid service worker
// Caches the app shell so the PWA loads with zero network after first visit.
// The Gemma model file itself is cached separately by MediaPipe's own
// storage (IndexedDB), not here — this just ensures the UI always boots.

const CACHE_NAME = "gemmaaid-shell-v1";
const SHELL_FILES = [
  "/",
  "/index.html",
  "/app.js",
  "/inference-browser.js",
  "/inference-server.js",
  "/styles.css",
  "/manifest.json",
];

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.addAll(SHELL_FILES))
  );
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(
        keys
          .filter((key) => key !== CACHE_NAME)
          .map((key) => caches.delete(key))
      )
    )
  );
  self.clients.claim();
});

self.addEventListener("fetch", (event) => {
  // Never intercept calls to the local inference server — those need to
  // reach the network (localhost) live, not be cached.
  if (event.request.url.includes("/api/")) return;

  event.respondWith(
    caches.match(event.request).then((cached) => cached || fetch(event.request))
  );
});
