import { createClient } from "@/lib/supabase/server";
import type { AssignmentView, RevisionView } from "@/lib/tasks/ordering";
import { isOverdue, type Assignment, type RevisionTask } from "@/types/database";

/**
 * Reads. The view types and the pure ordering rules live in
 * `lib/tasks/ordering.ts` and are re-exported here so every existing import
 * keeps working — they were split out so the planner can sort without
 * dragging in the Supabase server client.
 */
export type { AssignmentView, RevisionView, AssignmentGroups } from "@/lib/tasks/ordering";
export { groupAssignments, byUrgency } from "@/lib/tasks/ordering";

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



