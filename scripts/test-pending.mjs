/**
 * Which reassurance shows at which point in a long wait.
 *
 *   npm run test:pending
 *
 * The overlay exists for an operation that can run for two minutes, so the
 * only other way to check this is to stare at a spinner for two minutes and
 * hope the last line arrives. These are the rules it has to follow: forward
 * only, nothing before the first threshold, and indifferent to the order the
 * stages were written in.
 */
import test from "node:test";
import assert from "node:assert/strict";

import { stageFor } from "@/lib/pending-stage.ts";

const STAGES = [
  { after: 12, text: "twelve" },
  { after: 40, text: "forty" },
  { after: 90, text: "ninety" },
];

test("nothing is said before the first threshold", () => {
  assert.equal(stageFor(STAGES, 0), null);
  assert.equal(stageFor(STAGES, 11), null);
});

test("a threshold takes effect on the second it names", () => {
  assert.equal(stageFor(STAGES, 12).text, "twelve");
  assert.equal(stageFor(STAGES, 40).text, "forty");
  assert.equal(stageFor(STAGES, 90).text, "ninety");
});

test("the latest passed threshold wins, so the copy only moves forward", () => {
  assert.equal(stageFor(STAGES, 39).text, "twelve");
  assert.equal(stageFor(STAGES, 89).text, "forty");
  // Past the last one it stays put rather than falling back to nothing.
  assert.equal(stageFor(STAGES, 600).text, "ninety");
});

test("stages written out of order behave the same", () => {
  const jumbled = [STAGES[2], STAGES[0], STAGES[1]];
  for (const at of [0, 12, 39, 40, 89, 90, 600]) {
    assert.deepEqual(stageFor(jumbled, at), stageFor(STAGES, at), `at ${at}s`);
  }
});

test("no stages at all is a spinner with a clock, not a crash", () => {
  assert.equal(stageFor([], 0), null);
  assert.equal(stageFor([], 999), null);
});
