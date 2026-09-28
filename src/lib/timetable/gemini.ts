import { z } from "zod";

import { resultSchema, type ExtractionResult } from "@/lib/timetable/import-constants";

/**
 * Reading a timetable with Gemini instead of Claude.
 *
 * ---------------------------------------------------------------------------
 * Why there are two of these at all.
 *
 * Not because one reads better. Because Anthropic bills per call and Google's
 * AI Studio tier does not, and an app whose central feature is dark until
 * somebody's card clears is an app most people never see working. The whole
 * provider choice is one environment variable, and every one of them returns
 * the same `ExtractionResult` — so the review screen, the confirmation and the
 * engine underneath cannot tell which of them answered.
 *
 * The cost is in the fine print rather than the invoice: free-tier input is
 * used to improve Google's models, and these images have children's names and
 * their teachers' names printed on them. That is a real trade and it belongs
 * in the README, not buried in a comment here — but it is the reason this is
 * a switch rather than the default.
 * ---------------------------------------------------------------------------
 */

/** The current Flash model: multimodal, on the free tier, quick on a grid. */
const MODEL = "gemini-3.8-flash";

const ENDPOINT = "https://generativelanguage.googleapis.com/v1beta/interactions";

/**
 * A failure with a sentence already written for the person who caused it.
 *
 * The Anthropic path gets its distinctions from the SDK's typed error classes.
 * This path is a bare `fetch`, so the classification has to happen where the
 * status code still exists — by the time it reaches the action, an HTTP 429
 * and a malformed schema are both just an Error.
 */
export class ExtractionError extends Error {
  readonly userMessage: string;

  // Assigned in the body rather than declared as a constructor parameter
  // property: the unit tests run these files through Node's strip-only
  // TypeScript mode, which rejects that syntax outright.
  constructor(userMessage: string, cause?: string) {
    super(cause ?? userMessage);
    this.name = "ExtractionError";
    this.userMessage = userMessage;
  }
}

/**
 * Bend a JSON Schema into the subset Gemini accepts.
 *
 * Two edits, both from its documented subset rather than from experiment.
 * Zod writes a nullable field as `"type": ["string", "null"]`, and the only
 * composition Gemini documents is `anyOf` — every nullable field in the
 * timetable schema is one of these, so left alone the whole request is
 * rejected for a reason that names none of them. `$schema` is simply not in
 * the accepted vocabulary.
 *
 * Exported for the tests: this is a silent, total failure if it is wrong, and
 * it is the kind of thing that is wrong only for the one shape nobody tried.
 */
export function toGeminiSchema(schema: unknown): unknown {
  if (Array.isArray(schema)) return schema.map(toGeminiSchema);
  if (schema === null || typeof schema !== "object") return schema;

  const out: Record<string, unknown> = {};

  for (const [key, value] of Object.entries(schema as Record<string, unknown>)) {
    if (key === "$schema") continue;

    if (key === "type" && Array.isArray(value)) {
      out.anyOf = value.map((t) => ({ type: t }));
      continue;
    }

    out[key] = toGeminiSchema(value);
  }

  return out;
}

/** Built once — the schema never varies, and converting it per upload is waste. */
const RESPONSE_SCHEMA = toGeminiSchema(
  z.toJSONSchema(resultSchema, { io: "output" }),
);

export type GeminiInput = {
  /** Base64 image bytes, no data: prefix. */
  data: string;
  mediaType: string;
  /** The same reading rules the Anthropic path uses. */
  system: string;
  /** The single user turn: which class, and what to do with the grid. */
  instruction: string;
};

export async function extractWithGemini(input: GeminiInput): Promise<ExtractionResult> {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    throw new ExtractionError(
      "Timetable reading is set to Google but GEMINI_API_KEY is missing. Add a key from Google AI Studio, or put TIMETABLE_EXTRACTOR back to mock.",
    );
  }

  let response: Response;
  try {
    response = await fetch(ENDPOINT, {
      method: "POST",
      headers: { "x-goog-api-key": apiKey, "content-type": "application/json" },
      body: JSON.stringify({
        model: MODEL,
        // The rules go in as the first turn rather than as a separate system
        // field: one documented shape, used the same way every time.
        input: [
          { type: "text", text: input.system },
          { type: "image", data: input.data, mime_type: input.mediaType },
          { type: "text", text: input.instruction },
        ],
        response_format: {
          type: "text",
          mime_type: "application/json",
          schema: RESPONSE_SCHEMA,
        },
      }),
    });
  } catch (error) {
    throw new ExtractionError(
      "The timetable reader could not be reached. Check this server's connection and try again.",
      error instanceof Error ? error.message : undefined,
    );
  }

  if (!response.ok) throw await failureFor(response);

  const body = (await response.json()) as { output_text?: unknown };
  const text = typeof body.output_text === "string" ? body.output_text : "";

  if (!text.trim()) {
    throw new ExtractionError(
      "The timetable reader returned nothing at all. Try again, or try a clearer photo.",
    );
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(stripFence(text));
  } catch {
    throw new ExtractionError(
      "The timetable reader's answer could not be understood. Try again.",
      text.slice(0, 200),
    );
  }

  /*
    Validated rather than trusted.

    The Anthropic path gets a parsed object back from the SDK, already checked
    against the schema. Here the schema is a request parameter and the reply is
    a string, so nothing has checked that it kept its side of the bargain. An
    unchecked object flows straight into `normaliseEntries`, which reads fields
    it assumes exist.
  */
  const checked = resultSchema.safeParse(parsed);
  if (!checked.success) {
    throw new ExtractionError(
      "The timetable reader's answer was not in the expected shape. Try again.",
      checked.error.message.slice(0, 300),
    );
  }

  return { ...checked.data, provider: "google" };
}

/** Status codes, translated. The body usually carries a usable reason too. */
async function failureFor(response: Response): Promise<ExtractionError> {
  const detail = await response.text().catch(() => "");

  if (response.status === 400 && /api key/i.test(detail)) {
    return new ExtractionError(
      "That Google API key was rejected. Check GEMINI_API_KEY against the key in Google AI Studio.",
      detail.slice(0, 300),
    );
  }
  if (response.status === 401 || response.status === 403) {
    return new ExtractionError(
      "The Google API key was refused. Check that it is enabled for the Gemini API.",
      detail.slice(0, 300),
    );
  }
  if (response.status === 429) {
    return new ExtractionError(
      "The free Gemini tier's rate limit was hit. Wait a minute and try again — this one does pass.",
      detail.slice(0, 300),
    );
  }
  if (response.status >= 500) {
    return new ExtractionError(
      "Google's timetable reader is having trouble. Try again in a moment.",
      detail.slice(0, 300),
    );
  }

  return new ExtractionError(
    "The timetable could not be read. Try again, or try a clearer photo.",
    `${response.status}: ${detail.slice(0, 300)}`,
  );
}

/**
 * Some replies arrive fenced as ```json even when JSON was asked for.
 * Cheap to undo, and the alternative is a parse error blaming the photograph.
 */
function stripFence(text: string): string {
  const fenced = text.trim().match(/^```(?:json)?\s*\n([\s\S]*?)\n?```$/);
  return fenced ? fenced[1] : text;
}
