"use client";

import { useSchoolDay } from "@/components/school-day/school-day-provider";
import { CurrentActivityCard } from "@/components/today/current-activity-card";
import type { TimetableState } from "@/lib/timetable/types";

/**
 * The current-activity card, ticking.
 *
 * `CurrentActivityCard` renders a `TimetableState` and nothing else — which is
 * why this is a five-line component rather than a rewrite. The card was built
 * that way on purpose; all that changed is where the state comes from.
 *
 * Until hydration the server's resolution is used, so the card is never blank
 * and never disagrees with itself between the two paints.
 */
export function LiveActivity({ initial }: { initial: TimetableState }) {
  const day = useSchoolDay();
  return <CurrentActivityCard state={day?.state ?? initial} />;
}
