import { cache } from "react";

import { getHelpRequests, type HelpList } from "@/lib/data/help";
import { describeLastSeen, describePresence, type Presence } from "@/lib/presence/describe";
import { timeToMinutesSafe } from "@/lib/planner/build-plan";
import { createClient } from "@/lib/supabase/server";
import { byUrgency, groupAssignments, type AssignmentView } from "@/lib/tasks/ordering";
import { clockIn, resolveNow } from "@/lib/timetable/resolve";
import { toResolvedEntry } from "@/lib/timetable/to-resolved-entry";
import type { ResolvedEntry } from "@/lib/timetable/types";
import { isOverdue, type Assignment } from "@/types/database";

/**
 * Everything a support account can see about one student, in one read.
 *
 * Gathered here rather than in each page so the parent's dashboard and the
 * full student record cannot drift apart — they were already growing two
 * copies of "load her homework and group it", and the second copy is always
 * the one that ends up subtly different.
 *
 * Nothing here is privileged. Every query is an ordinary authenticated read
 * and RLS decides what comes back: her own rows to her, and rows covered by
 * an ACTIVE link to whoever holds it. A support account with no link runs this
 * exact code and gets an empty snapshot.
 */

export type StudentSnapshot = {
  studentId: string;
  name: string;
  firstName: string;
  timezone: string;
  /** Her timetable, for the ticking presence card on the client. */
  entries: ResolvedEntry[];
  studyUntilMinutes: number;
  settleMinutes: number;
  /** Server-resolved so the first paint is never blank. */
  presence: Presence;
  /** Already formatted: "Active 12 min ago", or null. */
  lastSeen: string | null;
  /** Outstanding work, most urgent first. */
  outstanding: AssignmentView[];
  overdueCount: number;
  completedCount: number;
  /** Recently finished, newest first — the "she did this" half. */
  recentlyCompleted: AssignmentView[];
  help: HelpList;
};

type EntryRow = Parameters<typeof toResolvedEntry>[0];

export const getStudentSnapshot = cache(async function getStudentSnapshot(
  studentId: string,
  fallbackName = "Your student",
): Promise<StudentSnapshot> {
  const supabase = await createClient();
  const now = new Date();

  const [{ data: profile }, { data: version }, { data: rows }, { data: seen }, help] =
    await Promise.all([
      supabase
        .from("profiles")
        .select("full_name, timezone, study_until, settle_minutes")
        .eq("id", studentId)
        .maybeSingle(),
      supabase
        .from("timetable_versions")
        .select("id")
        .eq("user_id", studentId)
        .eq("status", "active")
        .maybeSingle(),
      supabase
        .from("assignments")
        .select("*, subjects(name, color_token)")
        .eq("user_id", studentId)
        .order("due_date"),
      supabase
        .from("activity_logs")
        .select("created_at")
        .eq("user_id", studentId)
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle(),
      getHelpRequests(studentId),
    ]);

  // The entries need the version id, so this one read cannot join the batch
  // above. It is skipped entirely when she has no active timetable.
  let entries: ResolvedEntry[] = [];
  if (version) {
    const { data } = await supabase
      .from("timetable_entries")
      .select(
        "id, activity_type, title, room, teacher, day_of_week, start_time, end_time, subject_id, subjects(name, color_token)",
      )
      .eq("timetable_version_id", version.id)
      .order("day_of_week")
      .order("start_time");
    entries = ((data ?? []) as unknown as EntryRow[]).map(toResolvedEntry);
  }

  const name = profile?.full_name ?? fallbackName;
  const timezone = profile?.timezone ?? "UTC";
  const studyUntilMinutes = timeToMinutesSafe(profile?.study_until, 21 * 60);
  const settleMinutes = profile?.settle_minutes ?? 30;

  // Her clock, not the server's and not the parent's.
  const { minutes, dayOfWeek } = clockIn(timezone);
  const presence = describePresence({
    state: resolveNow(entries, minutes, dayOfWeek),
    nowMinutes: minutes,
    dayOfWeek,
    studyUntilMinutes,
    settleMinutes,
  });

  const assignments = ((rows ?? []) as never[]).map(
    (row: Assignment & { subjects: { name: string; color_token: string } | null }) => ({
      ...row,
      subject: row.subjects,
      overdue: isOverdue(row, now),
      dueAt: new Date(`${row.due_date}T${row.due_time ?? "23:59:59"}`),
    }),
  );

  const groups = groupAssignments(assignments, now);
  const outstanding = [...groups.overdue, ...groups.dueSoon, ...groups.upcoming].sort(
    byUrgency,
  );

  return {
    studentId,
    name,
    firstName: name.split(/\s+/)[0] ?? name,
    timezone,
    entries,
    studyUntilMinutes,
    settleMinutes,
    presence,
    lastSeen: describeLastSeen(seen?.created_at ?? null, now),
    outstanding,
    overdueCount: groups.overdue.length,
    completedCount: groups.completed.length,
    recentlyCompleted: [...groups.completed]
      .sort((a, b) => (b.completed_at ?? "").localeCompare(a.completed_at ?? ""))
      .slice(0, 6),
    help,
  };
});
