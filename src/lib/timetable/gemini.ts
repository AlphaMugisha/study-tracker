import { z } from "zod";

import { isPdf, resultSchema, type ExtractionResult } from "@/lib/timetable/import-constants";

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

/**
 * Models to try, in order, until one answers.
 *
 * Not a preference list — a queue. The free tier returns 503
 * `service_unavailable` on whichever model is currently busy, and the
 * flagship is the busiest of them: on the afternoon this was written
 * `gemini-3.8-flash` was refusing every request while 3.7 and 3.6 answered
 * in a few seconds. One model hard-coded means the upload screen is down
 * whenever that model is, for a reason nobody here can fix or wait out.
 *
 * Ordered by what actually answered rather than by capability, because each
 * attempt on a busy model costs about eight seconds before it gives up, and
 * reading a grid is not work that needs the flagship. The flagship is last
 * rather than absent so a day when the others are the busy ones still works.
 */
const MODELS = [
  "gemini-3.7-flash",
  "gemini-3.6-flash",
  "gemini-3.8-flash",
  // The lite models are last because they are the slowest and the least
  // capable, but they are in the list because the free tier's daily cap of
  // twenty reads is counted per model rather than per key. Each name here is
  // another twenty timetables a day, and a lite model reading the week
  // correctly beats a better one that is out of allowance until tomorrow.
  "gemini-3.5-flash-lite",
  "gemini-3.1-flash-lite",
  // Last on evidence rather than on capability: this one answered 503 on one
  // afternoon and then hung to the full timeout on the next morning, which is
  // the most expensive way to be unavailable.
  "gemini-3.5-flash",
];

/** One name in GEMINI_MODEL pins the lot, for pinning a known-good model. */
function configuredModels(): string[] {
  const pinned = process.env.GEMINI_MODEL?.trim();
  return pinned ? [pinned] : MODELS;
}

/**
 * Models known to be unavailable, and the moment it is worth asking again.
 *
 * A model that has spent its twenty-a-day will say so every time for the rest
 * of the day, and a model that hangs tends to hang again. Neither fact is
 * remembered anywhere, so without this every upload re-discovers them from
 * scratch: on the morning this was written that was three refusals and a
 * sixty-second timeout — eighty seconds of a ninety-second wait — before
 * reaching the model that was going to answer all along.
 *
 * Module scope, so it lasts as long as the server process and no longer. It
 * is a cache of a fact that expires, not a record of anything, and being
 * wrong about it costs one wasted attempt rather than a wrong answer.
 */
const sidelined = new Map<string, number>();

function sideline(model: string, ms: number, why: string) {
  sidelined.set(model, Date.now() + ms);
  console.warn(`[timetable] ${model} set aside for ${Math.round(ms / 1000)}s (${why})`);
}

/**
 * The queue, minus anything currently set aside — and never empty.
 *
 * Pure, exported and tested, because the dangerous case is silent: if every
 * model ends up set aside at once, the naive version of this returns nothing,
 * the loop body never runs, and every upload fails instantly with whatever
 * error happened to be left over from last time. A stale note about
 * yesterday's quota must never be the reason nobody can upload today, so an
 * empty result means forget the notes and try everything.
 *
 * `expired` comes back so the caller can drop what it no longer needs; this
 * function does not mutate the map it is given.
 */
export function availableModels(
  all: string[],
  sidelined: ReadonlyMap<string, number>,
  now: number,
): { models: string[]; cleared: boolean } {
  const available = all.filter((model) => (sidelined.get(model) ?? 0) <= now);
  return available.length > 0
    ? { models: available, cleared: false }
    : { models: all, cleared: true };
}

function modelsToTry(): string[] {
  const { models, cleared } = availableModels(configuredModels(), sidelined, Date.now());
  if (cleared) sidelined.clear();
  return models;
}

const ENDPOINT = "https://generativelanguage.googleapis.com/v1beta/interactions";

/**
 * How long to let one model think before giving up on it and trying the next.
 *
 * A read of a photograph comes back in twenty-odd seconds. A busy model can
 * take forty just to say it is busy, and three of those in a row is a minute
 * and a half of somebody watching a spinner before being told to try later.
 *
 * So both ends are bounded. `PER_MODEL` stops one slow model from eating the
 * lot; `TOTAL` is the promise made to whoever is waiting, and the reason the
 * queue stops early rather than dutifully trying a third model it no longer
 * has time for. The total matters more than it looks: in production this runs
 * inside a Server Action, and a platform that kills the function at its own
 * limit produces a blank failure instead of a sentence.
 */
const PER_MODEL_TIMEOUT_MS = 60_000;
const TOTAL_BUDGET_MS = 120_000;

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
  /** Base64 bytes of the image or PDF, no data: prefix. */
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

  const bodyFor = (model: string) =>
    JSON.stringify({
      model,
      // The rules go in as the first turn rather than as a separate system
      // field: one documented shape, used the same way every time.
      input: [
        { type: "text", text: input.system },
        // Same split as the Anthropic path, for the same reason: a PDF goes in
        // as a document and an image as an image, and neither provider will
        // take one dressed as the other.
        {
          type: isPdf(input.mediaType) ? "document" : "image",
          data: input.data,
          mime_type: input.mediaType,
        },
        { type: "text", text: input.instruction },
      ],
      response_format: {
        type: "text",
        mime_type: "application/json",
        schema: RESPONSE_SCHEMA,
      },
    });

  let response: Response | null = null;
  let lastFailure: ExtractionError | null = null;
  const deadline = Date.now() + TOTAL_BUDGET_MS;

  for (const model of modelsToTry()) {
    const remaining = deadline - Date.now();
    // Starting an attempt there is no time left to finish only delays the
    // answer; the previous model's failure is already the true one. This is
    // what keeps a six-model queue from becoming a six-minute wait.
    if (remaining < 5_000) {
      console.warn(`[timetable] out of budget before ${model}`);
      break;
    }

    const startedAt = Date.now();
    let attempt: Response;

    try {
      attempt = await fetch(ENDPOINT, {
        method: "POST",
        headers: { "x-goog-api-key": apiKey, "content-type": "application/json" },
        body: bodyFor(model),
        signal: AbortSignal.timeout(Math.min(PER_MODEL_TIMEOUT_MS, remaining)),
      });
    } catch (error) {
      // A timeout is this model being too slow, which is the same kind of
      // problem as it being busy: move on rather than give up.
      if (error instanceof Error && error.name === "TimeoutError") {
        lastFailure = new ExtractionError(
          "The timetable reader took too long. Try again in a few minutes.",
          `${model}: timed out after ${PER_MODEL_TIMEOUT_MS}ms`,
        );
        // The most expensive way for a model to fail, and the most repeatable.
        sideline(model, 5 * 60_000, "timed out");
        continue;
      }
      throw new ExtractionError(
        "The timetable reader could not be reached. Check this server's connection and try again.",
        error instanceof Error ? error.message : undefined,
      );
    }

    // Logged because the only way to tell a slow model from a busy one, after
    // the fact, is to have written down which answered and how long it took.
    console.warn(
      `[timetable] ${model} → ${attempt.status} in ${Date.now() - startedAt}ms`,
    );

    if (attempt.ok) {
      response = attempt;
      break;
    }

    lastFailure = await failureFor(attempt, model);

    // A busy model is the next model's problem; a rejected key is nobody's.
    if (attempt.status !== 503 && attempt.status !== 429) throw lastFailure;

    if (attempt.status === 429) {
      // A daily cap is spent until the day turns over, but "the day" is in a
      // timezone this code does not know, so it is half an hour at a time
      // rather than a guess at midnight somewhere.
      const daily = /per day/i.test(lastFailure.message);
      sideline(model, daily ? 30 * 60_000 : 60_000, daily ? "daily quota" : "rate limited");
    } else {
      sideline(model, 60_000, "busy");
    }
  }

  if (!response) {
    throw (
      lastFailure ??
      new ExtractionError("The timetable reader could not be reached. Try again in a moment.")
    );
  }

  const text = outputTextOf(await response.json());

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

/**
 * What a failed response means, in one sentence, for the person who caused it.
 *
 * Pure and exported so it can be tested. Every branch here was written after
 * watching the wrong sentence appear in front of somebody — most of them are
 * indistinguishable from each other by status code alone, and the one that
 * matters most is two different limits sharing a 429. Getting these wrong is
 * not cosmetic: it sends people to retry something that cannot succeed, or to
 * replace a key that was never the problem.
 */
export function describeHttpFailure(status: number, detail: string): string {
  if (status === 400 && /api key/i.test(detail)) {
    return "That Google API key was rejected. Check GEMINI_API_KEY against the key in Google AI Studio.";
  }

  if (status === 401 || status === 403) {
    return "The Google API key was refused. Check that it is enabled for the Gemini API.";
  }

  if (status === 429) {
    /*
      A per-minute burst really does clear in a minute. The free tier's other
      limit is twenty requests per day, per model — and "wait a minute and try
      again" is a lie to somebody who will sit there retrying an upload that
      cannot succeed again until tomorrow. Google says which it is in the body,
      and gives a delay for the burst case, so both are quoted not guessed.
    */
    if (/per day/i.test(detail)) {
      return "That Google key has used up its free quota for today — it is twenty reads a day on each model, and this one is spent. It resets tomorrow. Switching TIMETABLE_EXTRACTOR to anthropic, or pinning a different model with GEMINI_MODEL, works in the meantime.";
    }

    const retryIn = detail.match(/retry in (\d+)s/i)?.[1];
    return `The free tier's rate limit was hit.${
      retryIn ? ` Google suggests trying again in ${retryIn} seconds.` : " Wait a minute and try again."
    }`;
  }

  if (status >= 500) {
    return "Google's models are all busy right now — that is the free tier, not your key or your photo. Try again in a few minutes.";
  }

  return "The timetable could not be read. Try again, or try a clearer photo.";
}

/** Reads the body, then hands the decision to the pure function above. */
async function failureFor(response: Response, model: string): Promise<ExtractionError> {
  const detail = await response.text().catch(() => "");
  return new ExtractionError(
    describeHttpFailure(response.status, detail),
    `${model} ${response.status}: ${detail.slice(0, 300)}`,
  );
}

/**
 * Dig the model's text out of the reply.
 *
 * `output_text` is a convenience property on Google's own SDK objects, not a
 * field on the wire — the REST body has no such key, and reading it gives an
 * empty string on a perfectly good response. What is actually there is a list
 * of steps, of which the interesting one is `model_output`; the others are the
 * model's own thinking, which arrives as an opaque signature with no text in
 * it at all. `output_text` is still checked first, in case a future shape
 * grows one.
 */
function outputTextOf(body: unknown): string {
  if (!body || typeof body !== "object") return "";

  const reply = body as {
    output_text?: unknown;
    steps?: Array<{ type?: unknown; content?: Array<{ type?: unknown; text?: unknown }> }>;
  };

  if (typeof reply.output_text === "string" && reply.output_text.trim()) {
    return reply.output_text;
  }

  return (reply.steps ?? [])
    .filter((step) => step.type === "model_output")
    .flatMap((step) => step.content ?? [])
    .filter((part) => part.type === "text" && typeof part.text === "string")
    .map((part) => part.text as string)
    .join("");
}

/**
 * Some replies arrive fenced as ```json even when JSON was asked for.
 * Cheap to undo, and the alternative is a parse error blaming the photograph.
 */
function stripFence(text: string): string {
  const fenced = text.trim().match(/^```(?:json)?\s*\n([\s\S]*?)\n?```$/);
  return fenced ? fenced[1] : text;
}
