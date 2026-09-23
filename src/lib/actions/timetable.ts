"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";

import { logActivity } from "@/lib/activity";
import { createClient } from "@/lib/supabase/server";
import { fieldErrorsFrom } from "@/lib/validation/auth";
import type { DayOfWeek } from "@/types/database";

/**
 * Timetable entry mutations — entering a school week by hand.
 *
 * Until now a timetable could only arrive via the seed script, which made the
 * whole Timetable page read-only furniture. Phase 8's upload-and-extract flow
 * is still to come; this is the manual path, and it is the one that has to
 * work regardless.
 *
 * Three database constraints shape the validation here, and each is mirrored
 * so the student gets a field error rather than a raw PostgREST failure:
 *
 *   timetable_entries_time_order         end must be after start
 *   timetable_entries_class_has_subject  a lesson must name its subject
 *   timetable_entries_describable        anything else must have a title
 *
 * A fourth cannot be mirrored and is translated instead: an EXCLUDE ... USING
 * gist constraint rejects two entries that overlap on the same day, coming
 * back as 23P01. That check belongs in the database — it is the only place
 * that can see every other entry — so here it becomes a readable message.
 */

const entrySchema = z
  .object({
    activityType: z.enum(["class", "break", "free", "study", "other"]),
    subjectId: z.string().uuid().nullable(),
    /**
     * A lesson can name its subject in words instead of picking an id. The
     * timetable is where a student first says what they study, so demanding
     * they go and create subjects elsewhere before they can enter a single
     * lesson gets the order backwards.
     */
    subjectName: z.string().max(80, "That subject name is too long.").nullable(),
    title: z.string().max(200, "That title is a little too long.").nullable(),
    // The column is a literal union (1..7) in the generated types, so the
    // range check and the narrowing happen in one place rather than leaving a
    // bare `number` to be cast later.
    dayOfWeek: z
      .number()
      .int()
      .min(1)
      .max(7)
      .transform((v) => v as DayOfWeek),
    startTime: z.string().regex(/^\d{2}:\d{2}$/, "Use a time like 08:30."),
    endTime: z.string().regex(/^\d{2}:\d{2}$/, "Use a time like 09:20."),
    room: z.string().max(60, "Keep the room under 60 characters.").nullable(),
    teacher: z.string().max(80, "Keep the teacher under 80 characters.").nullable(),
  })
  .refine((v) => v.endTime > v.startTime, {
    message: "The end time has to be after the start time.",
    path: ["endTime"],
  })
  .refine(
    (v) =>
      v.activityType !== "class" ||
      v.subjectId !== null ||
      (v.subjectName !== null && v.subjectName.trim() !== ""),
    { message: "Which subject is this lesson?", path: ["subjectName"] },
  )
  .refine(
    (v) =>
      v.subjectId !== null ||
      (v.subjectName !== null && v.subjectName.trim() !== "") ||
      (v.title !== null && v.title.trim() !== ""),
    { message: "Give this a name.", path: ["title"] },
  );

export type TimetableEntryFormState = {
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
    activityType: text("activityType") ?? "class",
    subjectId: subjectId === "__none__" ? null : subjectId,
    subjectName: text("subjectName"),
    title: text("title"),
    dayOfWeek: Number(text("dayOfWeek") ?? 1),
    startTime: text("startTime") ?? "",
    endTime: text("endTime") ?? "",
    room: text("room"),
    teacher: text("teacher"),
  };
}

function describe(message: string): string {
  if (message.includes("23P01") || message.includes("overlap") || message.includes("exclusion")) {
    return "That clashes with something already on this day. Check the times.";
  }
  if (message.includes("timetable_entries_time_order")) {
    return "The end time has to be after the start time.";
  }
  return "Something went wrong saving that. Try again.";
}

/**
 * The active timetable, created on first use.
 *
 * `timetable_versions_confirmed_when_active` requires `confirmed_at` on an
 * active row, so it is set here rather than left to a default — a draft that
 * nothing can ever activate would be worse than no timetable at all.
 */
async function ensureActiveVersion(
  supabase: Awaited<ReturnType<typeof createClient>>,
  userId: string,
): Promise<string | null> {
  const { data: existing } = await supabase
    .from("timetable_versions")
    .select("id")
    .eq("status", "active")
    .maybeSingle();
  if (existing) return existing.id;

  const { data: created } = await supabase
    .from("timetable_versions")
    .insert({
      user_id: userId,
      name: "My timetable",
      status: "active",
      source_type: "manual",
      confirmed_at: new Date().toISOString(),
    })
    .select("id")
    .single();

  return created?.id ?? null;
}

/** The palette slots, cycled so a new subject is not always chart-1. */
const COLOR_TOKENS = ["chart-1", "chart-2", "chart-3", "chart-4", "chart-5"] as const;

/**
 * Turn a typed subject name into a subject id, creating it if needed.
 *
 * Matching is case-insensitive and trims, because `subjects_user_name_key` is
 * a unique index on `(user_id, lower(btrim(name)))` — so "maths " and "Maths"
 * are the same subject to the database, and this must agree with it or the
 * insert fails on a constraint the student cannot see.
 */
async function resolveSubject(
  supabase: Awaited<ReturnType<typeof createClient>>,
  userId: string,
  name: string,
): Promise<{ id: string } | { error: string }> {
  const wanted = name.trim();

  const { data: existing } = await supabase
    .from("subjects")
    .select("id, name")
    .ilike("name", wanted);

  const match = (existing ?? []).find(
    (s) => s.name.trim().toLowerCase() === wanted.toLowerCase(),
  );
  if (match) return { id: match.id };

  const { count } = await supabase
    .from("subjects")
    .select("id", { count: "exact", head: true });

  const { data: created, error } = await supabase
    .from("subjects")
    .insert({
      user_id: userId,
      name: wanted,
      color_token: COLOR_TOKENS[(count ?? 0) % COLOR_TOKENS.length],
    })
    .select("id")
    .single();

  if (error || !created) return { error: "Could not create that subject." };

  await logActivity({
    activityType: "subject_created",
    entityType: "subject",
    entityId: created.id,
    metadata: { name: wanted, via: "timetable" },
  });

  return { id: created.id };
}

export async function saveTimetableEntryAction(
  _prev: TimetableEntryFormState,
  formData: FormData,
): Promise<TimetableEntryFormState> {
  const parsed = entrySchema.safeParse(read(formData));
  if (!parsed.success) return { fieldErrors: fieldErrorsFrom(parsed.error) };

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { formError: "Your session has expired. Sign in again." };

  const versionId = await ensureActiveVersion(supabase, user.id);
  if (!versionId) return { formError: "Could not open your timetable. Try again." };

  // A typed name wins over a picked id: if the student edited the field, that
  // is the more recent expression of intent.
  let subjectId = parsed.data.subjectId;
  if (parsed.data.subjectName && parsed.data.subjectName.trim() !== "") {
    const resolved = await resolveSubject(supabase, user.id, parsed.data.subjectName);
    if ("error" in resolved) return { fieldErrors: { subjectName: resolved.error } };
    subjectId = resolved.id;
  }

  const row = {
    subject_id: subjectId,
    activity_type: parsed.data.activityType,
    // A lesson is named by its subject, so a redundant title is dropped.
    title: parsed.data.activityType === "class" ? null : parsed.data.title,
    day_of_week: parsed.data.dayOfWeek,
    start_time: parsed.data.startTime,
    end_time: parsed.data.endTime,
    room: parsed.data.room,
    teacher: parsed.data.teacher,
  };

  const id = formData.get("id");
  const isEdit = typeof id === "string" && id !== "";

  const { error } = isEdit
    ? await supabase.from("timetable_entries").update(row).eq("id", id)
    : await supabase
        .from("timetable_entries")
        .insert({ ...row, user_id: user.id, timetable_version_id: versionId });

  if (error) {
    const msg = describe(error.message);
    return msg.startsWith("That clashes")
      ? { fieldErrors: { startTime: msg } }
      : { formError: msg };
  }

  await logActivity({
    activityType: isEdit ? "timetable_entry_updated" : "timetable_updated",
    entityType: "timetable_entry",
    entityId: isEdit ? id : undefined,
    metadata: { day: parsed.data.dayOfWeek, start: parsed.data.startTime },
  });

  revalidateTimetablePages();
  return { ok: true };
}

export async function deleteTimetableEntryAction(formData: FormData): Promise<void> {
  const id = formData.get("id");
  if (typeof id !== "string") return;

  const supabase = await createClient();
  await supabase.from("timetable_entries").delete().eq("id", id);

  revalidateTimetablePages();
}

function revalidateTimetablePages(): void {
  revalidatePath("/timetable");
  // The dashboard reads the timetable for "what am I doing now", and the
  // planner reads it for when school ends.
  revalidatePath("/dashboard");
  revalidatePath("/plan");
}
