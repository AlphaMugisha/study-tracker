/**
 * Typing a timetable out, one lesson per line.
 *
 *   npm run test:parse
 *
 * The parser is deliberately forgiving, which is exactly why it needs pinning:
 * every rule that accepts a sloppier line is also a rule that could accept the
 * wrong reading of a tidy one. The cases below are the shapes a person copying
 * from a printed timetable actually produces.
 */
import test from "node:test";
import assert from "node:assert/strict";

import { parseTimetableLines, parseDay } from "@/lib/timetable/parse-lines.ts";

const one = (line) => {
  const { entries, problems } = parseTimetableLines(line);
  assert.equal(problems.length, 0, `unexpected problem: ${problems[0]?.reason}`);
  assert.equal(entries.length, 1);
  return entries[0];
};

test("a day is a day however it is abbreviated", () => {
  for (const [token, day] of [["Monday", 1], ["mon", 1], ["MON", 1], ["Tues", 2],
                              ["wed", 3], ["Thurs", 4], ["fri", 5], ["1", 1], ["7", 7]]) {
    assert.equal(parseDay(token), day, token);
  }
  for (const token of ["", "Marchday", "0", "8", "Java"]) {
    assert.equal(parseDay(token), null, token);
  }
});

test("the times a person actually writes", () => {
  assert.deepEqual(
    ["08:00-09:40", "8:00 - 9:40", "8-9:40", "08.00–09.40", "8:00 to 9:40"]
      .map((t) => { const e = one(`Mon ${t} Java`); return `${e.startTime}-${e.endTime}`; }),
    ["08:00-09:40", "08:00-09:40", "08:00-09:40", "08:00-09:40", "08:00-09:40"],
  );
});

test("pm on the end of a range carries back to the start", () => {
  // "1:30 - 2:20 PM" is an afternoon double, not a lesson at half one in the
  // morning that ends fourteen hours later.
  const e = one("Mon 1:30 - 2:20 PM Software Engineering");
  assert.equal(e.startTime, "13:30");
  assert.equal(e.endTime, "14:20");
});

test("an explicit am on the start is not overridden", () => {
  const e = one("Mon 8:00 AM - 9:40 AM Embedded System Software");
  assert.equal(e.startTime, "08:00");
  assert.equal(e.endTime, "09:40");
});

test("the teacher can arrive in brackets, after a comma, or after a dash", () => {
  for (const line of [
    "Tue 10:00-11:40 Advanced Database (Eric)",
    "Tue 10:00-11:40 Advanced Database, Eric",
    "Tue 10:00-11:40 Advanced Database - Eric",
  ]) {
    const e = one(line);
    assert.equal(e.subject, "Advanced Database", line);
    assert.equal(e.teacher, "Eric", line);
  }
});

test("a subject with its own comma keeps everything but the last piece", () => {
  const e = one("Thu 08:00-09:40 Data Structures (DSA) (Eric)");
  assert.equal(e.subject, "Data Structures (DSA)");
  assert.equal(e.teacher, "Eric");
});

test("no teacher is null rather than an empty string", () => {
  const e = one("Fri 11:40-12:30 Student Led Clubs");
  assert.equal(e.teacher, null);
});

test("breaks and study periods are typed, not filed as lessons", () => {
  assert.equal(one("Mon 09:40-10:00 Short Break").activityType, "break");
  assert.equal(one("Mon 12:30-13:30 Lunch Break").activityType, "break");
  assert.equal(one("Mon 11:40-12:30 Supervised Self-Study").activityType, "study");
  assert.equal(one("Wed 16:20-17:20 Office Hours").activityType, "break");
  // A non-lesson carries its name in title; the database requires a lesson
  // to name a subject and would reject one that did not.
  const brk = one("Mon 09:40-10:00 Short Break");
  assert.equal(brk.subject, null);
  assert.equal(brk.title, "Short Break");
});

test("a lesson names a subject and no title", () => {
  const e = one("Mon 08:00-09:40 Embedded System Software (Willy)");
  assert.equal(e.activityType, "class");
  assert.equal(e.subject, "Embedded System Software");
  assert.equal(e.title, null);
  assert.equal(e.confidence, "high");
});

test("blank lines and comments pass without complaint", () => {
  const { entries, problems } = parseTimetableLines(
    "# Term 2\n\nMon 08:00-09:40 Java\n\n   \n# afternoon\nMon 13:30-15:10 Web3\n",
  );
  assert.equal(problems.length, 0);
  assert.equal(entries.length, 2);
});

test("a spreadsheet paste comes in on tabs", () => {
  const e = one("Wednesday\t10:00-10:50\tJava\tFaustin");
  assert.equal(e.dayOfWeek, 3);
  assert.equal(e.subject, "Java");
  assert.equal(e.teacher, "Faustin");
});

test("rows come back sorted by day then time, whatever order they were typed", () => {
  const { entries } = parseTimetableLines(
    "Fri 08:00-08:50 Software Engineering\nMon 13:30-15:10 Web3\nMon 08:00-09:40 Java",
  );
  assert.deepEqual(
    entries.map((e) => `${e.dayOfWeek} ${e.startTime}`),
    ["1 08:00", "1 13:30", "5 08:00"],
  );
});

/*
  The failures matter more than the successes. A line that cannot be read has
  to be reported with its number and its text — a timetable quietly missing
  Thursday is worse than one that refused to parse.
*/
test("a line that cannot be read is reported, never dropped", () => {
  const { entries, problems } = parseTimetableLines(
    [
      "Mon 08:00-09:40 Java",       // fine
      "Java 08:00-09:40",           // no day
      "Mon Java",                   // no times
      "Mon 10:00-09:00 Java",       // ends before it starts
      "Mon 08:00-09:40",            // no lesson
    ].join("\n"),
  );

  assert.equal(entries.length, 1);
  assert.equal(problems.length, 4);
  assert.deepEqual(problems.map((p) => p.lineNumber), [2, 3, 4, 5]);
  assert.match(problems[0].reason, /day/i);
  assert.match(problems[1].reason, /time/i);
  assert.match(problems[2].reason, /ends before/i);
  assert.match(problems[3].reason, /no lesson/i);
  // The text is echoed back so the line can be found in a long paste.
  assert.equal(problems[0].text, "Java 08:00-09:40");
});

test("empty input is an empty result, not a crash", () => {
  const { entries, problems } = parseTimetableLines("");
  assert.deepEqual(entries, []);
  assert.deepEqual(problems, []);
});
