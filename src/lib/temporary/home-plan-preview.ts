import type { AssignmentView, RevisionView } from "@/lib/data/tasks";
import { byUrgency } from "@/lib/data/tasks";
import { minutesToLabel } from "@/lib/timetable/types";

/**
 * ⚠️ TEMPORARY — replaced by the real scheduler in Phase 6.
 * ---------------------------------------------------------------------------
 * A preview, not an algorithm. It takes the real assignments and revision
 * tasks and lays them end to end from school-end + 30 minutes, dropping a
 * 15-minute break between each. That is all.
 *
 * What the real planner will add, and this deliberately does not do:
 *   - a day-end cutoff, with anything that does not fit reported as deferred
 *   - splitting tasks longer than 45 minutes into blocks
 *   - breaks driven by accumulated work rather than one-per-task
 *   - persistence to `study_sessions`, and respecting manual reordering
 *
 * Kept here under `temporary/` rather than in `lib/planner/` so it is obvious
 * this is scaffolding and does not get mistaken for the real thing.
 */

export type PlanPreviewBlock = {
  id: string;
  kind: "homework" | "revision" | "break";
  label: string;
  detail: string | null;
  startLabel: string;
  minutes: number;
};

const SETTLE_MINUTES = 30;
const BREAK_MINUTES = 15;
const MAX_BLOCKS = 4;

export function buildHomePlanPreview({
  schoolEndsMinutes,
  assignments,
  revision,
}: {
  /** Minutes since midnight when the last timetabled entry finishes. */
  schoolEndsMinutes: number | null;
  assignments: AssignmentView[];
  revision: RevisionView[];
}): { blocks: PlanPreviewBlock[]; startsAt: string | null } {
  const outstanding = assignments
    .filter((a) => a.status !== "completed")
    .sort(byUrgency)
    .slice(0, MAX_BLOCKS);

  const revisionToday = revision.filter((r) => r.status !== "completed").slice(0, 1);

  if (outstanding.length === 0 && revisionToday.length === 0) {
    return { blocks: [], startsAt: null };
  }

  // Default to a 15:00 finish when there is no timetable to read it from.
  const start = (schoolEndsMinutes ?? 15 * 60) + SETTLE_MINUTES;
  let cursor = start;
  const blocks: PlanPreviewBlock[] = [];

  const items: Array<{ kind: "homework" | "revision"; label: string; detail: string | null; minutes: number; id: string }> = [
    ...outstanding.map((a) => ({
      kind: "homework" as const,
      id: a.id,
      label: a.title,
      detail: a.subject?.name ?? null,
      minutes: a.estimated_minutes,
    })),
    ...revisionToday.map((r) => ({
      kind: "revision" as const,
      id: r.id,
      label: r.title,
      detail: r.subject?.name ?? null,
      minutes: r.estimated_minutes,
    })),
  ];

  items.forEach((item, index) => {
    blocks.push({
      id: item.id,
      kind: item.kind,
      label: item.label,
      detail: item.detail,
      startLabel: minutesToLabel(cursor),
      minutes: item.minutes,
    });
    cursor += item.minutes;

    if (index < items.length - 1) {
      blocks.push({
        id: `break-${index}`,
        kind: "break",
        label: "Break",
        detail: null,
        startLabel: minutesToLabel(cursor),
        minutes: BREAK_MINUTES,
      });
      cursor += BREAK_MINUTES;
    }
  });

  return { blocks, startsAt: minutesToLabel(start) };
}
