import {
  timeToMinutes,
  toDayOfWeek,
  type ResolvedEntry,
  type TimetableState,
} from "@/lib/timetable/types";

/**
 * ⚠️ TEMPORARY — replaced by `resolveNow()` in Phase 3B.
 * ---------------------------------------------------------------------------
 * This exists so the Today page can be built and judged against real seeded
 * data instead of a mock. It reads the real timetable and returns the real
 * `TimetableState`, so the page it feeds is the finished page.
 *
 * What it deliberately does NOT do — all of it is Phase 3B's job:
 *
 *   - timezone handling. It uses the server's clock, not the student's
 *     `profiles.timezone`. On a Supabase server in another region, "now" is
 *     simply wrong. This is the single biggest reason it is temporary.
 *   - live ticking. The remaining time is computed once, at render. Nothing
 *     counts down.
 *   - holidays, DST boundaries, midnight rollover.
 *
 * `demoFallback` is the other giveaway: outside school hours it pretends an
 * entry is in progress so the card can be reviewed at any time of day. The
 * real engine will honestly report `before_school` / `after_school` instead.
 *
 * Phase 3B deletes this file. Nothing imports it except `getTodayState()`.
 */
export function resolveTemporary(
  entries: ResolvedEntry[],
  now: Date,
  options: { demoFallback?: boolean } = {},
): TimetableState {
  const today = toDayOfWeek(now);
  const todays = entries
    .filter((e) => e.dayOfWeek === today)
    .sort((a, b) => a.startMinutes - b.startMinutes);

  if (entries.length === 0) return { kind: "no_timetable" };

  if (todays.length === 0) {
    // Weekend, or a weekday with nothing timetabled. On a weekend with
    // demoFallback on, borrow Monday so the interface can still be reviewed.
    if (options.demoFallback) {
      const monday = entries
        .filter((e) => e.dayOfWeek === 1)
        .sort((a, b) => a.startMinutes - b.startMinutes);
      if (monday.length > 0) return midDay(monday);
    }
    return { kind: "no_school", reason: today >= 6 ? "weekend" : "empty_day" };
  }

  const minutes = now.getHours() * 60 + now.getMinutes();
  const first = todays[0];
  const last = todays[todays.length - 1];

  if (minutes < first.startMinutes) {
    if (options.demoFallback) return midDay(todays);
    return {
      kind: "before_school",
      next: first,
      startsInMinutes: first.startMinutes - minutes,
    };
  }

  if (minutes >= last.endMinutes) {
    if (options.demoFallback) return midDay(todays);
    return { kind: "after_school", lastEntry: last };
  }

  const index = todays.findIndex(
    (e) => minutes >= e.startMinutes && minutes < e.endMinutes,
  );

  if (index === -1) {
    // Between two entries: an untimetabled gap.
    const next = todays.find((e) => e.startMinutes > minutes)!;
    const previous = [...todays].reverse().find((e) => e.endMinutes <= minutes)!;
    return { kind: "gap", previous, next, remainingMinutes: next.startMinutes - minutes };
  }

  return inActivity(todays, index, minutes);
}

function inActivity(
  todays: ResolvedEntry[],
  index: number,
  minutes: number,
): TimetableState {
  const current = todays[index];
  const elapsed = minutes - current.startMinutes;
  const remaining = current.endMinutes - minutes;

  return {
    kind: "in_activity",
    current,
    previous: todays[index - 1] ?? null,
    next: todays[index + 1] ?? null,
    elapsedMinutes: elapsed,
    remainingMinutes: remaining,
    progress: Math.min(1, Math.max(0, elapsed / current.durationMinutes)),
  };
}

/**
 * Demo-only: park the clock a third of the way into a mid-morning entry so the
 * Current Activity Card always has something to show. Never reached once the
 * real engine lands.
 */
function midDay(todays: ResolvedEntry[]): TimetableState {
  const index = Math.min(2, todays.length - 1);
  const entry = todays[index];
  const minutes = entry.startMinutes + Math.floor(entry.durationMinutes / 3);
  return inActivity(todays, index, minutes);
}

/** Shared by the temporary resolver and the timetable page. */
export function toResolvedEntry(row: {
  id: string;
  activity_type: ResolvedEntry["activityType"];
  title: string | null;
  room: string | null;
  teacher: string | null;
  day_of_week: number;
  start_time: string;
  end_time: string;
  subjects: { name: string; color_token: string } | null;
}): ResolvedEntry {
  const startMinutes = timeToMinutes(row.start_time);
  const endMinutes = timeToMinutes(row.end_time);
  const subjectName = row.subjects?.name ?? null;

  // A lesson is named by its subject; anything else by its own title.
  const label = subjectName ?? row.title ?? "Untitled";
  const detail = subjectName && row.title ? row.title : (row.room ?? row.teacher);

  return {
    id: row.id,
    activityType: row.activity_type,
    label,
    detail,
    subjectName,
    colorToken: row.subjects?.color_token ?? null,
    room: row.room,
    dayOfWeek: row.day_of_week as ResolvedEntry["dayOfWeek"],
    startMinutes,
    endMinutes,
    startLabel: row.start_time.slice(0, 5),
    endLabel: row.end_time.slice(0, 5),
    durationMinutes: endMinutes - startMinutes,
  };
}
