import { cache } from "react";

import { getActivityFeed } from "@/lib/data/support";
import { createClient } from "@/lib/supabase/server";
import { isOverdue, type Assignment } from "@/types/database";

/**
 * A seven-day report on one student.
 *
 * Computed on read, not stored. A weekly snapshot table would need something
 * to write it every week, and the numbers here are cheap to derive from rows
 * that already exist — so the report is always current rather than as current
 * as the last job that ran.
 *
 * What it deliberately is NOT: a judgement. It counts what was added, what was
 * finished, how long was spent and what slipped. It does not grade her.
 */

export type WeeklyReport = {
  from: string;
  to: string;
  /** Homework logged during the window. */
  added: number;
  /** Homework completed during the window, whenever it was set. */
  completed: number;
  /** Still outstanding at the end of the window. */
  outstanding: number;
  /** Outstanding AND past its due date. */
  overdue: number;
  /** Minutes of recorded study sessions in the window. */
  studiedMinutes: number;
  /** Distinct days in the window with any recorded activity. */
  activeDays: number;
  /** Subjects she completed work in, most first. */
  strongest: Array<{ subject: string; completed: number }>;
  /** Outstanding work grouped by subject, worst first. */
  slipping: Array<{ subject: string; outstanding: number; overdue: number }>;
};

const DAY_MS = 86_400_000;

export const getWeeklyReport = cache(async function getWeeklyReport(
  studentId: string,
  days = 7,
): Promise<WeeklyReport> {
  const supabase = await createClient();
  const now = new Date();
  const since = new Date(now.getTime() - days * DAY_MS);

  const [{ data: rows }, { data: sessions }, activity] = await Promise.all([
    supabase
      .from("assignments")
      .select("*, subjects(name)")
      .eq("user_id", studentId),
    supabase
      .from("study_sessions")
      .select("duration_minutes, started_at")
      .eq("user_id", studentId)
      .gte("started_at", since.toISOString()),
    getActivityFeed(studentId, 200),
  ]);

  const assignments = ((rows ?? []) as never[]) as Array<
    Assignment & { subjects: { name: string } | null }
  >;

  const inWindow = (iso: string | null) =>
    iso !== null && new Date(iso).getTime() >= since.getTime();

  const added = assignments.filter((a) => inWindow(a.created_at)).length;
  const completedRows = assignments.filter(
    (a) => a.status === "completed" && inWindow(a.completed_at),
  );
  const outstandingRows = assignments.filter((a) => a.status !== "completed");

  const studiedMinutes = (sessions ?? []).reduce(
    (total, s) => total + (s.duration_minutes ?? 0),
    0,
  );

  // A day counts as active if anything at all was logged on it. Using the
  // activity log rather than sessions means adding homework counts too —
  // a day spent writing down what was set is not an inactive day.
  const activeDays = new Set(
    activity
      .filter((e) => inWindow(e.created_at))
      .map((e) => new Date(e.created_at).toDateString()),
  ).size;

  const bySubject = (list: typeof assignments) => {
    const map = new Map<string, number>();
    for (const a of list) {
      const name = a.subjects?.name ?? "No subject";
      map.set(name, (map.get(name) ?? 0) + 1);
    }
    return map;
  };

  const completedBy = bySubject(completedRows);
  const outstandingBy = bySubject(outstandingRows);
  const overdueBy = bySubject(outstandingRows.filter((a) => isOverdue(a, now)));

  return {
    from: since.toISOString().slice(0, 10),
    to: now.toISOString().slice(0, 10),
    added,
    completed: completedRows.length,
    outstanding: outstandingRows.length,
    overdue: outstandingRows.filter((a) => isOverdue(a, now)).length,
    studiedMinutes,
    activeDays,
    strongest: [...completedBy.entries()]
      .map(([subject, completed]) => ({ subject, completed }))
      .sort((a, b) => b.completed - a.completed)
      .slice(0, 4),
    slipping: [...outstandingBy.entries()]
      .map(([subject, outstanding]) => ({
        subject,
        outstanding,
        overdue: overdueBy.get(subject) ?? 0,
      }))
      // Overdue first, then sheer volume: three overdue matters more than
      // five that are simply not due yet.
      .sort((a, b) => b.overdue - a.overdue || b.outstanding - a.outstanding)
      .slice(0, 4),
  };
});
