"use client";

import { createContext, useContext, useMemo, useSyncExternalStore } from "react";

import { clockIn, isAtSchool, resolveNow } from "@/lib/timetable/resolve";
import type { ResolvedEntry, TimetableState } from "@/lib/timetable/types";

type SchoolDay = {
  state: TimetableState;
  /** True between the first and last bell, breaks and gaps included. */
  atSchool: boolean;
  /** False for a support account: school mode is the student's, not theirs. */
  locked: boolean;
  /** Minutes since midnight in the student's timezone. */
  nowMinutes: number;
  timezone: string;
};

const SchoolDayContext = createContext<SchoolDay | null>(null);

/**
 * A ticking clock, shared.
 *
 * `useSyncExternalStore` over a single interval rather than a state+effect per
 * consumer: one timer for the whole tree, a null server snapshot so the server
 * and the first client paint agree, and no setState-in-effect.
 *
 * It ticks every 20 seconds. The countdown is displayed in whole minutes, so a
 * per-second tick would re-render sixty times to change a digit twice, and a
 * per-minute tick could show a stale minute for up to 59 seconds.
 */
const TICK_MS = 20_000;

function subscribe(onChange: () => void) {
  const id = setInterval(onChange, TICK_MS);
  return () => clearInterval(id);
}
const getSnapshot = () => Math.floor(Date.now() / TICK_MS);
const getServerSnapshot = () => null;

export function SchoolDayProvider({
  entries,
  timezone,
  /**
   * Whether school mode may lock features. A support account watching a
   * student is never locked — it is her school day, not theirs, and the
   * parent needs the app most while she is unreachable.
   */
  lockable,
  /** Resolved on the server so the first paint is not empty. */
  initial,
  children,
}: {
  entries: ResolvedEntry[];
  timezone: string;
  lockable: boolean;
  initial: { state: TimetableState; nowMinutes: number };
  children: React.ReactNode;
}) {
  const tick = useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);

  const value = useMemo<SchoolDay>(() => {
    // Before hydration, trust the server's resolution rather than rendering
    // a different one and causing a mismatch.
    if (tick === null) {
      return {
        state: initial.state,
        atSchool: isAtSchool(initial.state),
        locked: lockable && isAtSchool(initial.state),
        nowMinutes: initial.nowMinutes,
        timezone,
      };
    }

    const { minutes, dayOfWeek } = clockIn(timezone);
    const state = resolveNow(entries, minutes, dayOfWeek);
    const atSchool = isAtSchool(state);

    return { state, atSchool, locked: lockable && atSchool, nowMinutes: minutes, timezone };
    // `tick` is the dependency that matters; it changes on every interval.
  }, [tick, entries, timezone, lockable, initial]);

  return <SchoolDayContext.Provider value={value}>{children}</SchoolDayContext.Provider>;
}

/**
 * The live school day.
 *
 * Returns null outside the provider — auth pages, for instance — so callers
 * must handle absence rather than assume a school day exists.
 */
export function useSchoolDay(): SchoolDay | null {
  return useContext(SchoolDayContext);
}

/** Convenience: is the app locked down right now? */
export function useSchoolLock(): boolean {
  return useSchoolDay()?.locked ?? false;
}
