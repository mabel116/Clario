const CACHE_NAME = 'clario-cache-vB5Rww97gdOAvcorW2zFYi';
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
  '/_next/static/B5Rww97gdOAvcorW2zFYi/_buildManifest.js',
  '/_next/static/B5Rww97gdOAvcorW2zFYi/_ssgManifest.js',
  '/_next/static/chunks/1028-2291304ead5d2dd1.js',
  '/_next/static/chunks/11390db7.740869c229a72a13.js',
  '/_next/static/chunks/1517-e8afac63fb92352c.js',
  '/_next/static/chunks/1536.44223d65adf4c204.js',
  '/_next/static/chunks/2063.ece9624c3fad1c1f.js',
  '/_next/static/chunks/2282.48dcdcb060a7c155.js',
  '/_next/static/chunks/2545-eadf65dc66a053c8.js',
  '/_next/static/chunks/2774-e3c6f599d1576415.js',
  '/_next/static/chunks/2809-16a54b4fcb04e48a.js',
  '/_next/static/chunks/3045.a101f48b34372ade.js',
  '/_next/static/chunks/3229.7634777240c68420.js',
  '/_next/static/chunks/3818-694bef21a7e8bb93.js',
  '/_next/static/chunks/3954.78618aa86cc15ce0.js',
  '/_next/static/chunks/4016.2e3776ede1f80ddc.js',
  '/_next/static/chunks/4259.37019b86906c2572.js',
  '/_next/static/chunks/4444.2aacf918adae4387.js',
  '/_next/static/chunks/44530001-969465deca09cd56.js',
  '/_next/static/chunks/4538.d973b343991990fd.js',
  '/_next/static/chunks/4bd1b696-4fa9b7ebe6eda6ad.js',
  '/_next/static/chunks/5034.310ac68ae380e6dc.js',
  '/_next/static/chunks/5091-f3c7d11d88a4a8b0.js',
  '/_next/static/chunks/5140-8abe25b271d0cf42.js',
  '/_next/static/chunks/5203.7c54c202406d4620.js',
  '/_next/static/chunks/5556.e6b11c4afeae00ab.js',
  '/_next/static/chunks/6218.2a359a0f55d6ba39.js',
  '/_next/static/chunks/7805.b844111fd53bdae4.js',
  '/_next/static/chunks/8257.c88bf553ac66110d.js',
  '/_next/static/chunks/9014.a7e0626991ad7b0e.js',
  '/_next/static/chunks/9168.6075fb01d98990fc.js',
  '/_next/static/chunks/9244.2eaea94d3886c28e.js',
  '/_next/static/chunks/9843-f63de8ba3edbd466.js',
  '/_next/static/chunks/app/_not-found/page-faaf4096b438fbf2.js',
  '/_next/static/chunks/app/auth/callback/route-d8f15e6b7864f163.js',
  '/_next/static/chunks/app/clients/%5Bid%5D/invoices/new/page-26c319443a246ef5.js',
  '/_next/static/chunks/app/clients/%5Bid%5D/page-6efb34da7dfb0ecc.js',
  '/_next/static/chunks/app/clients/[id]/invoices/new/page-26c319443a246ef5.js',
  '/_next/static/chunks/app/clients/[id]/page-6efb34da7dfb0ecc.js',
  '/_next/static/chunks/app/clients/page-8a92278c29d0181f.js',
  '/_next/static/chunks/app/error-dbc12b66d5a35c85.js',
  '/_next/static/chunks/app/invoices/%5Bid%5D/edit/page-22f3f4f015bdd041.js',
  '/_next/static/chunks/app/invoices/%5Bid%5D/page-76dd58df6d68f8fb.js',
  '/_next/static/chunks/app/invoices/[id]/edit/page-22f3f4f015bdd041.js',
  '/_next/static/chunks/app/invoices/[id]/page-76dd58df6d68f8fb.js',
  '/_next/static/chunks/app/invoices/page-e627cef8bd16e037.js',
  '/_next/static/chunks/app/layout-b89ce6cf0eac4c2e.js',
  '/_next/static/chunks/app/page-4f2bead1dc08cede.js',
  '/_next/static/chunks/app/payments/page-82f68852d82b1a12.js',
  '/_next/static/chunks/app/reset-password/page-6c17e56568cb0217.js',
  '/_next/static/chunks/app/settings/page-a526aed5aa04807a.js',
  '/_next/static/chunks/app/sign-in/page-5de0ff73eca2cd67.js',
  '/_next/static/chunks/app/sign-up/page-895e0a8821e07af7.js',
  '/_next/static/chunks/b2d98e07.ba6f3248961eca08.js',
  '/_next/static/chunks/d78ee677.e563f3a1ee2dc6a9.js',
  '/_next/static/chunks/f1df3ce6.560959a551f90d4b.js',
  '/_next/static/chunks/ff804112.6ec2e10fd223e37d.js',
  '/_next/static/chunks/framework-8e61f16870a3a930.js',
  '/_next/static/chunks/main-64cc2a57ce68dd60.js',
  '/_next/static/chunks/main-app-a8ebf46b46d0da44.js',
  '/_next/static/chunks/pages/_app-30337988e7306617.js',
  '/_next/static/chunks/pages/_error-8a1aab7f5646bdea.js',
  '/_next/static/chunks/polyfills-42372ed130431b0a.js',
  '/_next/static/chunks/webpack-92abd9c985646d2e.js',
  '/_next/static/css/faec4c964f3497ab.css',
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
