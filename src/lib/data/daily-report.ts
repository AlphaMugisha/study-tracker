import { cache } from "react";

import { buildDailyReports, type DailyReport } from "@/lib/report/daily";
import { createClient } from "@/lib/supabase/server";

/**
 * Per-day reports for one student.
 *
 * Ordinary authenticated reads, same as everything else on the support side:
 * `activity_logs`, `study_sessions` and `assignments` all have SELECT policies
 * of `has_student_access(user_id)`, so this returns rows to her and to whoever
 * she has actively linked, and nothing to anyone else. The bucketing itself is
 * pure and lives in `lib/report/daily.ts`, where it is unit-tested against the
 * timezone edges that actually break this kind of thing.
 */

/** A sane ceiling on the range, so a hand-typed `?days=9999` cannot ask for
 *  the entire history in one query. */
const MAX_DAYS = 90;

export const getDailyReports = cache(async function getDailyReports(
  studentId: string,
  timezone: string,
  days = 14,
): Promise<DailyReport[]> {
  const span = Math.min(Math.max(1, Math.floor(days)), MAX_DAYS);
  const supabase = await createClient();
  const now = new Date();

  // One extra day of slack at the far end: an event late on the earliest day
  // can belong to it in her timezone while sitting outside a UTC-cut window.
  const since = new Date(now.getTime() - (span + 1) * 86_400_000).toISOString();

  const [{ data: activity }, { data: sessions }, { data: assignments }] = await Promise.all([
    supabase
      .from("activity_logs")
      .select("activity_type, metadata, created_at")
      .eq("user_id", studentId)
      .gte("created_at", since)
      .order("created_at", { ascending: true }),
    supabase
      .from("study_sessions")
      .select("started_at, duration_minutes")
      .eq("user_id", studentId)
      .gte("started_at", since),
    supabase
      .from("assignments")
      .select("title, due_date, status, completed_at")
      .eq("user_id", studentId)
      // `due_date` is a plain calendar date, so it is filtered as one.
      .gte("due_date", since.slice(0, 10)),
  ]);

  return buildDailyReports({
    timezone,
    days: span,
    now,
    activity: activity ?? [],
    sessions: sessions ?? [],
    assignments: assignments ?? [],
  });
});
