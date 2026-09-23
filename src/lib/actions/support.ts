"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";

import { logActivity } from "@/lib/activity";
import { createClient } from "@/lib/supabase/server";
import { fieldErrorsFrom } from "@/lib/validation/auth";

/**
 * Support-access mutations.
 *
 * The shape of this file is the consent model, so it is worth stating plainly:
 *
 *   an admin can only ASK      `requestAccessAction` always creates a PENDING
 *                              row; the insert policy enforces that, and the
 *                              admin's own update policy forbids ever writing
 *                              status = 'active'
 *
 *   only the student can GRANT `respondToRequestAction` runs as the student,
 *                              under a policy keyed to student_id
 *
 *   either side can END it     the student revokes; the admin withdraws
 *
 * None of this is enforced here. It is enforced by RLS and column grants —
 * this file would be unable to escalate even if it tried.
 */

export type SupportFormState = {
  formError?: string;
  fieldErrors?: Record<string, string>;
  ok?: boolean;
};

const requestSchema = z.object({
  email: z.string().email("That doesn't look like an email address."),
  note: z
    .string()
    .max(300, "Keep the note under 300 characters.")
    .nullable(),
});

/**
 * Ask a student for access, by email.
 *
 * Goes through `request_student_access`, a SECURITY DEFINER function, because
 * finding the account requires reading `auth.users` — which `authenticated`
 * cannot do, and should not be able to. The function returns the link id and
 * nothing else about the user.
 */
export async function requestAccessAction(
  _prev: SupportFormState,
  formData: FormData,
): Promise<SupportFormState> {
  const raw = {
    email: String(formData.get("email") ?? "").trim(),
    note: (String(formData.get("note") ?? "").trim() || null) as string | null,
  };

  const parsed = requestSchema.safeParse(raw);
  if (!parsed.success) return { fieldErrors: fieldErrorsFrom(parsed.error) };

  const supabase = await createClient();
  const { data, error } = await supabase.rpc("request_student_access", {
    student_email: parsed.data.email,
    request_note: parsed.data.note,
  });

  if (error) {
    // The function raises with specific SQLSTATEs so these stay readable.
    if (error.message.includes("No account with that email")) {
      return { fieldErrors: { email: "No account with that email." } };
    }
    if (error.message.includes("your own account")) {
      return { fieldErrors: { email: "That is your own account." } };
    }
    if (error.message.includes("Only a support account")) {
      return { formError: "Only a support account can request access." };
    }
    return { formError: "Could not send that request. Try again." };
  }

  await logActivity({
    activityType: "support_access_requested",
    entityType: "admin_student_link",
    entityId: typeof data === "string" ? data : undefined,
    metadata: { email: parsed.data.email },
  });

  revalidatePath("/admin");
  revalidatePath("/settings");
  return { ok: true };
}

/**
 * The student's decision. This is the only place access is ever granted, and
 * it is a student action — the admin's policy cannot write 'active'.
 */
export async function respondToRequestAction(formData: FormData): Promise<void> {
  const id = formData.get("id");
  const decision = formData.get("decision");
  if (typeof id !== "string" || (decision !== "grant" && decision !== "deny")) return;

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return;

  const { data } = await supabase
    .from("admin_student_links")
    .update(
      decision === "grant"
        ? { status: "active" as const, revoked_at: null }
        : { status: "revoked" as const, revoked_at: new Date().toISOString() },
    )
    // Belt and braces alongside the policy: this row must be the caller's.
    .eq("id", id)
    .eq("student_id", user.id)
    .select("id, admin_id");

  if (data && data.length > 0) {
    await logActivity({
      activityType:
        decision === "grant" ? "support_access_granted" : "support_access_revoked",
      entityType: "admin_student_link",
      entityId: id,
      metadata: { adminId: data[0].admin_id },
    });
  }

  revalidatePath("/settings");
  revalidatePath("/admin");
}

/** End an active link. Available to the student at any time, with no reason. */
export async function revokeAccessAction(formData: FormData): Promise<void> {
  const id = formData.get("id");
  if (typeof id !== "string") return;

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return;

  const { data } = await supabase
    .from("admin_student_links")
    .update({ status: "revoked" as const, revoked_at: new Date().toISOString() })
    .eq("id", id)
    .eq("student_id", user.id)
    .select("id, admin_id");

  if (data && data.length > 0) {
    await logActivity({
      activityType: "support_access_revoked",
      entityType: "admin_student_link",
      entityId: id,
      metadata: { adminId: data[0].admin_id },
    });
  }

  revalidatePath("/settings");
  revalidatePath("/admin");
}

/** The admin's own side: withdraw a request, or hand back access. */
export async function withdrawAccessAction(formData: FormData): Promise<void> {
  const id = formData.get("id");
  if (typeof id !== "string") return;

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return;

  await supabase
    .from("admin_student_links")
    .update({ status: "revoked" as const, revoked_at: new Date().toISOString() })
    .eq("id", id)
    .eq("admin_id", user.id);

  revalidatePath("/admin");
  revalidatePath("/settings");
}
