import type { Metadata } from "next";

import { PageContainer } from "@/components/layout/app-shell";
import { Reveal, RevealWords } from "@/components/shared/reveal";
import { Block, BlockHeading, Eyebrow } from "@/components/shared/surface";
import { CurrentActivityCard } from "@/components/today/current-activity-card";
import {
  DayStats,
  DueSoonList,
  HomePlanPreview,
  RestOfDay,
  TodayProgress,
  UpNextCard,
} from "@/components/today/sections";
import { requireSessionContext, displayName } from "@/lib/auth";
import { getActiveTimetable } from "@/lib/data/timetable";
import { byUrgency, getAssignments, getRevisionTasks, groupAssignments } from "@/lib/data/tasks";
import { firstNameOf, formatFullDate, greeting } from "@/lib/format";
import { buildEveningPlan, timeToMinutesSafe } from "@/lib/planner/build-plan";
import { resolveTemporary } from "@/lib/timetable/resolve-temporary";
import { formatDurationCompact, toDayOfWeek } from "@/lib/timetable/types";

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

  const plan = buildEveningPlan({
    schoolEndsMinutes,
    settleMinutes: session.profile?.settle_minutes ?? 30,
    studyUntilMinutes: timeToMinutesSafe(session.profile?.study_until, 21 * 60),
    assignments,
    revision,
    nowMinutes: now.getHours() * 60 + now.getMinutes(),
  });
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

  /**
   * "Rest of today" is measured from the same point the current-activity card
   * is showing, not from the wall clock -- while the temporary resolver can
   * park that card mid-lesson via `demoFallback`, reading the clock here would
   * make the two cards disagree about what time it is.
   */
  const restFromMinutes =
    state.kind === "in_activity"
      ? state.current.endMinutes
      : state.kind === "gap"
        ? state.next.startMinutes
        : state.kind === "before_school"
          ? 0
          : null;

  const restOfDay =
    restFromMinutes === null
      ? []
      : todaysEntries
          .filter((e) => e.startMinutes >= restFromMinutes)
          .sort((a, b) => a.startMinutes - b.startMinutes);

  const lessonsToday = todaysEntries.filter((e) => e.activityType === "class").length;
  const workMinutes = plan.workMinutes;

  return (
    <PageContainer>
      {/* The greeting is the headline -- "Today" as a title tells her what the
          nav already said -- and it is the entry point of the whole dashboard,
          so it gets the most air on the page, above it and below it. */}
      <header className="mb-rhythm max-w-[20ch] pt-2 sm:max-w-none md:pt-6">
        <Eyebrow tone="accent" className="mb-7">
          {formatFullDate(now)}
        </Eyebrow>
        <h1 className="text-greeting text-balance text-ink">
          <RevealWords text={`${greeting(now)}, ${firstNameOf(displayName(session))}.`} />
        </h1>
      </header>

      <Reveal>
        <DayStats
          stats={[
            { label: "Lessons today", value: String(lessonsToday), tone: "lesson" as const },
            {
              label: "Due soon",
              value: String(dueSoon.length),
              tone: groups.overdue.length > 0 ? ("danger" as const) : ("pause" as const),
            },
            {
              label: "Work tonight",
              value: workMinutes > 0 ? formatDurationCompact(workMinutes) : "None",
              tone: "brand" as const,
            },
          ]}
        />
      </Reveal>

      {/*
        A single narrative column, the way the reference composes: full-width
        blocks separated by rhythm, with grids *inside* a block rather than a
        main-plus-rail split. A rail would come out around 250px at the widths
        this is actually used at, which is too narrow to carry anything.
      */}
      <div className="mt-rhythm space-y-rhythm md:space-y-rhythm-lg">
        <Block aria-label="Right now">
          <Reveal>
            <CurrentActivityCard state={state} />
          </Reveal>

          <div className="mt-6 grid gap-6 md:mt-8 lg:grid-cols-2 lg:gap-8">
            <Reveal index={1}>
              <UpNextCard next={upNext} />
            </Reveal>
            <Reveal index={2}>
              <RestOfDay entries={restOfDay} />
            </Reveal>
          </div>
        </Block>

        <Block id="evening">
          <Reveal>
            <BlockHeading
              eyebrow="After school"
              tone="revise"
              title="When you get home."
              description={
                plan.startWith
                  ? `Start with ${plan.startWith.label}, and finish by ${plan.endsBy}.`
                  : "Nothing outstanding. The evening is yours."
              }
            />
          </Reveal>
          <div className="grid gap-6 lg:grid-cols-2 lg:gap-8">
            <Reveal index={1}>
              <HomePlanPreview plan={plan} />
            </Reveal>
            <Reveal index={2}>
              <TodayProgress done={doneToday} total={trackedToday.length} />
            </Reveal>
          </div>
        </Block>

        <Block id="due">
          <Reveal>
            <BlockHeading
              eyebrow="Deadlines"
              tone="pause"
              title="What's coming due."
              count={dueSoon.length}
            />
          </Reveal>
          <Reveal index={1}>
            <DueSoonList assignments={dueSoon} />
          </Reveal>
        </Block>
      </div>
    </PageContainer>
  );
}
