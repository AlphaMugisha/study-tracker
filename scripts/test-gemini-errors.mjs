/**
 * What the reader says when Google says no.
 *
 *   npm run test:gemini
 *
 * Every case here is a real response body, and most of them are
 * indistinguishable by status code alone. These are not cosmetic strings: the
 * wrong one sends somebody to retry an upload that cannot succeed until
 * tomorrow, or to replace a key that was never the problem. That happened
 * twice before these existed.
 */
import test from "node:test";
import assert from "node:assert/strict";

import { describeHttpFailure } from "@/lib/timetable/gemini.ts";

/** Verbatim from the API on the morning the daily cap was hit. */
const DAILY = JSON.stringify({
  error: {
    message:
      "Rate limit exceeded for model gemini-3.8-flash (limit: 20 requests per day on Free Tier). Please retry in 48s or upgrade your tier at https://ai.dev/rate-limit.",
    code: "too_many_requests",
  },
});

const BUSY = JSON.stringify({
  error: {
    message:
      "gemini-3.8-flash is currently experiencing high demand, spikes in demand are usually temporary. Please try again later.",
    code: "service_unavailable",
  },
});

test("a daily cap does not tell anyone to wait a minute", () => {
  const said = describeHttpFailure(429, DAILY);
  assert.match(said, /today/i);
  assert.match(said, /resets tomorrow/i);
  // The trap: the body also says "retry in 48s", which is true of the burst
  // limit and a lie about this one. Quoting it here is the original bug.
  assert.doesNotMatch(said, /48 seconds/);
  assert.doesNotMatch(said, /wait a minute/i);
});

test("a daily cap names the two ways out", () => {
  const said = describeHttpFailure(429, DAILY);
  assert.match(said, /anthropic/);
  assert.match(said, /GEMINI_MODEL/);
});

test("a burst limit quotes the delay the API gave", () => {
  const said = describeHttpFailure(429, '{"error":{"message":"Rate limit exceeded. Please retry in 7s"}}');
  assert.match(said, /7 seconds/);
  assert.doesNotMatch(said, /today/i);
});

test("a burst limit with no delay still says something true", () => {
  const said = describeHttpFailure(429, '{"error":{"message":"Rate limit exceeded"}}');
  assert.match(said, /wait a minute/i);
  assert.doesNotMatch(said, /undefined/);
});

test("busy is not the key's fault, and says so", () => {
  const said = describeHttpFailure(503, BUSY);
  assert.match(said, /busy/i);
  // The whole point of this sentence: both other guesses are wrong.
  assert.match(said, /not your key or your photo/i);
});

test("a rejected key is told apart from a bad request", () => {
  assert.match(
    describeHttpFailure(400, '{"error":{"message":"API key not valid. Pass a valid API key."}}'),
    /GEMINI_API_KEY/,
  );
  assert.match(
    describeHttpFailure(400, '{"error":{"message":"Invalid JSON payload received."}}'),
    /could not be read/i,
  );
});

test("401 and 403 both point at the key rather than the photo", () => {
  for (const status of [401, 403]) {
    const said = describeHttpFailure(status, "");
    assert.match(said, /key/i, String(status));
    assert.doesNotMatch(said, /clearer photo/i, String(status));
  }
});

test("an unrecognised status falls back without mentioning a cause it does not know", () => {
  const said = describeHttpFailure(418, "");
  assert.match(said, /could not be read/i);
  assert.doesNotMatch(said, /key/i);
  assert.doesNotMatch(said, /quota/i);
});

test("every branch returns a non-empty sentence", () => {
  for (const status of [400, 401, 403, 404, 429, 500, 503, 418]) {
    const said = describeHttpFailure(status, "");
    assert.ok(said.trim().length > 20, `${status}: ${said}`);
    assert.match(said, /\.$/, `${status} should end in a full stop`);
  }
});

/*
  Which models are worth asking, given what is known about them.

  The dangerous case here is silent. If everything ends up set aside at once
  — an afternoon where the free tier refuses across the board — the obvious
  version of this returns an empty list, the loop body never runs, and every
  upload fails instantly with whatever error was left over from last time.
  Nobody would be able to upload a timetable until the server was restarted.
*/
import { availableModels } from "@/lib/timetable/gemini.ts";

const ALL = ["a", "b", "c"];
const NOW = 1_000_000;

test("nothing set aside means try everything, in order", () => {
  const { models, cleared } = availableModels(ALL, new Map(), NOW);
  assert.deepEqual(models, ALL);
  assert.equal(cleared, false);
});

test("a model set aside is skipped, and order is otherwise kept", () => {
  const { models } = availableModels(ALL, new Map([["b", NOW + 60_000]]), NOW);
  assert.deepEqual(models, ["a", "c"]);
});

test("a sideline that has expired is over", () => {
  const { models } = availableModels(ALL, new Map([["b", NOW - 1]]), NOW);
  assert.deepEqual(models, ALL);
  // Exactly now counts as expired: a note timed to the millisecond should
  // not keep a model out for one more attempt.
  assert.deepEqual(availableModels(ALL, new Map([["b", NOW]]), NOW).models, ALL);
});

test("everything set aside falls back to everything, rather than to nothing", () => {
  const all = new Map(ALL.map((m) => [m, NOW + 60_000]));
  const { models, cleared } = availableModels(ALL, all, NOW);
  assert.deepEqual(models, ALL, "an empty queue would fail every upload instantly");
  assert.equal(cleared, true, "the caller has to know to forget the stale notes");
});

test("it does not mutate the notes it was given", () => {
  const notes = new Map([["b", NOW + 60_000]]);
  availableModels(ALL, notes, NOW);
  assert.equal(notes.size, 1);
  assert.equal(notes.get("b"), NOW + 60_000);
});

test("a note about a model that is no longer in the list is harmless", () => {
  const { models } = availableModels(ALL, new Map([["gone", NOW + 60_000]]), NOW);
  assert.deepEqual(models, ALL);
});

test("a single pinned model is never sidelined into an empty queue", () => {
  const { models, cleared } = availableModels(["only"], new Map([["only", NOW + 60_000]]), NOW);
  assert.deepEqual(models, ["only"]);
  assert.equal(cleared, true);
});
