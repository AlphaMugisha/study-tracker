import { cache } from "react";

import { createClient } from "@/lib/supabase/server";
import type { UserRole } from "@/types/database";

/**
 * Who can see whom, under 0008 oversight.
 *
 * A support account sees every student without asking; a student sees every
 * support account that can therefore see them. Both answers come from the one
 * `oversight_counterparts` function, which is the point — the disclosure to
 * the student is the same query as the listing for the admin, so the portal
 * cannot start showing students that the Settings panel has stopped
 * mentioning.
 *
 * Nothing here is privileged in the service-role sense. The function is
 * SECURITY DEFINER so a student can learn who oversees them without being
 * granted general read on admin profile rows, and it returns names and
 * timezones — never a way in.
 *
 * `admin_student_links` is still read separately (`lib/data/support.ts`): it
 * is no longer the gate, but it still carries notes and the history of
 * anything requested the old way, and it is still what `can_manage_timetable`
 * checks before letting a parent edit a timetable.
 */

export type Counterpart = {
  id: string;
  name: string;
  timezone: string;
  role: UserRole;
};

export type Oversight = {
  /** Students, when the caller is an admin. Support accounts, when a student. */
  counterparts: Counterpart[];
  /**
   * True when migration 0008 has not been applied yet.
   *
   * It matters that this is distinguishable from "no students". An admin whose
   * portal is empty needs to know whether nobody has registered or whether the
   * migration is simply not in — the first is a fact about the world and the
   * second is a job to do, and an empty list says the wrong one.
   */
  pendingMigration: boolean;
};

const EMPTY: Oversight = { counterparts: [], pendingMigration: false };

/**
 * PostgREST codes for "that function is not in the schema cache".
 *
 * PGRST202 is the specific one for an unresolvable RPC; the others are the
 * same set `lib/data/help.ts` watches for, kept in step because the cause is
 * identical — a migration file sitting in the repo and not in the database.
 */
const MISSING_FUNCTION = new Set(["PGRST202", "PGRST205", "PGRST204", "42883", "42P01"]);

export const getOversight = cache(async function getOversight(): Promise<Oversight> {
  const supabase = await createClient();

  const { data, error } = await supabase.rpc("oversight_counterparts");

  if (error) {
    if (MISSING_FUNCTION.has(error.code)) return { ...EMPTY, pendingMigration: true };
    return EMPTY;
  }

  const rows = (data ?? []) as Array<{
    id: string;
    full_name: string | null;
    timezone: string | null;
    role: UserRole;
  }>;

  return {
    counterparts: rows.map((r) => ({
      id: r.id,
      // A profile row always has a name — the 0001 trigger derives one from the
      // email — but the column is only `not null` for rows that trigger made.
      name: r.full_name?.trim() || "Unnamed account",
      timezone: r.timezone ?? "UTC",
      role: r.role,
    })),
    pendingMigration: false,
  };
});
