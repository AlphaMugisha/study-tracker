import { z } from "zod";

/**
 * The parts of timetable import that both sides need.
 *
 * Split out from `extract.ts` because that module imports the Anthropic SDK.
 * A client component importing anything from it — even a type — risks pulling
 * a server-only dependency and an API key path into the browser bundle. These
 * are plain values and shapes, safe anywhere.
 */

/**
 * The ceiling on an upload, whatever kind it is.
 *
 * Both providers accept considerably more than this — Anthropic 32MB a
 * request, Google 50MB a document — so the limit here is about the Server
 * Action's body rather than about either of them. It is named for what it
 * covers rather than for images, because it stopped being images-only the
 * day PDFs were accepted, and a constant called MAX_IMAGE_BYTES guarding a
 * PDF is the kind of thing that gets "fixed" by somebody who trusts the name.
 */
export const MAX_UPLOAD_BYTES = 3_500_000;

export const SUPPORTED_MEDIA_TYPES = [
  "image/jpeg",
  "image/png",
  "image/gif",
  "image/webp",
  "application/pdf",
] as const;

export type SupportedMediaType = (typeof SUPPORTED_MEDIA_TYPES)[number];

/**
 * A PDF is sent as a document rather than as an image by both providers, and
 * neither will take it the other way round. One predicate so the two request
 * builders cannot disagree about what counts.
 */
export function isPdf(mediaType: string): boolean {
  return mediaType === "application/pdf";
}

/** "JPEG, PNG, WebP, GIF or PDF" — the accepted list, in a sentence. */
export const SUPPORTED_UPLOAD_LABEL = "JPEG, PNG, WebP, GIF or PDF";

/**
 * What the photograph actually contains.
 *
 * `shared` is the school-noticeboard grid: every class in the year on one
 * sheet, with the class name printed alongside each block. Reading it is a
 * two-step job — find the right block, then read it — and getting the first
 * step wrong produces a timetable that looks perfect and belongs to somebody
 * else, so that mode demands a class name.
 *
 * `single` is one class's own timetable: periods down the side, days across
 * the top, and nothing on the page belonging to anyone else. There is no block
 * to pick, so a class name is decoration and the reader should take the whole
 * grid. Asking for one anyway is how you get "nothing readable was found for
 * S3 MCB" from an image whose every cell was legible.
 */
export const TIMETABLE_SCOPES = ["single", "shared"] as const;

export type TimetableScope = (typeof TIMETABLE_SCOPES)[number];

export const entrySchema = z.object({
  dayOfWeek: z
    .number()
    .int()
    .min(1)
    .max(7)
    .describe("1 = Monday through 7 = Sunday"),
  startTime: z.string().describe("24-hour HH:MM, e.g. 08:30"),
  endTime: z.string().describe("24-hour HH:MM, e.g. 09:20"),
  activityType: z
    .enum(["class", "break", "free", "study", "other"])
    .describe("class for a taught lesson; break for break/lunch/assembly"),
  subject: z
    .string()
    .nullable()
    .describe("Subject name for a lesson, expanded from any abbreviation. Null if not a lesson."),
  title: z
    .string()
    .nullable()
    .describe("What this is, when it is not a lesson: Break, Lunch, Assembly."),
  room: z.string().nullable(),
  teacher: z.string().nullable(),
  confidence: z
    .enum(["high", "medium", "low"])
    .describe("low if the cell was unclear, ambiguous, or the time had to be guessed"),
});

export const resultSchema = z.object({
  readable: z
    .boolean()
    .describe("false if this is not a timetable, or is too unclear to read at all"),
  problem: z
    .string()
    .nullable()
    .describe("When readable is false, one plain sentence saying what is wrong."),
  className: z
    .string()
    .nullable()
    .describe("The class/form this timetable was read for, as printed on the image."),
  entries: z.array(entrySchema),
  notes: z
    .array(z.string())
    .describe("Anything the reader should check: ambiguous cells, cut-off edges, guessed times."),
});

export type ExtractedEntry = z.infer<typeof entrySchema>;
export type ExtractionResult = z.infer<typeof resultSchema> & {
  /** Which provider produced this, so the review screen can say so. */
  provider: "anthropic" | "google" | "mock";
};
