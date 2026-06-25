/*
  Simple service worker for offline caching.
  This worker caches the main HTML file and other static assets. It uses
  a network-first strategy: fetches from the network when available,
  and falls back to the cache when offline. Cached responses are
  updated in the background when possible.
*/

const CACHE_NAME = 'shaochi-app-cache-v1';
// List of resources to precache. Add other assets (CSS, JS) as needed.
const ASSETS = [
  '/',
  'index-7.html',
];

self.addEventListener('install', event => {
  // Pre-cache application shell
  event.waitUntil(
    caches.open(CACHE_NAME).then(cache => {
      return cache.addAll(ASSETS);
    })
  );
});

self.addEventListener('fetch', event => {
  const request = event.request;
  // Only handle GET requests
  if (request.method !== 'GET') return;
  event.respondWith(
    fetch(request)
      .then(response => {
        // Update cache with fresh version of the resource
        const responseClone = response.clone();
        caches.open(CACHE_NAME).then(cache => cache.put(request, responseClone));
        return response;
      })
      .catch(() => {
        // If network fetch fails, try to return the cached version
        return caches.match(request);
      })
  );
});