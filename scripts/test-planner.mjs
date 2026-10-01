/**
 * Unit tests for the evening planner.
 *
 *   npm run test:planner
 *
 * The planner is pure, so this needs no database and no server. It is the one
 * piece of real product logic in StudyFlow — "what should I start with" — and
 * the behaviour that matters most is the behaviour the old preview could not
 * express at all: refusing to schedule past the cutoff, and saying so.
 */
import test from "node:test";
import assert from "node:assert/strict";

import { buildEveningPlan } from "@/lib/planner/build-plan.ts";

const HOUR = 60;

/** Minimal shapes — the planner only reads these fields. */
function hw(id, title, minutes, { due = "2026-10-01", overdue = false, priority = "medium", status = "not_started" } = {}) {
  return {
    id,
    title,
    estimated_minutes: minutes,
    status,
    priority,
    overdue,
    due_date: due,
    due_time: null,
    dueAt: new Date(`${due}T23:59:59`),
    subject: { name: "Maths", color_token: "chart-1" },
  };
}

const BASE = {
  schoolEndsMinutes: 15 * HOUR, // 15:00
  settleMinutes: 30, // start 15:30
  studyUntilMinutes: 21 * HOUR, // 21:00
  revision: [],
};

test("schedules work after school plus the settle gap", () => {
  const plan = buildEveningPlan({ ...BASE, assignments: [hw("a", "Essay", 30)] });
  assert.equal(plan.startsAt, "15:30");
  assert.equal(plan.blocks[0].startLabel, "15:30");
  assert.equal(plan.blocks[0].minutes, 30);
  assert.equal(plan.deferred.length, 0);
});

test("answers 'what do I start with' with the most urgent task", () => {
  const plan = buildEveningPlan({
    ...BASE,
    assignments: [
      hw("later", "Read chapter", 20, { due: "2026-12-01" }),
      hw("urgent", "Physics sheet", 20, { due: "2026-09-24", overdue: true }),
    ],
  });
  assert.equal(plan.startWith.label, "Physics sheet");
  assert.equal(plan.blocks[0].label, "Physics sheet");
});

test("splits a long task into sittings rather than one wall of time", () => {
  const plan = buildEveningPlan({ ...BASE, assignments: [hw("a", "Coursework", 120)] });
  const work = plan.blocks.filter((b) => b.kind !== "break");
  assert.ok(work.length >= 3, `expected the 120min task to be split, got ${work.length}`);
  assert.ok(work.every((b) => b.minutes <= 45), "no sitting may exceed 45 minutes");
  assert.equal(work.reduce((t, b) => t + b.minutes, 0), 120, "no minutes lost in the split");
  assert.equal(work[0].part.total, work.length);
  assert.equal(work[0].part.index, 1);
});

test("folds a tiny trailing remainder into the previous sitting", () => {
  // 50 minutes would otherwise become 45 + 5; a 5-minute block is noise.
  const plan = buildEveningPlan({ ...BASE, assignments: [hw("a", "Worksheet", 50)] });
  const work = plan.blocks.filter((b) => b.kind !== "break");
  assert.equal(work.length, 1);
  assert.equal(work[0].minutes, 50);
});

test("inserts a break only after accumulated work, not after every task", () => {
  const plan = buildEveningPlan({
    ...BASE,
    assignments: [hw("a", "One", 10), hw("b", "Two", 10), hw("c", "Three", 10)],
  });
  assert.equal(plan.blocks.filter((b) => b.kind === "break").length, 0,
    "three short tasks should not earn a break");
});

test("never schedules past the cutoff, and defers what will not fit", () => {
  const plan = buildEveningPlan({
    ...BASE,
    studyUntilMinutes: 16 * HOUR, // only 30 minutes of evening
    assignments: [hw("a", "Fits", 30), hw("b", "Does not fit", 60)],
  });
  const last = plan.blocks[plan.blocks.length - 1];
  const endMinutes = Number(last.endLabel.slice(0, 2)) * 60 + Number(last.endLabel.slice(3));
  assert.ok(endMinutes <= 16 * HOUR, `plan ran past the cutoff: ends ${last.endLabel}`);
  assert.equal(plan.deferred.length, 1);
  assert.equal(plan.deferred[0].label, "Does not fit");
  assert.equal(plan.deferred[0].scheduledMinutes, 0);
});

test("reports partial progress on a task that only half fits", () => {
  const plan = buildEveningPlan({
    ...BASE,
    studyUntilMinutes: 16 * HOUR + 30, // 60 minutes of evening
    assignments: [hw("a", "Long essay", 120)],
  });
  const deferred = plan.deferred[0];
  assert.equal(deferred.label, "Long essay");
  assert.ok(deferred.scheduledMinutes > 0, "some of it should have been scheduled");
  assert.ok(deferred.scheduledMinutes < 120, "not all of it should fit");
});

test("starts from now when the evening is already underway", () => {
  const plan = buildEveningPlan({
    ...BASE,
    nowMinutes: 18 * HOUR, // it is already 18:00
    assignments: [hw("a", "Essay", 30)],
  });
  assert.equal(plan.startsAt, "18:00", "a plan starting hours ago is not a plan");
});

test("completed work is not scheduled", () => {
  const plan = buildEveningPlan({
    ...BASE,
    assignments: [hw("a", "Done", 30, { status: "completed" }), hw("b", "To do", 20)],
  });
  const labels = plan.blocks.map((b) => b.label);
  assert.ok(!labels.includes("Done"));
  assert.ok(labels.includes("To do"));
});

test("an evening with no time left defers everything and claims nothing", () => {
  const plan = buildEveningPlan({
    ...BASE,
    nowMinutes: 22 * HOUR, // past the cutoff already
    assignments: [hw("a", "Essay", 30)],
  });
  assert.equal(plan.blocks.length, 0);
  assert.equal(plan.startWith, null);
  assert.equal(plan.deferred.length, 1);
});

test("nothing outstanding means an empty plan, not an empty crash", () => {
  const plan = buildEveningPlan({ ...BASE, assignments: [] });
  assert.equal(plan.blocks.length, 0);
  assert.equal(plan.deferred.length, 0);
  assert.equal(plan.startWith, null);
});

// ---------------------------------------------------------------------------
// Filling the evening from the timetable
// ---------------------------------------------------------------------------
// `spareMinutes` used to be reported and nothing more: an evening with no
// homework was described as empty rather than used. These cover the one rule
// that makes that safe to change — set work always wins, and a suggestion
// never displaces it.

/** The shape `suggestStudy` returns; the planner reads only these fields. */
function sug(subject, minutes, reason = `${subject} is on tomorrow's timetable.`) {
  return {
    subjectId: `sub-${subject}`,
    subjectName: subject,
    colorToken: "chart-1",
    minutes,
    score: 50,
    headline: `${subject}, ready for tomorrow`,
    reasons: [reason],
    next: null,
    last: null,
  };
}

test("an empty evening is filled from the timetable rather than left empty", () => {
  const plan = buildEveningPlan({
    ...BASE,
    assignments: [],
    suggestions: [sug("Chemistry", 30)],
  });
  assert.equal(plan.blocks.length, 1);
  assert.equal(plan.blocks[0].kind, "suggested");
  assert.equal(plan.blocks[0].subjectId, "sub-Chemistry");
  assert.equal(plan.suggestedMinutes, 30);
  assert.equal(plan.startsAt, "15:30");
});

test("a suggestion answers 'what do I start with' only when nothing was set", () => {
  const withHomework = buildEveningPlan({
    ...BASE,
    assignments: [hw("a", "Essay", 30)],
    suggestions: [sug("Chemistry", 30)],
  });
  assert.equal(withHomework.startWith.label, "Essay", "set work comes first, always");
  assert.equal(withHomework.startWith.reason, null);

  const withoutHomework = buildEveningPlan({
    ...BASE,
    assignments: [],
    suggestions: [sug("Chemistry", 30, "You have a Chemistry double at 09:20 tomorrow.")],
  });
  assert.equal(withoutHomework.startWith.label, "Chemistry, ready for tomorrow");
  assert.equal(
    withoutHomework.startWith.reason,
    "You have a Chemistry double at 09:20 tomorrow.",
    "a suggestion has to say why; set work does not",
  );
});

test("suggestions go after the homework, never in front of it", () => {
  const plan = buildEveningPlan({
    ...BASE,
    assignments: [hw("a", "Essay", 30)],
    suggestions: [sug("Chemistry", 30)],
  });
  const kinds = plan.blocks.filter((b) => b.kind !== "break").map((b) => b.kind);
  assert.deepEqual(kinds, ["homework", "suggested"]);
  assert.equal(plan.workMinutes, 60);
  assert.equal(plan.suggestedMinutes, 30, "only the suggested half counts as suggested");
});

test("nothing is suggested in an evening that could not hold the homework", () => {
  const plan = buildEveningPlan({
    ...BASE,
    studyUntilMinutes: 16 * HOUR, // 30 minutes of evening
    assignments: [hw("a", "Fits", 30), hw("b", "Does not fit", 60)],
    suggestions: [sug("Chemistry", 30)],
  });
  assert.ok(plan.deferred.length > 0);
  assert.equal(plan.blocks.filter((b) => b.kind === "suggested").length, 0,
    "offering optional revision to someone already out of time is noise");
  assert.equal(plan.suggestedMinutes, 0);
});

test("a suggestion is never scheduled past the cutoff", () => {
  const plan = buildEveningPlan({
    ...BASE,
    studyUntilMinutes: 16 * HOUR, // 30 minutes of evening
    assignments: [],
    suggestions: [sug("Chemistry", 45), sug("French", 45)],
  });
  for (const block of plan.blocks) {
    const end = Number(block.endLabel.slice(0, 2)) * 60 + Number(block.endLabel.slice(3));
    assert.ok(end <= 16 * HOUR, `suggestion ran past the cutoff: ends ${block.endLabel}`);
  }
  assert.ok(plan.blocks.length <= 1, "only what fits");
});

test("a short remainder is left spare rather than filled with a token block", () => {
  const plan = buildEveningPlan({
    ...BASE,
    studyUntilMinutes: 15 * HOUR + 45, // 15 minutes of evening
    assignments: [],
    suggestions: [sug("Chemistry", 30)],
  });
  assert.equal(plan.blocks.length, 0, "15 minutes is not a study session");
  assert.equal(plan.spareMinutes, 15);
});

test("a free evening is capped, not packed end to end with revision", () => {
  const plan = buildEveningPlan({
    ...BASE, // 15:30 to 21:00 — five and a half hours
    assignments: [],
    suggestions: ["A", "B", "C", "D", "E", "F"].map((s) => sug(s, 45)),
  });
  const suggested = plan.blocks.filter((b) => b.kind === "suggested");
  assert.equal(suggested.length, 3, "three blocks is an offer; six is a sentence");
  assert.ok(plan.spareMinutes > 0, "the rest of the evening stays hers");
});

test("a suggested block carries the reason it was made", () => {
  const plan = buildEveningPlan({
    ...BASE,
    assignments: [],
    suggestions: [sug("Chemistry", 30, "You have a Chemistry double at 09:20 tomorrow.")],
  });
  assert.equal(plan.blocks[0].reason, "You have a Chemistry double at 09:20 tomorrow.");
  assert.equal(plan.blocks[0].detail, "Chemistry");
  assert.equal(plan.blocks[0].taskId, null, "there is no row to work against yet");
});

test("breaks are earned across suggestions the same way they are across homework", () => {
  const plan = buildEveningPlan({
    ...BASE,
    assignments: [],
    suggestions: [sug("A", 45), sug("B", 45), sug("C", 45)],
  });
  const breaks = plan.blocks.filter((b) => b.kind === "break");
  assert.ok(breaks.length >= 1, "135 minutes of revision earns at least one break");
});

test("an evening already over suggests nothing", () => {
  const plan = buildEveningPlan({
    ...BASE,
    nowMinutes: 22 * HOUR,
    assignments: [],
    suggestions: [sug("Chemistry", 30)],
  });
  assert.equal(plan.blocks.length, 0);
  assert.equal(plan.startWith, null);
});
