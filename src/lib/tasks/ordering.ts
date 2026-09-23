import type { Assignment, RevisionTask } from "@/types/database";

/**
 * The view types and the pure ordering rules for homework.
 *
 * These live apart from `lib/data/tasks.ts` because that module imports the
 * Supabase server client, which imports `next/headers` — pulling in a request
 * context just to sort an array. Keeping the pure half separate means the
 * planner can import the sort, and the sort can be unit-tested, without a
 * database or a running server anywhere near it.
 */

/** An assignment with its subject joined and its derived state computed. */
export type AssignmentView = Assignment & {
  subject: { name: string; color_token: string } | null;
  overdue: boolean;
  /** `Date` at which it is due, for sorting. */
  dueAt: Date;
};

export type RevisionView = RevisionTask & {
  subject: { name: string; color_token: string } | null;
};

export type AssignmentGroups = {
  overdue: AssignmentView[];
  dueSoon: AssignmentView[];
  upcoming: AssignmentView[];
  completed: AssignmentView[];
};

/**
 * Overdue is derived here, never read from a column — a stored flag would
 * need a cron job to stay true. "Due soon" is today plus the next two days;
 * beyond that is upcoming.
 */
export function groupAssignments(
  assignments: AssignmentView[],
  now = new Date(),
): AssignmentGroups {
  const horizon = new Date(now);
  horizon.setDate(horizon.getDate() + 3);
  horizon.setHours(0, 0, 0, 0);

  const groups: AssignmentGroups = { overdue: [], dueSoon: [], upcoming: [], completed: [] };

  for (const a of assignments) {
    if (a.status === "completed") groups.completed.push(a);
    else if (a.overdue) groups.overdue.push(a);
    else if (a.dueAt < horizon) groups.dueSoon.push(a);
    else groups.upcoming.push(a);
  }

  groups.completed.sort(
    (x, y) => new Date(y.completed_at ?? 0).getTime() - new Date(x.completed_at ?? 0).getTime(),
  );
  return groups;
}

/** Sort key used wherever homework is listed: most urgent first. */
const PRIORITY_RANK = { high: 0, medium: 1, low: 2 } as const;

export function byUrgency(a: AssignmentView, b: AssignmentView): number {
  if (a.overdue !== b.overdue) return a.overdue ? -1 : 1;
  const due = a.dueAt.getTime() - b.dueAt.getTime();
  if (due !== 0) return due;
  const priority = PRIORITY_RANK[a.priority] - PRIORITY_RANK[b.priority];
  if (priority !== 0) return priority;
  return b.estimated_minutes - a.estimated_minutes;
}
