/**
 * Unit tests for the study suggester.
 *
 *   npm run test:suggest
 *
 * Pure, like the planner, so this needs no database and no server. What it is
 * really testing is that the recommendation is *derived from the timetable*
 * rather than from a fixed list of subjects — every assertion below changes
 * only the timetable and expects the answer to change with it.
 *
 * The other thing under test is the promise the UI makes: a suggestion always
 * carries the reason it was made. A ranking with no reasons cannot be argued
 * with, and this is a tool for a fifteen-year-old, not an oracle.
 */
import test from "node:test";
import assert from "node:assert/strict";

import { suggestStudy } from "@/lib/planner/suggest-study.ts";

const WED = 3;
const THU = 4;
const FRI = 5;
const MON = 1;
const EVENING = 19 * 60;

function hm(label) {
  const [h, m] = label.split(":");
  return Number(h) * 60 + Number(m);
}

/** A lesson. Subject id is derived from the name so fixtures stay readable. */
function lesson(day, subject, start, end) {
  return {
    id: `${subject}-${day}-${start}`,
    activityType: "class",
    label: subject,
    detail: null,
    teacher: null,
    subjectName: subject,
    subjectId: `sub-${subject}`,
    colorToken: "chart-1",
    room: null,
    dayOfWeek: day,
    startMinutes: hm(start),
    endMinutes: hm(end),
    startLabel: start,
    endLabel: end,
    durationMinutes: hm(end) - hm(start),
  };
}

/** A free or study period — time the school has already set aside. */
function slot(day, kind, start, end, label = "Private study") {
  return {
    id: `${kind}-${day}-${start}`,
    activityType: kind,
    label,
    detail: null,
    teacher: null,
    subjectName: null,
    subjectId: null,
    colorToken: null,
    room: null,
    dayOfWeek: day,
    startMinutes: hm(start),
    endMinutes: hm(end),
    startLabel: start,
    endLabel: end,
    durationMinutes: hm(end) - hm(start),
  };
}

function hw(subject, { status = "not_started" } = {}) {
  return {
    id: `hw-${subject}`,
    subject_id: `sub-${subject}`,
    title: `${subject} sheet`,
    status,
    priority: "medium",
    estimated_minutes: 30,
    overdue: false,
    due_date: "2026-10-02",
    due_time: null,
    dueAt: new Date("2026-10-02T23:59:59"),
    subject: { name: subject, color_token: "chart-1" },
  };
}

function rev(subject, { status = "not_started" } = {}) {
  return {
    id: `rev-${subject}`,
    subject_id: `sub-${subject}`,
    title: `${subject} recall`,
    status,
    priority: "low",
    estimated_minutes: 30,
    subject: { name: subject, color_token: "chart-1" },
  };
}

const ask = (overrides) =>
  suggestStudy({ today: WED, nowMinutes: EVENING, ...overrides });

const names = (guidance) => guidance.suggestions.map((s) => s.subjectName);

// ---------------------------------------------------------------------------
// It reads the timetable
// ---------------------------------------------------------------------------

test("a lesson tomorrow outranks the same lesson later in the week", () => {
  const guidance = ask({
    entries: [
      lesson(FRI, "Maths", "11:00", "12:00"),
      lesson(THU, "Chemistry", "09:20", "10:20"),
    ],
  });
  assert.deepEqual(names(guidance), ["Chemistry", "Maths"]);
});

test("a double period tomorrow outranks a single tomorrow", () => {
  const guidance = ask({
    entries: [
      lesson(THU, "French", "14:00", "15:00"),
      lesson(THU, "Chemistry", "09:20", "10:20"),
      lesson(THU, "Chemistry", "10:20", "11:20"),
    ],
  });
  assert.equal(names(guidance)[0], "Chemistry");
  const chemistry = guidance.suggestions[0];
  assert.equal(chemistry.next.periods, 2);
  assert.equal(chemistry.next.minutes, 120);
  assert.ok(
    chemistry.reasons.some((r) => r.includes("2 periods")),
    `expected the double to be given as a reason, got ${JSON.stringify(chemistry.reasons)}`,
  );
});

test("names the day and time, so the reason can be checked against the timetable", () => {
  const guidance = ask({ entries: [lesson(THU, "Chemistry", "09:20", "10:20")] });
  const [chemistry] = guidance.suggestions;
  assert.equal(chemistry.next.inDays, 1);
  assert.equal(chemistry.next.when, "tomorrow");
  assert.ok(chemistry.reasons.some((r) => r.includes("09:20")));
});

test("a subject taught today is offered for consolidation", () => {
  // Wednesday evening: this morning's lesson is behind her, not ahead.
  const guidance = ask({ entries: [lesson(WED, "Biology", "08:30", "09:30")] });
  const [biology] = guidance.suggestions;
  assert.equal(biology.last.inDays, 0);
  assert.equal(biology.next, null, "a Wednesday-only subject has nothing ahead this week");
  assert.ok(
    biology.reasons.some((r) => r.includes("taught today")),
    `expected a consolidation reason, got ${JSON.stringify(biology.reasons)}`,
  );
});

test("a lesson still to come today counts as ahead, not behind", () => {
  const guidance = suggestStudy({
    today: WED,
    nowMinutes: 8 * 60, // 08:00, before the bell
    entries: [lesson(WED, "Biology", "08:30", "09:30")],
  });
  const [biology] = guidance.suggestions;
  assert.equal(biology.next.inDays, 0);
  assert.equal(biology.next.when, "later today");
  assert.equal(biology.last, null);
});

test("a long gap since the last lesson is a reason in itself", () => {
  const guidance = ask({
    entries: [
      lesson(FRI, "Physics", "11:00", "12:00"), // ahead 2
      lesson(FRI, "Physics", "09:00", "10:00"), // and last taught 5 days ago
    ],
  });
  const [physics] = guidance.suggestions;
  assert.equal(physics.last.inDays, 5);
  assert.ok(physics.reasons.some((r) => r.includes("not had a Physics lesson")));
});

test("breaks, free periods and untimetabled rows are never suggested as subjects", () => {
  const guidance = ask({
    entries: [
      slot(THU, "free", "11:00", "12:00"),
      { ...slot(THU, "break", "10:00", "10:20", "Break"), activityType: "break" },
      { ...slot(THU, "other", "15:00", "16:00", "Assembly"), activityType: "other" },
    ],
  });
  assert.deepEqual(guidance.suggestions, [], "nothing on that timetable is a subject");
});

test("no timetable means no suggestions, not a crash", () => {
  const guidance = ask({ entries: [] });
  assert.deepEqual(guidance.suggestions, []);
  assert.deepEqual(guidance.slots, []);
});

// ---------------------------------------------------------------------------
// It does not double up on what is already planned
// ---------------------------------------------------------------------------

test("a subject she has already queued revision for is not suggested back to her", () => {
  const entries = [
    lesson(THU, "Chemistry", "09:20", "10:20"),
    lesson(THU, "French", "14:00", "15:00"),
  ];
  const before = ask({ entries });
  assert.ok(before.suggestions.some((s) => s.subjectName === "Chemistry"));

  const after = ask({ entries, revision: [rev("Chemistry")] });
  assert.deepEqual(names(after), ["French"]);
});

test("completed revision does not suppress the subject — that is the point of it being done", () => {
  const guidance = ask({
    entries: [lesson(THU, "Chemistry", "09:20", "10:20")],
    revision: [rev("Chemistry", { status: "completed" })],
  });
  assert.deepEqual(names(guidance), ["Chemistry"]);
});

test("a subject with homework already in tonight's plan ranks below one with nothing set", () => {
  const guidance = ask({
    entries: [
      lesson(THU, "Chemistry", "09:20", "10:20"),
      lesson(THU, "French", "09:20", "10:20"),
    ],
    assignments: [hw("Chemistry")],
  });
  assert.deepEqual(names(guidance), ["French", "Chemistry"]);
  const chemistry = guidance.suggestions[1];
  assert.ok(chemistry.reasons.some((r) => r.includes("already has homework")));
});

test("a subject nothing else would ever raise says so", () => {
  const guidance = ask({ entries: [lesson(THU, "Latin", "09:20", "10:20")] });
  assert.ok(
    guidance.suggestions[0].reasons.some((r) => r.includes("only way it gets studied")),
  );
});

test("recorded sessions damp a subject that has actually been studied", () => {
  const entries = [
    lesson(THU, "Chemistry", "09:20", "10:20"),
    lesson(THU, "French", "09:20", "10:20"),
  ];
  const guidance = ask({
    entries,
    // French worked on yesterday; Chemistry not for a fortnight.
    studiedDaysAgo: { "sub-French": 1, "sub-Chemistry": 14 },
  });
  assert.deepEqual(names(guidance), ["Chemistry", "French"]);
  assert.ok(guidance.suggestions[0].reasons.some((r) => r.includes("14 days ago")));
});

// ---------------------------------------------------------------------------
// Every suggestion justifies itself
// ---------------------------------------------------------------------------

test("no suggestion is ever made without a reason", () => {
  const guidance = ask({
    entries: [
      lesson(THU, "Chemistry", "09:20", "10:20"),
      lesson(FRI, "Maths", "11:00", "12:00"),
      lesson(WED, "Biology", "08:30", "09:30"),
      lesson(MON, "Physics", "09:00", "10:00"),
    ],
  });
  assert.ok(guidance.suggestions.length > 0);
  for (const suggestion of guidance.suggestions) {
    assert.ok(suggestion.reasons.length > 0, `${suggestion.subjectName} has no reasons`);
    assert.ok(suggestion.headline.length > 0);
    assert.ok(suggestion.minutes >= 20 && suggestion.minutes <= 45,
      `${suggestion.subjectName} suggested ${suggestion.minutes} min, outside a sitting`);
  }
});

test("the sitting is sized from the lesson, and stays within one planner block", () => {
  const short = ask({ entries: [lesson(THU, "Maths", "09:00", "09:40")] });
  const long = ask({ entries: [lesson(THU, "Art", "09:00", "11:00")] });
  assert.equal(short.suggestions[0].minutes, 30, "40-minute period → 30-minute sitting");
  assert.equal(long.suggestions[0].minutes, 45, "a two-hour period is still capped at 45");
});

test("the order is stable when scores tie", () => {
  const entries = [
    lesson(THU, "Zoology", "09:20", "10:20"),
    lesson(THU, "Art", "09:20", "10:20"),
  ];
  assert.deepEqual(names(ask({ entries })), ["Art", "Zoology"]);
  assert.deepEqual(names(ask({ entries: [...entries].reverse() })), ["Art", "Zoology"]);
});

test("the list is capped, so a twelve-subject timetable is not twelve recommendations", () => {
  const entries = ["A", "B", "C", "D", "E", "F", "G", "H"].map((s) =>
    lesson(THU, s, "09:20", "10:20"),
  );
  assert.equal(ask({ entries }).suggestions.length, 4);
  assert.equal(ask({ entries, limit: 2 }).suggestions.length, 2);
});

// ---------------------------------------------------------------------------
// Free and study periods
// ---------------------------------------------------------------------------

test("a free period is paired with the subject next taught after it", () => {
  const guidance = ask({
    entries: [
      slot(THU, "free", "11:00", "12:00"),
      lesson(THU, "Chemistry", "14:00", "15:00"), // same day, after the slot
      lesson(MON, "Physics", "09:00", "10:00"), // not until next week
    ],
  });
  assert.equal(guidance.slots.length, 1);
  assert.equal(guidance.slots[0].suggestion.subjectName, "Chemistry");
  assert.equal(guidance.slots[0].when, "tomorrow");
  assert.equal(guidance.slots[0].minutes, 60);
});

test("a lesson earlier the same day does not count as following a free period", () => {
  const guidance = ask({
    entries: [
      slot(THU, "study", "14:00", "15:00"),
      lesson(THU, "Chemistry", "09:00", "10:00"), // before the slot
      lesson(FRI, "Maths", "09:00", "10:00"), // the next thing after it
    ],
  });
  assert.equal(guidance.slots[0].suggestion.subjectName, "Maths");
});

test("free periods already past today are not offered", () => {
  const guidance = suggestStudy({
    today: WED,
    nowMinutes: 13 * 60, // 13:00
    entries: [
      slot(WED, "free", "09:00", "10:00"), // gone
      slot(WED, "free", "14:00", "15:00"), // still to come
      lesson(THU, "Chemistry", "09:20", "10:20"),
    ],
  });
  assert.equal(guidance.slots.length, 1);
  assert.equal(guidance.slots[0].startLabel, "14:00");
});

test("a slot too short to study in is not offered", () => {
  const guidance = ask({
    entries: [
      slot(THU, "free", "11:00", "11:10"),
      lesson(THU, "Chemistry", "14:00", "15:00"),
    ],
  });
  assert.deepEqual(guidance.slots, []);
});

test("two free periods on one day get two different subjects", () => {
  const guidance = ask({
    entries: [
      slot(THU, "free", "09:00", "10:00"),
      slot(THU, "free", "11:00", "12:00"),
      lesson(THU, "Chemistry", "14:00", "15:00"),
      lesson(FRI, "Maths", "09:00", "10:00"),
    ],
  });
  assert.equal(guidance.slots.length, 2);
  const paired = guidance.slots.map((s) => s.suggestion.subjectName);
  assert.equal(new Set(paired).size, 2, `both slots got ${paired[0]}`);
});

test("slots are offered in the order they happen", () => {
  const guidance = ask({
    entries: [
      slot(FRI, "free", "09:00", "10:00"),
      slot(THU, "free", "11:00", "12:00"),
      lesson(THU, "Chemistry", "14:00", "15:00"),
      lesson(FRI, "Maths", "11:00", "12:00"),
    ],
  });
  assert.deepEqual(
    guidance.slots.map((s) => s.inDays),
    [1, 2],
  );
});

test("free periods are not offered when there is nothing to put in them", () => {
  const guidance = ask({ entries: [slot(THU, "free", "11:00", "12:00")] });
  assert.deepEqual(guidance.slots, [], "a free period with no subjects is just free time");
});

test("two periods of a subject on one day are only called a double if they are adjacent", () => {
  const adjacent = ask({
    entries: [
      lesson(THU, "Chemistry", "09:20", "10:20"),
      lesson(THU, "Chemistry", "10:20", "11:20"),
    ],
  });
  assert.equal(adjacent.suggestions[0].next.contiguous, true);
  assert.ok(adjacent.suggestions[0].reasons.some((r) => r.includes("back to back")));

  const split = ask({
    entries: [
      lesson(THU, "Chemistry", "07:30", "08:30"),
      lesson(THU, "Chemistry", "14:00", "15:00"), // a whole school day apart
    ],
  });
  assert.equal(split.suggestions[0].next.contiguous, false);
  assert.ok(
    split.suggestions[0].reasons.some((r) => r.includes("2 times that day")),
    "a morning and an afternoon lesson is not a double period",
  );
  assert.ok(
    !split.suggestions[0].reasons.some((r) => r.includes("back to back")),
    "the timetable flatly contradicts that",
  );
});
