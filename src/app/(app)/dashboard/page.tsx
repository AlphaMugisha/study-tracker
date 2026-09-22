import type { Metadata } from "next";

import { PageContainer } from "@/components/layout/app-shell";
import { Reveal } from "@/components/shared/reveal";
import { CurrentActivityCard } from "@/components/today/current-activity-card";
import {
  DayStats,
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
import { formatDuration, toDayOfWeek } from "@/lib/timetable/types";

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

  const lessonsToday = todaysEntries.filter((e) => e.activityType === "class").length;
  const workMinutes = plan.blocks
    .filter((b) => b.kind !== "break")
    .reduce((total, b) => total + b.minutes, 0);

  return (
    <PageContainer>
      <Reveal>
        <header className="mb-6 sm:mb-8">
          {/* The greeting IS the headline, as in the reference -- "Today" as a
              title told her nothing she didn't already know. */}
          <h1 className="text-greeting font-semibold text-ink">
            {greeting(now)}, {firstNameOf(displayName(session))}.
          </h1>
          <p className="mt-1.5 text-[15px] text-ink-muted">{formatFullDate(now)}</p>
        </header>
      </Reveal>

      <Reveal index={1} className="mb-5 sm:mb-6">
        <DayStats
          stats={[
            { label: "Lessons today", value: String(lessonsToday) },
            {
              label: "Due soon",
              value: String(dueSoon.length),
              tone: groups.overdue.length > 0 ? "danger" : "default",
            },
            {
              label: "Work tonight",
              value: workMinutes > 0 ? formatDuration(workMinutes) : "None",
            },
          ]}
        />
      </Reveal>

      {/*
        Main column carries the narrative -- what am I doing, what happens when
        I get home, what's due. The rail carries the glanceable things. On
        mobile it all collapses to one column in that same reading order.
      */}
      <div className="grid items-start gap-4 lg:grid-cols-12 lg:gap-5">
        <div className="flex flex-col gap-4 lg:col-span-8 lg:gap-5">
          <Reveal index={2}>
            <CurrentActivityCard state={state} />
          </Reveal>
          <Reveal index={4}>
            <HomePlanPreview blocks={plan.blocks} startsAt={plan.startsAt} />
          </Reveal>
          <Reveal index={6}>
            <DueSoonList assignments={dueSoon} />
          </Reveal>
        </div>

        <div className="flex flex-col gap-4 lg:col-span-4 lg:sticky lg:top-[4.75rem] lg:gap-5">
          <Reveal index={3}>
            <UpNextCard next={upNext} />
          </Reveal>
          <Reveal index={5}>
            <TodayProgress done={doneToday} total={trackedToday.length} />
          </Reveal>
        </div>
      </div>
    </PageContainer>
  );
}
