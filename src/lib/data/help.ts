import { cache } from "react";

import { createClient } from "@/lib/supabase/server";
import type { HelpRequest } from "@/types/database";

/**
 * "Things I don't understand."
 *
 * Reads go through RLS exactly like everything else: the SELECT policy is
 * `has_student_access(user_id)`, so this returns her rows to her and to a
 * support account she has linked, and nothing to anyone else.
 */

export type HelpEntry = HelpRequest & {
  subjectName: string | null;
  assignmentTitle: string | null;
};

export type HelpList = {
  open: HelpEntry[];
  resolved: HelpEntry[];
  /**
   * True when migration 0006 has not been applied yet. The feature then shows
   * a short "run the migration" note instead of an empty list — an empty list
   * would say "she understands everything", which is a very different and
   * completely wrong message.
   */
  pendingMigration: boolean;
};

const EMPTY: HelpList = { open: [], resolved: [], pendingMigration: false };

/** PostgREST codes for "that table/column is not in the schema cache". */
const MISSING_TABLE = new Set(["PGRST205", "PGRST204", "42P01"]);

export const getHelpRequests = cache(async function getHelpRequests(
  studentId: string,
): Promise<HelpList> {
  const supabase = await createClient();

  const { data, error } = await supabase
    .from("help_requests")
    .select("*, subjects(name), assignments(title)")
    .eq("user_id", studentId)
    .order("created_at", { ascending: false });

  if (error) {
    if (MISSING_TABLE.has(error.code)) return { ...EMPTY, pendingMigration: true };
    return EMPTY;
  }

  const rows = ((data ?? []) as never[]) as Array<
    HelpRequest & {
      subjects: { name: string } | null;
      assignments: { title: string } | null;
    }
  >;

  const entries: HelpEntry[] = rows.map((r) => ({
    ...r,
    subjectName: r.subjects?.name ?? null,
    assignmentTitle: r.assignments?.title ?? null,
  }));

  return {
    open: entries.filter((e) => e.status === "open"),
    // Sorted by when they were sorted out, not when they were raised: the
    // interesting question about a resolved item is how recently it cleared.
    resolved: entries
      .filter((e) => e.status === "resolved")
      .sort((a, b) => (b.resolved_at ?? "").localeCompare(a.resolved_at ?? "")),
    pendingMigration: false,
  };
});

/** How long something has been sitting unresolved, in plain words. */
export function stuckFor(entry: HelpEntry, now: Date = new Date()): string {
  const days = Math.floor(
    (now.getTime() - new Date(entry.created_at).getTime()) / 86_400_000,
  );
  if (days < 1) return "Today";
  if (days === 1) return "Since yesterday";
  if (days < 7) return `${days} days`;
  const weeks = Math.floor(days / 7);
  return weeks === 1 ? "Over a week" : `${weeks} weeks`;
}
