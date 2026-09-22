import { createClient } from "@/lib/supabase/server";
import type { ActivityType } from "@/types/database";

/**
 * Append one academic event to the activity log.
 *
 * `activity_type` is a closed enum, so this can only ever record things the
 * student did inside StudyFlow. Both `user_id` and `actor_id` are the caller —
 * the RLS insert policy requires it, and it is the only shape that makes sense
 * until an admin can act on a student's behalf (which they cannot, by design).
 *
 * Logging is best-effort: a failed write must never fail the mutation the
 * student actually asked for.
 */
export async function logActivity(entry: {
  activityType: ActivityType;
  entityType?: string;
  entityId?: string;
  metadata?: Record<string, unknown>;
}): Promise<void> {
  try {
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) return;

    await supabase.from("activity_logs").insert({
      user_id: user.id,
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
