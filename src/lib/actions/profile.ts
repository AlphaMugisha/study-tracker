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
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) return { formError: "Your session has expired. Sign in again." };

  /*
    Filtered on the row being written, rather than left to RLS.

    `profiles_update_own` is `id = auth.uid()`, so an unfiltered update only
    ever reached one row — but that is the policy doing the work of the query,
    and the query should not need the policy to be correct to be correct. It
    also made the empty-result branch unreadable: no rows came back whether
    the session had expired, the policy had refused, or the column did not
    exist, and all three were reported as "sign in again".
  */
  const details = { full_name: parsed.data.fullName, timezone: parsed.data.timezone };
  const planner = {
    study_until: parsed.data.studyUntil,
    settle_minutes: parsed.data.settleMinutes,
  };

  const write = (values: typeof details | (typeof details & typeof planner)) =>
    supabase.from("profiles").update(values).eq("id", user.id).select("id");

  const { data, error } = await write({ ...details, ...planner });

  /*
    The planner columns arrived in migration 0004, and migrations here are
    applied by hand. On a database that has not had it, `study_until` and
    `settle_minutes` do not exist (42703) or are not granted (42501) — and
    because the settings page reads a missing column as undefined and falls
    back to a default, the form renders perfectly and only saving fails. The
    name and timezone have been writable since 0001 and have nothing to do
    with it, so they are saved anyway and the message names the migration
    rather than blaming the session.
  */
  const plannerMissing =
    error &&
    (error.code === "42703" || error.code === "42501") &&
    /study_until|settle_minutes/.test(`${error.message} ${error.details ?? ""}`);

  if (plannerMissing) {
    const retry = await write(details);
    if (retry.error || !retry.data?.length) {
      return { formError: `Could not save your details (${error?.code ?? "unknown"}).` };
    }

    revalidatePath("/settings");
    revalidatePath("/dashboard", "layout");
    return {
      formError:
        "Your name and timezone were saved. The two planning fields could not be — this database has not had migration 0004_planning_window.sql applied, so the columns they need are not there yet.",
    };
  }

  if (error) return { formError: `Could not save your details (${error.code}). Try again.` };
  if (!data || data.length === 0) {
    // The row is gone or the policy refused it; either way signing in again
    // is the only thing the person can usefully do.
    return { formError: "That profile could not be found. Sign in again." };
  }

  revalidatePath("/settings");
  // The planner reads both of the new fields, so its pages must refresh too.
  revalidatePath("/dashboard");
  revalidatePath("/plan");
  revalidatePath("/dashboard", "layout");
  return { ok: true };
}
