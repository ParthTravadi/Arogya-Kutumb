/* ═══════════════════════════════════════════════════════
   Arogya Kutumb - Service Worker  v15
   Compatible with: GitHub Pages, any static HTTPS host

   Cache strategy:
   - App shell (index.html, manifest, icons) → Cache First
   - Google Fonts CSS                        → Stale While Revalidate
   - Font files (gstatic)                    → Cache First (long TTL)
   - All API calls (Anthropic, OpenRouter,
     Open-Meteo, Nominatim)                  → Network Only (never cache)
   ═══════════════════════════════════════════════════════ */

const CACHE_NAME = 'ak-v15';

/* Files to pre-cache on install */
const PRECACHE = [
  './',
  './index.html',
  './manifest.json',
  './icon-192.png',
  './icon-512.png'
];

/* Domains that must NEVER be cached (live data / API keys) */
const NETWORK_ONLY = [
  'api.anthropic.com',
  'openrouter.ai',
  'air-quality-api.open-meteo.com',
  'api.open-meteo.com',
  'nominatim.openstreetmap.org'
];

/* Domains using Stale-While-Revalidate */
const FONTS_CSS = ['fonts.googleapis.com'];
const FONTS_FILES = ['fonts.gstatic.com'];

/* ── Install ── */
self.addEventListener('install', event => {
  self.skipWaiting();
  event.waitUntil(
    caches.open(CACHE_NAME).then(cache =>
      Promise.allSettled(
        PRECACHE.map(url => cache.add(url).catch(() => { /* ok if icon missing during dev */ }))
      )
    )
  );
});

/* ── Activate: remove old caches ── */
self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys()
      .then(keys => Promise.all(
        keys.filter(k => k !== CACHE_NAME).map(k => caches.delete(k))
      ))
      .then(() => self.clients.claim())
  );
});

/* ── Fetch ── */
self.addEventListener('fetch', event => {
  const req = event.request;
  if (req.method !== 'GET') return;

  let url;
  try { url = new URL(req.url); } catch { return; }
  if (!url.protocol.startsWith('http')) return;

  const host = url.hostname;

  /* 1. Network-only: live APIs */
  if (NETWORK_ONLY.some(d => host.includes(d))) {
    event.respondWith(
      fetch(req).catch(() => new Response(
        JSON.stringify({ error: 'offline' }),
        { status: 503, headers: { 'Content-Type': 'application/json' } }
      ))
    );
    return;
  }

  /* 2. Fonts CSS: stale-while-revalidate */
  if (FONTS_CSS.some(d => host.includes(d))) {
    event.respondWith(staleWhileRevalidate(req));
    return;
  }

  /* 3. Font files: cache-first (they are content-addressed, rarely change) */
  if (FONTS_FILES.some(d => host.includes(d))) {
    event.respondWith(cacheFirst(req));
    return;
  }

  /* 4. Same-origin app shell: cache-first with network fallback */
  if (url.origin === self.location.origin) {
    event.respondWith(
      cacheFirst(req).catch(() =>
        /* Offline navigation fallback */
        req.mode === 'navigate'
          ? caches.match('./index.html')
          : new Response('', { status: 503 })
      )
    );
    return;
  }

  /* 5. Everything else: try network, don't cache */
  event.respondWith(fetch(req).catch(() => new Response('', { status: 503 })));
});

/* ── Helpers ── */
async function cacheFirst(req) {
  const cached = await caches.match(req);
  if (cached) return cached;
  const res = await fetch(req);
  if (res && res.status === 200) {
    const cache = await caches.open(CACHE_NAME);
    cache.put(req, res.clone());
  }
  return res;
}

async function staleWhileRevalidate(req) {
  const cache  = await caches.open(CACHE_NAME);
  const cached = await cache.match(req);
  const fetchPromise = fetch(req).then(res => {
    if (res && res.status === 200) cache.put(req, res.clone());
    return res;
  }).catch(() => cached);
  return cached || fetchPromise;
}
