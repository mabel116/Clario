'use client';

import { useEffect } from 'react';

export function PWARegistration() {
  useEffect(() => {
    const ENABLE_PWA = true; // Feature flag to temporarily disable SW registration for network comparisons
    if (!ENABLE_PWA) {
      console.log('[PWA] Service Worker registration is temporarily disabled via feature flag.');
      return;
    }

    if (
      typeof window !== 'undefined' &&
      'serviceWorker' in navigator
    ) {
      const handleRegister = async () => {
        try {
          const registration = await navigator.serviceWorker.register('/sw.js');

          console.log('[PWA] Service Worker registered scope:', registration.scope);

          // Listen for updates
          registration.addEventListener('updatefound', () => {
            const installingWorker = registration.installing;
            if (!installingWorker) return;

            installingWorker.addEventListener('statechange', () => {
              if (installingWorker.state === 'installed') {
                if (navigator.serviceWorker.controller) {
                  // New update is available. Signal worker to skip waiting.
                  console.log('[PWA] New update available, signaling worker to skip waiting.');
                  installingWorker.postMessage({ type: 'SKIP_WAITING' });
                }
              }
            });
          });
        } catch (error) {
          console.error('[PWA] Service Worker registration failed:', error);
        }
      };

      // Handle reload when the active service worker changes (controller change)
      let refreshing = false;
      navigator.serviceWorker.addEventListener('controllerchange', () => {
        if (!refreshing) {
          refreshing = true;
          console.log('[PWA] Controller changed. Reloading page to load the new cache shell...');
          window.location.reload();
        }
      });

      // Register SW after window load event is complete
      if (document.readyState === 'complete') {
        handleRegister();
      } else {
        window.addEventListener('load', handleRegister);
        return () => window.removeEventListener('load', handleRegister);
      }
    }
  }, []);

  return null;
}
