"use server";

import { revalidatePath } from "next/cache";

import { logActivity } from "@/lib/activity";
import { createClient } from "@/lib/supabase/server";

/**
 * Study sessions — what was actually worked on, as opposed to what was planned.
 *
 * The `study_sessions` table has existed since 0002 but nothing ever wrote to
 * it, so progress was a single yes/no tick per assignment. With these, "I did
 * 40 minutes of the essay and stopped" is recordable, which is what lets the
 * planner eventually schedule the remainder rather than the whole thing again.
 *
 * Only one session may be open at a time. Starting a second implicitly closes
 * the first: a student who forgets to press stop should not end up with two
 * open rows and a nonsense total.
 */

/** The open session, if there is one, with the task it belongs to. */
export async function getOpenSession(): Promise<{
  id: string;
  assignmentId: string | null;
  startedAt: string;
  title: string | null;
} | null> {
  const supabase = await createClient();
  // The hand-written Database types declare no relationships, so an embedded
  // `assignments(title)` select cannot be typed. One extra round trip is a
  // fair price for not casting through `unknown`.
  const { data } = await supabase
    .from("study_sessions")
    .select("id, assignment_id, started_at")
    .is("ended_at", null)
    .order("started_at", { ascending: false })
    .limit(1);

  const row = (data ?? [])[0];
  if (!row) return null;

  let title: string | null = null;
  if (row.assignment_id) {
    const { data: assignment } = await supabase
      .from("assignments")
      .select("title")
      .eq("id", row.assignment_id)
      .maybeSingle();
    title = assignment?.title ?? null;
  }

  return {
    id: row.id,
    assignmentId: row.assignment_id,
    startedAt: row.started_at,
    title,
  };
}

export async function startSessionAction(formData: FormData): Promise<void> {
  const assignmentId = formData.get("assignmentId");
  if (typeof assignmentId !== "string") return;

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return;

  // Close anything still running before opening a new one.
  await closeOpenSessions(supabase);

  // Carry the subject across so a session stays attributable even if the
  // assignment is later deleted — the FK nulls `assignment_id` on delete.
  const { data: assignment } = await supabase
    .from("assignments")
    .select("id, title, subject_id")
    .eq("id", assignmentId)
    .single();
  if (!assignment) return;

  const { data } = await supabase
    .from("study_sessions")
    .insert({
      user_id: user.id,
      assignment_id: assignment.id,
      subject_id: assignment.subject_id,
    })
    .select("id")
    .single();

  // Starting work is also a status change: the task is now in progress.
  await supabase
    .from("assignments")
    .update({ status: "in_progress" })
    .eq("id", assignment.id)
    .eq("status", "not_started");

  if (data) {
    await logActivity({
      activityType: "study_session_started",
      entityType: "study_session",
      entityId: data.id,
      metadata: { title: assignment.title },
    });
  }

  revalidateStudyPages();
}

export async function stopSessionAction(formData: FormData): Promise<void> {
  const sessionId = formData.get("sessionId");
  if (typeof sessionId !== "string") return;

  const supabase = await createClient();
  const { data: open } = await supabase
    .from("study_sessions")
    .select("id, started_at, assignment_id")
    .eq("id", sessionId)
    .is("ended_at", null)
    .maybeSingle();
  if (!open) return;

  const minutes = elapsedMinutes(open.started_at);

  await supabase
    .from("study_sessions")
    .update({ ended_at: new Date().toISOString(), duration_minutes: minutes })
    .eq("id", sessionId);

  await logActivity({
    activityType: "study_session_completed",
    entityType: "study_session",
    entityId: sessionId,
    metadata: { minutes, assignmentId: open.assignment_id },
  });

  revalidateStudyPages();
}

/**
 * Minutes between `startedAt` and now, floored, never negative.
 *
 * Clock skew between the database default (`now()`) and the server can make a
 * just-opened session look like it started in the future; a negative duration
 * would violate `study_sessions_duration_positive` and fail the write.
 */
function elapsedMinutes(startedAt: string): number {
  const ms = Date.now() - new Date(startedAt).getTime();
  return Math.max(0, Math.floor(ms / 60000));
}

type Client = Awaited<ReturnType<typeof createClient>>;

async function closeOpenSessions(supabase: Client): Promise<void> {
  const { data: open } = await supabase
    .from("study_sessions")
    .select("id, started_at")
    .is("ended_at", null);

  for (const row of open ?? []) {
    await supabase
      .from("study_sessions")
      .update({
        ended_at: new Date().toISOString(),
        duration_minutes: elapsedMinutes(row.started_at),
      })
      .eq("id", row.id);
  }
}

function revalidateStudyPages(): void {
  revalidatePath("/dashboard");
  revalidatePath("/plan");
  revalidatePath("/homework");
}
