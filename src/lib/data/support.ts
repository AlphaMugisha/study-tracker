import { cache } from "react";
import { getUser } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import type { ActivityLog, ActivityType, AdminStudentLink, LinkStatus } from "@/types/database";

/**
 * Support-access reads.
 *
 * Every query here is ordinary and unprivileged — no service-role key, no
 * bypass. RLS decides what comes back: `has_student_access` returns rows only
 * for your own record or for a student who has an ACTIVE link to you. An admin
 * with no link runs exactly these queries and gets nothing.
 *
 * That is the point. The authorisation lives in the database, so a mistake in
 * this file can only ever show less than it should, never more.
 */

export type SupportLink = AdminStudentLink & {
  /** The other party's name; null if their profile is not readable. */
  counterpartName: string | null;
};

type ProfileRow = { id: string; full_name: string };

async function namesFor(ids: string[]): Promise<Map<string, string>> {
  if (ids.length === 0) return new Map();
  const supabase = await createClient();
  const { data } = await supabase.from("profiles").select("id, full_name").in("id", ids);
  return new Map(((data ?? []) as ProfileRow[]).map((p) => [p.id, p.full_name]));
}

/** Links where the caller is the support account. */
export const getLinksAsAdmin = cache(async function getLinksAsAdmin(): Promise<SupportLink[]> {
  const supabase = await createClient();
  const { data } = await supabase
    .from("admin_student_links")
    .select("*")
    .order("created_at", { ascending: false });

  const rows = (data ?? []) as AdminStudentLink[];
  const user = await getUser();

  const mine = rows.filter((r) => r.admin_id === user?.id);
  const names = await namesFor(mine.map((r) => r.student_id));

  return mine.map((r) => ({ ...r, counterpartName: names.get(r.student_id) ?? null }));
});

/** Links where the caller is the student being asked about. */
export const getLinksAsStudent = cache(async function getLinksAsStudent(): Promise<SupportLink[]> {
  const supabase = await createClient();
  const { data } = await supabase
    .from("admin_student_links")
    .select("*")
    .order("created_at", { ascending: false });

  const rows = (data ?? []) as AdminStudentLink[];
  const user = await getUser();

  const mine = rows.filter((r) => r.student_id === user?.id);
  const names = await namesFor(mine.map((r) => r.admin_id));

  return mine.map((r) => ({ ...r, counterpartName: names.get(r.admin_id) ?? null }));
});

export function isLive(link: { status: LinkStatus; revoked_at: string | null }): boolean {
  return link.status === "active" && link.revoked_at === null;
}

/**
 * A student's academic activity, most recent first.
 *
 * Returns nothing unless the caller is that student or holds an active link —
 * the `activity_logs` SELECT policy is `has_student_access(user_id)`, the same
 * predicate as everything else.
 */
export async function getActivityFeed(
  studentId: string,
  limit = 60,
): Promise<ActivityLog[]> {
  const supabase = await createClient();
  const { data } = await supabase
    .from("activity_logs")
    .select("*")
    .eq("user_id", studentId)
    .order("created_at", { ascending: false })
    .limit(limit);

  return (data ?? []) as ActivityLog[];
}

/**
 * Plain-English labels for the activity enum.
 *
 * Deliberately phrased as academic record-keeping, because that is what these
 * are: every one of them is an action the student took inside StudyFlow. There
 * is nothing here about where they were, what else they had open, or what they
 * typed — the enum is closed, and this is the whole of it.
 */
const ACTIVITY_LABEL: Record<ActivityType, string> = {
  subject_created: "Added a subject",
  subject_updated: "Renamed a subject",
  subject_deleted: "Removed a subject",
  timetable_confirmed: "Confirmed a timetable",
  timetable_updated: "Changed their timetable",
  timetable_entry_updated: "Edited a timetable slot",
  assignment_created: "Added homework",
  assignment_updated: "Edited homework",
  assignment_started: "Started homework",
  assignment_completed: "Completed homework",
  assignment_deleted: "Deleted homework",
  revision_created: "Added revision",
  revision_completed: "Completed revision",
  study_session_started: "Started working",
  study_session_completed: "Finished a study session",
  support_access_requested: "Support access requested",
  support_access_granted: "Granted support access",
  support_access_revoked: "Revoked support access",
};

export function describeActivity(entry: ActivityLog): {
  label: string;
  detail: string | null;
} {
  const label = ACTIVITY_LABEL[entry.activity_type] ?? entry.activity_type;
  const meta = entry.metadata ?? {};

  const title = typeof meta.title === "string" ? meta.title : null;
  const minutes = typeof meta.minutes === "number" ? meta.minutes : null;

  if (minutes !== null) {
    return { label, detail: title ? `${title} · ${minutes} min` : `${minutes} min` };
  }
  return { label, detail: title };
}

/** Which accent a row takes, so a feed is scannable rather than a wall. */
export function activityTone(
  type: ActivityType,
): "brand" | "lesson" | "revise" | "pause" | "danger" {
  if (type.endsWith("_completed")) return "brand";
  if (type.startsWith("assignment")) return "lesson";
  if (type.startsWith("revision") || type.startsWith("study_session")) return "revise";
  if (type.startsWith("support_access")) return "danger";
  return "pause";
}

/**
 * A one-query summary for the app shell.
 *
 * The header renders on every page, so this deliberately does not reuse
 * `getLinksAsAdmin`/`getLinksAsStudent` — those each make a second round trip
 * to resolve names, which the header does not need.
 *
 * Both sides come from the same rows: the SELECT policy returns links where
 * you are either the admin or the student, so one read answers "how many
 * students can I see" and "is anyone asking to see me".
 */
export type SupportSummary = {
  /** Active links where the caller is the support account. */
  studentsVisible: number;
  /** Requests awaiting the caller's own decision. */
  pendingForMe: number;
};

export const getSupportSummary = cache(async function getSupportSummary(): Promise<SupportSummary> {
  // The cached user, not another `auth.getUser()` — this runs in the app
  // shell on every page, so a second round trip here is paid everywhere.
  const [supabase, user] = await Promise.all([createClient(), getUser()]);
  if (!user) return { studentsVisible: 0, pendingForMe: 0 };

  const { data } = await supabase
    .from("admin_student_links")
    .select("admin_id, student_id, status, revoked_at");

  const rows = (data ?? []) as Array<{
    admin_id: string;
    student_id: string;
    status: LinkStatus;
    revoked_at: string | null;
  }>;

  return {
    studentsVisible: rows.filter((r) => r.admin_id === user.id && isLive(r)).length,
    pendingForMe: rows.filter((r) => r.student_id === user.id && r.status === "pending")
      .length,
  };
});
