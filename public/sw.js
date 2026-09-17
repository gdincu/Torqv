/* App-shell service worker (hand-rolled: zero extra dependencies).
 * - App shell: cache-first, served offline.
 * - Navigations: network-first, fallback to cached index.html.
 * - Map tiles: runtime cache-first with a cap (never precached).
 */
const VERSION = 'tqv2-v1';
const APP_SHELL = ['./', './index.html', './manifest.webmanifest', './favicon.svg'];
const TILE_HOSTS = ['demotiles.maplibre.org', 'tile.openstreetmap.org'];
const TILE_CACHE = 'tqv2-tiles';
const MAX_TILES = 300;

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches
      .open(VERSION)
      .then((c) => c.addAll(APP_SHELL))
      .then(() => self.skipWaiting()),
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) =>
        Promise.all(keys.filter((k) => k !== VERSION && k !== TILE_CACHE).map((k) => caches.delete(k))),
      )
      .then(() => self.clients.claim()),
  );
});

async function trimTiles() {
  try {
    const c = await caches.open(TILE_CACHE);
    const keys = await c.keys();
    if (keys.length > MAX_TILES) {
      await Promise.all(keys.slice(0, keys.length - MAX_TILES).map((k) => c.delete(k)));
    }
  } catch {
    /* cache API may be unavailable — tiles just won't persist */
  }
}

self.addEventListener('fetch', (event) => {
  const req = event.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);

  if (TILE_HOSTS.includes(url.hostname)) {
    event.respondWith(
      caches.open(TILE_CACHE).then(async (cache) => {
        const hit = await cache.match(req);
        if (hit) return hit;
        try {
          const res = await fetch(req);
          if (res.ok) {
            cache.put(req, res.clone());
            trimTiles();
          }
          return res;
        } catch {
          const miss = await cache.match(req);
          if (miss) return miss;
          throw new Error('tile offline');
        }
      }),
    );
    return;
  }

  if (req.mode === 'navigate') {
    event.respondWith(
      fetch(req)
        .then((res) => {
          const copy = res.clone();
          caches.open(VERSION).then((c) => c.put('./index.html', copy));
          return res;
        })
        .catch(() => caches.match('./index.html')),
    );
    return;
  }

  event.respondWith(
    caches.match(req).then((hit) => {
      const net = fetch(req)
        .then((res) => {
          if (res.ok && url.origin === self.location.origin) {
            const copy = res.clone();
            caches.open(VERSION).then((c) => c.put(req, copy));
          }
          return res;
        })
        .catch(() => hit);
      return hit || net;
    }),
  );
});
