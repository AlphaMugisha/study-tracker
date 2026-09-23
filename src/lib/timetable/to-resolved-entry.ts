import { timeToMinutes, type ResolvedEntry } from "@/lib/timetable/types";

/**
 * A database row becomes a `ResolvedEntry`.
 *
 * The one part of the retired temporary resolver worth keeping. It lives here
 * rather than in `types.ts` because it knows the shape of a PostgREST row,
 * which the type module deliberately does not.
 */
export function toResolvedEntry(row: {
  id: string;
  activity_type: ResolvedEntry["activityType"];
  title: string | null;
  room: string | null;
  teacher: string | null;
  day_of_week: number;
  start_time: string;
  end_time: string;
  subject_id: string | null;
  subjects: { name: string; color_token: string } | null;
}): ResolvedEntry {
  const startMinutes = timeToMinutes(row.start_time);
  const endMinutes = timeToMinutes(row.end_time);
  const subjectName = row.subjects?.name ?? null;

  // A lesson is named by its subject; anything else by its own title.
  const label = subjectName ?? row.title ?? "Untitled";
  const detail = subjectName && row.title ? row.title : (row.room ?? row.teacher);

  return {
    id: row.id,
    activityType: row.activity_type,
    label,
    detail,
    subjectName,
    subjectId: row.subject_id,
    colorToken: row.subjects?.color_token ?? null,
    room: row.room,
    dayOfWeek: row.day_of_week as ResolvedEntry["dayOfWeek"],
    startMinutes,
    endMinutes,
    startLabel: row.start_time.slice(0, 5),
    endLabel: row.end_time.slice(0, 5),
    durationMinutes: endMinutes - startMinutes,
  };
}
