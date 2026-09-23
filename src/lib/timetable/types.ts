import type { ActivityKind, DayOfWeek } from "@/types/database";

/**
 * The shape the timetable engine speaks.
 *
 * This file is PERMANENT. Phase 3B replaces the temporary resolver with the
 * real `resolveNow()`, and because both return `TimetableState`, nothing that
 * renders it has to change.
 */

/** A timetable row flattened for display: subject joined, times pre-formatted. */
export type ResolvedEntry = {
  id: string;
  activityType: ActivityKind;
  /** Subject name for a lesson, otherwise the entry's own title. */
  label: string;
  /** Secondary line: room, teacher, or the subject when a title is present. */
  detail: string | null;
  subjectName: string | null;
  colorToken: string | null;
  room: string | null;
  dayOfWeek: DayOfWeek;
  /** Minutes since midnight — the engine's native unit. */
  startMinutes: number;
  endMinutes: number;
  /** `HH:MM`, already formatted so components never parse times. */
  startLabel: string;
  endLabel: string;
  durationMinutes: number;
};

/**
 * Every state the school day can be in. A discriminated union rather than a
 * bag of nullable fields, so a component cannot render "32 minutes remaining"
 * for a day that has not started.
 */
export type TimetableState =
  | { kind: "no_timetable" }
  | { kind: "no_school"; reason: "weekend" | "empty_day" }
  | { kind: "before_school"; next: ResolvedEntry; startsInMinutes: number }
  | {
      kind: "in_activity";
      current: ResolvedEntry;
      previous: ResolvedEntry | null;
      next: ResolvedEntry | null;
      elapsedMinutes: number;
      remainingMinutes: number;
      /** 0–1, for the progress bar. */
      progress: number;
    }
  /** Untimetabled gap between two entries — "you're currently free". */
  | { kind: "gap"; previous: ResolvedEntry; next: ResolvedEntry; remainingMinutes: number }
  | { kind: "after_school"; lastEntry: ResolvedEntry };

// ---------------------------------------------------------------------------
// Helpers shared by the temporary resolver and the eventual engine
// ---------------------------------------------------------------------------

/** `"08:30:00"` → `510`. */
export function timeToMinutes(time: string): number {
  const [h, m] = time.split(":");
  return Number(h) * 60 + Number(m);
}

/** `510` → `"08:30"`. */
export function minutesToLabel(minutes: number): string {
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`;
}

/** `95` → `"1 hr 35 min"`. Used for durations, not countdowns. */
export function formatDuration(minutes: number): string {
  if (minutes < 60) return `${minutes} min`;
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return m === 0 ? `${h} hr` : `${h} hr ${m} min`;
}

/**
 * `105` → `"1h 45m"`. For stat slots, where the number is set very large and
 * the long form ("1 hr 45 min") is three times wider than the cell.
 */
export function formatDurationCompact(minutes: number): string {
  if (minutes < 60) return `${minutes}m`;
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return m === 0 ? `${h}h` : `${h}h ${m}m`;
}

export const DAY_NAMES: Record<number, string> = {
  1: "Monday",
  2: "Tuesday",
  3: "Wednesday",
  4: "Thursday",
  5: "Friday",
  6: "Saturday",
  7: "Sunday",
};

export const DAY_SHORT: Record<number, string> = {
  1: "Mon",
  2: "Tue",
  3: "Wed",
  4: "Thu",
  5: "Fri",
  6: "Sat",
  7: "Sun",
};

/** JS `getDay()` is 0=Sunday; we store 1=Monday…7=Sunday. */
export function toDayOfWeek(date: Date): DayOfWeek {
  const js = date.getDay();
  return (js === 0 ? 7 : js) as DayOfWeek;
}
