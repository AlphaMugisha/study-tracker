"use client";

import { useSyncExternalStore } from "react";

/**
 * Whether the window is scrolled past `threshold`.
 *
 * `useSyncExternalStore` rather than useState+useEffect: the server has no
 * scroll position, so the server snapshot is always false and React reconciles
 * the real value on hydration without us writing state inside an effect.
 *
 * The subscription is passive and reads a single number, so it is cheap enough
 * to run unthrottled -- the getSnapshot result is a boolean, and React bails
 * out of re-rendering while it stays the same.
 */
export function useScrolled(threshold = 8): boolean {
  return useSyncExternalStore(
    (onChange) => {
      window.addEventListener("scroll", onChange, { passive: true });
      return () => window.removeEventListener("scroll", onChange);
    },
    () => window.scrollY > threshold,
    () => false,
  );
}
