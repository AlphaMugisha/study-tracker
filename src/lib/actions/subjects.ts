"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";

import { logActivity } from "@/lib/activity";
import { createClient } from "@/lib/supabase/server";
import { fieldErrorsFrom } from "@/lib/validation/auth";

/**
 * Subject mutations.
 *
 * Until now `getSubjects()` could read subjects but nothing could write them,
 * so the only subjects that existed were the ones the seed script inserted.
 * Homework does not require a subject, so this was not a hard blocker — but it
 * meant every task added by hand read "No subject" and lost its colour.
 *
 * As with assignments, none of these filter by `user_id`: RLS is the boundary,
 * and a redundant filter would imply it is not.
 */

const COLOR_TOKENS = ["chart-1", "chart-2", "chart-3", "chart-4", "chart-5"] as const;

const subjectSchema = z.object({
  name: z
    .string()
    .min(1, "Give the subject a name.")
    .max(80, "That name is a little too long."),
  shortName: z
    .string()
    .max(12, "Keep the short name to 12 characters.")
    .nullable(),
  // Mirrors the `subjects_color_token_valid` check constraint. Validating here
  // too means a bad value is a field error rather than a 400 from PostgREST.
  colorToken: z.enum(COLOR_TOKENS),
});

export type SubjectFormState = {
  formError?: string;
  fieldErrors?: Record<string, string>;
  ok?: boolean;
};

function read(formData: FormData) {
  const text = (k: string) => {
    const v = formData.get(k);
    return typeof v === "string" && v.trim() !== "" ? v.trim() : null;
  };
  return {
    name: text("name") ?? "",
    shortName: text("shortName"),
    colorToken: text("colorToken") ?? "chart-1",
  };
}

/**
 * `subjects_user_name_key` is a unique index on (user_id, lower(btrim(name))),
 * so a duplicate comes back as 23505. Reported against the name field, since
 * that is the field the student has to change.
 */
function describe(message: string): string {
  if (message.includes("duplicate key") || message.includes("23505")) {
    return "You already have a subject with that name.";
  }
  return "Something went wrong saving that. Try again.";
}

export async function createSubjectAction(
  _prev: SubjectFormState,
  formData: FormData,
): Promise<SubjectFormState> {
  const parsed = subjectSchema.safeParse(read(formData));
  if (!parsed.success) return { fieldErrors: fieldErrorsFrom(parsed.error) };

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { formError: "Your session has expired. Sign in again." };

  const { data, error } = await supabase
    .from("subjects")
    .insert({
      user_id: user.id,
      name: parsed.data.name,
      short_name: parsed.data.shortName,
      color_token: parsed.data.colorToken,
    })
    .select("id, name")
    .single();

  if (error) {
    const msg = describe(error.message);
    return msg.startsWith("You already")
      ? { fieldErrors: { name: msg } }
      : { formError: msg };
  }

  await logActivity({
    activityType: "subject_created",
    entityType: "subject",
    entityId: data.id,
    metadata: { name: data.name },
  });

  revalidateEverywhereSubjectsShow();
  return { ok: true };
}

export async function updateSubjectAction(
  _prev: SubjectFormState,
  formData: FormData,
): Promise<SubjectFormState> {
  const id = formData.get("id");
  if (typeof id !== "string") return { formError: "Missing subject." };

  const parsed = subjectSchema.safeParse(read(formData));
  if (!parsed.success) return { fieldErrors: fieldErrorsFrom(parsed.error) };

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("subjects")
    .update({
      name: parsed.data.name,
      short_name: parsed.data.shortName,
      color_token: parsed.data.colorToken,
    })
    .eq("id", id)
    .select("id, name");

  if (error) {
    const msg = describe(error.message);
    return msg.startsWith("You already")
      ? { fieldErrors: { name: msg } }
      : { formError: msg };
  }
  // RLS returns zero rows rather than an error when the row is not yours.
  if (!data || data.length === 0) return { formError: "That subject could not be found." };

  await logActivity({
    activityType: "subject_updated",
    entityType: "subject",
    entityId: id,
    metadata: { name: data[0].name },
  });

  revalidateEverywhereSubjectsShow();
  return { ok: true };
}

/**
 * Deleting a subject does NOT delete its homework.
 *
 * 0003 set these foreign keys to `ON DELETE SET NULL (subject_id)`, so the
 * assignments survive and simply become unfiled. That is the right trade: a
 * student renaming or tidying their subject list should never lose work they
 * still have to do.
 */
export async function deleteSubjectAction(formData: FormData): Promise<void> {
  const id = formData.get("id");
  if (typeof id !== "string") return;

  const supabase = await createClient();
  const { data } = await supabase.from("subjects").delete().eq("id", id).select("id, name");

  if (data && data.length > 0) {
    await logActivity({
      activityType: "subject_deleted",
      entityType: "subject",
      entityId: id,
      metadata: { name: data[0].name },
    });
  }

  revalidateEverywhereSubjectsShow();
}

/** Subjects colour homework, the timetable and the plan, so all three refresh. */
function revalidateEverywhereSubjectsShow(): void {
  revalidatePath("/settings");
  revalidatePath("/homework");
  revalidatePath("/dashboard");
  revalidatePath("/plan");
  revalidatePath("/timetable");
}
