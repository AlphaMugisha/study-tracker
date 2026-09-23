/**
 * Unit tests for the school-day resolver.
 *
 *   npm run test:resolve
 *
 * This decides what the student sees all day and whether school mode locks
 * the app, so the edge cases matter more than the happy path: the minute a
 * lesson ends, the gap between two lessons, and the fact that a break is
 * still school.
 */
import test from "node:test";
import assert from "node:assert/strict";

import { resolveNow, isAtSchool, clockIn } from "@/lib/timetable/resolve.ts";

const H = 60;

function entry(id, day, start, end, type = "class") {
  return {
    id,
    activityType: type,
    label: id,
    detail: null,
    subjectName: null,
    subjectId: null,
    colorToken: null,
    room: null,
    dayOfWeek: day,
    startMinutes: start,
    endMinutes: end,
    startLabel: "",
    endLabel: "",
    durationMinutes: end - start,
  };
}

// Monday: 08:00-09:00 maths, 09:00-09:15 break, 09:15-10:15 physics
const MONDAY = [
  entry("maths", 1, 8 * H, 9 * H),
  entry("break", 1, 9 * H, 9 * H + 15, "break"),
  entry("physics", 1, 9 * H + 15, 10 * H + 15),
];

test("no timetable at all", () => {
  assert.equal(resolveNow([], 9 * H, 1).kind, "no_timetable");
});

test("a day with nothing timetabled", () => {
  const s = resolveNow(MONDAY, 9 * H, 2);
  assert.equal(s.kind, "no_school");
  assert.equal(s.reason, "empty_day");
});

test("the weekend says weekend, not empty", () => {
  assert.equal(resolveNow(MONDAY, 9 * H, 6).reason, "weekend");
});

test("before the first bell", () => {
  const s = resolveNow(MONDAY, 7 * H + 30, 1);
  assert.equal(s.kind, "before_school");
  assert.equal(s.next.id, "maths");
  assert.equal(s.startsInMinutes, 30);
});

test("mid-lesson reports remaining and progress", () => {
  const s = resolveNow(MONDAY, 8 * H + 45, 1);
  assert.equal(s.kind, "in_activity");
  assert.equal(s.current.id, "maths");
  assert.equal(s.remainingMinutes, 15);
  assert.equal(s.elapsedMinutes, 45);
  assert.equal(s.progress, 0.75);
  assert.equal(s.next.id, "break");
});

test("the minute a lesson ends, the next one has started", () => {
  // Boundary: end is exclusive, start is inclusive. Off by one here would
  // leave a one-minute hole every lesson.
  const s = resolveNow(MONDAY, 9 * H, 1);
  assert.equal(s.kind, "in_activity");
  assert.equal(s.current.id, "break");
  assert.equal(s.elapsedMinutes, 0);
});

test("the last minute of the day is still in the lesson", () => {
  const s = resolveNow(MONDAY, 10 * H + 14, 1);
  assert.equal(s.kind, "in_activity");
  assert.equal(s.remainingMinutes, 1);
});

test("after the last bell", () => {
  const s = resolveNow(MONDAY, 10 * H + 15, 1);
  assert.equal(s.kind, "after_school");
  assert.equal(s.lastEntry.id, "physics");
});

test("an untimetabled gap is reported as a gap", () => {
  const sparse = [entry("a", 1, 8 * H, 9 * H), entry("b", 1, 11 * H, 12 * H)];
  const s = resolveNow(sparse, 10 * H, 1);
  assert.equal(s.kind, "gap");
  assert.equal(s.previous.id, "a");
  assert.equal(s.next.id, "b");
  assert.equal(s.remainingMinutes, 60);
});

test("a break still counts as being at school", () => {
  // The lock must not lift during break, or it lifts every hour.
  assert.equal(isAtSchool(resolveNow(MONDAY, 9 * H + 5, 1)), true);
});

test("a gap between lessons still counts as being at school", () => {
  const sparse = [entry("a", 1, 8 * H, 9 * H), entry("b", 1, 11 * H, 12 * H)];
  assert.equal(isAtSchool(resolveNow(sparse, 10 * H, 1)), true);
});

test("before and after school do not count as at school", () => {
  assert.equal(isAtSchool(resolveNow(MONDAY, 7 * H, 1)), false);
  assert.equal(isAtSchool(resolveNow(MONDAY, 17 * H, 1)), false);
  assert.equal(isAtSchool(resolveNow(MONDAY, 12 * H, 6)), false);
});

test("clockIn reads the given timezone, not the host's", () => {
  // A fixed instant: 2026-09-23T12:00:00Z.
  const at = new Date("2026-09-23T12:00:00Z");
  const kigali = clockIn("Africa/Kigali", at); // UTC+2
  const utc = clockIn("UTC", at);
  assert.equal(utc.minutes, 12 * H);
  assert.equal(kigali.minutes, 14 * H);
  assert.equal(kigali.dayOfWeek, 3); // Wednesday
});

test("an unknown timezone degrades instead of throwing", () => {
  const at = new Date("2026-09-23T12:00:00Z");
  const r = clockIn("Not/AZone", at);
  assert.ok(Number.isFinite(r.minutes));
  assert.ok(r.dayOfWeek >= 1 && r.dayOfWeek <= 7);
});
