import { useEffect } from 'react';

/**
 * Background scroll lock & iOS PWA status bar dimming hook.
 * Note: Dynamic manipulation of element.style.overflow on #clario-main-scroll is omitted
 * to prevent the iOS WebKit compositor paint detachment / scroll freeze bug.
 * Background scroll prevention is handled via backdrop touch isolation on modal backdrops.
 * Dynamically updates <meta name="theme-color"> so iOS dims the top status bar to match modal overlay.
 */
export function useModalScrollLock(isLocked: boolean = true) {
  useEffect(() => {
    if (!isLocked) return;

    let meta = document.querySelector('meta[name="theme-color"]') as HTMLMetaElement | null;
    const originalColor = meta ? meta.getAttribute('content') : '#ffffff';

    if (!meta) {
      meta = document.createElement('meta');
      meta.name = 'theme-color';
      document.head.appendChild(meta);
    }

    // Dim the iOS PWA status bar to match the dark modal overlay
    meta.setAttribute('content', '#18181b');

    return () => {
      if (meta) {
        meta.setAttribute('content', originalColor || '#ffffff');
      }
    };
  }, [isLocked]);
}

