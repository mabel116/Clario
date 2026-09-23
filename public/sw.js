const CACHE_NAME = 'clario-cache-vFce2FFP89TeFvv3U2bOgp';
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
    '/@powersync/AccessHandlePoolVFS-BPUHfZME.js',
  '/@powersync/FacadeVFS-d1ZDvud7.js',
  '/@powersync/IDBBatchAtomicVFS-DbkDb777.js',
  '/@powersync/MemoryVFS-DVJL5F8j.js',
  '/@powersync/OPFSCoopSyncVFS-BgTiWPfa.js',
  '/@powersync/OPFSWriteAheadVFS-Rt5CGCZP.js',
  '/@powersync/assets/mc-wa-sqlite-DoDpgFfE.wasm',
  '/@powersync/assets/mc-wa-sqlite-async-DYagSq56.wasm',
  '/@powersync/assets/wa-sqlite-CagagB9I.wasm',
  '/@powersync/assets/wa-sqlite-async-DCIP8kAx.wasm',
  '/@powersync/mc-wa-sqlite-DDFgWP93.js',
  '/@powersync/mc-wa-sqlite-async-lGclTjKJ.js',
  '/@powersync/wa-sqlite-B0tZMM0j.js',
  '/@powersync/wa-sqlite-async-CM6BmfRh.js',
  '/@powersync/websockets-Q8W_lerF.js',
  '/@powersync/worker.js',
  '/_next/static/Fce2FFP89TeFvv3U2bOgp/_buildManifest.js',
  '/_next/static/Fce2FFP89TeFvv3U2bOgp/_ssgManifest.js',
  '/_next/static/chunks/11390db7.c696782f2ce29acd.js',
  '/_next/static/chunks/1255-57ed0c74e155ba3a.js',
  '/_next/static/chunks/1482.df8b7bca3f9d15b2.js',
  '/_next/static/chunks/1646.f9222787e8cf193b.js',
  '/_next/static/chunks/176-d89ae5da5dd06f8d.js',
  '/_next/static/chunks/1919-f0d9a5006a1de59c.js',
  '/_next/static/chunks/2063.681fcc77c2708ee4.js',
  '/_next/static/chunks/2820-551b700710034b10.js',
  '/_next/static/chunks/3489-13f51a49533a9e4a.js',
  '/_next/static/chunks/3954.4ea064498801d46e.js',
  '/_next/static/chunks/4382-a94566abd1c629e6.js',
  '/_next/static/chunks/4444.02e4cb8a3d825558.js',
  '/_next/static/chunks/44530001-306c91269327025e.js',
  '/_next/static/chunks/464.610decf9957e86c1.js',
  '/_next/static/chunks/4830.bbeb8703bb05a771.js',
  '/_next/static/chunks/4bd1b696-100b9d70ed4e49c1.js',
  '/_next/static/chunks/5139.bab70807d9ac195a.js',
  '/_next/static/chunks/5222.95cc8023485ef8e4.js',
  '/_next/static/chunks/5363.7e89de19a3aef288.js',
  '/_next/static/chunks/5971.9c5c3e02081562e0.js',
  '/_next/static/chunks/6665.8e470cf7fbd0c5fb.js',
  '/_next/static/chunks/6740.55d97aedf107da5b.js',
  '/_next/static/chunks/7328-fa10ed019cdf98d2.js',
  '/_next/static/chunks/7367.8d140ad141b14b1f.js',
  '/_next/static/chunks/7418-b58f37ac56b61453.js',
  '/_next/static/chunks/7448-6c5cb5e7ce1ab311.js',
  '/_next/static/chunks/8937.0c6284e68bcfc44c.js',
  '/_next/static/chunks/9209.9a67cbd4abcce624.js',
  '/_next/static/chunks/9440.9505c490fcae4290.js',
  '/_next/static/chunks/9697.e81659965f85412b.js',
  '/_next/static/chunks/9891.c99400f37cd4e7bb.js',
  '/_next/static/chunks/app/_not-found/page-ad3286dfbfedeef8.js',
  '/_next/static/chunks/app/auth/callback/route-d6e9f7e23ede70cf.js',
  '/_next/static/chunks/app/clients/%5Bid%5D/invoices/new/page-09cdbd94963290ba.js',
  '/_next/static/chunks/app/clients/%5Bid%5D/page-d6e9f7e23ede70cf.js',
  '/_next/static/chunks/app/clients/[id]/invoices/new/page-09cdbd94963290ba.js',
  '/_next/static/chunks/app/clients/[id]/page-d6e9f7e23ede70cf.js',
  '/_next/static/chunks/app/clients/page-4c2a551ae1a635f5.js',
  '/_next/static/chunks/app/error-86c35a80c1e0d0d2.js',
  '/_next/static/chunks/app/invoices/%5Bid%5D/edit/page-a5ada25aa2fd47ef.js',
  '/_next/static/chunks/app/invoices/%5Bid%5D/page-082b8662aa4230d4.js',
  '/_next/static/chunks/app/invoices/[id]/edit/page-a5ada25aa2fd47ef.js',
  '/_next/static/chunks/app/invoices/[id]/page-082b8662aa4230d4.js',
  '/_next/static/chunks/app/invoices/page-f72a1352354a1ace.js',
  '/_next/static/chunks/app/layout-4a78cfcf4edd6b5c.js',
  '/_next/static/chunks/app/page-d2ffe0f71c202f24.js',
  '/_next/static/chunks/app/payments/page-90ad41fedd7260d5.js',
  '/_next/static/chunks/app/reset-password/page-61043b1b334d9202.js',
  '/_next/static/chunks/app/settings/page-874ffa987054d9db.js',
  '/_next/static/chunks/app/sign-in/page-1529c957a28cc72c.js',
  '/_next/static/chunks/app/sign-up/page-b307bc3d2e6abd72.js',
  '/_next/static/chunks/b2d98e07.e5c5d76204b305e4.js',
  '/_next/static/chunks/d78ee677.63a7e0215e64cc50.js',
  '/_next/static/chunks/f1df3ce6.f402fddf6ec5c65d.js',
  '/_next/static/chunks/ff804112.054e22aa82036647.js',
  '/_next/static/chunks/framework-d063bb259975c6cd.js',
  '/_next/static/chunks/main-131c4368a818878c.js',
  '/_next/static/chunks/main-app-16c61a5c8d8da3cb.js',
  '/_next/static/chunks/pages/_app-e91d44151749b25d.js',
  '/_next/static/chunks/pages/_error-d5437e6632e42397.js',
  '/_next/static/chunks/polyfills-42372ed130431b0a.js',
  '/_next/static/chunks/webpack-8e6b564fdabf1494.js',
  '/_next/static/css/ccd9e62d72d4b2a8.css',
  '/_next/static/media/mc-wa-sqlite-async.e27ab1ed.wasm',
  '/_next/static/media/mc-wa-sqlite.194e2ec3.wasm',
  '/_next/static/media/wa-sqlite-async.b5c71aa6.wasm',
  '/_next/static/media/wa-sqlite.1c79f40b.wasm',
  '/icon-192.png',
  '/icon-512.png',
  '/icon-maskable.png',
  '/manifest.json'
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
