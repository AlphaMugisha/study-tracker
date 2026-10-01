import type { AssignmentView, RevisionView } from "@/lib/tasks/ordering";
import { DAY_NAMES, type ResolvedEntry } from "@/lib/timetable/types";
import type { DayOfWeek } from "@/types/database";

/**
 * What to study, read off the timetable.
 *
 * The planner already answers "what do I start with" — but only from work
 * somebody typed in. Homework comes from a teacher; revision came from the
 * student remembering to write it down. Nothing in StudyFlow ever looked at
 * the timetable and said *Chemistry, because you have a double first thing
 * tomorrow and you have not opened it since Tuesday*. That is the one thing a
 * timetable can tell you that a to-do list cannot, and it was being used to
 * work out one number: when school finishes.
 *
 * This is the missing half. It is a pure function of the timetable plus what
 * is already queued, so it needs no database, no new table and no migration —
 * everything below is derived from rows that already exist.
 *
 * The rules, and why each one is here:
 *
 *   Coming up.        A lesson tomorrow is the single strongest signal on the
 *                     timetable: it is the only work with a fixed date that
 *                     nobody set as homework. Weighted by how soon, and by how
 *                     much of it there is — a double period is more to walk in
 *                     ready for than a single.
 *
 *   Just taught.      A subject covered today is cheapest to consolidate today.
 *                     This is the half of spaced repetition a timetable can
 *                     actually see.
 *
 *   Long gaps.        A subject last taught five days ago and returning
 *                     tomorrow has had the longest time to fade. A subject you
 *                     had this morning and have again tomorrow has not.
 *
 *   What is already   Homework due for a subject is already in tonight's plan;
 *   covered.          suggesting revision on top of it double-books the
 *                     evening. A revision task you queued yourself outranks
 *                     anything this could guess, so the subject drops out
 *                     rather than being recommended back to you.
 *
 *   Neglect.          A subject on the timetable with no homework, no queued
 *                     revision and no recorded session is the one nothing else
 *                     in the product will ever surface.
 *
 * Every suggestion carries its `reasons` as sentences, not a score. A ranked
 * list with no explanation is a horoscope — the student has to be able to
 * disagree with it, and can only do that if it says why.
 *
 * Deliberately NOT here: writing anything. A suggestion becomes real only when
 * the student queues it (`queueSuggestionAction`), so the plan never fills up
 * with guesses nobody asked for.
 */

/** A subject's lessons on one day, as a single fact. */
export type LessonRef = {
  day: DayOfWeek;
  /** "later today", "tomorrow", "Thursday". */
  when: string;
  /** Whole days from today. 0 = today, 1 = tomorrow. */
  inDays: number;
  startLabel: string;
  endLabel: string;
  /** Total taught minutes that day, across every period. */
  minutes: number;
  /** How many separate periods that day. */
  periods: number;
  /**
   * Whether those periods actually run into each other.
   *
   * Two periods on one day is a double only if they are adjacent. Monday's
   * Maths at 07:30 and again at 14:00 is two lessons with a whole school day
   * between them, and calling that "back to back" is a claim the timetable
   * flatly contradicts.
   */
  contiguous: boolean;
};

export type StudySuggestion = {
  subjectId: string;
  subjectName: string;
  colorToken: string | null;
  /** Suggested sitting length, sized from the lesson itself. */
  minutes: number;
  /** Ranking score. Exposed so a surprising order can be explained, not hidden. */
  score: number;
  /** The instruction, in one line. */
  headline: string;
  /** Why the timetable says so. Always at least one. */
  reasons: string[];
  /** The next time this subject is timetabled, if it is this week. */
  next: LessonRef | null;
  /** The last time it was, if it was this week. */
  last: LessonRef | null;
};

/**
 * A free or study period on the timetable — time the school has already given
 * her, which until now the product displayed and said nothing about.
 */
export type StudySlot = {
  id: string;
  kind: "free" | "study";
  label: string;
  when: string;
  inDays: number;
  startLabel: string;
  endLabel: string;
  minutes: number;
  /** What to spend it on. Null only when there is nothing worth suggesting. */
  suggestion: StudySuggestion | null;
};

export type StudyGuidance = {
  suggestions: StudySuggestion[];
  slots: StudySlot[];
};

// ---------------------------------------------------------------------------
// Weights
// ---------------------------------------------------------------------------
// Tuned so that "on tomorrow's timetable" beats every other single signal, but
// three weaker signals together can overtake it — a neglected subject last
// taught a week ago and returning on Thursday should not sit below a subject
// she had this morning and has again tomorrow.

const W = {
  /** Still to come today. Rare in the evening; decisive in the morning. */
  nextToday: 46,
  nextTomorrow: 40,
  nextInTwoDays: 18,
  nextLater: 6,
  /** Per period beyond the first in the next lesson's day, capped. */
  perExtraPeriod: 6,
  maxExtraPeriod: 12,
  /** Taught today — consolidate while it is fresh. */
  taughtToday: 24,
  taughtYesterday: 10,
  /** Five or more days since the last lesson, and it is coming back. */
  longGap: 12,
  /** Nothing else in the product will ever raise this subject. */
  nothingQueued: 12,
  /** Homework for it is already in tonight's plan. */
  homeworkDue: -18,
  neverStudied: 14,
  /** Ten or more days since a recorded session. */
  staleStudy: 8,
} as const;

/** A subject has to clear this to be worth putting on the screen. */
const MIN_SCORE = 10;

/** Shortest slot worth naming. Ten minutes is packing up, not studying. */
const MIN_SLOT_MINUTES = 20;

const DAYS_AHEAD = 6;

type Occurrence = {
  day: DayOfWeek;
  /** Whole days forward (`ahead`) or backward (`behind`) from today. */
  offset: number;
  startMinutes: number;
  endMinutes: number;
  startLabel: string;
  endLabel: string;
  minutes: number;
};

type SubjectRecord = {
  subjectId: string;
  name: string;
  colorToken: string | null;
  /** Every class in the next seven days, soonest first. */
  ahead: Occurrence[];
  /** Every class in the previous seven days, most recent first. */
  behind: Occurrence[];
  /** Typical single-period length, for sizing the sitting. */
  typicalMinutes: number;
};

export function suggestStudy({
  entries,
  today,
  nowMinutes = 0,
  assignments = [],
  revision = [],
  studiedDaysAgo = {},
  limit = 4,
}: {
  /** The whole active timetable, every day — not just today's. */
  entries: ResolvedEntry[];
  today: DayOfWeek;
  /**
   * Minutes since midnight. Splits today into what has been taught and what is
   * still to come: at 19:00 today's Physics is something to consolidate, at
   * 08:00 it is something to be ready for.
   */
  nowMinutes?: number;
  assignments?: AssignmentView[];
  revision?: RevisionView[];
  /** Whole days since the last recorded session, by subject id. */
  studiedDaysAgo?: Record<string, number>;
  limit?: number;
}): StudyGuidance {
  const subjects = indexSubjects(entries, today, nowMinutes);
  if (subjects.size === 0) return { suggestions: [], slots: [] };

  const openHomework = countBySubject(
    assignments.filter((a) => a.status !== "completed"),
    (a) => a.subject_id,
  );
  const openRevision = countBySubject(
    revision.filter((r) => r.status !== "completed"),
    (r) => r.subject_id,
  );

  const suggestions: StudySuggestion[] = [];
  for (const record of subjects.values()) {
    // Revision she queued herself is already in tonight's plan, under a title
    // she chose. Recommending the same subject back to her is exactly the
    // duplication this screen exists to avoid, so it is an exclusion rather
    // than a penalty — no weight can be tuned to make a repeat useful.
    if ((openRevision.get(record.subjectId) ?? 0) > 0) continue;

    const suggestion = scoreSubject(record, {
      homework: openHomework.get(record.subjectId) ?? 0,
      studiedDaysAgo: studiedDaysAgo[record.subjectId],
    });
    if (suggestion.score >= MIN_SCORE) suggestions.push(suggestion);
  }

  // Name as the tie-break, so the same week never reshuffles between renders.
  suggestions.sort((a, b) => b.score - a.score || a.subjectName.localeCompare(b.subjectName));

  const ranked = suggestions.slice(0, limit);
  return { suggestions: ranked, slots: buildSlots(entries, today, nowMinutes, subjects, ranked) };
}

// ---------------------------------------------------------------------------
// Reading the timetable
// ---------------------------------------------------------------------------

/**
 * Every subject on the timetable, with its lessons sorted into what is still
 * coming and what has already happened.
 *
 * A lesson happening *right now* counts as neither: it is not something to
 * prepare for and not yet something to go over.
 */
function indexSubjects(
  entries: ResolvedEntry[],
  today: DayOfWeek,
  nowMinutes: number,
): Map<string, SubjectRecord> {
  const subjects = new Map<string, SubjectRecord>();

  for (const entry of entries) {
    if (entry.activityType !== "class" || !entry.subjectId) continue;

    let record = subjects.get(entry.subjectId);
    if (!record) {
      record = {
        subjectId: entry.subjectId,
        name: entry.subjectName ?? entry.label,
        colorToken: entry.colorToken,
        ahead: [],
        behind: [],
        typicalMinutes: 0,
      };
      subjects.set(entry.subjectId, record);
    }

    const occurrence: Occurrence = {
      day: entry.dayOfWeek,
      offset: 0,
      startMinutes: entry.startMinutes,
      endMinutes: entry.endMinutes,
      startLabel: entry.startLabel,
      endLabel: entry.endLabel,
      minutes: entry.durationMinutes,
    };

    const ahead = (entry.dayOfWeek - today + 7) % 7;
    if (ahead > 0 || entry.startMinutes >= nowMinutes) {
      record.ahead.push({ ...occurrence, offset: ahead });
    }

    const behind = (today - entry.dayOfWeek + 7) % 7;
    if (behind > 0 || entry.endMinutes <= nowMinutes) {
      record.behind.push({ ...occurrence, offset: behind });
    }

    // The longest period wins rather than the mean: a subject taught as one
    // double and three singles should be revised in double-sized sittings.
    record.typicalMinutes = Math.max(record.typicalMinutes, entry.durationMinutes);
  }

  for (const record of subjects.values()) {
    record.ahead.sort((a, b) => a.offset - b.offset || a.startMinutes - b.startMinutes);
    record.behind.sort((a, b) => a.offset - b.offset || b.startMinutes - a.startMinutes);
  }

  return subjects;
}

/** Collapse a day's worth of a subject's periods into one fact. */
function toLessonRef(
  occurrences: Occurrence[],
  offset: number,
  direction: "ahead" | "behind",
): LessonRef | null {
  const sameDay = occurrences.filter((o) => o.offset === offset);
  if (sameDay.length === 0) return null;

  const first = sameDay[0];
  const last = sameDay[sameDay.length - 1];

  // Contiguity is checked against the clock rather than assumed from the
  // count: in time order, each period has to begin where the previous ended.
  const inTimeOrder = [...sameDay].sort((a, b) => a.startMinutes - b.startMinutes);
  const contiguous = inTimeOrder.every(
    (o, i) => i === 0 || o.startMinutes === inTimeOrder[i - 1].endMinutes,
  );

  return {
    day: first.day,
    when: whenLabel(offset, first.day, direction),
    inDays: offset,
    // `behind` is sorted latest-first, so the earlier bound is the last entry.
    startLabel: direction === "ahead" ? first.startLabel : last.startLabel,
    endLabel: direction === "ahead" ? last.endLabel : first.endLabel,
    minutes: sameDay.reduce((total, o) => total + o.minutes, 0),
    periods: sameDay.length,
    contiguous,
  };
}

function whenLabel(offset: number, day: DayOfWeek, direction: "ahead" | "behind"): string {
  if (offset === 0) return direction === "ahead" ? "later today" : "earlier today";
  if (offset === 1) return direction === "ahead" ? "tomorrow" : "yesterday";
  return DAY_NAMES[day] ?? `in ${offset} days`;
}

// ---------------------------------------------------------------------------
// Scoring
// ---------------------------------------------------------------------------

function scoreSubject(
  record: SubjectRecord,
  queued: { homework: number; studiedDaysAgo: number | undefined },
): StudySuggestion {
  const next = record.ahead.length > 0 ? toLessonRef(record.ahead, record.ahead[0].offset, "ahead") : null;
  const last =
    record.behind.length > 0 ? toLessonRef(record.behind, record.behind[0].offset, "behind") : null;

  const reasons: string[] = [];
  let score = 0;

  // --- what is coming ------------------------------------------------------
  if (next) {
    if (next.inDays === 0) {
      score += W.nextToday;
      reasons.push(`You still have ${record.name} today at ${next.startLabel}.`);
    } else if (next.inDays === 1) {
      score += W.nextTomorrow;
      reasons.push(`${record.name} is on tomorrow's timetable at ${next.startLabel}.`);
    } else if (next.inDays === 2) {
      score += W.nextInTwoDays;
      reasons.push(`Next ${record.name} is ${next.when} at ${next.startLabel}.`);
    } else {
      score += W.nextLater;
      reasons.push(`Next ${record.name} is ${next.when}.`);
    }

    if (next.periods > 1) {
      score += Math.min(W.maxExtraPeriod, (next.periods - 1) * W.perExtraPeriod);
      reasons.push(
        next.contiguous
          ? `That is ${next.periods} periods back to back — ${next.minutes} minutes of it.`
          : `You have it ${next.periods} times that day — ${next.minutes} minutes in total.`,
      );
    }
  }

  // --- what has just been taught -------------------------------------------
  if (last?.inDays === 0) {
    score += W.taughtToday;
    reasons.push(
      last.periods > 1
        ? `You had ${last.periods} periods of it today. It is cheapest to go over now.`
        : `It was taught today at ${last.startLabel}. It is cheapest to go over now.`,
    );
  } else if (last?.inDays === 1) {
    score += W.taughtYesterday;
    reasons.push("It was taught yesterday.");
  }

  // A week is the longest a gap can be on a repeating timetable, so "five or
  // more days" is the tail of the distribution, not an arbitrary threshold.
  if (last && last.inDays >= 5 && next) {
    score += W.longGap;
    reasons.push(`You have not had a ${record.name} lesson since ${last.when}.`);
  }

  // --- what is already covered ---------------------------------------------
  // Homework is a penalty rather than an exclusion: an essay due Friday is
  // not the same as being ready for Thursday's lesson, so the subject stays
  // on the list, just below the ones nothing covers.
  if (queued.homework > 0) {
    score += W.homeworkDue;
    reasons.push("Tonight's plan already has homework for it.");
  } else {
    score += W.nothingQueued;
    reasons.push("No homework set and nothing queued — this is the only way it gets studied.");
  }

  // --- what has actually been done -----------------------------------------
  const studied = queued.studiedDaysAgo;
  if (studied === undefined) {
    score += W.neverStudied;
    reasons.push("No study session recorded for it yet.");
  } else if (studied >= 10) {
    score += W.staleStudy;
    reasons.push(`Last studied ${studied} days ago.`);
  }

  return {
    subjectId: record.subjectId,
    subjectName: record.name,
    colorToken: record.colorToken,
    minutes: sittingMinutes(record.typicalMinutes, next),
    score,
    headline: headlineFor(record.name, next, last),
    reasons,
    next,
    last,
  };
}

/**
 * How long to sit with it.
 *
 * Three quarters of a period, because revision is recall rather than being
 * taught, and clamped into the same 20–45 range the evening planner splits
 * work into — a suggestion the planner would immediately cut in half is not a
 * suggestion, it is two.
 */
function sittingMinutes(typicalMinutes: number, next: LessonRef | null): number {
  const base = typicalMinutes > 0 ? typicalMinutes * 0.75 : 30;
  const sized = next && next.periods > 1 ? base * 1.2 : base;
  return Math.min(45, Math.max(20, Math.round(sized / 5) * 5));
}

function headlineFor(name: string, next: LessonRef | null, last: LessonRef | null): string {
  if (next?.inDays === 0) return `${name}, before this afternoon`;
  if (next?.inDays === 1) return `${name}, ready for tomorrow`;
  if (last?.inDays === 0) return `${name}, while today is fresh`;
  if (next) return `${name}, before ${next.when}`;
  return `Revise ${name}`;
}

// ---------------------------------------------------------------------------
// Free and study periods
// ---------------------------------------------------------------------------

/**
 * The free and study periods still ahead this week, each with something to do
 * in it.
 *
 * The pairing is not just "the top suggestion": a free period on Wednesday
 * morning is best spent on something taught Wednesday afternoon or Thursday.
 * So each slot takes the highest-ranked subject whose next lesson *after that
 * slot* is soonest, which is the only way this can say "you are free at 11:05
 * and you have Chemistry at 14:00".
 */
function buildSlots(
  entries: ResolvedEntry[],
  today: DayOfWeek,
  nowMinutes: number,
  subjects: Map<string, SubjectRecord>,
  ranked: StudySuggestion[],
): StudySlot[] {
  if (ranked.length === 0) return [];

  // The slot and the minute it ends, kept together: the pairing below needs to
  // ask "what lesson comes after this" and minutes are the engine's unit —
  // comparing the `HH:MM` labels happens to work while they stay zero-padded
  // and silently stops working the moment they do not.
  const found: Array<{ slot: StudySlot; endMinutes: number }> = [];

  for (const entry of entries) {
    if (entry.activityType !== "free" && entry.activityType !== "study") continue;
    if (entry.durationMinutes < MIN_SLOT_MINUTES) continue;

    const offset = (entry.dayOfWeek - today + 7) % 7;
    if (offset === 0 && entry.startMinutes < nowMinutes) continue;
    if (offset > DAYS_AHEAD) continue;

    found.push({
      endMinutes: entry.endMinutes,
      slot: {
        id: entry.id,
        kind: entry.activityType,
        label: entry.activityType === "study" ? entry.label : "Free period",
        when: whenLabel(offset, entry.dayOfWeek, "ahead"),
        inDays: offset,
        startLabel: entry.startLabel,
        endLabel: entry.endLabel,
        minutes: entry.durationMinutes,
        suggestion: null,
      },
    });
  }

  found.sort(
    (a, b) => a.slot.inDays - b.slot.inDays || a.endMinutes - b.endMinutes,
  );

  // Spread the recommendations across slots rather than naming the same
  // subject four times: two free periods on one day are two chances, not one.
  // If they run out, they are reused rather than leaving a slot blank.
  const used = new Set<string>();
  for (const { slot, endMinutes } of found) {
    const pick =
      pickForSlot(slot.inDays, endMinutes, subjects, ranked, used) ??
      pickForSlot(slot.inDays, endMinutes, subjects, ranked, new Set());
    if (pick) {
      slot.suggestion = pick;
      used.add(pick.subjectId);
    }
  }

  return found.map((f) => f.slot);
}

function pickForSlot(
  slotInDays: number,
  slotEndMinutes: number,
  subjects: Map<string, SubjectRecord>,
  ranked: StudySuggestion[],
  used: Set<string>,
): StudySuggestion | null {
  let best: StudySuggestion | null = null;
  let bestGap = Number.POSITIVE_INFINITY;

  for (const suggestion of ranked) {
    if (used.has(suggestion.subjectId)) continue;

    const record = subjects.get(suggestion.subjectId);
    const following = record?.ahead.find(
      (o) =>
        o.offset > slotInDays ||
        (o.offset === slotInDays && o.startMinutes >= slotEndMinutes),
    );

    // A subject with no lesson left this week still counts, just last: the gap
    // is the far end of the window rather than "never". `ranked` is already in
    // score order, so an equal gap keeps the better-scoring subject.
    const gap = following ? following.offset - slotInDays : DAYS_AHEAD + 1;
    if (gap < bestGap) {
      best = suggestion;
      bestGap = gap;
    }
  }

  return best;
}

// ---------------------------------------------------------------------------

function countBySubject<T>(rows: T[], subjectId: (row: T) => string | null): Map<string, number> {
  const counts = new Map<string, number>();
  for (const row of rows) {
    const id = subjectId(row);
    if (id) counts.set(id, (counts.get(id) ?? 0) + 1);
  }
  return counts;
}
