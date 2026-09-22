"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";

import { createClient } from "@/lib/supabase/server";
import { fieldErrorsFrom } from "@/lib/validation/auth";

export type ProfileFormState = {
  formError?: string;
  fieldErrors?: Record<string, string>;
  ok?: boolean;
};

const profileSchema = z.object({
  fullName: z
    .string()
    .min(2, "Tell us your name.")
    .max(80, "That name is a little too long."),
  timezone: z.string().min(1, "Pick a timezone."),
});

/**
 * `role` is deliberately absent from this action and from the form.
 *
 * That is not the protection, though — the migration revokes UPDATE on
 * `profiles.role` from `authenticated`, so the database would refuse the write
 * even if someone posted it by hand. This is just the UI agreeing with the
 * database.
 */
export async function updateProfileAction(
  _prev: ProfileFormState,
  formData: FormData,
): Promise<ProfileFormState> {
  const raw = {
    fullName: String(formData.get("fullName") ?? "").trim(),
    timezone: String(formData.get("timezone") ?? "").trim(),
  };

  const parsed = profileSchema.safeParse(raw);
  if (!parsed.success) return { fieldErrors: fieldErrorsFrom(parsed.error) };

  // Reject a timezone the browser cannot resolve, rather than storing junk the
  // timetable engine will later choke on.
  try {
    new Intl.DateTimeFormat("en-GB", { timeZone: parsed.data.timezone });
  } catch {
    return { fieldErrors: { timezone: "That isn't a timezone we recognise." } };
  }

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("profiles")
    .update({ full_name: parsed.data.fullName, timezone: parsed.data.timezone })
    .select("id");

  if (error) return { formError: "Could not save your details. Try again." };
  if (!data || data.length === 0) return { formError: "Your session has expired. Sign in again." };

  revalidatePath("/settings");
  revalidatePath("/dashboard", "layout");
  return { ok: true };
}
