/**
 * Background scroll lock hook.
 * Intentional no-op: Touch isolation on backdrops handles scroll prevention cleanly
 * without causing iOS WebKit paint detachment or theme-color race conditions.
 */
export function useModalScrollLock(_isLocked: boolean = true) {
  // Intentional no-op: Touch isolation on backdrops handles scroll prevention cleanly
  // without causing iOS WebKit paint detachment or theme-color race conditions.
}

