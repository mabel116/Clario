import { useEffect } from 'react';

/**
 * Custom hook to lock background scrolling when a modal or sheet is open.
 * Targets #clario-main-scroll if available, falling back to document.body.
 */
export function useModalScrollLock(isLocked: boolean = true) {
  useEffect(() => {
    if (!isLocked || typeof document === 'undefined') return;
    const scrollEl = document.getElementById('clario-main-scroll') || document.body;
    const originalOverflow = scrollEl.style.overflow;
    scrollEl.style.overflow = 'hidden';

    return () => {
      scrollEl.style.overflow = originalOverflow;
    };
  }, [isLocked]);
}
