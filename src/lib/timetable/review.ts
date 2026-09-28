import type { ExtractedEntry } from "@/lib/timetable/import-constants";

/**
 * The checks the review screen runs on rows a human is editing.
 *
 * Split out of `extract.ts` for the same reason `import-constants.ts` was:
 * that module imports the Anthropic SDK, and the review screen is a client
 * component. These are pure functions over plain rows, so both sides can use
 * them — and the point is that both sides DO. Until the review step could only
 * edit and delete, the server had checked every row before a human saw it. Now
 * that rows can be added and times retyped, the same checks have to run in the
 * browser as well, or the first time a bad row is noticed is a failed insert.
 */

/** `"8.30"`, `"0830"`, `"8h30"`, `"08:30:00"` → `"08:30"`. Null if hopeless. */
export function normaliseTime(value: string): string | null {
  const raw = value.trim();

  const colon = raw.match(/^(\d{1,2})\s*[:.h]\s*(\d{2})/i);
  const bare = raw.match(/^(\d{2})(\d{2})$/);
  const hourOnly = raw.match(/^(\d{1,2})$/);

  let h: number;
  let m: number;

  if (colon) {
    h = Number(colon[1]);
    m = Number(colon[2]);
  } else if (bare) {
    h = Number(bare[1]);
    m = Number(bare[2]);
  } else if (hourOnly) {
    h = Number(hourOnly[1]);
    m = 0;
  } else {
    return null;
  }

  // A trailing pm on an hour below 12 is the one am/pm case worth handling:
  // school timetables that use it are otherwise unreadable as 24-hour.
  if (/p\.?m/i.test(raw) && h < 12) h += 12;
  if (/a\.?m/i.test(raw) && h === 12) h = 0;

  if (!Number.isInteger(h) || !Number.isInteger(m)) return null;
  if (h < 0 || h > 23 || m < 0 || m > 59) return null;

  return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`;
}

/** Rows that overlap each other, which the database will reject as 23P01. */
export function findClashes(entries: ExtractedEntry[]): Array<[ExtractedEntry, ExtractedEntry]> {
  const clashes: Array<[ExtractedEntry, ExtractedEntry]> = [];

  for (let i = 0; i < entries.length; i += 1) {
    for (let j = i + 1; j < entries.length; j += 1) {
      const a = entries[i];
      const b = entries[j];
      if (a.dayOfWeek !== b.dayOfWeek) continue;
      if (a.startTime < b.endTime && b.startTime < a.endTime) clashes.push([a, b]);
    }
  }

  return clashes;
}

/**
 * Why this row could not be saved, or null if it can be.
 *
 * Deliberately the same three rules the server applies in `normaliseEntries`.
 * A row that fails here would fail there, and finding that out after the
 * confirmation means a half-written week.
 */
export function rowProblem(entry: {
  startTime: string;
  endTime: string;
  activityType: string;
  subject: string | null;
  title: string | null;
}): string | null {
  const start = normaliseTime(entry.startTime);
  const end = normaliseTime(entry.endTime);

  if (!start) return "The start time is not a time.";
  if (!end) return "The end time is not a time.";
  if (end <= start) return "It ends before it starts.";
  if (!(entry.subject?.trim() || entry.title?.trim())) return "It needs a name.";

  return null;
}
