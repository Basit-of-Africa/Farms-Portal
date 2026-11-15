/*
 * Service worker for the installable portal (PWA).
 *
 * - Pages (HTML) are fetched from the network first, so a new deploy is
 *   picked up immediately; the cached copy is only used when offline.
 * - Built assets under /assets/ have content hashes in their names and never
 *   change, so they are served from cache once downloaded.
 * - API calls, uploads and cloud media are never cached (personal data).
 *
 * Bump CACHE_NAME when this file's caching rules change: old caches are
 * deleted on activation.
 */
const CACHE_NAME = 'adubiaro-portal-v2';
const SHELL = ['/', '/icon.jpg', '/manifest.json'];

self.addEventListener('install', event => {
  event.waitUntil(
    caches
      .open(CACHE_NAME)
      .then(cache => cache.addAll(SHELL))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', event => {
  event.waitUntil(
    caches
      .keys()
      .then(names => Promise.all(names.filter(n => n !== CACHE_NAME).map(n => caches.delete(n))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', event => {
  const request = event.request;
  const url = new URL(request.url);

  // Never cache API responses, uploaded files, cross-origin requests or non-GET requests
  if (
    request.method !== 'GET' ||
    url.origin !== self.location.origin ||
    url.pathname.startsWith('/api/') ||
    url.pathname.startsWith('/uploads/')
  ) {
    return;
  }

  // Pages: network first, cached copy only when offline
  const isPage = request.mode === 'navigate' || (request.headers.get('accept') || '').includes('text/html');
  if (isPage) {
    event.respondWith(
      fetch(request)
        .then(response => {
          if (response && response.ok) {
            const copy = response.clone();
            caches.open(CACHE_NAME).then(cache => cache.put('/', copy));
          }
          return response;
        })
        .catch(() => caches.match('/'))
    );
    return;
  }

  // Hashed build assets: cache first (they never change)
  if (url.pathname.startsWith('/assets/')) {
    event.respondWith(
      caches.match(request).then(
        cached =>
          cached ||
          fetch(request).then(response => {
            if (response && response.ok) {
              const copy = response.clone();
              caches.open(CACHE_NAME).then(cache => cache.put(request, copy));
            }
            return response;
          })
      )
    );
    return;
  }

  // Other static files (icons, manifest, fonts): network first, cache as offline fallback
  event.respondWith(
    fetch(request)
      .then(response => {
        if (response && response.ok) {
          const copy = response.clone();
          caches.open(CACHE_NAME).then(cache => cache.put(request, copy));
        }
        return response;
      })
      .catch(() => caches.match(request))
  );
});
