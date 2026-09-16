/* ══════════════════════════════════════════════════
   Arogya Kutumb — Service Worker  v10
   Strategy:
     • App shell (HTML + Google Fonts) → Cache-first
     • API calls (Anthropic, OpenRouter, Open-Meteo,
       Nominatim) → Network-first, no cache
   ══════════════════════════════════════════════════ */

const CACHE   = 'ak-v10';
const SHELL   = [
  './',
  './index.html',
  './manifest.json',
  './icon-192.png',
  './icon-512.png'
];

/* Network-only domains — never cache */
const NET_ONLY = [
  'api.anthropic.com',
  'openrouter.ai',
  'air-quality-api.open-meteo.com',
  'nominatim.openstreetmap.org',
  'fonts.googleapis.com',
  'fonts.gstatic.com'
];

/* ── Install: pre-cache shell ── */
self.addEventListener('install', event => {
  event.waitUntil(
    caches.open(CACHE).then(cache =>
      /* Don't fail install if a shell asset is missing */
      Promise.allSettled(SHELL.map(url => cache.add(url)))
    ).then(() => self.skipWaiting())
  );
});

/* ── Activate: delete old caches ── */
self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys().then(keys =>
      Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k)))
    ).then(() => self.clients.claim())
  );
});

/* ── Fetch: route by destination ── */
self.addEventListener('fetch', event => {
  const url = new URL(event.request.url);

  /* Always go to network for API / external data calls */
  if(NET_ONLY.some(d => url.hostname.includes(d))){
    event.respondWith(fetch(event.request));
    return;
  }

  /* Cache-first for everything else (app shell) */
  event.respondWith(
    caches.match(event.request).then(cached => {
      if(cached) return cached;
      return fetch(event.request).then(res => {
        /* Only cache successful same-origin responses */
        if(res && res.status === 200 && url.origin === self.location.origin){
          const clone = res.clone();
          caches.open(CACHE).then(c => c.put(event.request, clone));
        }
        return res;
      });
    }).catch(() => {
      /* Offline fallback — return cached index.html for navigation */
      if(event.request.mode === 'navigate'){
        return caches.match('./index.html');
      }
    })
  );
});
