import type { ActivityLog } from "@/types/database";

/**
 * One report per day, cut at midnight.
 *
 * ---------------------------------------------------------------------------
 * WHOSE MIDNIGHT. Days are bucketed in the STUDENT's timezone, not the
 * server's and not the reader's. This is the whole difficulty of the file: on
 * Vercel the server is UTC, the parent may be anywhere, and homework she
 * finished at 00:30 on Tuesday belongs to Tuesday for her and to Monday for a
 * UTC clock. Every timestamp here goes through `dayKeyIn` for that reason —
 * there is no `toISOString().slice(0, 10)` anywhere in this module, and there
 * must not be.
 * ---------------------------------------------------------------------------
 *
 * Computed on read rather than written by a nightly job. The numbers come
 * from `activity_logs`, which is append-only and cannot be edited or deleted
 * by anyone — so a finished day's report is already final, and stays final,
 * without anything having to run at 00:00 to freeze it. It also means the
 * record survives the homework itself: deleting an assignment does not erase
 * the fact that it was completed, because the title was copied into the log
 * entry at the time.
 *
 * The one thing this cannot reconstruct is a count of rows that no longer
 * exist — see `missed`, which reads live assignments and is therefore the only
 * field here that a later deletion can change.
 */

export type DailyReport = {
  /** `YYYY-MM-DD` in her timezone. */
  date: string;
  /** "Mon 23 Sep", pre-formatted so components never parse dates. */
  label: string;
  weekday: string;
  /** True for the day currently in progress — its numbers are not final yet. */
  today: boolean;
  added: number;
  completed: number;
  /** Titles of what she finished, newest first. Capped for display. */
  completedTitles: string[];
  studiedMinutes: number;
  helpLogged: number;
  helpResolved: number;
  /** Every logged event, including ones with no dedicated counter. */
  events: number;
  /** Homework that came due this day and was not finished by the end of it. */
  missed: string[];
};

export type DailyInput = {
  timezone: string;
  /** How many days back to report on, including today. */
  days: number;
  now: Date;
  activity: Pick<ActivityLog, "activity_type" | "metadata" | "created_at">[];
  sessions: Array<{ started_at: string; duration_minutes: number | null }>;
  assignments: Array<{
    title: string;
    due_date: string;
    status: string;
    completed_at: string | null;
  }>;
};

/**
 * `YYYY-MM-DD` for an instant, as seen from a given timezone.
 *
 * `en-CA` because it is the locale whose short date format IS ISO order. The
 * alternative — shifting the Date by a UTC offset and slicing — is wrong twice
 * a year, and wrong in the direction nobody notices until a DST weekend.
 */
export function dayKeyIn(timezone: string, at: Date): string {
  try {
    return new Intl.DateTimeFormat("en-CA", {
      timeZone: timezone,
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    }).format(at);
  } catch {
    // An unrecognised zone degrades to the host clock rather than throwing and
    // taking the page with it.
    return new Intl.DateTimeFormat("en-CA", {
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    }).format(at);
  }
}

/*
  Month and weekday names are spelled out here rather than asked of `Intl`.

  Not pedantry: `en-GB` short-month renders September as "Sept" while every
  other month is three letters, so a column of dates comes out ragged — and
  the exact abbreviations vary with the ICU build, which differs between Node
  versions. A fixed table is three lines and cannot drift.
*/
const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const WEEKDAYS = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];

/** `"2026-09-23"` → `{ label: "Wed 23 Sep", weekday: "Wednesday" }`. */
function describeDay(key: string): { label: string; weekday: string } {
  // Noon UTC: far enough from either edge that no timezone can push this
  // calendar date onto the day before or after while we name it.
  const at = new Date(`${key}T12:00:00Z`);
  const [, month, day] = key.split("-");
  const weekday = WEEKDAYS[at.getUTCDay()];

  return {
    label: `${weekday.slice(0, 3)} ${Number(day)} ${MONTHS[Number(month) - 1]}`,
    weekday,
  };
}

/** Walks back `days` calendar days from `now`, in her timezone. */
function dayKeys(timezone: string, now: Date, days: number): string[] {
  const keys: string[] = [];
  for (let i = 0; i < days; i += 1) {
    keys.push(dayKeyIn(timezone, new Date(now.getTime() - i * 86_400_000)));
  }
  // A DST shift can make two steps land on the same calendar day. Dedupe
  // rather than render the same date twice with the numbers split across it.
  return [...new Set(keys)];
}

export function buildDailyReports({
  timezone,
  days,
  now,
  activity,
  sessions,
  assignments,
}: DailyInput): DailyReport[] {
  const keys = dayKeys(timezone, now, days);
  const todayKey = keys[0];
  const wanted = new Set(keys);

  const blank = () => ({
    added: 0,
    completed: 0,
    completedTitles: [] as string[],
    studiedMinutes: 0,
    helpLogged: 0,
    helpResolved: 0,
    events: 0,
    missed: [] as string[],
  });

  const buckets = new Map(keys.map((k) => [k, blank()]));

  for (const entry of activity) {
    const key = dayKeyIn(timezone, new Date(entry.created_at));
    const bucket = buckets.get(key);
    if (!bucket) continue;

    bucket.events += 1;

    switch (entry.activity_type) {
      case "assignment_created":
        bucket.added += 1;
        break;
      case "assignment_completed": {
        bucket.completed += 1;
        const title = entry.metadata?.title;
        if (typeof title === "string") bucket.completedTitles.push(title);
        break;
      }
      case "help_logged":
        bucket.helpLogged += 1;
        break;
      case "help_resolved":
        bucket.helpResolved += 1;
        break;
      default:
        break;
    }
  }

  for (const session of sessions) {
    const bucket = buckets.get(dayKeyIn(timezone, new Date(session.started_at)));
    if (bucket) bucket.studiedMinutes += session.duration_minutes ?? 0;
  }

  /*
    "Missed" is the one field read from live assignments rather than from the
    immutable log, because the log records what she DID and this is about what
    she did not do — an absence leaves no entry. It is therefore also the one
    field that can change retroactively if old homework is later deleted.

    `due_date` is already a plain calendar date in her own terms, so it is
    compared as a string. Putting it through a Date would re-introduce exactly
    the timezone shift the rest of this file exists to avoid.
  */
  for (const a of assignments) {
    if (!wanted.has(a.due_date)) continue;
    // The day in progress has not finished yet, so nothing is missed on it.
    if (a.due_date === todayKey) continue;

    const finishedOnTime =
      a.status === "completed" &&
      a.completed_at !== null &&
      dayKeyIn(timezone, new Date(a.completed_at)) <= a.due_date;

    if (!finishedOnTime) buckets.get(a.due_date)?.missed.push(a.title);
  }

  return keys.map((key) => {
    const b = buckets.get(key) ?? blank();
    const { label, weekday } = describeDay(key);
    return {
      date: key,
      label,
      weekday,
      today: key === todayKey,
      ...b,
      // Newest first, and capped: a card listing forty titles is a wall.
      completedTitles: b.completedTitles.reverse().slice(0, 6),
    };
  });
}

/** Totals across the whole range, for the summary strip above the list. */
export function summarise(reports: DailyReport[]) {
  return {
    added: reports.reduce((n, r) => n + r.added, 0),
    completed: reports.reduce((n, r) => n + r.completed, 0),
    studiedMinutes: reports.reduce((n, r) => n + r.studiedMinutes, 0),
    missed: reports.reduce((n, r) => n + r.missed.length, 0),
    activeDays: reports.filter((r) => r.events > 0).length,
    // The day in progress is excluded: counting it as a quiet day at 00:05
    // would make every morning look like a relapse.
    countedDays: reports.filter((r) => !r.today).length,
  };
}
