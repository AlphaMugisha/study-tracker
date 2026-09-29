import type { ExtractedEntry } from "@/lib/timetable/import-constants";
import { normaliseTime } from "@/lib/timetable/review";

/**
 * A whole timetable, typed out a line at a time.
 *
 * ---------------------------------------------------------------------------
 * The third way in, after a photograph and the one-row form.
 *
 * Reading a photo is the fastest route when there is a photo. There often is
 * not: the timetable was read out in class, or it lives in a group chat, or
 * the copy to hand is too dark to read. The one-row form covers that, at the
 * cost of a day, two times, a name and a teacher per lesson — forty times.
 *
 * So: one lesson per line, paste the lot, check it on the same review screen
 * everything else lands on. Nothing here writes anything; it produces the same
 * rows the reader produces, and a human still confirms them.
 *
 * The parser is deliberately forgiving, because the person typing is copying
 * from something and should not have to think about format. `Mon`, `monday`
 * and `1` are the same day. `8-9:40`, `08:00 - 09:40` and `8:00 AM – 9:40 AM`
 * are the same period. A teacher can arrive in brackets, after a comma or
 * after a dash. What it will not do is guess: a line it cannot read is
 * reported with its number and its text, never silently dropped, because a
 * timetable quietly missing Thursday is worse than one that refused to parse.
 * ---------------------------------------------------------------------------
 */

export type ParsedLine = {
  /** 1-based, so a complaint can name the line the person is looking at. */
  lineNumber: number;
  text: string;
  reason: string;
};

export type ParseResult = {
  entries: ExtractedEntry[];
  problems: ParsedLine[];
};

const DAYS: Array<[RegExp, number]> = [
  [/^(mon|monday)$/i, 1],
  [/^(tue|tues|tuesday)$/i, 2],
  [/^(wed|weds|wednesday)$/i, 3],
  [/^(thu|thur|thurs|thursday)$/i, 4],
  [/^(fri|friday)$/i, 5],
  [/^(sat|saturday)$/i, 6],
  [/^(sun|sunday)$/i, 7],
];

/** Words that mean a row is not a taught lesson, so the type is not guessed. */
const KINDS: Array<[RegExp, ExtractedEntry["activityType"]]> = [
  [/\b(break|lunch|recess|assembly|registration|office hours|tea)\b/i, "break"],
  [/\b(self[-\s]?study|supervised study|prep|study)\b/i, "study"],
  [/\b(free|no lesson|spare)\b/i, "free"],
  [/\b(club|clubs|games|sport|pe practice|activity|guidance)\b/i, "other"],
];

/**
 * `"Mon"`, `"monday"`, `"1"` → 1. Null if it is not a day at all.
 *
 * Exported because "which of these is Thursday" is the single most likely
 * thing to be wrong in a list somebody typed at speed.
 */
export function parseDay(token: string): number | null {
  const word = token.trim().replace(/[.,;:|]+$/, "");
  if (!word) return null;

  for (const [pattern, day] of DAYS) {
    if (pattern.test(word)) return day;
  }

  if (/^[1-7]$/.test(word)) return Number(word);
  return null;
}

/** The start and end of `"8:00 AM - 9:40 AM"`, already normalised. */
function parseRange(text: string): { start: string; end: string; rest: string } | null {
  /*
    Both halves are captured loosely and handed to `normaliseTime`, which is
    the same function that cleans up what the model returns. One definition of
    what a time looks like, whoever typed it.
  */
  const range = text.match(
    /(\d{1,2}(?:[:.h]\d{2})?\s*(?:[ap]\.?m\.?)?)\s*(?:-|–|—|to|until|till)\s*(\d{1,2}(?:[:.h]\d{2})?\s*(?:[ap]\.?m\.?)?)/i,
  );
  if (!range) return null;

  let start = normaliseTime(range[1]);
  const end = normaliseTime(range[2]);
  if (!start || !end) return null;

  /*
    "1:30 - 2:20 PM" means both halves are afternoon.

    Written out, the am/pm is usually only on the end of the range, and a
    start read literally lands in the small hours — which then fails the
    ends-before-it-starts check and takes a real lesson with it.
  */
  if (!/[ap]\.?m/i.test(range[1]) && /p\.?m/i.test(range[2]) && start < end) {
    const bumped = normaliseTime(`${range[1]} pm`);
    if (bumped && bumped < end) start = bumped;
  }

  return { start, end, rest: text.replace(range[0], " ").trim() };
}

/** The name, and a teacher if one was written after it. */
function parseNameAndTeacher(text: string): { name: string; teacher: string | null } {
  const cleaned = text.replace(/^[\s,;:|—–-]+|[\s,;:|—–-]+$/g, "");

  // Brackets first: unambiguous, and the shape every printed timetable uses.
  const bracketed = cleaned.match(/^(.*?)\s*\(([^)]+)\)\s*$/);
  if (bracketed && bracketed[1].trim()) {
    return { name: bracketed[1].trim(), teacher: bracketed[2].trim() || null };
  }

  // Then a trailing separator. Only the last one, so "Data Structures, DSA,
  // Eric" gives the teacher rather than half the subject.
  const trailing = cleaned.match(/^(.*[^\s])\s*(?:,|\||\s-\s|\s—\s|\s–\s)\s*([^,|]+)$/);
  if (trailing && trailing[1].trim()) {
    return { name: trailing[1].trim(), teacher: trailing[2].trim() || null };
  }

  return { name: cleaned, teacher: null };
}

function kindOf(name: string): ExtractedEntry["activityType"] {
  for (const [pattern, kind] of KINDS) {
    if (pattern.test(name)) return kind;
  }
  return "class";
}

/**
 * Columns to the freeform shape: `Mon 08:00-09:40 Java (Faustin)`.
 *
 * Copying a block out of a spreadsheet gives tab-separated fields, and a
 * timetable typed into one usually keeps start and end in their own columns.
 * Both are unambiguous in a way a run of spaces is not — without this,
 * `Java<tab>Faustin` reads as a subject called "Java Faustin".
 *
 * Returns null when the line is not in columns, so the freeform path takes it.
 */
function fromColumns(line: string): string | null {
  const fields = (line.includes("\t") ? line.split("\t") : line.split(","))
    .map((field) => field.trim())
    .filter(Boolean);

  if (fields.length < 3) return null;
  if (parseDay(fields[0]) === null) return null;

  const looksLikeTime = (field: string) => normaliseTime(field) !== null;
  const hasRange = /(?:-|–|—|\bto\b|\buntil\b)/i.test(fields[1]);

  let range: string;
  let rest: string[];

  if (hasRange) {
    range = fields[1];
    rest = fields.slice(2);
  } else if (fields.length >= 4 && looksLikeTime(fields[1]) && looksLikeTime(fields[2])) {
    range = `${fields[1]}-${fields[2]}`;
    rest = fields.slice(3);
  } else {
    return null;
  }

  const [name, teacher] = rest;
  if (!name) return null;

  return `${fields[0]} ${range} ${name}${teacher ? ` (${teacher})` : ""}`;
}

/**
 * One lesson per line: day, times, what it is, and who teaches it.
 *
 * Blank lines and anything starting with `#` are skipped without comment —
 * pasted lists arrive with headings and spacing, and complaining about them
 * would bury the complaints that matter.
 */
export function parseTimetableLines(input: string): ParseResult {
  const entries: ExtractedEntry[] = [];
  const problems: ParsedLine[] = [];

  input.split(/\r?\n/).forEach((raw, index) => {
    const lineNumber = index + 1;
    const line = raw.trim();
    if (!line || line.startsWith("#")) return;

    // A spreadsheet paste arrives in columns, which say exactly where the
    // subject stops and the teacher starts — information a space does not
    // carry. Rewritten into the freeform shape so there is still one parser.
    const text = fromColumns(line) ?? line;

    const firstGap = text.search(/[\s,;:|]/);
    const day = parseDay(firstGap === -1 ? text : text.slice(0, firstGap));
    if (day === null) {
      problems.push({
        lineNumber,
        text: line,
        reason: "It does not start with a day. Begin the line with Monday, Tue, or a number 1–7.",
      });
      return;
    }

    const afterDay = firstGap === -1 ? "" : text.slice(firstGap);
    const range = parseRange(afterDay);
    if (!range) {
      problems.push({
        lineNumber,
        text: line,
        reason: "No start and end time. Write them as 08:00-09:40.",
      });
      return;
    }

    if (range.end <= range.start) {
      problems.push({ lineNumber, text: line, reason: "It ends before it starts." });
      return;
    }

    const { name, teacher } = parseNameAndTeacher(range.rest);
    if (!name) {
      problems.push({ lineNumber, text: line, reason: "It has a day and a time but no lesson." });
      return;
    }

    const activityType = kindOf(name);

    entries.push({
      dayOfWeek: day,
      startTime: range.start,
      endTime: range.end,
      activityType,
      subject: activityType === "class" ? name : null,
      title: activityType === "class" ? null : name,
      room: null,
      teacher,
      // Typed by a person reading their own timetable. Nothing was inferred,
      // so nothing should arrive outlined as needing a second look.
      confidence: "high",
    });
  });

  entries.sort((a, b) => a.dayOfWeek - b.dayOfWeek || a.startTime.localeCompare(b.startTime));
  return { entries, problems };
}
