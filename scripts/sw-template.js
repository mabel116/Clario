const CACHE_NAME = 'clario-cache-v__BUILD_ID__';
const CORE_ROUTES = [
  '/',
  '/clients',
  '/invoices',
  '/payments',
  '/settings',
  '/clients/_shell_/invoices/new',
  '/invoices/_shell_',
  '/invoices/_shell_/edit'
];

const PRECACHE_URLS = [
  ...CORE_ROUTES,
  '/manifest.json',
  '/icon-192.png',
  '/icon-512.png',
  '/icon-maskable.png',
  // __PRECACHE_ASSETS__
];

// Helper to ensure only valid HTTP/HTTPS URLs are passed to CacheStorage
function isCacheable(req) {
  if (!req) return false;
  const reqUrl = typeof req === 'string' ? req : req.url;
  if (!reqUrl) return false;
  return reqUrl.startsWith('http://') || reqUrl.startsWith('https://') || (reqUrl.startsWith('/') && !reqUrl.startsWith('//'));
}

// Install Event: cache precached assets and core document routes
self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then(async (cache) => {
      console.log('[SW] Pre-caching static assets and core document routes...');

      // Find any prior clario caches to copy from if offline or network fetch fails
      const allCacheKeys = await caches.keys();
      const prevCacheNames = allCacheKeys.filter(k => k !== CACHE_NAME && k.startsWith('clario-cache-v'));
      const prevCaches = await Promise.all(prevCacheNames.map(k => caches.open(k)));

      await Promise.all(
        PRECACHE_URLS.map(async (url) => {
          try {
            await cache.add(url);
          } catch (err) {
            // If network fetch fails (e.g. offline during install), attempt to copy from previous cache
            let recovered = false;
            for (const prevCache of prevCaches) {
              const matched = await prevCache.match(url);
              if (matched) {
                if (isCacheable(url)) {
                  await cache.put(url, matched).catch(() => {});
                }
                recovered = true;
                break;
              }
            }
            if (!recovered) {
              console.warn(`[SW] Warning: failed to precache ${url}:`, err.message);
            }
          }
        })
      );

      // Best-effort pre-caching of RSC payloads for core routes to enable seamless offline client-side transitions
      for (const route of CORE_ROUTES) {
        try {
          const rscReq = new Request(`${route}?_rsc`, { headers: { 'RSC': '1' } });
          const rscRes = await fetch(rscReq);
          if (rscRes && rscRes.status === 200) {
            if (isCacheable(rscReq)) await cache.put(rscReq, rscRes.clone()).catch(() => {});
            if (isCacheable(`${route}?_rsc`)) await cache.put(`${route}?_rsc`, rscRes).catch(() => {});
          }
        } catch (e) {
          // Attempt fallback from previous cache for RSC payload
          for (const prevCache of prevCaches) {
            const matched = await prevCache.match(`${route}?_rsc`);
            if (matched) {
              if (isCacheable(`${route}?_rsc`)) {
                await cache.put(`${route}?_rsc`, matched).catch(() => {});
              }
              break;
            }
          }
        }
      }
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

  // 1. Protocol Guard: Immediately bypass any non-HTTP/HTTPS request (e.g. chrome-extension://, moz-extension://)
  if (url.protocol !== 'http:' && url.protocol !== 'https:') {
    return; // Pass-through directly without intercepting
  }

  // 2. Proactive safety bypass: Never intercept/cache sync APIs, Supabase Auth/DB calls (/auth/v1/, /rest/v1/), PowerSync WebSocket/streaming connections, Next.js HMR, or non-GET requests
  if (
    request.method !== 'GET' ||
    url.protocol === 'ws:' ||
    url.protocol === 'wss:' ||
    request.headers.get('Upgrade') === 'websocket' ||
    url.pathname.includes('/auth/v1/') ||
    url.pathname.includes('/rest/v1/') ||
    url.hostname.includes('supabase.co') || 
    url.hostname.includes('powersync.com') ||
    url.hostname.includes('powersync.journeyapps.com') ||
    url.pathname.includes('/sync/stream') ||
    url.pathname.startsWith('/api/') ||
    url.pathname.startsWith('/auth/') ||
    url.pathname.includes('webpack-hmr')
  ) {
    return; // Pass-through directly without intercepting
  }

  // Handle Next.js RSC (React Server Component) client-side navigation requests
  if (url.searchParams.has('_rsc') || request.headers.get('RSC') === '1') {
    event.respondWith(
      fetch(request)
        .then((networkResponse) => {
          if (networkResponse && networkResponse.status === 200) {
            const responseToCache = networkResponse.clone();
            caches.open(CACHE_NAME).then((cache) => {
              if (isCacheable(request)) {
                cache.put(request, responseToCache).catch(() => {});
              }
              if (isCacheable(`${url.pathname}?_rsc`)) {
                cache.put(`${url.pathname}?_rsc`, responseToCache).catch(() => {});
              }
            });
          }
          return networkResponse;
        })
        .catch(async () => {
          console.log('[SW] RSC fetch offline, attempting cache resolution for:', url.pathname);
          // 1. Try exact request match in cache
          const exactMatch = await caches.match(request);
          if (exactMatch) return exactMatch;

          // 2. Try match ignoring query parameters
          const ignoreSearchMatch = await caches.match(request, { ignoreSearch: true });
          if (ignoreSearchMatch) return ignoreSearchMatch;

          // 3. Try query-agnostic RSC payload match
          const rscMatch = await caches.match(`${url.pathname}?_rsc`);
          if (rscMatch) return rscMatch;

          // 4. Resolve dynamic route patterns to precached RSC shells
          if (/^\/clients\/[^/]+\/invoices\/new/.test(url.pathname)) {
            const shellRsc = await caches.match('/clients/_shell_/invoices/new?_rsc');
            if (shellRsc) return shellRsc;
            const shellDoc = await caches.match('/clients/_shell_/invoices/new');
            if (shellDoc) return shellDoc;
          }
          if (/^\/invoices\/[^/]+\/edit/.test(url.pathname)) {
            const shellRsc = await caches.match('/invoices/_shell_/edit?_rsc');
            if (shellRsc) return shellRsc;
            const shellDoc = await caches.match('/invoices/_shell_/edit');
            if (shellDoc) return shellDoc;
          }
          if (/^\/invoices\/[^/]+/.test(url.pathname)) {
            const shellRsc = await caches.match('/invoices/_shell_?_rsc');
            if (shellRsc) return shellRsc;
            const shellDoc = await caches.match('/invoices/_shell_');
            if (shellDoc) return shellDoc;
          }
          if (/^\/clients\//.test(url.pathname)) {
            const shellRsc = await caches.match('/clients?_rsc');
            if (shellRsc) return shellRsc;
            const shellDoc = await caches.match('/clients');
            if (shellDoc) return shellDoc;
          }
          if (/^\/invoices\//.test(url.pathname)) {
            const shellRsc = await caches.match('/invoices?_rsc');
            if (shellRsc) return shellRsc;
            const shellDoc = await caches.match('/invoices');
            if (shellDoc) return shellDoc;
          }
          if (/^\/payments/.test(url.pathname)) {
            const shellRsc = await caches.match('/payments?_rsc');
            if (shellRsc) return shellRsc;
          }
          if (/^\/settings/.test(url.pathname)) {
            const shellRsc = await caches.match('/settings?_rsc');
            if (shellRsc) return shellRsc;
          }

          // 5. Benign 200 OK fallback: Never return 503 or error status codes that trigger Next.js hard page reloads
          console.log('[SW] Serving benign empty RSC 200 OK fallback for:', url.pathname);
          return new Response('', {
            status: 200,
            statusText: 'OK',
            headers: {
              'Content-Type': 'text/x-component',
              'x-clario-offline': '1'
            }
          });
        })
    );
    return;
  }

  // Handle navigate/HTML pages
  if (request.mode === 'navigate') {
    event.respondWith(
      fetch(request)
        .then((networkResponse) => {
          if (networkResponse && networkResponse.status === 200) {
            const responseToCache = networkResponse.clone();
            caches.open(CACHE_NAME).then((cache) => {
              if (isCacheable(request)) {
                cache.put(request, responseToCache).catch(() => {});
              }
            });
          }
          return networkResponse;
        })
        .catch(async (err) => {
          console.log('[SW] Navigation failed, serving cached route shell fallback:', err);
          // 1. Try exact route match (e.g. /clients)
          const exactMatch = await caches.match(request);
          if (exactMatch) return exactMatch;

          // 2. Try match ignoring query parameters
          const ignoreSearchMatch = await caches.match(request, { ignoreSearch: true });
          if (ignoreSearchMatch) return ignoreSearchMatch;

          // 3. Try pathname without query string
          const pathnameMatch = await caches.match(url.pathname);
          if (pathnameMatch) return pathnameMatch;

          // 4. Resolve dynamic route patterns to specific route shells
          if (/^\/clients\/[^/]+\/invoices\/new/.test(url.pathname)) {
            const newInvoiceShell = await caches.match('/clients/_shell_/invoices/new');
            if (newInvoiceShell) return newInvoiceShell;
          }
          if (/^\/invoices\/[^/]+\/edit/.test(url.pathname)) {
            const editInvoiceShell = await caches.match('/invoices/_shell_/edit');
            if (editInvoiceShell) return editInvoiceShell;
          }
          if (/^\/invoices\/[^/]+/.test(url.pathname)) {
            const invoiceDetailShell = await caches.match('/invoices/_shell_');
            if (invoiceDetailShell) return invoiceDetailShell;
          }
          if (/^\/clients\//.test(url.pathname)) {
            const clientsShell = await caches.match('/clients');
            if (clientsShell) return clientsShell;
          }
          if (/^\/invoices\//.test(url.pathname)) {
            const invoicesShell = await caches.match('/invoices');
            if (invoicesShell) return invoicesShell;
          }

          // 5. Fallback to root shell ONLY for root or non-subroute paths
          // Strict safety rule: Never return '/' (Financial Dashboard) for /clients/* or /invoices/*
          if (!url.pathname.startsWith('/clients') && !url.pathname.startsWith('/invoices')) {
            const rootMatch = await caches.match('/');
            if (rootMatch) return rootMatch;
          }

          // 6. As last resort fallback, return generic /clients or / shell rather than dead 503
          if (url.pathname.startsWith('/clients')) {
            const clientsFallback = await caches.match('/clients');
            if (clientsFallback) return clientsFallback;
          }
          if (url.pathname.startsWith('/invoices')) {
            const invoicesFallback = await caches.match('/invoices');
            if (invoicesFallback) return invoicesFallback;
          }
          const rootFallback = await caches.match('/');
          if (rootFallback) return rootFallback;

          return new Response('Offline', { status: 200, headers: { 'Content-Type': 'text/html' } });
        })
    );
    return;
  }

  // Cache-first strategy for static assets (Next.js scripts, styling, images, fonts, JSON files, WASM binaries)
  if (
    url.pathname.startsWith('/_next/') ||
    url.pathname.startsWith('/@powersync/') ||
    url.pathname.endsWith('.png') ||
    url.pathname.endsWith('.jpg') ||
    url.pathname.endsWith('.jpeg') ||
    url.pathname.endsWith('.svg') ||
    url.pathname.endsWith('.ico') ||
    url.pathname.endsWith('.json') ||
    url.pathname.endsWith('.wasm') ||
    url.pathname.endsWith('.css') ||
    url.pathname.endsWith('.js') ||
    url.pathname.endsWith('.woff') ||
    url.pathname.endsWith('.woff2') ||
    url.pathname.endsWith('.ttf')
  ) {
    event.respondWith(
      caches.match(request).then(async (cachedResponse) => {
        if (cachedResponse) {
          return cachedResponse;
        }
        // Fallback for percent-encoded or unencoded bracket paths (e.g. [id] vs %5Bid%5D)
        if (url.pathname.includes('%5B') || url.pathname.includes('%5D')) {
          const decoded = decodeURIComponent(url.pathname);
          const decodedMatch = await caches.match(decoded);
          if (decodedMatch) return decodedMatch;
        } else if (url.pathname.includes('[') || url.pathname.includes(']')) {
          const encoded = url.pathname.replace(/\[/g, '%5B').replace(/\]/g, '%5D');
          const encodedMatch = await caches.match(encoded);
          if (encodedMatch) return encodedMatch;
        }
        return fetch(request).then((networkResponse) => {
          // Cache successful same-origin or allowed requests
          if (networkResponse && networkResponse.status === 200) {
            const responseToCache = networkResponse.clone();
            caches.open(CACHE_NAME).then((cache) => {
              if (isCacheable(request)) {
                cache.put(request, responseToCache).catch(() => {});
              }
            });
          }
          return networkResponse;
        });
      })
    );
    return;
  }
});
