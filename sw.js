/* ══════════════════════════════════════════════════
   Arogya Kutumb — Service Worker  v11
   Fixes:
   - Scope set to '/' for GitHub Pages root deployment
   - Apple/iOS compatible (no push/background sync)
   - Cache-first for shell; network-first for all APIs
   ══════════════════════════════════════════════════ */

const CACHE   = 'ak-v11';
const SHELL   = [
  './',
  './index.html',
  './manifest.json',
  './icon-192.png',
  './icon-512.png'
];

/* Domains that must never be cached */
const NET_ONLY_HOSTS = [
  'api.anthropic.com',
  'openrouter.ai',
  'air-quality-api.open-meteo.com',
  'nominatim.openstreetmap.org',
  'fonts.googleapis.com',
  'fonts.gstatic.com'
];

/* ── Install: pre-cache shell ── */
self.addEventListener('install', event => {
  self.skipWaiting(); // take control immediately
  event.waitUntil(
    caches.open(CACHE).then(cache =>
      Promise.allSettled(SHELL.map(url =>
        cache.add(url).catch(() => {/* ignore missing icons during dev */})
      ))
    )
  );
});

/* ── Activate: delete stale caches, claim all clients ── */
self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys()
      .then(keys => Promise.all(
        keys.filter(k => k !== CACHE).map(k => caches.delete(k))
      ))
      .then(() => self.clients.claim())
  );
});

/* ── Fetch: network-first for APIs, cache-first for shell ── */
self.addEventListener('fetch', event => {
  const req = event.request;

  // Only handle GET requests
  if(req.method !== 'GET') return;

  let url;
  try { url = new URL(req.url); } catch(e) { return; }

  // Non-http(s) schemes (chrome-extension, data, etc.) — skip
  if(!url.protocol.startsWith('http')) return;

  // External API calls — always network, never cache
  if(NET_ONLY_HOSTS.some(h => url.hostname.includes(h))){
    event.respondWith(
      fetch(req).catch(() => new Response('', {status: 503}))
    );
    return;
  }

  // App shell + same-origin assets — cache-first, network fallback
  event.respondWith(
    caches.match(req).then(cached => {
      if(cached) return cached;

      return fetch(req).then(res => {
        // Cache valid same-origin responses
        if(res && res.status === 200 &&
           (url.origin === self.location.origin || url.hostname.includes('fonts.gstatic.com'))){
          const clone = res.clone();
          caches.open(CACHE).then(c => c.put(req, clone));
        }
        return res;
      });
    }).catch(() => {
      // Offline: return cached index.html for navigation requests
      if(req.mode === 'navigate'){
        return caches.match('./index.html')
          .then(r => r || new Response('<h1>Offline</h1><p>Open the app once online first.</p>',
            {headers:{'Content-Type':'text/html'}}));
      }
      return new Response('', {status: 503});
    })
  );
});
