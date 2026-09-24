"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";

import { logActivity } from "@/lib/activity";
import { createClient } from "@/lib/supabase/server";
import {
  extractTimetable,
  findClashes,
  normaliseEntries,
  MAX_IMAGE_BYTES,
  SUPPORTED_MEDIA_TYPES,
  type ExtractedEntry,
  type ExtractionResult,
} from "@/lib/timetable/extract";

/**
 * Upload a photo of a timetable, check what was read, then commit it.
 *
 * Two actions on purpose, with a human in between. `analyse` never writes;
 * `confirm` writes only what came back from the review screen. Nothing the
 * model produced reaches the database without somebody having looked at it —
 * the timetable drives the countdown, the evening plan and school mode, so a
 * silent misreading is expensive in a way a wrong homework title is not.
 *
 * Both accept an optional `studentId`, so a linked support account can do this
 * for a student. That is permitted by migration 0007 and by nothing else: the
 * RLS predicate is `can_manage_timetable`, which covers the timetable and the
 * subjects a lesson needs, and leaves homework, revision, sessions and the
 * help list owner-only.
 */

export type AnalyseState = {
  formError?: string;
  fieldErrors?: Record<string, string>;
  result?: ExtractionResult;
  /** Rows that could never have been saved, with the reason. */
  dropped?: Array<{ entry: ExtractedEntry; reason: string }>;
  /** Pairs that overlap — the database would reject the second of each. */
  clashCount?: number;
  studentId?: string;
  studentName?: string;
};

export type ConfirmState = {
  formError?: string;
  ok?: boolean;
  saved?: number;
};

/**
 * Whose timetable is being edited, and may the caller edit it?
 *
 * The database would refuse a forbidden write anyway. This exists so the
 * refusal is a sentence rather than an empty result, and so every query below
 * can filter by an explicit id — since 0002 the SELECT policy has returned
 * rows for linked students too, and an unfiltered read here would mix two
 * people's timetables together.
 */
async function resolveTarget(
  supabase: Awaited<ReturnType<typeof createClient>>,
  requested: string | null,
): Promise<{ id: string; name: string; onBehalf: boolean } | { error: string }> {
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "Your session has expired. Sign in again." };

  if (!requested || requested === user.id) {
    return { id: user.id, name: "your", onBehalf: false };
  }

  const { data: link } = await supabase
    .from("admin_student_links")
    .select("id")
    .eq("admin_id", user.id)
    .eq("student_id", requested)
    .eq("status", "active")
    .is("revoked_at", null)
    .maybeSingle();

  if (!link) {
    return { error: "You do not have access to that student's timetable." };
  }

  const { data: profile } = await supabase
    .from("profiles")
    .select("full_name")
    .eq("id", requested)
    .maybeSingle();

  return {
    id: requested,
    name: profile?.full_name?.split(/\s+/)[0] ?? "that student",
    onBehalf: true,
  };
}

// ---------------------------------------------------------------------------
// Step one: read the image
// ---------------------------------------------------------------------------

export async function analyseTimetableAction(
  _prev: AnalyseState,
  formData: FormData,
): Promise<AnalyseState> {
  const file = formData.get("image");
  const classContext = String(formData.get("classContext") ?? "").trim();
  const requested = formData.get("studentId");

  const fieldErrors: Record<string, string> = {};
  if (!classContext) {
    fieldErrors.classContext = "Say which class you are in — the timetable covers several.";
  } else if (classContext.length > 80) {
    fieldErrors.classContext = "That is a little long for a class name.";
  }
  if (!(file instanceof File) || file.size === 0) {
    fieldErrors.image = "Choose a photo of the timetable.";
  } else if (!SUPPORTED_MEDIA_TYPES.includes(file.type as never)) {
    fieldErrors.image = "Use a JPEG, PNG, WebP or GIF. PDFs are not supported yet.";
  } else if (file.size > MAX_IMAGE_BYTES) {
    fieldErrors.image = `That image is ${(file.size / 1_000_000).toFixed(1)}MB. Keep it under ${
      MAX_IMAGE_BYTES / 1_000_000
    }MB.`;
  }

  if (Object.keys(fieldErrors).length > 0) return { fieldErrors };

  const supabase = await createClient();
  const target = await resolveTarget(
    supabase,
    typeof requested === "string" ? requested : null,
  );
  if ("error" in target) return { formError: target.error };

  const image = file as File;
  const data = Buffer.from(await image.arrayBuffer()).toString("base64");

  let result: ExtractionResult;
  try {
    result = await extractTimetable({
      data,
      mediaType: image.type as never,
      classContext,
    });
  } catch (error) {
    // The key being missing or the API being down are different problems from
    // an unreadable photo, and saying "try a clearer picture" to someone whose
    // API key is unset wastes their afternoon.
    const message = error instanceof Error ? error.message : "";
    if (message.includes("ANTHROPIC_API_KEY")) {
      return {
        formError:
          "Timetable reading is not configured on this server. Set ANTHROPIC_API_KEY, or leave TIMETABLE_EXTRACTOR on mock to try the flow with sample data.",
      };
    }
    return {
      formError: "The timetable reader could not be reached. Try again in a moment.",
    };
  }

  if (!result.readable) {
    return {
      formError:
        result.problem ??
        "That does not look like a timetable, or it is too unclear to read.",
    };
  }

  const { entries, dropped } = normaliseEntries(result.entries);

  if (entries.length === 0) {
    return {
      formError: `Nothing readable was found for "${classContext}". Check the class name matches what is printed on the timetable.`,
    };
  }

  return {
    result: { ...result, entries },
    dropped,
    clashCount: findClashes(entries).length,
    studentId: target.id,
    studentName: target.name,
  };
}

// ---------------------------------------------------------------------------
// Step two: commit what the human approved
// ---------------------------------------------------------------------------

const confirmEntrySchema = z.object({
  dayOfWeek: z.number().int().min(1).max(7),
  startTime: z.string().regex(/^\d{2}:\d{2}$/),
  endTime: z.string().regex(/^\d{2}:\d{2}$/),
  activityType: z.enum(["class", "break", "free", "study", "other"]),
  subject: z.string().nullable(),
  title: z.string().nullable(),
  room: z.string().nullable(),
  teacher: z.string().nullable(),
  confidence: z.enum(["high", "medium", "low"]),
});

const COLOR_TOKENS = ["chart-1", "chart-2", "chart-3", "chart-4", "chart-5"] as const;

export async function confirmTimetableAction(
  _prev: ConfirmState,
  formData: FormData,
): Promise<ConfirmState> {
  const payload = formData.get("entries");
  const requested = formData.get("studentId");
  const name = String(formData.get("name") ?? "").trim() || "My timetable";

  let rows: z.infer<typeof confirmEntrySchema>[];
  try {
    rows = z.array(confirmEntrySchema).min(1).parse(JSON.parse(String(payload)));
  } catch {
    return { formError: "Those entries could not be read. Start the upload again." };
  }

  const supabase = await createClient();
  const target = await resolveTarget(
    supabase,
    typeof requested === "string" ? requested : null,
  );
  if ("error" in target) return { formError: target.error };

  /*
    Archive first, insert second.

    `timetable_versions_no_active_overlap` is an EXCLUDE constraint: two active
    versions whose date ranges overlap are rejected. Inserting the new one
    before retiring the old would therefore fail on a constraint the person
    uploading has no way to understand.
  */
  const { error: archiveError } = await supabase
    .from("timetable_versions")
    .update({ status: "archived" })
    .eq("user_id", target.id)
    .eq("status", "active");

  if (archiveError) {
    return { formError: "The existing timetable could not be replaced. Try again." };
  }

  const { data: version, error: versionError } = await supabase
    .from("timetable_versions")
    .insert({
      user_id: target.id,
      name,
      status: "active",
      source_type: "image",
      confirmed_at: new Date().toISOString(),
      extraction_meta: { confirmedBy: target.onBehalf ? "support" : "student" },
    })
    .select("id")
    .single();

  if (versionError || !version) {
    return { formError: "The new timetable could not be created. Try again." };
  }

  // Subjects, resolved once per distinct name rather than once per lesson.
  const subjectIds = new Map<string, string>();
  const wantedSubjects = [
    ...new Set(
      rows
        .map((r) => r.subject?.trim())
        .filter((s): s is string => Boolean(s))
        .map((s) => s),
    ),
  ];

  const { data: existingSubjects } = await supabase
    .from("subjects")
    .select("id, name")
    .eq("user_id", target.id);

  for (const wanted of wantedSubjects) {
    const match = (existingSubjects ?? []).find(
      (s) => s.name.trim().toLowerCase() === wanted.toLowerCase(),
    );
    if (match) {
      subjectIds.set(wanted, match.id);
      continue;
    }

    const { data: created } = await supabase
      .from("subjects")
      .insert({
        user_id: target.id,
        name: wanted,
        color_token: COLOR_TOKENS[subjectIds.size % COLOR_TOKENS.length],
      })
      .select("id")
      .single();

    if (created) subjectIds.set(wanted, created.id);
  }

  const entries = rows.map((r) => {
    const subjectId = r.subject ? (subjectIds.get(r.subject.trim()) ?? null) : null;
    // A lesson whose subject could not be created must not be sent as a
    // class — `timetable_entries_class_has_subject` would reject the whole
    // insert and lose the rest of the week with it.
    const activityType = r.activityType === "class" && !subjectId ? "other" : r.activityType;

    return {
      user_id: target.id,
      timetable_version_id: version.id,
      subject_id: subjectId,
      activity_type: activityType,
      title: r.title ?? (activityType === "class" ? null : (r.subject ?? "Untitled")),
      day_of_week: r.dayOfWeek,
      start_time: r.startTime,
      end_time: r.endTime,
      room: r.room,
      teacher: r.teacher,
      confidence: r.confidence,
    };
  });

  const { data: inserted, error: entriesError } = await supabase
    .from("timetable_entries")
    .insert(entries)
    .select("id");

  if (entriesError) {
    // Roll the version back rather than leave an active timetable with no
    // lessons in it — that state reads as "school is over forever".
    await supabase.from("timetable_versions").delete().eq("id", version.id);
    return {
      formError: entriesError.message.includes("23P01")
        ? "Two of those lessons overlap. Go back and fix the clash."
        : "Those lessons could not be saved. Nothing was changed.",
    };
  }

  await logActivity({
    activityType: "timetable_confirmed",
    entityType: "timetable_version",
    entityId: version.id,
    onBehalfOf: target.id,
    metadata: {
      title: name,
      entries: inserted?.length ?? entries.length,
      source: "image",
      // Recorded so it is visible in her feed that somebody else did this.
      bySupport: target.onBehalf,
    },
  });

  revalidatePath("/timetable");
  revalidatePath("/dashboard");
  revalidatePath("/plan");
  if (target.onBehalf) revalidatePath(`/admin/${target.id}`);

  return { ok: true, saved: inserted?.length ?? entries.length };
}
