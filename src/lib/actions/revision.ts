"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";

import { logActivity } from "@/lib/activity";
import { createClient } from "@/lib/supabase/server";
import { fieldErrorsFrom } from "@/lib/validation/auth";
import type { TaskStatus } from "@/types/database";

/**
 * Revision mutations.
 *
 * `revision_tasks` has been readable since 0002 and fed into the planner, but
 * nothing could write one — so the Revision panel on /plan showed a count that
 * could only ever be whatever the seed script inserted. This closes that.
 *
 * Revision differs from homework in one way that matters: there is no
 * deadline. `scheduled_date` is optional and means "I intend to do this on
 * this day", not "this is due". The planner treats revision as filler after
 * homework for exactly that reason.
 *
 * As everywhere else, no `user_id` filter: RLS is the boundary.
 */

const revisionSchema = z.object({
  title: z
    .string()
    .min(1, "Give this revision a title.")
    .max(200, "That title is a little too long."),
  subjectId: z.string().uuid().nullable(),
  // Mirrors `revision_tasks_estimate_range`.
  estimatedMinutes: z
    .number()
    .int()
    .min(5, "Give it at least 5 minutes.")
    .max(600, "Keep the estimate under 10 hours."),
  priority: z.enum(["low", "medium", "high"]),
  scheduledDate: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/, "Use a date like 2026-09-30.")
    .nullable(),
});

export type RevisionFormState = {
  formError?: string;
  fieldErrors?: Record<string, string>;
  ok?: boolean;
};

function read(formData: FormData) {
  const text = (k: string) => {
    const v = formData.get(k);
    return typeof v === "string" && v.trim() !== "" ? v.trim() : null;
  };
  const subjectId = text("subjectId");

  return {
    title: text("title") ?? "",
    subjectId: subjectId === "__none__" ? null : subjectId,
    estimatedMinutes: Number(text("estimatedMinutes") ?? 30),
    priority: text("priority") ?? "low",
    scheduledDate: text("scheduledDate"),
  };
}

export async function createRevisionAction(
  _prev: RevisionFormState,
  formData: FormData,
): Promise<RevisionFormState> {
  const parsed = revisionSchema.safeParse(read(formData));
  if (!parsed.success) return { fieldErrors: fieldErrorsFrom(parsed.error) };

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { formError: "Your session has expired. Sign in again." };

  const { data, error } = await supabase
    .from("revision_tasks")
    .insert({
      user_id: user.id,
      subject_id: parsed.data.subjectId,
      title: parsed.data.title,
      estimated_minutes: parsed.data.estimatedMinutes,
      priority: parsed.data.priority,
      scheduled_date: parsed.data.scheduledDate,
    })
    .select("id, title")
    .single();

  if (error) return { formError: "Could not save that. Try again." };

  await logActivity({
    activityType: "revision_created",
    entityType: "revision_task",
    entityId: data.id,
    metadata: { title: data.title },
  });

  revalidateRevisionPages();
  return { ok: true };
}

/** Status changes are one-click, so they take a plain form action. */
export async function setRevisionStatusAction(formData: FormData): Promise<void> {
  const id = formData.get("id");
  const status = formData.get("status") as TaskStatus | null;
  if (typeof id !== "string" || !status) return;

  const supabase = await createClient();
  // `completed_at` is kept in step by the `revision_tasks_sync_completed_at`
  // trigger, so setting it here would only risk disagreeing with it.
  const { data } = await supabase
    .from("revision_tasks")
    .update({ status })
    .eq("id", id)
    .select("id, title");

  if (data && data.length > 0 && status === "completed") {
    await logActivity({
      activityType: "revision_completed",
      entityType: "revision_task",
      entityId: id,
      metadata: { title: data[0].title },
    });
  }

  revalidateRevisionPages();
}

export async function deleteRevisionAction(formData: FormData): Promise<void> {
  const id = formData.get("id");
  if (typeof id !== "string") return;

  const supabase = await createClient();
  await supabase.from("revision_tasks").delete().eq("id", id);

  revalidateRevisionPages();
}

function revalidateRevisionPages(): void {
  revalidatePath("/plan");
  revalidatePath("/dashboard");
}
