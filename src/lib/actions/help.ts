"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";

import { logActivity } from "@/lib/activity";
import { createClient } from "@/lib/supabase/server";
import { fieldErrorsFrom } from "@/lib/validation/auth";

/**
 * "I don't understand this" — mutations.
 *
 * Writes are owner-only at the database level, which is what makes the list
 * trustworthy to both of them: a support account can read every entry and
 * cannot add, edit, or tick one off. A parent quietly closing an item she
 * never resolved would make the whole feature worthless to her, and the RLS
 * policy in 0006 is what actually prevents it — not this file.
 */

const helpSchema = z.object({
  topic: z
    .string()
    .min(1, "Say what you are stuck on.")
    .max(200, "Keep it short — the detail box is below."),
  detail: z.string().max(2000, "Keep the detail under 2000 characters.").nullable(),
  subjectId: z.string().uuid().nullable(),
  assignmentId: z.string().uuid().nullable(),
});

export type HelpFormState = {
  formError?: string;
  fieldErrors?: Record<string, string>;
  ok?: boolean;
};

function text(formData: FormData, key: string): string | null {
  const v = formData.get(key);
  if (typeof v !== "string") return null;
  const trimmed = v.trim();
  // The subject Select needs a non-empty value for "none" — same sentinel the
  // homework form uses.
  if (trimmed === "" || trimmed === "__none__") return null;
  return trimmed;
}

function describe(message: string): string {
  if (/help_requests/i.test(message) && /does not exist|schema cache/i.test(message)) {
    return "This feature needs database migration 0006. Ask whoever set up the app to apply it.";
  }
  if (/help_requests_topic_length/.test(message)) return "Say what you are stuck on.";
  if (/help_requests_detail_length/.test(message)) return "That detail is too long.";
  return "Something went wrong saving that. Try again.";
}

export async function logHelpAction(
  _prev: HelpFormState,
  formData: FormData,
): Promise<HelpFormState> {
  const parsed = helpSchema.safeParse({
    topic: text(formData, "topic") ?? "",
    detail: text(formData, "detail"),
    subjectId: text(formData, "subjectId"),
    assignmentId: text(formData, "assignmentId"),
  });
  if (!parsed.success) return { fieldErrors: fieldErrorsFrom(parsed.error) };

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { formError: "Your session has expired. Sign in again." };

  const { data, error } = await supabase
    .from("help_requests")
    .insert({
      user_id: user.id,
      topic: parsed.data.topic,
      detail: parsed.data.detail,
      subject_id: parsed.data.subjectId,
      assignment_id: parsed.data.assignmentId,
    })
    .select("id, topic")
    .single();

  if (error) return { formError: describe(error.message) };

  await logActivity({
    activityType: "help_logged",
    entityType: "help_request",
    entityId: data.id,
    metadata: { title: data.topic },
  });

  revalidatePath("/help");
  revalidatePath("/dashboard");
  return { ok: true };
}

/** One click, both directions — reopening matters as much as resolving. */
export async function setHelpStatusAction(formData: FormData): Promise<void> {
  const id = formData.get("id");
  const status = formData.get("status");
  if (typeof id !== "string") return;
  if (status !== "open" && status !== "resolved") return;

  const supabase = await createClient();
  // `resolved_at` is maintained by a trigger, so it is not set here.
  const { data } = await supabase
    .from("help_requests")
    .update({ status })
    .eq("id", id)
    .select("id, topic");

  if (data && data.length > 0) {
    await logActivity({
      activityType: status === "resolved" ? "help_resolved" : "help_logged",
      entityType: "help_request",
      entityId: id,
      metadata: { title: data[0].topic, status },
    });
  }

  revalidatePath("/help");
  revalidatePath("/dashboard");
}

export async function deleteHelpAction(formData: FormData): Promise<void> {
  const id = formData.get("id");
  if (typeof id !== "string") return;

  const supabase = await createClient();
  await supabase.from("help_requests").delete().eq("id", id);

  revalidatePath("/help");
  revalidatePath("/dashboard");
}
