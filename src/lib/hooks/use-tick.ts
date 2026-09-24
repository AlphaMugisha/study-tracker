"use client";

import { useSyncExternalStore } from "react";

/**
 * One shared clock for everything that has to tick.
 *
 * `useSyncExternalStore` over a single interval rather than state-plus-effect
 * per consumer: one timer for the whole tree, and a null server snapshot so
 * the server render and the first client paint agree instead of flashing.
 *
 * Twenty seconds. Countdowns are displayed in whole minutes, so a per-second
 * tick would re-render sixty times to change a digit twice, and a per-minute
 * tick could leave a stale minute on screen for up to fifty-nine seconds.
 */
export const TICK_MS = 20_000;

function subscribe(onChange: () => void) {
  const id = setInterval(onChange, TICK_MS);
  return () => clearInterval(id);
}

const getSnapshot = () => Math.floor(Date.now() / TICK_MS);
const getServerSnapshot = () => null;

/** Null until hydration — callers must fall back to their server value. */
export function useTick(): number | null {
  return useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
}
