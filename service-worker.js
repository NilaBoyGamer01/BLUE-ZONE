// service-worker.js
// BLUE-ZONE PWA — cache-first app shell with offline fallback.
//
// Bump CACHE_VERSION whenever you change index.html, manifest.json, or icons
// so the browser fetches fresh copies instead of stale cached ones.
const CACHE_VERSION = 'blue-zone-v1';
const CACHE_NAME = `blue-zone-cache-${CACHE_VERSION}`;

// The "app shell" — everything needed to render the page while offline.
// Since this site is a single self-contained index.html (CSS/JS inline),
// the shell is small: the page itself, the manifest, and the icons.
const APP_SHELL = [
  './',
  './index.html',
  './manifest.json',
  './icons/icon-192.png',
  './icons/icon-512.png'
];

// ---- Install: pre-cache the app shell ----
self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then((cache) => cache.addAll(APP_SHELL))
      .then(() => self.skipWaiting())
  );
});

// ---- Activate: clean up old cache versions ----
self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(
        keys
          .filter((key) => key.startsWith('blue-zone-cache-') && key !== CACHE_NAME)
          .map((key) => caches.delete(key))
      )
    ).then(() => self.clients.claim())
  );
});

// ---- Fetch: cache-first for the app shell, network passthrough for
//      everything dynamic (Firebase/API calls, cross-origin requests). ----
self.addEventListener('fetch', (event) => {
  const { request } = event;

  // Only handle GET requests — POST/PUT (e.g. Firebase writes) always go
  // straight to the network.
  if (request.method !== 'GET') return;

  const url = new URL(request.url);

  // Only apply our cache-first strategy to same-origin, navigable/static
  // requests. Leave Firebase/Firestore/Storage and other cross-origin API
  // calls alone so the app's live data stays fresh and functional.
  const isSameOrigin = url.origin === self.location.origin;
  const isNavigation = request.mode === 'navigate';

  if (!isSameOrigin && !isNavigation) {
    return; // let the browser handle it normally (network)
  }

  event.respondWith(
    caches.match(request).then((cached) => {
      if (cached) {
        // Cache-first: serve immediately, refresh cache in the background.
        event.waitUntil(
          fetch(request)
            .then((response) => {
              if (response && response.ok) {
                caches.open(CACHE_NAME).then((cache) => cache.put(request, response));
              }
            })
            .catch(() => {/* offline — ignore, we already served cache */})
        );
        return cached;
      }

      // Not cached yet — try the network, then fall back to the cached
      // index.html shell (works for the initial route + offline navigation).
      return fetch(request)
        .then((response) => {
          if (response && response.ok && isSameOrigin) {
            const clone = response.clone();
            caches.open(CACHE_NAME).then((cache) => cache.put(request, clone));
          }
          return response;
        })
        .catch(() => caches.match('./index.html'));
    })
  );
});
