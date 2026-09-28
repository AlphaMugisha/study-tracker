import Anthropic from "@anthropic-ai/sdk";
import { zodOutputFormat } from "@anthropic-ai/sdk/helpers/zod";

import { getExtractionProvider } from "@/lib/env";
import { findClashes, normaliseTime } from "@/lib/timetable/review";
import {
  MAX_IMAGE_BYTES,
  resultSchema,
  SUPPORTED_MEDIA_TYPES,
  TIMETABLE_SCOPES,
  type ExtractedEntry,
  type ExtractionResult,
  type SupportedMediaType,
  type TimetableScope,
} from "@/lib/timetable/import-constants";

export {
  MAX_IMAGE_BYTES,
  SUPPORTED_MEDIA_TYPES,
  TIMETABLE_SCOPES,
  type ExtractedEntry,
  type ExtractionResult,
  type TimetableScope,
};

/*
  Re-exported rather than moved out of sight. These live in `review.ts` now
  because the review screen needs them too and cannot import this file, but
  every existing caller — and the tests — still reaches for them here.
*/
export { findClashes, normaliseTime };

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
  /**
   * "S3 MCB", "Grade 10 Blue" — whatever she calls her class. Required when
   * the grid covers several classes; optional, and used only as a label, when
   * the whole image is already one class's timetable.
   */
  classContext: string | null;
  /** Whether the image is one class's timetable or the whole school's grid. */
  scope: TimetableScope;
};

/**
 * The rules that do not depend on what kind of photograph this is: how to read
 * a time, what counts as one entry, and when to admit to a guess.
 */
const READING_RULES = `Reading the grid:
- Times are often in a header row or a left column, and often written as 8.30, 8:30, 0830 or 8h30. Normalise everything to 24-hour HH:MM. Watch the AM/PM: a period labelled 1:30-2:20 PM is 13:30 to 14:20, not 01:30.
- If a lesson's end time is not printed, infer it from the next period's start, and mark that row's confidence as medium.
- A double period is ONE entry spanning both slots, not two. That is true whether it is drawn as a single merged cell or as two consecutive cells holding the same subject and teacher — read those as one lesson running from the first slot's start to the second slot's end.
- Break, lunch, assembly, registration and games are real rows: return them with activityType break or other. The student's day is not only lessons, and the app uses them.
- A name in brackets under a subject is the teacher. Put it in teacher, not in subject.
- Expand subject abbreviations where you are confident (MATHS to Mathematics, PHY to Physics, ENG to English). If an abbreviation is ambiguous, keep it as printed and mark confidence low.
- Empty cells, free periods and study periods are worth returning as free or study.

Confidence is not decoration. Mark a row low whenever you had to guess: a blurred cell, a time you inferred, an abbreviation you are not sure of, a teacher code you cannot expand. The person checking this will read the low rows and skim the high ones, so an over-confident row is the one that gets through wrong.

Put anything else worth a second look in notes — an edge cut off by the photo, two lessons that appear to clash, a day that looks incomplete.`;

/**
 * The school-wide grid: many classes on one sheet.
 *
 * Almost all of the difficulty is in the first paragraph. Reading a cell
 * correctly but reading the wrong block of cells produces a plausible,
 * complete, entirely wrong week, and that is not a mistake anybody catches by
 * glancing at the review screen.
 */
const SYSTEM_SHARED = `You read photographs of school timetables and return them as structured data.

The single most important thing: this timetable is a grid covering MANY classes at once — one block of rows or columns per class, with the class name printed alongside. You will be told which class the student is in. Return ONLY that class's lessons. Returning another class's lessons is worse than returning nothing, because it looks correct and is not.

If you cannot find the named class on the image, set readable to false and say so in problem. Do not fall back to "the first class" or "the whole grid" — guessing which child this belongs to is the one mistake that cannot be caught by looking.

${READING_RULES}`;

/**
 * One class's own timetable — the sheet pinned inside that classroom.
 *
 * Here the danger runs the other way. There is no block to pick out, so
 * hunting for one and finding nothing is how a perfectly legible image comes
 * back empty. Take everything, including the bands that run the full width of
 * the week.
 */
const SYSTEM_SINGLE = `You read photographs of school timetables and return them as structured data.

This image is ONE class's timetable — periods down one side, days of the week across the other, and nothing on the page belonging to any other class. Return every cell of it. Do not look for a class name to filter by and do not leave anything out: if it is printed in the grid, it is this student's.

- A row or band that spans the full width of the week — SHORT BREAK, LUNCH BREAK, OFFICE HOURS, assembly — applies to every day it stretches across. Return it once per day, not once in total.
- If a class or form name is printed as a heading, put it in className. It is a label, not a filter.

${READING_RULES}`;

/**
 * A fixture, for running the flow without an API key or a bill.
 *
 * It is deliberately imperfect: one low-confidence row and one note, so the
 * review screen is exercised in the state that actually matters rather than
 * on a page where everything is green.
 *
 * The single-class sample is the wider of the two — five full days, teachers,
 * and breaks that run across the whole week — because that is the shape the
 * new mode has to survive, and a three-row fixture would never show that the
 * review screen scrolls.
 */
function mockResult(input: ExtractionInput): ExtractionResult {
  const { classContext, scope } = input;

  const lesson = (
    dayOfWeek: number,
    startTime: string,
    endTime: string,
    subject: string,
    room: string | null,
    confidence: "high" | "medium" | "low" = "high",
    teacher: string | null = null,
  ): ExtractedEntry => ({
    dayOfWeek,
    startTime,
    endTime,
    activityType: "class",
    subject,
    title: null,
    room,
    teacher,
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

  if (scope === "single") {
    // One class's week: the same two breaks every day, which is the part of
    // this shape most likely to come back missing from a real read.
    const week = [1, 2, 3, 4, 5];
    const morning = [
      ["Embedded System Software", "Willy"],
      ["Advanced Networking", "Felix"],
      ["Data Structures (DSA)", "Eric"],
      ["Software Engineering", "Felix"],
      ["Web3", "Emmanuel"],
    ];
    const afternoon = [
      ["Software Engineering", "Felix"],
      ["Advanced English", "Christine"],
      ["Applied Math II", "Jean Bosco"],
      ["Applied Physics II", "Jean De Dieu"],
      ["Development of 3D Models", "Willy"],
    ];

    return {
      provider: "mock",
      readable: true,
      problem: null,
      className: classContext || "S3 MCB",
      entries: week.flatMap((day, i) => [
        lesson(day, "08:00", "09:40", morning[i][0], null, "high", morning[i][1]),
        br(day, "09:40", "10:00", "Short break"),
        lesson(day, "10:00", "11:40", afternoon[i][0], null, day === 4 ? "low" : "high", afternoon[i][1]),
        br(day, "12:30", "13:30", "Lunch break"),
        lesson(day, "13:30", "15:10", morning[(i + 2) % 5][0], null, "high", morning[(i + 2) % 5][1]),
      ]),
      notes: [
        "This is sample data — TIMETABLE_EXTRACTOR is set to mock, so the image was not read.",
        "The last period on Thursday was hard to read. Check it against the photo.",
      ],
    };
  }

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
  if (getExtractionProvider() === "mock") return mockResult(input);

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
    system: input.scope === "single" ? SYSTEM_SINGLE : SYSTEM_SHARED,
    messages: [
      {
        role: "user",
        content: [
          {
            type: "image",
            source: { type: "base64", media_type: input.mediaType, data: input.data },
          },
          { type: "text", text: instruction(input) },
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

/**
 * The one turn of user text, which differs by mode more than the prompt does.
 *
 * In single-class mode the class name is a hint at most — telling the model to
 * "return that class's timetable only" would invite it to filter a grid that
 * has nothing to filter, and come back with an empty week from an image where
 * every cell was legible.
 */
function instruction(input: ExtractionInput): string {
  if (input.scope === "single") {
    return input.classContext
      ? `This timetable belongs to one class: ${input.classContext}. Every cell on the image is theirs — read the whole grid.`
      : "This timetable belongs to a single class. Every cell on the image is theirs — read the whole grid.";
  }

  return `This student is in: ${input.classContext}\n\nReturn that class's timetable only.`;
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
