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
