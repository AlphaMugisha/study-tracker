import Anthropic from "@anthropic-ai/sdk";
import { zodOutputFormat } from "@anthropic-ai/sdk/helpers/zod";

import { getExtractionProvider } from "@/lib/env";
import {
  MAX_IMAGE_BYTES,
  resultSchema,
  SUPPORTED_MEDIA_TYPES,
  type ExtractedEntry,
  type ExtractionResult,
  type SupportedMediaType,
} from "@/lib/timetable/import-constants";

export {
  MAX_IMAGE_BYTES,
  SUPPORTED_MEDIA_TYPES,
  type ExtractedEntry,
  type ExtractionResult,
};

/**
 * Reading a school timetable out of a photograph.
 *
 * ---------------------------------------------------------------------------
 * NOTHING HERE WRITES TO THE DATABASE, and that is the design.
 *
 * This returns a proposal. A human confirms it on the next screen, and only
 * that confirmation writes anything. A timetable is the spine of the whole
 * product — the countdown, the evening plan and school mode all read from it —
 * so a model misreading "09.20" as "09:20am on Thursday" must cost one glance,
 * not a week of wrong answers that nobody thinks to question.
 *
 * Everything it is unsure about is marked rather than dropped. `confidence`
 * per row and `notes` at the top are what make the review screen worth
 * looking at: a page of 40 rows that all look equally certain gets confirmed
 * without being read.
 * ---------------------------------------------------------------------------
 */

export type ExtractionInput = {
  /** Raw image bytes, base64 encoded (no data: prefix). */
  data: string;
  mediaType: SupportedMediaType;
  /** "S3 MCB", "Grade 10 Blue" — whatever she calls her class. */
  classContext: string;
};

const SYSTEM = `You read photographs of school timetables and return them as structured data.

The single most important thing: a school timetable is usually a grid covering MANY classes at once — one block of rows or columns per class, with the class name printed alongside. You will be told which class the student is in. Return ONLY that class's lessons. Returning another class's lessons is worse than returning nothing, because it looks correct and is not.

If you cannot find the named class on the image, set readable to false and say so in problem. Do not fall back to "the first class" or "the whole grid" — guessing which child this belongs to is the one mistake that cannot be caught by looking.

Reading the grid:
- Times are often in a header row or a left column, and often written as 8.30, 8:30, 0830 or 8h30. Normalise everything to 24-hour HH:MM.
- If a lesson's end time is not printed, infer it from the next period's start, and mark that row's confidence as medium.
- A double period shown as one merged cell is ONE entry spanning both slots, not two.
- Break, lunch, assembly, registration and games are real rows: return them with activityType break or other. The student's day is not only lessons, and the app uses them.
- Expand subject abbreviations where you are confident (MATHS to Mathematics, PHY to Physics, ENG to English). If an abbreviation is ambiguous, keep it as printed and mark confidence low.
- Empty cells, free periods and study periods are worth returning as free or study.

Confidence is not decoration. Mark a row low whenever you had to guess: a blurred cell, a time you inferred, an abbreviation you are not sure of, a teacher code you cannot expand. The person checking this will read the low rows and skim the high ones, so an over-confident row is the one that gets through wrong.

Put anything else worth a second look in notes — an edge cut off by the photo, two lessons that appear to clash, a day that looks incomplete.`;

/**
 * A fixture, for running the flow without an API key or a bill.
 *
 * It is deliberately imperfect: one low-confidence row and one note, so the
 * review screen is exercised in the state that actually matters rather than
 * on a page where everything is green.
 */
function mockResult(classContext: string): ExtractionResult {
  const lesson = (
    dayOfWeek: number,
    startTime: string,
    endTime: string,
    subject: string,
    room: string | null,
    confidence: "high" | "medium" | "low" = "high",
  ): ExtractedEntry => ({
    dayOfWeek,
    startTime,
    endTime,
    activityType: "class",
    subject,
    title: null,
    room,
    teacher: null,
    confidence,
  });

  const br = (dayOfWeek: number, startTime: string, endTime: string, title: string): ExtractedEntry => ({
    dayOfWeek,
    startTime,
    endTime,
    activityType: "break",
    subject: null,
    title,
    room: null,
    teacher: null,
    confidence: "high",
  });

  return {
    provider: "mock",
    readable: true,
    problem: null,
    className: classContext,
    entries: [
      lesson(1, "08:00", "09:00", "Mathematics", "B12"),
      br(1, "09:00", "09:20", "Break"),
      lesson(1, "09:20", "10:20", "Physics", "Lab 2"),
      lesson(1, "10:20", "11:20", "English", null, "low"),
      lesson(2, "08:00", "09:00", "Chemistry", "Lab 1"),
      br(2, "09:00", "09:20", "Break"),
      lesson(2, "09:20", "10:20", "Biology", "Lab 3"),
      lesson(3, "08:00", "09:00", "Mathematics", "B12"),
      lesson(3, "09:20", "10:20", "History", "A4"),
      lesson(4, "08:00", "09:00", "Geography", "A2"),
      lesson(5, "08:00", "09:00", "Mathematics", "B12"),
    ],
    notes: [
      "This is sample data — TIMETABLE_EXTRACTOR is set to mock, so the image was not read.",
      "Thursday looks short. Check whether the photo cut off the right-hand edge.",
    ],
  };
}

export async function extractTimetable(input: ExtractionInput): Promise<ExtractionResult> {
  if (getExtractionProvider() === "mock") return mockResult(input.classContext);

  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    throw new Error(
      "TIMETABLE_EXTRACTOR is set to anthropic but ANTHROPIC_API_KEY is missing.",
    );
  }

  const client = new Anthropic({ apiKey });

  const response = await client.messages.parse({
    model: "claude-opus-5",
    max_tokens: 16000,
    // Reading a dense grid and deciding which block belongs to one class is
    // exactly the kind of work worth thinking about before answering.
    thinking: { type: "adaptive" },
    system: SYSTEM,
    messages: [
      {
        role: "user",
        content: [
          {
            type: "image",
            source: { type: "base64", media_type: input.mediaType, data: input.data },
          },
          {
            type: "text",
            text: `This student is in: ${input.classContext}\n\nReturn that class's timetable only.`,
          },
        ],
      },
    ],
    output_config: { format: zodOutputFormat(resultSchema) },
  });

  const parsed = response.parsed_output;
  if (!parsed) {
    return {
      provider: "anthropic",
      readable: false,
      problem: "The timetable could not be read from that image. Try a clearer photo.",
      className: null,
      entries: [],
      notes: [],
    };
  }

  return { ...parsed, provider: "anthropic" };
}

// ---------------------------------------------------------------------------
// Cleaning up what comes back
// ---------------------------------------------------------------------------

/**
 * Normalise and sanity-check extracted rows before a human ever sees them.
 *
 * Pure, and unit-tested. Two jobs: put times into the shape the database
 * expects, and drop rows that could only ever be rejected — an entry whose end
 * is before its start would fail `timetable_entries_time_order` at insert
 * time, and finding that out AFTER the review screen means the confirmation
 * half-succeeds and she is left with a partial week.
 */
export function normaliseEntries(entries: ExtractedEntry[]): {
  entries: ExtractedEntry[];
  dropped: Array<{ entry: ExtractedEntry; reason: string }>;
} {
  const kept: ExtractedEntry[] = [];
  const dropped: Array<{ entry: ExtractedEntry; reason: string }> = [];

  for (const raw of entries) {
    const startTime = normaliseTime(raw.startTime);
    const endTime = normaliseTime(raw.endTime);

    if (!startTime || !endTime) {
      dropped.push({ entry: raw, reason: "The times could not be read." });
      continue;
    }
    if (endTime <= startTime) {
      dropped.push({ entry: raw, reason: "It ends before it starts." });
      continue;
    }
    if (raw.dayOfWeek < 1 || raw.dayOfWeek > 7) {
      dropped.push({ entry: raw, reason: "That is not a day of the week." });
      continue;
    }

    const subject = raw.subject?.trim() || null;
    const title = raw.title?.trim() || null;

    // The database requires a lesson to name a subject. A "class" with no
    // subject demotes to "other" rather than being thrown away — the slot is
    // real even when the reading of it failed, and a human can name it.
    const activityType =
      raw.activityType === "class" && !subject ? "other" : raw.activityType;

    kept.push({
      ...raw,
      startTime,
      endTime,
      activityType,
      subject,
      title: title ?? (activityType !== "class" && !subject ? "Untitled" : null),
      room: raw.room?.trim() || null,
      teacher: raw.teacher?.trim() || null,
      // A row we had to rescue is not a high-confidence row, whatever it said.
      confidence:
        activityType !== raw.activityType ? "low" : raw.confidence,
    });
  }

  kept.sort((a, b) => a.dayOfWeek - b.dayOfWeek || a.startTime.localeCompare(b.startTime));
  return { entries: kept, dropped };
}

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
