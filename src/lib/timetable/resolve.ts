import {
  toDayOfWeek,
  type ResolvedEntry,
  type TimetableState,
} from "@/lib/timetable/types";

/**
 * Where the student is in their school day, right now.
 *
 * Replaces `resolve-temporary.ts`. Three things are different and all three
 * matter:
 *
 *   Timezone.   The caller passes minutes-since-midnight and a day index
 *               already resolved in the STUDENT's zone, not the server's. On
 *               a host in another region — which Vercel is — the server clock
 *               is simply the wrong clock, and the old resolver used it.
 *
 *   Honesty.    No `demoFallback`. Outside school hours this says
 *               `before_school` or `after_school` rather than pretending a
 *               lesson is in progress so the card looks populated.
 *
 *   Tickable.   Pure and cheap, so a client component can call it every
 *               second against a live clock and the countdown actually counts
 *               down. The old one computed once at render and then lied for
 *               as long as the page stayed open.
 */
export function resolveNow(
  entries: ResolvedEntry[],
  /** Minutes since midnight, in the student's timezone. */
  nowMinutes: number,
  /** 1 = Monday … 7 = Sunday, in the student's timezone. */
  dayOfWeek: number,
): TimetableState {
  if (entries.length === 0) return { kind: "no_timetable" };

  const todays = entries
    .filter((e) => e.dayOfWeek === dayOfWeek)
    .sort((a, b) => a.startMinutes - b.startMinutes);

  if (todays.length === 0) {
    return { kind: "no_school", reason: dayOfWeek >= 6 ? "weekend" : "empty_day" };
  }

  const first = todays[0];
  const last = todays[todays.length - 1];

  if (nowMinutes < first.startMinutes) {
    return {
      kind: "before_school",
      next: first,
      startsInMinutes: first.startMinutes - nowMinutes,
    };
  }

  if (nowMinutes >= last.endMinutes) {
    return { kind: "after_school", lastEntry: last };
  }

  const currentIndex = todays.findIndex(
    (e) => nowMinutes >= e.startMinutes && nowMinutes < e.endMinutes,
  );

  if (currentIndex !== -1) {
    const current = todays[currentIndex];
    const elapsed = nowMinutes - current.startMinutes;
    const total = current.endMinutes - current.startMinutes;

    return {
      kind: "in_activity",
      current,
      previous: todays[currentIndex - 1] ?? null,
      next: todays[currentIndex + 1] ?? null,
      elapsedMinutes: elapsed,
      remainingMinutes: current.endMinutes - nowMinutes,
      // Guarded: a zero-length entry is impossible per the CHECK constraint,
      // but a division by zero here would render NaN% into the progress bar.
      progress: total > 0 ? Math.min(1, Math.max(0, elapsed / total)) : 0,
    };
  }

  // Between two timetabled things — a gap the timetable does not name.
  const next = todays.find((e) => e.startMinutes > nowMinutes);
  const previous = [...todays].reverse().find((e) => e.endMinutes <= nowMinutes);

  if (next && previous) {
    return {
      kind: "gap",
      previous,
      next,
      remainingMinutes: next.startMinutes - nowMinutes,
    };
  }

  return { kind: "after_school", lastEntry: last };
}

/**
 * "Is she at school right now?"
 *
 * True from the first bell to the last, INCLUDING breaks and gaps — a break
 * between two lessons is still school. This is what school mode keys off, and
 * getting it wrong in the lenient direction would unlock the app mid-lesson.
 */
export function isAtSchool(state: TimetableState): boolean {
  return state.kind === "in_activity" || state.kind === "gap";
}

/**
 * Minutes-since-midnight and weekday, in an arbitrary IANA timezone.
 *
 * `Intl` rather than date arithmetic: it is the only thing that gets DST
 * transitions right, and "what time is it for her" is exactly the question
 * the old resolver got wrong by asking the server.
 */
export function clockIn(timezone: string, at: Date = new Date()): {
  minutes: number;
  dayOfWeek: number;
} {
  try {
    const parts = new Intl.DateTimeFormat("en-GB", {
      timeZone: timezone,
      hour: "2-digit",
      minute: "2-digit",
      weekday: "short",
      hourCycle: "h23",
    }).formatToParts(at);

    const get = (t: string) => parts.find((p) => p.type === t)?.value ?? "";
    const hour = Number(get("hour"));
    const minute = Number(get("minute"));
    const weekday = get("weekday");

    const DAYS: Record<string, number> = {
      Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6, Sun: 7,
    };

    return {
      minutes: hour * 60 + minute,
      dayOfWeek: DAYS[weekday] ?? toDayOfWeek(at),
    };
  } catch {
    // An unrecognised timezone should degrade to the local clock rather than
    // take the page down.
    return { minutes: at.getHours() * 60 + at.getMinutes(), dayOfWeek: toDayOfWeek(at) };
  }
}
