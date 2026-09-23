import { cache } from "react";
import { createClient } from "@/lib/supabase/server";
import { toResolvedEntry } from "@/lib/timetable/to-resolved-entry";
import type { ResolvedEntry } from "@/lib/timetable/types";
import type { Subject, TimetableVersion } from "@/types/database";

/**
 * Server-side reads. Every one of these runs through the anon-key client with
 * the user's session, so Row Level Security does the filtering — there is no
 * `where user_id = ...` anywhere below, and there does not need to be.
 */

type EntryRow = Parameters<typeof toResolvedEntry>[0];

export type ActiveTimetable = {
  version: TimetableVersion | null;
  entries: ResolvedEntry[];
};

/**
 * The confirmed timetable in force today. `status = 'active'` is guaranteed
 * unique per date range by an exclusion constraint, so this cannot be
 * ambiguous.
 */
export const getActiveTimetable = cache(async function getActiveTimetable(): Promise<ActiveTimetable> {
  const supabase = await createClient();

  const { data: version } = await supabase
    .from("timetable_versions")
    .select("*")
    .eq("status", "active")
    .maybeSingle();

  if (!version) return { version: null, entries: [] };

  const { data } = await supabase
    .from("timetable_entries")
    .select(
      "id, activity_type, title, room, teacher, day_of_week, start_time, end_time, subject_id, subjects(name, color_token)",
    )
    .eq("timetable_version_id", version.id)
    .order("day_of_week")
    .order("start_time");

  const entries = ((data ?? []) as unknown as EntryRow[]).map(toResolvedEntry);

  return { version: version as TimetableVersion, entries };
});

export const getSubjects = cache(async function getSubjects(): Promise<Subject[]> {
  const supabase = await createClient();
  const { data } = await supabase.from("subjects").select("*").order("name");
  return (data ?? []) as Subject[];
});
