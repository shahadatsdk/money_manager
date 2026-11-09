const CACHE_NAME = "money-manager-v5";
const ASSETS = [
  "./",
  "./index.html",
  "./app.js",
  "./audit.js",
  "./db.js",
  "./db.json",
  "./manifest.json",
  "./icon-192.svg",
  "./vendor/bootstrap/css/bootstrap.min.css",
  "./vendor/bootstrap/js/bootstrap.bundle.min.js",
  "./vendor/bootstrap-icons/bootstrap-icons.css",
  "./vendor/bootstrap-icons/fonts/bootstrap-icons.woff2",
  "./vendor/bootstrap-icons/fonts/bootstrap-icons.woff",
  "./vendor/chartjs/chart.umd.min.js"
];

// Install — cache all core assets
self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => {
      console.log("[SW] Caching assets");
      return cache.addAll(ASSETS);
    })
  );
  self.skipWaiting();
});

// Activate — clean up old caches
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

// Fetch — serve from cache first, fall back to network
self.addEventListener("fetch", (event) => {
  // Skip non-GET requests
  if (event.request.method !== "GET") return;

  // Skip chrome-extension and other non-http requests
  if (!event.request.url.startsWith("http")) return;

  // Never cache the sync API — activity/snapshot reads must always be fresh
  if (new URL(event.request.url).pathname.startsWith("/api/")) return;

  event.respondWith(
    caches.match(event.request).then((cached) => {
      if (cached) {
        // Return cached, but also update cache in background
        const fetchPromise = fetch(event.request).then((response) => {
          if (response && response.status === 200) {
            const clone = response.clone();
            caches.open(CACHE_NAME).then((cache) => {
              cache.put(event.request, clone);
            });
          }
          return response;
        }).catch(() => cached);

        return cached;
      }

      // Not in cache — fetch from network and cache it
      return fetch(event.request).then((response) => {
        if (!response || response.status !== 200) return response;

        const clone = response.clone();
        caches.open(CACHE_NAME).then((cache) => {
          cache.put(event.request, clone);
        });
        return response;
      });
    })
  );
});
