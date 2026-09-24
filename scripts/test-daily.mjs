/**
 * Unit tests for the per-day report.
 *
 *   npm run test:daily
 *
 * Almost every test here is about WHICH DAY something lands on. That is the
 * only hard part: the server is UTC, the parent may be anywhere, and the
 * answer has to be her midnight every time. A report that silently files
 * Tuesday's homework under Monday is wrong in a way nobody notices, because
 * the totals still look plausible.
 */
import test from "node:test";
import assert from "node:assert/strict";

import { buildDailyReports, dayKeyIn, summarise } from "@/lib/report/daily.ts";

const KIGALI = "Africa/Kigali"; // UTC+2, no DST
const NY = "America/New_York"; // UTC-4/-5, with DST

function logged(type, iso, title) {
  return { activity_type: type, created_at: iso, metadata: title ? { title } : {} };
}

function build(over = {}) {
  return buildDailyReports({
    timezone: KIGALI,
    days: 7,
    now: new Date("2026-09-23T09:00:00Z"),
    activity: [],
    sessions: [],
    assignments: [],
    ...over,
  });
}

test("day keys are read in her timezone, not UTC", () => {
  // 22:30 UTC is already the 24th in Kigali (UTC+2).
  const at = new Date("2026-09-23T22:30:00Z");
  assert.equal(dayKeyIn(KIGALI, at), "2026-09-24");
  assert.equal(dayKeyIn("UTC", at), "2026-09-23");
});

test("and behind UTC too, not just ahead", () => {
  // 02:00 UTC is still the previous evening in New York.
  const at = new Date("2026-09-23T02:00:00Z");
  assert.equal(dayKeyIn(NY, at), "2026-09-22");
  assert.equal(dayKeyIn("UTC", at), "2026-09-23");
});

test("an unknown timezone degrades instead of throwing", () => {
  assert.doesNotThrow(() => dayKeyIn("Mars/Olympus_Mons", new Date()));
});

test("the list runs newest first and covers the range", () => {
  const r = build();
  assert.equal(r.length, 7);
  assert.equal(r[0].date, "2026-09-23");
  assert.equal(r[6].date, "2026-09-17");
  assert.equal(r[0].today, true);
  assert.equal(r[1].today, false);
});

test("work done just after her midnight lands on the new day", () => {
  // 22:10 UTC on the 22nd = 00:10 on the 23rd in Kigali. This is THE case
  // that a UTC-bucketed report gets wrong.
  const r = build({
    activity: [logged("assignment_completed", "2026-09-22T22:10:00Z", "Late night maths")],
  });

  assert.equal(r[0].date, "2026-09-23");
  assert.equal(r[0].completed, 1, "belongs to the 23rd, her time");
  assert.equal(r[1].completed, 0, "must not be filed under the 22nd");
  assert.deepEqual(r[0].completedTitles, ["Late night maths"]);
});

test("work done just before her midnight stays on the old day", () => {
  const r = build({
    activity: [logged("assignment_completed", "2026-09-22T21:50:00Z", "Evening physics")],
  });
  assert.equal(r[0].completed, 0);
  assert.equal(r[1].completed, 1);
});

test("each event type reaches its own counter", () => {
  const day = "2026-09-22T12:00:00Z";
  const r = build({
    activity: [
      logged("assignment_created", day, "A"),
      logged("assignment_created", day, "B"),
      logged("assignment_completed", day, "A"),
      logged("help_logged", day, "Quadratics"),
      logged("help_resolved", day, "Quadratics"),
      logged("study_session_started", day),
    ],
  });

  const d = r[1];
  assert.equal(d.added, 2);
  assert.equal(d.completed, 1);
  assert.equal(d.helpLogged, 1);
  assert.equal(d.helpResolved, 1);
  assert.equal(d.events, 6, "every logged event counts towards activity");
});

test("events outside the range are ignored, not clamped onto the edge", () => {
  const r = build({
    activity: [logged("assignment_completed", "2026-08-01T12:00:00Z", "Ancient history")],
  });
  assert.equal(
    r.reduce((n, d) => n + d.completed, 0),
    0,
  );
});

test("study minutes are bucketed by her clock and summed", () => {
  const r = build({
    sessions: [
      { started_at: "2026-09-22T12:00:00Z", duration_minutes: 30 },
      { started_at: "2026-09-22T14:00:00Z", duration_minutes: 15 },
      // 22:30 UTC = 00:30 on the 23rd for her.
      { started_at: "2026-09-22T22:30:00Z", duration_minutes: 20 },
    ],
  });
  assert.equal(r[1].studiedMinutes, 45);
  assert.equal(r[0].studiedMinutes, 20);
});

test("a null duration does not poison the total with NaN", () => {
  const r = build({
    sessions: [
      { started_at: "2026-09-22T12:00:00Z", duration_minutes: null },
      { started_at: "2026-09-22T13:00:00Z", duration_minutes: 25 },
    ],
  });
  assert.equal(r[1].studiedMinutes, 25);
});

test("homework due on a past day and never finished is missed", () => {
  const r = build({
    assignments: [
      { title: "Essay", due_date: "2026-09-21", status: "not_started", completed_at: null },
    ],
  });
  assert.deepEqual(r[2].missed, ["Essay"]);
});

test("finished late still counts as missed on the day it was due", () => {
  const r = build({
    assignments: [
      {
        title: "Essay",
        due_date: "2026-09-21",
        status: "completed",
        completed_at: "2026-09-22T10:00:00Z",
      },
    ],
  });
  assert.deepEqual(r[2].missed, ["Essay"]);
});

test("finished on the day it was due is not missed", () => {
  const r = build({
    assignments: [
      {
        title: "Essay",
        due_date: "2026-09-21",
        status: "completed",
        completed_at: "2026-09-21T19:00:00Z",
      },
    ],
  });
  assert.deepEqual(r[2].missed, []);
});

test("nothing is missed on the day still in progress", () => {
  // It is 11:00 for her and the homework is due tonight. Calling that missed
  // at lunchtime would be both wrong and demoralising.
  const r = build({
    assignments: [
      { title: "Due tonight", due_date: "2026-09-23", status: "not_started", completed_at: null },
    ],
  });
  assert.deepEqual(r[0].missed, []);
});

test("completed titles are newest first and capped", () => {
  const activity = Array.from({ length: 9 }, (_, i) =>
    logged("assignment_completed", `2026-09-22T${String(8 + i).padStart(2, "0")}:00:00Z`, `Task ${i}`),
  );
  const r = build({ activity });
  assert.equal(r[1].completed, 9);
  assert.equal(r[1].completedTitles.length, 6, "capped for display");
  assert.equal(r[1].completedTitles[0], "Task 8", "newest first");
});

test("a completion whose title was lost still counts", () => {
  // The count comes from the log entry; the title is a nicety.
  const r = build({
    activity: [{ activity_type: "assignment_completed", created_at: "2026-09-22T12:00:00Z", metadata: {} }],
  });
  assert.equal(r[1].completed, 1);
  assert.deepEqual(r[1].completedTitles, []);
});

test("the summary excludes the day in progress from the day count", () => {
  const r = build({
    activity: [logged("assignment_completed", "2026-09-22T12:00:00Z", "A")],
  });
  const s = summarise(r);
  assert.equal(s.completed, 1);
  assert.equal(s.activeDays, 1);
  assert.equal(s.countedDays, 6, "today is still running and is not a finished day");
});

test("a range spanning a DST change does not duplicate a date", () => {
  // New York falls back on 1 Nov 2026. Stepping by fixed 24h across it can
  // land twice on the same calendar day.
  const r = buildDailyReports({
    timezone: NY,
    days: 7,
    now: new Date("2026-11-03T12:00:00Z"),
    activity: [],
    sessions: [],
    assignments: [],
  });
  assert.equal(new Set(r.map((d) => d.date)).size, r.length, "no repeated dates");
});

test("days are labelled for reading, not parsing", () => {
  const r = build();
  assert.equal(r[0].label, "Wed 23 Sep");
  assert.equal(r[0].weekday, "Wednesday");
});
