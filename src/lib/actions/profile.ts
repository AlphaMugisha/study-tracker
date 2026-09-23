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
  // Mirrors the `profiles_study_until_sane` check. A cutoff before noon would
  // put the whole evening before school even finishes.
  studyUntil: z
    .string()
    .regex(/^([12]\d|0?\d):[0-5]\d$/, "Use a time like 21:00.")
    .refine((v) => {
      const [h] = v.split(":").map(Number);
      return h >= 12;
    }, "Pick a time after midday."),
  settleMinutes: z
    .number()
    .int()
    .min(0, "That can't be negative.")
    .max(240, "Keep the wind-down under four hours."),
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
    studyUntil: String(formData.get("studyUntil") ?? "21:00").trim(),
    settleMinutes: Number(String(formData.get("settleMinutes") ?? "30").trim()),
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
    .update({
      full_name: parsed.data.fullName,
      timezone: parsed.data.timezone,
      study_until: parsed.data.studyUntil,
      settle_minutes: parsed.data.settleMinutes,
    })
    .select("id");

  if (error) return { formError: "Could not save your details. Try again." };
  if (!data || data.length === 0) return { formError: "Your session has expired. Sign in again." };

  revalidatePath("/settings");
  // The planner reads both of the new fields, so its pages must refresh too.
  revalidatePath("/dashboard");
  revalidatePath("/plan");
  revalidatePath("/dashboard", "layout");
  return { ok: true };
}
