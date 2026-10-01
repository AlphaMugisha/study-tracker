import { byUrgency, type AssignmentView, type RevisionView } from "@/lib/tasks/ordering";
import type { StudySuggestion } from "@/lib/planner/suggest-study";
import { minutesToLabel } from "@/lib/timetable/types";

/**
 * The evening planner.
 *
 * Replaces `lib/temporary/home-plan-preview.ts`, which took the top four
 * tasks, laid them end to end from school-end + 30, and stopped. It had no
 * finishing time, so it would schedule past midnight; it split nothing; and it
 * dropped everything past the fourth task without saying so.
 *
 * The rules here, and why each one exists:
 *
 *   A cutoff.        `studyUntil` is hard. Work that will not fit before it is
 *                    returned as `deferred` rather than quietly discarded —
 *                    "you cannot finish all of this tonight" is the single
 *                    most useful thing this can tell her, and the old preview
 *                    was structurally incapable of saying it.
 *
 *   Splitting.       Anything longer than MAX_BLOCK is cut into chunks. A
 *                    90-minute essay shown as one 90-minute block is a wall;
 *                    the same essay as two 45s with a break is a plan.
 *
 *   Earned breaks.   A break follows accumulated work, not every task. Three
 *                    ten-minute tasks in a row do not need two breaks between
 *                    them.
 *
 *   Order.           `byUrgency` — overdue first, then due date, then
 *                    priority. The planner does not invent its own ordering;
 *                    it is the same sort the homework list uses, so the top of
 *                    one is the top of the other.
 *
 *   Filling.         Whatever is left of the window after the real work is
 *                    offered to `suggestions` — revision the timetable asked
 *                    for. `spareMinutes` was previously reported as a number
 *                    and nothing else, so an empty evening was described as
 *                    empty rather than used. Where those come from, and why
 *                    they are ranked as they are, is `suggest-study.ts`.
 *
 * Deliberately NOT here: persistence. This is a pure function of its inputs so
 * it can be tested without a database, and so re-planning is free. Recording
 * what was actually worked on is `study_sessions`, a separate concern.
 */

/** Longest single sitting before a break is offered. */
const MAX_BLOCK_MINUTES = 45;
/** Work accumulated before a break is inserted. */
const BREAK_AFTER_MINUTES = 50;
const BREAK_MINUTES = 15;
/** Below this, a trailing chunk is merged into the previous one instead of
 *  becoming a block of its own — a 4-minute block is noise. */
const MIN_CHUNK_MINUTES = 10;

/**
 * Least time worth offering a suggestion in, and the most suggestions to fill
 * with.
 *
 * The cap matters. A free Friday evening would otherwise be laid out as five
 * hours of revision nobody asked for, and a plan that reads as a punishment
 * gets ignored wholesale. Three blocks is an offer; eight is a sentence.
 */
const MIN_SUGGESTION_MINUTES = 20;
const MAX_SUGGESTED_BLOCKS = 3;

/** `suggested` is revision this proposed; `revision` is revision she queued. */
export type PlanBlockKind = "homework" | "revision" | "break" | "suggested";

export type PlanBlock = {
  id: string;
  /** The row this block works on. Several blocks can share one. */
  taskId: string | null;
  /** Set on `suggested` blocks, which have no row yet — this is what lets one
   *  be queued as real revision straight from the timeline. */
  subjectId: string | null;
  kind: PlanBlockKind;
  label: string;
  detail: string | null;
  /** Why this block is here. Only ever set on `suggested`. */
  reason: string | null;
  startMinutes: number;
  startLabel: string;
  endLabel: string;
  minutes: number;
  /** "Part 2 of 3" when a task was split; null when it is whole. */
  part: { index: number; total: number } | null;
};

export type DeferredTask = {
  taskId: string;
  kind: "homework" | "revision";
  label: string;
  detail: string | null;
  minutes: number;
  /** Minutes that did fit tonight; the rest rolls over. */
  scheduledMinutes: number;
  dueLabel: string | null;
  overdue: boolean;
};

export type EveningPlan = {
  blocks: PlanBlock[];
  deferred: DeferredTask[];
  startsAt: string | null;
  endsBy: string;
  /** Minutes of actual work scheduled, excluding breaks. */
  workMinutes: number;
  /** How much of `workMinutes` is suggested revision rather than set work. */
  suggestedMinutes: number;
  /** Minutes of the window left unused. */
  spareMinutes: number;
  /** The single answer to "what do I start with", or null when there is
   *  nothing to do and nothing worth suggesting. */
  startWith: {
    label: string;
    detail: string | null;
    minutes: number;
    /** Set when the answer came from the timetable rather than a deadline. */
    reason: string | null;
  } | null;
};

type Candidate = {
  id: string;
  kind: "homework" | "revision";
  label: string;
  detail: string | null;
  minutes: number;
  dueLabel: string | null;
  overdue: boolean;
};

export function buildEveningPlan({
  schoolEndsMinutes,
  settleMinutes,
  studyUntilMinutes,
  assignments,
  revision,
  suggestions = [],
  nowMinutes,
}: {
  /** Minutes since midnight when the last timetabled entry finishes. */
  schoolEndsMinutes: number | null;
  settleMinutes: number;
  studyUntilMinutes: number;
  assignments: AssignmentView[];
  revision: RevisionView[];
  /** Ranked timetable-driven revision, used to fill whatever is left of the
   *  window. Nothing is taken from here if homework had to be deferred. */
  suggestions?: StudySuggestion[];
  /** If the evening has already begun, start from now rather than from the
   *  school bell — a plan that starts an hour ago is not a plan. */
  nowMinutes?: number;
}): EveningPlan {
  const candidates: Candidate[] = [
    ...assignments
      .filter((a) => a.status !== "completed")
      .sort(byUrgency)
      .map((a) => ({
        id: a.id,
        kind: "homework" as const,
        label: a.title,
        detail: a.subject?.name ?? null,
        minutes: Math.max(1, a.estimated_minutes),
        dueLabel: a.due_date,
        overdue: a.overdue,
      })),
    ...revision
      .filter((r) => r.status !== "completed")
      .map((r) => ({
        id: r.id,
        kind: "revision" as const,
        label: r.title,
        detail: r.subject?.name ?? null,
        minutes: Math.max(1, r.estimated_minutes),
        dueLabel: null,
        overdue: false,
      })),
  ];

  // Default to a 15:00 finish when there is no timetable to read it from.
  const afterSchool = (schoolEndsMinutes ?? 15 * 60) + settleMinutes;
  const start = Math.max(afterSchool, nowMinutes ?? 0);

  // Out of evening entirely. Nothing can be scheduled and nothing is worth
  // suggesting, so everything outstanding is reported as deferred.
  if (start >= studyUntilMinutes) {
    return {
      blocks: [],
      deferred: candidates.map((c) => ({
        taskId: c.id,
        kind: c.kind,
        label: c.label,
        detail: c.detail,
        minutes: c.minutes,
        scheduledMinutes: 0,
        dueLabel: c.dueLabel,
        overdue: c.overdue,
      })),
      startsAt: null,
      endsBy: minutesToLabel(studyUntilMinutes),
      workMinutes: 0,
      suggestedMinutes: 0,
      spareMinutes: Math.max(0, studyUntilMinutes - start),
      startWith: null,
    };
  }

  const blocks: PlanBlock[] = [];
  const deferred: DeferredTask[] = [];
  let cursor = start;
  let sinceBreak = 0;
  let workMinutes = 0;
  let suggestedMinutes = 0;

  /**
   * A break, but only once enough work has built up and only if work can
   * follow it. Shared by the homework pass and the filling pass so the two
   * cannot drift into different ideas of when a break is earned.
   */
  const insertBreakIfEarned = (): void => {
    if (sinceBreak < BREAK_AFTER_MINUTES) return;
    if (studyUntilMinutes - cursor <= BREAK_MINUTES + MIN_CHUNK_MINUTES) return;

    blocks.push({
      id: `break-${cursor}`,
      taskId: null,
      subjectId: null,
      kind: "break",
      label: "Break",
      detail: null,
      reason: null,
      startMinutes: cursor,
      startLabel: minutesToLabel(cursor),
      endLabel: minutesToLabel(cursor + BREAK_MINUTES),
      minutes: BREAK_MINUTES,
      part: null,
    });
    cursor += BREAK_MINUTES;
    sinceBreak = 0;
  };

  for (const task of candidates) {
    // How many blocks this task will need, so each can be labelled "2 of 3".
    const chunks = splitTask(task.minutes);
    let scheduled = 0;

    for (let i = 0; i < chunks.length; i += 1) {
      const chunk = chunks[i];

      insertBreakIfEarned();

      if (cursor + chunk > studyUntilMinutes) break; // out of evening

      blocks.push({
        id: `${task.id}-${i}`,
        taskId: task.id,
        subjectId: null,
        kind: task.kind,
        label: task.label,
        detail: task.detail,
        reason: null,
        startMinutes: cursor,
        startLabel: minutesToLabel(cursor),
        endLabel: minutesToLabel(cursor + chunk),
        minutes: chunk,
        part: chunks.length > 1 ? { index: i + 1, total: chunks.length } : null,
      });

      cursor += chunk;
      sinceBreak += chunk;
      workMinutes += chunk;
      scheduled += chunk;
    }

    // Anything not fully placed is reported, with however much did fit.
    if (scheduled < task.minutes) {
      deferred.push({
        taskId: task.id,
        kind: task.kind,
        label: task.label,
        detail: task.detail,
        minutes: task.minutes,
        scheduledMinutes: scheduled,
        dueLabel: task.dueLabel,
        overdue: task.overdue,
      });
    }
  }

  // Fill what is left with what the timetable asked for — but only when the
  // set work all fitted. Proposing optional revision in an evening that could
  // not hold the homework is not a suggestion, it is noise.
  if (deferred.length === 0) {
    for (const suggestion of suggestions.slice(0, MAX_SUGGESTED_BLOCKS)) {
      insertBreakIfEarned();

      const remaining = studyUntilMinutes - cursor;
      if (remaining < MIN_SUGGESTION_MINUTES) break;

      const minutes = Math.min(suggestion.minutes, remaining, MAX_BLOCK_MINUTES);

      blocks.push({
        id: `suggested-${suggestion.subjectId}-${cursor}`,
        taskId: null,
        subjectId: suggestion.subjectId,
        kind: "suggested",
        label: suggestion.headline,
        detail: suggestion.subjectName,
        reason: suggestion.reasons[0] ?? null,
        startMinutes: cursor,
        startLabel: minutesToLabel(cursor),
        endLabel: minutesToLabel(cursor + minutes),
        minutes,
        part: null,
      });

      cursor += minutes;
      sinceBreak += minutes;
      workMinutes += minutes;
      suggestedMinutes += minutes;
    }
  }

  const first = blocks.find((b) => b.kind !== "break");

  return {
    blocks,
    deferred,
    startsAt: blocks.length > 0 ? minutesToLabel(start) : null,
    endsBy: minutesToLabel(studyUntilMinutes),
    workMinutes,
    suggestedMinutes,
    spareMinutes: Math.max(0, studyUntilMinutes - cursor),
    startWith: first
      ? {
          label: first.label,
          detail: first.detail,
          minutes: first.minutes,
          reason: first.reason,
        }
      : null,
  };
}

/**
 * Cut a task into sittings of at most MAX_BLOCK_MINUTES.
 *
 * A trailing remainder below MIN_CHUNK_MINUTES is folded into the previous
 * chunk rather than left as its own block — "50 minutes" should become 45 + 5
 * nowhere; it becomes a single 50, because a 5-minute block is noise on a
 * plan and the extra five minutes of sitting is not worth a row.
 */
function splitTask(minutes: number): number[] {
  if (minutes <= MAX_BLOCK_MINUTES) return [minutes];

  const chunks: number[] = [];
  let left = minutes;
  while (left > 0) {
    const take = Math.min(MAX_BLOCK_MINUTES, left);
    chunks.push(take);
    left -= take;
  }

  const last = chunks[chunks.length - 1];
  if (chunks.length > 1 && last < MIN_CHUNK_MINUTES) {
    chunks.pop();
    chunks[chunks.length - 1] += last;
  }
  return chunks;
}

/** `"21:00"` or `"21:00:00"` → minutes since midnight. */
export function timeToMinutesSafe(time: string | null | undefined, fallback: number): number {
  if (!time) return fallback;
  const [h, m] = time.split(":");
  const minutes = Number(h) * 60 + Number(m);
  return Number.isFinite(minutes) ? minutes : fallback;
}
