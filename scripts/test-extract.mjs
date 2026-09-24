/**
 * Unit tests for cleaning up extracted timetable rows.
 *
 *   npm run test:extract
 *
 * The model's output is untrusted input. Everything here is about what happens
 * between "the model said so" and "a human sees it": times in a dozen written
 * forms, rows that could only ever be rejected by the database, and overlaps
 * that would fail halfway through the insert and leave a partial week.
 */
import test from "node:test";
import assert from "node:assert/strict";

import { normaliseTime, normaliseEntries, findClashes } from "@/lib/timetable/extract.ts";

function row(over = {}) {
  return {
    dayOfWeek: 1,
    startTime: "08:00",
    endTime: "09:00",
    activityType: "class",
    subject: "Mathematics",
    title: null,
    room: null,
    teacher: null,
    confidence: "high",
    ...over,
  };
}

test("times are read in every form a school prints them", () => {
  for (const [input, expected] of [
    ["08:30", "08:30"],
    ["8:30", "08:30"],
    ["8.30", "08:30"],
    ["8h30", "08:30"],
    ["0830", "08:30"],
    ["08:30:00", "08:30"],
    ["  8:05 ", "08:05"],
    ["9", "09:00"],
  ]) {
    assert.equal(normaliseTime(input), expected, `${input} should read as ${expected}`);
  }
});

test("pm is handled, because a 12-hour timetable is otherwise unreadable", () => {
  assert.equal(normaliseTime("1:30pm"), "13:30");
  assert.equal(normaliseTime("2.15 p.m."), "14:15");
  assert.equal(normaliseTime("12:30am"), "00:30");
  // Already 24-hour: pm must not push it past midnight.
  assert.equal(normaliseTime("14:00pm"), "14:00");
});

test("nonsense is null rather than a plausible wrong time", () => {
  for (const bad of ["", "lunch", "25:00", "08:75", "--", "n/a"]) {
    assert.equal(normaliseTime(bad), null, `${bad} should not parse`);
  }
});

test("rows the database would reject are dropped with a reason", () => {
  const { entries, dropped } = normaliseEntries([
    row(),
    row({ startTime: "10:00", endTime: "09:00" }),
    row({ startTime: "lunch", endTime: "also lunch" }),
    row({ dayOfWeek: 9 }),
  ]);

  assert.equal(entries.length, 1);
  assert.equal(dropped.length, 3);
  assert.match(dropped[0].reason, /ends before it starts/i);
  assert.match(dropped[1].reason, /could not be read/i);
});

test("a lesson with no subject is rescued, not discarded", () => {
  // timetable_entries_class_has_subject would reject it as a class. The slot
  // is real, so it becomes 'other' and is flagged for a human to name.
  const { entries, dropped } = normaliseEntries([row({ subject: null })]);
  assert.equal(dropped.length, 0);
  assert.equal(entries[0].activityType, "other");
  assert.equal(entries[0].confidence, "low", "a rescued row is never high confidence");
  assert.ok(entries[0].title, "it must be describable or the insert fails");
});

test("a rescued row keeps a title it already had", () => {
  const { entries } = normaliseEntries([
    row({ subject: null, title: "Private study", activityType: "class" }),
  ]);
  assert.equal(entries[0].title, "Private study");
});

test("blank strings become null, not empty subjects", () => {
  const { entries } = normaliseEntries([row({ room: "   ", teacher: "" })]);
  assert.equal(entries[0].room, null);
  assert.equal(entries[0].teacher, null);
});

test("rows come back sorted by day then time", () => {
  const { entries } = normaliseEntries([
    row({ dayOfWeek: 3, startTime: "09:00", endTime: "10:00" }),
    row({ dayOfWeek: 1, startTime: "11:00", endTime: "12:00" }),
    row({ dayOfWeek: 1, startTime: "08:00", endTime: "09:00" }),
  ]);
  assert.deepEqual(
    entries.map((e) => `${e.dayOfWeek}@${e.startTime}`),
    ["1@08:00", "1@11:00", "3@09:00"],
  );
});

test("times are normalised before they are compared", () => {
  // "8.30" vs "09:00" only orders correctly once both are HH:MM.
  const { entries, dropped } = normaliseEntries([row({ startTime: "8.30", endTime: "9.20" })]);
  assert.equal(dropped.length, 0);
  assert.equal(entries[0].startTime, "08:30");
  assert.equal(entries[0].endTime, "09:20");
});

test("overlaps are found before the database rejects them", () => {
  const clashes = findClashes([
    row({ startTime: "08:00", endTime: "09:00" }),
    row({ startTime: "08:30", endTime: "09:30" }),
  ]);
  assert.equal(clashes.length, 1);
});

test("touching lessons do not count as a clash", () => {
  // 09:00 end and 09:00 start is the normal shape of a school day.
  const clashes = findClashes([
    row({ startTime: "08:00", endTime: "09:00" }),
    row({ startTime: "09:00", endTime: "10:00" }),
  ]);
  assert.equal(clashes.length, 0);
});

test("the same times on different days are not a clash", () => {
  const clashes = findClashes([
    row({ dayOfWeek: 1, startTime: "08:00", endTime: "09:00" }),
    row({ dayOfWeek: 2, startTime: "08:00", endTime: "09:00" }),
  ]);
  assert.equal(clashes.length, 0);
});

test("a fully contained lesson is still a clash", () => {
  const clashes = findClashes([
    row({ startTime: "08:00", endTime: "10:00" }),
    row({ startTime: "08:30", endTime: "09:00" }),
  ]);
  assert.equal(clashes.length, 1);
});

test("an empty extraction is handled, not crashed on", () => {
  const { entries, dropped } = normaliseEntries([]);
  assert.deepEqual(entries, []);
  assert.deepEqual(dropped, []);
  assert.deepEqual(findClashes([]), []);
});
