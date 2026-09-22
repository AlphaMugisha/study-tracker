"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";

import { logActivity } from "@/lib/activity";
import { createClient } from "@/lib/supabase/server";
import { fieldErrorsFrom } from "@/lib/validation/auth";
import type { TaskStatus } from "@/types/database";

/**
 * Homework mutations.
 *
 * None of these filter by `user_id`: Row Level Security does that, and adding
 * a redundant client-side filter would imply the policy is not the boundary.
 * They do check the row exists afterwards, because RLS turns "not yours" into
 * "no rows" rather than an error.
 */

const assignmentSchema = z.object({
  title: z
    .string()
    .min(1, "Give this task a title.")
    .max(200, "That title is a little too long."),
  subjectId: z.string().uuid().nullable(),
  description: z.string().max(2000, "Keep the description under 2000 characters.").nullable(),
  dueDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Pick a due date."),
  dueTime: z
    .string()
    .regex(/^\d{2}:\d{2}$/, "Use a time like 16:30.")
    .nullable(),
  priority: z.enum(["low", "medium", "high"]),
  estimatedMinutes: z
    .number()
    .int()
    .min(5, "Give it at least 5 minutes.")
    .max(600, "Keep the estimate under 10 hours."),
});

export type AssignmentFormState = {
  formError?: string;
  fieldErrors?: Record<string, string>;
  ok?: boolean;
};

function read(formData: FormData) {
  const text = (k: string) => {
    const v = formData.get(k);
    return typeof v === "string" && v.trim() !== "" ? v.trim() : null;
  };

  // The subject Select needs a non-empty value for "none", so it sends a
  // sentinel rather than "". Normalise it back to null here.
  const subjectId = text("subjectId");

  return {
    title: text("title") ?? "",
    subjectId: subjectId === "__none__" ? null : subjectId,
    description: text("description"),
    dueDate: text("dueDate") ?? "",
    dueTime: text("dueTime"),
    priority: text("priority") ?? "medium",
    estimatedMinutes: Number(text("estimatedMinutes") ?? 30),
  };
}

export async function createAssignmentAction(
  _prev: AssignmentFormState,
  formData: FormData,
): Promise<AssignmentFormState> {
  const parsed = assignmentSchema.safeParse(read(formData));
  if (!parsed.success) return { fieldErrors: fieldErrorsFrom(parsed.error) };

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { formError: "Your session has expired. Sign in again." };

  const { data, error } = await supabase
    .from("assignments")
    .insert({
      user_id: user.id,
      subject_id: parsed.data.subjectId,
      title: parsed.data.title,
      description: parsed.data.description,
      due_date: parsed.data.dueDate,
      due_time: parsed.data.dueTime,
      priority: parsed.data.priority,
      estimated_minutes: parsed.data.estimatedMinutes,
    })
    .select("id, title")
    .single();

  if (error) return { formError: describe(error.message) };

  await logActivity({
    activityType: "assignment_created",
    entityType: "assignment",
    entityId: data.id,
    metadata: { title: data.title },
  });

  revalidatePath("/homework");
  revalidatePath("/dashboard");
  revalidatePath("/plan");
  return { ok: true };
}

export async function updateAssignmentAction(
  _prev: AssignmentFormState,
  formData: FormData,
): Promise<AssignmentFormState> {
  const id = formData.get("id");
  if (typeof id !== "string") return { formError: "Missing assignment." };

  const parsed = assignmentSchema.safeParse(read(formData));
  if (!parsed.success) return { fieldErrors: fieldErrorsFrom(parsed.error) };

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("assignments")
    .update({
      subject_id: parsed.data.subjectId,
      title: parsed.data.title,
      description: parsed.data.description,
      due_date: parsed.data.dueDate,
      due_time: parsed.data.dueTime,
      priority: parsed.data.priority,
      estimated_minutes: parsed.data.estimatedMinutes,
    })
    .eq("id", id)
    .select("id, title");

  if (error) return { formError: describe(error.message) };
  // RLS returns zero rows rather than an error when the row is not yours.
  if (!data || data.length === 0) return { formError: "That assignment could not be found." };

  await logActivity({
    activityType: "assignment_updated",
    entityType: "assignment",
    entityId: id,
    metadata: { title: data[0].title },
  });

  revalidatePath("/homework");
  revalidatePath("/dashboard");
  revalidatePath("/plan");
  return { ok: true };
}

/** Status changes are one-click, so they take a plain form action. */
export async function setAssignmentStatusAction(formData: FormData): Promise<void> {
  const id = formData.get("id");
  const status = formData.get("status") as TaskStatus | null;
  if (typeof id !== "string" || !status) return;

  const supabase = await createClient();
  // `completed_at` is maintained by a database trigger, so it is not set here.
  const { data } = await supabase
    .from("assignments")
    .update({ status })
    .eq("id", id)
    .select("id, title");

  if (data && data.length > 0) {
    await logActivity({
      activityType:
        status === "completed"
          ? "assignment_completed"
          : status === "in_progress"
            ? "assignment_started"
            : "assignment_updated",
      entityType: "assignment",
      entityId: id,
      metadata: { title: data[0].title, status },
    });
  }

  revalidatePath("/homework");
  revalidatePath("/dashboard");
  revalidatePath("/plan");
}

export async function deleteAssignmentAction(formData: FormData): Promise<void> {
  const id = formData.get("id");
  if (typeof id !== "string") return;

  const supabase = await createClient();
  const { data } = await supabase.from("assignments").delete().eq("id", id).select("id, title");

  if (data && data.length > 0) {
    await logActivity({
      activityType: "assignment_deleted",
      entityType: "assignment",
      entityId: id,
      metadata: { title: data[0].title },
    });
  }

  revalidatePath("/homework");
  revalidatePath("/dashboard");
  revalidatePath("/plan");
}

/** Database errors are for us; the student gets something they can act on. */
function describe(message: string): string {
  const m = message.toLowerCase();
  if (m.includes("estimated_minutes")) return "That time estimate is out of range.";
  if (m.includes("title")) return "That title is too long.";
  if (m.includes("violates row-level security")) {
    return "You don't have permission to change that.";
  }
  return "Something went wrong saving this. Try again.";
}
