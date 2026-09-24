import { z } from "zod";

/**
 * The parts of timetable import that both sides need.
 *
 * Split out from `extract.ts` because that module imports the Anthropic SDK.
 * A client component importing anything from it — even a type — risks pulling
 * a server-only dependency and an API key path into the browser bundle. These
 * are plain values and shapes, safe anywhere.
 */

/** The API rejects images over ~5MB once base64-encoded; this leaves headroom. */
export const MAX_IMAGE_BYTES = 3_500_000;

export const SUPPORTED_MEDIA_TYPES = [
  "image/jpeg",
  "image/png",
  "image/gif",
  "image/webp",
] as const;

export type SupportedMediaType = (typeof SUPPORTED_MEDIA_TYPES)[number];

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
  provider: "anthropic" | "mock";
};
