import { createClient } from "@/lib/supabase/server";
import type { ActivityType } from "@/types/database";

/**
 * Append one academic event to the activity log.
 *
 * `activity_type` is a closed enum, so this can only ever record things
 * somebody did inside StudyFlow.
 *
 * `user_id` is WHOSE RECORD this belongs to; `actor_id` is WHO DID IT. They
 * were always the same until 0007 let a linked support account edit a
 * student's timetable. Now they can differ, and that difference is the whole
 * point: she reads her own log, so an edit her parent makes appears in it with
 * their name on it. A change she cannot see would make the link something
 * other than what she agreed to.
 *
 * `actor_id` is never passed in. It is always the caller, because the RLS
 * policy requires it — nobody can attribute an action to somebody else.
 *
 * Logging is best-effort: a failed write must never fail the mutation the
 * student actually asked for.
 */
export async function logActivity(entry: {
  activityType: ActivityType;
  entityType?: string;
  entityId?: string;
  metadata?: Record<string, unknown>;
  /** Whose record this lands on. Defaults to the caller's own. */
  onBehalfOf?: string;
}): Promise<void> {
  try {
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) return;

    await supabase.from("activity_logs").insert({
      user_id: entry.onBehalfOf ?? user.id,
      actor_id: user.id,
      activity_type: entry.activityType,
      entity_type: entry.entityType ?? null,
      entity_id: entry.entityId ?? null,
      metadata: entry.metadata ?? {},
    });
  } catch {
    // Swallowed deliberately — see the note above.
  }
}
