const CACHE_NAME = 'clario-cache-v__BUILD_ID__';
const PRECACHE_URLS = [
  '/',
  '/manifest.json',
  '/icon-192.png',
  '/icon-512.png',
  '/icon-maskable.png',
  // __PRECACHE_ASSETS__
];

// Install Event: cache precached assets
self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => {
      console.log('[SW] Pre-caching static assets...');
      return cache.addAll(PRECACHE_URLS);
    }).then(() => self.skipWaiting())
  );
});

// Activate Event: delete stale caches
self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((cacheNames) => {
      return Promise.all(
        cacheNames.map((cacheName) => {
          if (cacheName !== CACHE_NAME && cacheName.startsWith('clario-cache-v')) {
            console.log('[SW] Removing old cache:', cacheName);
            return caches.delete(cacheName);
          }
        })
      );
    }).then(() => self.clients.claim())
  );
});

// Message Event: handle SKIP_WAITING message
self.addEventListener('message', (event) => {
  if (event.data && event.data.type === 'SKIP_WAITING') {
    self.skipWaiting();
  }
});

// Fetch Event: intercept requests
self.addEventListener('fetch', (event) => {
  const { request } = event;
  const url = new URL(request.url);

  // Proactive safety bypass: Never intercept/cache sync APIs, Supabase Auth/DB calls, Next.js HMR, RSC requests, or local auth endpoints
  if (
    url.hostname.includes('supabase.co') || 
    url.hostname.includes('powersync.com') ||
    url.hostname.includes('powersync.journeyapps.com') ||
    url.pathname.startsWith('/api/') ||
    url.pathname.startsWith('/auth/') ||
    url.pathname.includes('webpack-hmr') ||
    url.searchParams.has('_rsc') ||
    request.headers.get('RSC') === '1'
  ) {
    return; // Pass-through directly
  }

  // Handle navigate/HTML pages
  if (request.mode === 'navigate') {
    event.respondWith(
      fetch(request).catch((err) => {
        console.log('[SW] Navigation failed, serving root layout shell fallback:', err);
        // Fallback to the cached index/root shell for deep route restoration offline
        return caches.match('/');
      })
    );
    return;
  }

  // Cache-first strategy for static assets (Next.js scripts, styling, images, JSON files, WASM binaries)
  if (
    url.pathname.startsWith('/_next/') ||
    url.pathname.startsWith('/@powersync/') ||
    url.pathname.endsWith('.png') ||
    url.pathname.endsWith('.svg') ||
    url.pathname.endsWith('.json') ||
    url.pathname.endsWith('.wasm')
  ) {
    event.respondWith(
      caches.match(request).then((cachedResponse) => {
        if (cachedResponse) {
          return cachedResponse;
        }
        return fetch(request).then((networkResponse) => {
          // Cache successful same-origin or allowed requests
          if (networkResponse && networkResponse.status === 200) {
            const responseToCache = networkResponse.clone();
            caches.open(CACHE_NAME).then((cache) => {
              cache.put(request, responseToCache);
            });
          }
          return networkResponse;
        });
      })
    );
    return;
  }
});
