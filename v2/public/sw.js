// Offline shell (docs/sheets/PLAN.md §21.7): the character sheet on a phone
// at a table with no wifi. Cache-first for hashed immutable build assets —
// visited tools' table chunks ride along for free — and network-first with
// cache fallback for pages and public data, so deploys land the moment
// you're online and dead wifi costs you nothing when you're not.
//
// Cross-origin and non-GET requests pass through untouched: Drive sync
// (and the e2e suite's mocked Google) must keep hitting the real network.
// No background-sync cleverness here — the sync courier owns reconnection.

const CACHE = 'stb-shell-v1';
const CORE = ['/', '/sheet/', '/library/', '/manifest.webmanifest', '/favicon.svg'];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches
      .open(CACHE)
      .then((cache) => cache.addAll(CORE))
      .then(() => self.skipWaiting()),
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim()),
  );
});

self.addEventListener('fetch', (event) => {
  const req = event.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  if (url.origin !== self.location.origin) return;

  // Hashed build assets never change under their name: cache-first,
  // populate on first use.
  if (url.pathname.startsWith('/_astro/')) {
    event.respondWith(
      caches.match(req).then(
        (hit) =>
          hit ??
          fetch(req).then((res) => {
            if (res.ok) {
              const copy = res.clone();
              caches.open(CACHE).then((cache) => cache.put(req, copy));
            }
            return res;
          }),
      ),
    );
    return;
  }

  // Pages, data, masks: network-first (deploys win), cache fallback
  // (airplane mode loses nothing you've already visited).
  event.respondWith(
    fetch(req)
      .then((res) => {
        if (res.ok) {
          const copy = res.clone();
          caches.open(CACHE).then((cache) => cache.put(req, copy));
        }
        return res;
      })
      .catch(() =>
        caches.match(req).then((hit) => {
          if (hit) return hit;
          if (req.mode === 'navigate') return caches.match('/');
          return Response.error();
        }),
      ),
  );
});
