import { cache } from "react";

import { createClient } from "@/lib/supabase/server";

/**
 * How long ago each subject was last actually studied.
 *
 * `study_sessions` already carries `subject_id`, copied off the assignment when
 * a session opens so the attribution survives the homework being deleted. It
 * was only ever read as a total of minutes for the weekly report; this reads it
 * as recency, which is what the study suggester needs — "no session recorded
 * for Chemistry in a fortnight" is a reason to revise it, and a sum of minutes
 * cannot say that.
 *
 * RLS does the filtering, as everywhere else. A student with no sessions gets
 * an empty object, which the suggester reads as "never studied" rather than as
 * an error — so this degrades to a sensible recommendation rather than none.
 */

const DAY_MS = 86_400_000;

/** Subject id → whole days since its most recent recorded session. */
export const getStudyRecency = cache(async function getStudyRecency(
  windowDays = 21,
  now = new Date(),
): Promise<Record<string, number>> {
  const supabase = await createClient();
  const since = new Date(now.getTime() - windowDays * DAY_MS).toISOString();

  const { data } = await supabase
    .from("study_sessions")
    .select("subject_id, started_at")
    .not("subject_id", "is", null)
    .gte("started_at", since)
    .order("started_at", { ascending: false });

  const recency: Record<string, number> = {};
  for (const row of data ?? []) {
    // Ordered newest first, so the first sighting of a subject is its latest
    // session and every later row for it can be skipped.
    if (!row.subject_id || row.subject_id in recency) continue;
    const days = Math.floor((now.getTime() - new Date(row.started_at).getTime()) / DAY_MS);
    recency[row.subject_id] = Math.max(0, days);
  }

  return recency;
});
