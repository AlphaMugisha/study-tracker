import type { Metadata } from "next";

import { PageContainer } from "@/components/layout/app-shell";
import { Reveal } from "@/components/shared/reveal";
import { CurrentActivityCard } from "@/components/today/current-activity-card";
import {
  DueSoonList,
  HomePlanPreview,
  TodayProgress,
  UpNextCard,
} from "@/components/today/sections";
import { requireSessionContext, displayName } from "@/lib/auth";
import { getActiveTimetable } from "@/lib/data/timetable";
import { byUrgency, getAssignments, getRevisionTasks, groupAssignments } from "@/lib/data/tasks";
import { firstNameOf, formatFullDate, greeting } from "@/lib/format";
import { buildHomePlanPreview } from "@/lib/temporary/home-plan-preview";
import { resolveTemporary } from "@/lib/timetable/resolve-temporary";
import { toDayOfWeek } from "@/lib/timetable/types";

export const metadata: Metadata = { title: "Today" };

export default async function TodayPage() {
  const session = await requireSessionContext();
  const now = new Date();

  const [{ entries }, assignments, revision] = await Promise.all([
    getActiveTimetable(),
    getAssignments(now),
    getRevisionTasks(),
  ]);

  /**
   * TEMPORARY: Phase 3B replaces this single call with `resolveNow()`, which
   * resolves in the student's timezone and drives a live countdown. The page
   * below does not change — it already renders a `TimetableState`.
   *
   * `demoFallback` keeps the card populated outside school hours so the
   * interface can be reviewed at any time of day.
   */
  const state = resolveTemporary(entries, now, { demoFallback: true });

  const today = toDayOfWeek(now);
  const todaysEntries = entries.filter((e) => e.dayOfWeek === today);
  const schoolEndsMinutes =
    todaysEntries.length > 0
      ? Math.max(...todaysEntries.map((e) => e.endMinutes))
      : null;

  const plan = buildHomePlanPreview({ schoolEndsMinutes, assignments, revision });
  const groups = groupAssignments(assignments, now);
  const dueSoon = [...groups.overdue, ...groups.dueSoon].sort(byUrgency).slice(0, 5);

  const trackedToday = assignments.filter(
    (a) => a.due_date === now.toISOString().slice(0, 10) || a.overdue,
  );
  const doneToday = trackedToday.filter((a) => a.status === "completed").length;

  // `next` exists in several states, not just mid-lesson — before school it is
  // the first entry, and in a gap it is what the gap leads to.
  const upNext =
    state.kind === "in_activity"
      ? state.next
      : state.kind === "before_school" || state.kind === "gap"
        ? state.next
        : null;

  return (
    <PageContainer>
      <Reveal>
        <header className="mb-8 sm:mb-10">
          <p className="text-sm text-ink-muted">
            {greeting(now)}, {firstNameOf(displayName(session))}
          </p>
          <h1 className="mt-1 text-display font-semibold text-ink">Today</h1>
          <p className="mt-1.5 text-[15px] text-ink-muted">{formatFullDate(now)}</p>
        </header>
      </Reveal>

      {/*
        Mobile order is the reading order that matters: what am I doing, what's
        next, what happens at home, what's due, how am I going. On desktop the
        first two pair up and the rest falls into a 12-column grid.
      */}
      <div className="grid gap-4 lg:grid-cols-12 lg:gap-5">
        <Reveal index={1} className="lg:col-span-8">
          <CurrentActivityCard state={state} />
        </Reveal>

        <Reveal index={2} className="lg:col-span-4">
          <UpNextCard next={upNext} />
        </Reveal>

        <Reveal index={3} className="lg:col-span-7">
          <HomePlanPreview blocks={plan.blocks} startsAt={plan.startsAt} />
        </Reveal>

        <Reveal index={4} className="lg:col-span-5">
          <DueSoonList assignments={dueSoon} />
        </Reveal>

        <Reveal index={5} className="lg:col-span-4">
          <TodayProgress done={doneToday} total={trackedToday.length} />
        </Reveal>
      </div>
    </PageContainer>
  );
}
