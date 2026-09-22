import { createClient } from "@/lib/supabase/server";
import { isOverdue, type Assignment, type RevisionTask } from "@/types/database";

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

function toAssignmentView(
  row: Assignment & { subjects: { name: string; color_token: string } | null },
  now: Date,
): AssignmentView {
  return {
    ...row,
    subject: row.subjects,
    overdue: isOverdue(row, now),
    dueAt: new Date(`${row.due_date}T${row.due_time ?? "23:59:59"}`),
  };
}

export async function getAssignments(now = new Date()): Promise<AssignmentView[]> {
  const supabase = await createClient();
  const { data } = await supabase
    .from("assignments")
    .select("*, subjects(name, color_token)")
    .order("due_date")
    .order("due_time", { nullsFirst: false });

  return ((data ?? []) as never[]).map((row) => toAssignmentView(row, now));
}

export async function getRevisionTasks(): Promise<RevisionView[]> {
  const supabase = await createClient();
  const { data } = await supabase
    .from("revision_tasks")
    .select("*, subjects(name, color_token)")
    .order("scheduled_date", { nullsFirst: false });

  return ((data ?? []) as never[]).map((row: RevisionTask & {
    subjects: { name: string; color_token: string } | null;
  }) => ({ ...row, subject: row.subjects }));
}

// ---------------------------------------------------------------------------
// Grouping used by the Homework page and the Today page's "Due soon"
// ---------------------------------------------------------------------------

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
