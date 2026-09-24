/**
 * Unit tests for the presence description.
 *
 *   npm run test:presence
 *
 * The risk here is not a crash, it is a confident wrong sentence. A parent
 * reads "should be in class" and acts on it, so these tests are weighted
 * towards the boundaries where the answer flips: the last minute of a lesson,
 * the moment the sleep window opens, and the gap between the last bell and
 * homework time.
 *
 * The other thing they pin down is WORDING. Every headline must be phrased as
 * an expectation, never an observation — see the header of describe.ts. The
 * last test in this file enforces that mechanically across every state, so a
 * future edit cannot quietly turn a derived guess into a claim of fact.
 */
import test from "node:test";
import assert from "node:assert/strict";

import { describePresence, describeLastSeen } from "@/lib/presence/describe.ts";
import { resolveNow } from "@/lib/timetable/resolve.ts";

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
    startLabel: `${String(Math.floor(start / 60)).padStart(2, "0")}:${String(start % 60).padStart(2, "0")}`,
    endLabel: `${String(Math.floor(end / 60)).padStart(2, "0")}:${String(end % 60).padStart(2, "0")}`,
    durationMinutes: end - start,
  };
}

// Monday: 08:00 maths, 09:00 break, 09:15 physics, ends 10:15.
const MONDAY = [
  entry("Maths", 1, 8 * H, 9 * H),
  entry("Break", 1, 9 * H, 9 * H + 15, "break"),
  entry("Physics", 1, 9 * H + 15, 10 * H + 15),
];

/** Her settings: home by 30 min after the bell, plan runs to 21:00. */
const SETTINGS = { studyUntilMinutes: 21 * H, settleMinutes: 30 };

function at(nowMinutes, dayOfWeek = 1, entries = MONDAY) {
  return describePresence({
    state: resolveNow(entries, nowMinutes, dayOfWeek),
    nowMinutes,
    dayOfWeek,
    ...SETTINGS,
  });
}

test("mid-lesson says class, and names the subject", () => {
  const p = at(8 * H + 20);
  assert.equal(p.kind, "in_lesson");
  assert.equal(p.detail, "Maths");
  assert.equal(p.endsInMinutes, 40);
  assert.equal(p.atSchool, true);
});

test("a break is a break, not a lesson", () => {
  const p = at(9 * H + 5);
  assert.equal(p.kind, "at_break");
  // Still at school: the lock must not lift for fifteen minutes.
  assert.equal(p.atSchool, true);
  assert.match(p.detail, /Physics next/);
});

test("the last minute of a lesson is still the lesson", () => {
  assert.equal(at(8 * H + 59).kind, "in_lesson");
  assert.equal(at(9 * H).kind, "at_break");
});

test("early morning is asleep, not free", () => {
  const p = at(5 * H + 30);
  assert.equal(p.kind, "asleep");
  // Even asleep, it says when school starts — that is the useful half.
  assert.match(p.detail, /08:00/);
});

test("06:00 is the boundary: awake and getting ready", () => {
  assert.equal(at(5 * H + 59).kind, "asleep");
  assert.equal(at(6 * H).kind, "getting_ready");
});

test("45 minutes before the bell she should be heading in", () => {
  assert.equal(at(7 * H + 10).kind, "getting_ready");
  assert.equal(at(7 * H + 15).kind, "heading_in");
});

test("straight after the last bell she is travelling", () => {
  const p = at(10 * H + 20);
  assert.equal(p.kind, "heading_home");
  assert.equal(p.atSchool, false, "school mode must lift at the last bell");
});

test("settle time is respected before homework is expected", () => {
  // Last bell 10:15 + 30 min settle = 10:45.
  assert.equal(at(10 * H + 44).kind, "heading_home");
  assert.equal(at(10 * H + 45).kind, "study_time");
});

test("after the study window it is a free evening, not homework time", () => {
  assert.equal(at(20 * H + 59).kind, "study_time");
  assert.equal(at(21 * H).kind, "free_evening");
});

test("an hour after the study window, lights out", () => {
  assert.equal(at(21 * H + 59).kind, "free_evening");
  assert.equal(at(22 * H).kind, "asleep");
});

test("the weekend is a weekend", () => {
  const p = at(11 * H, 6);
  assert.equal(p.kind, "free_day");
  assert.equal(p.headline, "Weekend");
});

test("a weekday with no lessons does not claim it is the weekend", () => {
  assert.equal(at(11 * H, 3).headline, "No school today");
});

test("no timetable admits it rather than guessing", () => {
  const p = at(11 * H, 1, []);
  assert.equal(p.kind, "unknown");
  // `known: false` is the load-bearing part, not the wording — the card sizes
  // the headline off it, so that an absence is never set in display type
  // alongside real statuses. Asserting the sentence instead would break on
  // every copy edit while letting the actual regression through.
  assert.equal(p.known, false);
  assert.equal(p.progress, null);
});

test("a real status is marked known, an absence is not", () => {
  assert.equal(at(8 * H + 20).known, true, "mid-lesson is a real status");
  assert.equal(at(22 * H + 30).known, true, "asleep is a real inference");
  assert.equal(at(11 * H, 1, []).known, false, "no timetable is not a status");
});

test("progress is carried through mid-lesson and null otherwise", () => {
  // Maths runs 08:00-09:00, so 08:30 is exactly half way.
  assert.equal(at(8 * H + 30).progress, 0.5);
  assert.equal(at(5 * H).progress, null);
  assert.equal(at(10 * H + 50).progress, null);
});

test("a settle time longer than the travel window still lands on study_time", () => {
  // A 3-hour settle: travel covers the first 45 min, settling the rest, and
  // homework time starts exactly when she said it should.
  const long = { studyUntilMinutes: 21 * H, settleMinutes: 180 };
  const state = (n) =>
    describePresence({ state: resolveNow(MONDAY, n, 1), nowMinutes: n, dayOfWeek: 1, ...long });

  assert.equal(state(10 * H + 30).kind, "heading_home");
  assert.equal(state(11 * H + 30).kind, "settling");
  assert.equal(state(13 * H + 14).kind, "settling");
  assert.equal(state(13 * H + 15).kind, "study_time");
});

test("a lesson running past lights-out is still a lesson", () => {
  // Boarding school, evening prep, bad data — whatever the cause, the
  // timetable beats the clock. Claiming she is asleep during a timetabled
  // lesson would be the more embarrassing error.
  const late = [entry("Prep", 1, 21 * H, 23 * H, "study")];
  assert.equal(at(22 * H + 30, 1, late).kind, "in_lesson");
});

test("every headline is an expectation, never an observation", () => {
  // The rule from describe.ts, enforced. "She is in class" is a claim the app
  // cannot support; "should be in class" is one it can.
  const samples = [
    at(5 * H), at(6 * H + 30), at(7 * H + 20), at(8 * H + 20), at(9 * H + 5),
    at(10 * H + 20), at(10 * H + 50), at(21 * H + 10), at(22 * H + 30),
    at(11 * H, 6), at(11 * H, 1, []),
  ];

  for (const p of samples) {
    assert.doesNotMatch(
      p.headline,
      /\b(is|was|has been)\s+(in|at|on|asleep|awake|working|studying)\b/i,
      `"${p.headline}" states as fact something the app only infers`,
    );
    if (p.detail) {
      assert.doesNotMatch(
        p.detail,
        /\bshe is (in|at|asleep|working|studying)\b/i,
        `"${p.detail}" states as fact something the app only infers`,
      );
    }
  }
});

test("last seen degrades gracefully and never says never", () => {
  const now = new Date("2026-01-10T12:00:00Z");
  assert.equal(describeLastSeen(null, now), null);
  assert.equal(describeLastSeen("not a date", now), null);
  assert.equal(describeLastSeen("2026-01-10T11:59:40Z", now), "Active just now");
  assert.equal(describeLastSeen("2026-01-10T11:45:00Z", now), "Active 15 min ago");
  assert.equal(describeLastSeen("2026-01-10T09:00:00Z", now), "Active 3 hrs ago");
  assert.equal(describeLastSeen("2026-01-09T09:00:00Z", now), "Active yesterday");
  assert.equal(describeLastSeen("2026-01-07T09:00:00Z", now), "Active 3 days ago");
  assert.equal(describeLastSeen("2025-12-01T09:00:00Z", now), "Not active this week");
});
