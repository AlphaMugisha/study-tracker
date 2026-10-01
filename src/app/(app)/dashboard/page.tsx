import type { Metadata } from "next";

import { PageContainer } from "@/components/layout/app-shell";
import { SupportDashboard } from "@/components/admin/support-dashboard";
import { Reveal, RevealWords } from "@/components/shared/reveal";
import { Block, BlockHeading, Eyebrow } from "@/components/shared/surface";
import { HelpDialog } from "@/components/help/help-dialog";
import { HelpList, HelpMigrationNotice } from "@/components/help/help-list";
import { LiveActivity } from "@/components/today/live-activity";
import { SchoolLockBanner, SchoolLocked } from "@/components/school-day/school-lock";
import {
  DayStats,
  DueSoonList,
  HomePlanPreview,
  RestOfDay,
  StudyFromTimetable,
  TodayProgress,
} from "@/components/today/sections";
import { requireSessionContext, displayName } from "@/lib/auth";
import { getHelpRequests } from "@/lib/data/help";
import { getStudyRecency } from "@/lib/data/study-history";
import { getActiveTimetable, getSubjects } from "@/lib/data/timetable";
import { byUrgency, getAssignments, getRevisionTasks, groupAssignments } from "@/lib/data/tasks";
import { firstNameOf, formatFullDate, greeting } from "@/lib/format";
import { buildEveningPlan, timeToMinutesSafe } from "@/lib/planner/build-plan";
import { suggestStudy } from "@/lib/planner/suggest-study";
import { clockIn, resolveNow } from "@/lib/timetable/resolve";
import { formatDurationCompact } from "@/lib/timetable/types";
import type { DayOfWeek } from "@/types/database";

export const metadata: Metadata = { title: "Today" };

export default async function TodayPage() {
  const session = await requireSessionContext();

  /**
   * A support account gets a different dashboard entirely.
   *
   * Showing a parent the student view means showing them their own empty
   * timetable and their own homework, of which they have none — a page about
   * nobody. What they actually opened the app for is the child.
   */
  if (session.profile?.role === "admin") return <SupportDashboard session={session} />;

  const now = new Date();

  const [{ entries }, assignments, revision, help, subjects, studiedDaysAgo] =
    await Promise.all([
      getActiveTimetable(),
      getAssignments(now),
      getRevisionTasks(),
      getHelpRequests(session.user.id),
      getSubjects(),
      getStudyRecency(),
    ]);

  /**
   * Her clock, not the server's. On Vercel those are different, and a
   * dashboard that says "you are in Maths" against the host's timezone is
   * worse than one that says nothing.
   */
  const timezone = session.profile?.timezone ?? "UTC";
  const { minutes: nowMinutes, dayOfWeek: today } = clockIn(timezone);
  const state = resolveNow(entries, nowMinutes, today);
  const todaysEntries = entries.filter((e) => e.dayOfWeek === today);
  const schoolEndsMinutes =
    todaysEntries.length > 0
      ? Math.max(...todaysEntries.map((e) => e.endMinutes))
      : null;

  // Same guidance the /plan page builds, from the same inputs, so the two
  // screens cannot recommend different subjects on the same evening.
  const guidance = suggestStudy({
    entries,
    today: today as DayOfWeek,
    nowMinutes,
    assignments,
    revision,
    studiedDaysAgo,
  });

  const plan = buildEveningPlan({
    schoolEndsMinutes,
    settleMinutes: session.profile?.settle_minutes ?? 30,
    studyUntilMinutes: timeToMinutesSafe(session.profile?.study_until, 21 * 60),
    assignments,
    revision,
    suggestions: guidance.suggestions,
    nowMinutes,
  });
  const groups = groupAssignments(assignments, now);
  const dueSoon = [...groups.overdue, ...groups.dueSoon].sort(byUrgency).slice(0, 5);

  const trackedToday = assignments.filter(
    (a) => a.due_date === now.toISOString().slice(0, 10) || a.overdue,
  );
  const doneToday = trackedToday.filter((a) => a.status === "completed").length;

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

      <SchoolLockBanner />

      <Reveal>
        <DayStats
          stats={[
            {
              label: "Lessons today",
              value: String(lessonsToday),
              tone: "lesson" as const,
              href: "/timetable",
            },
            {
              label: "Due soon",
              value: String(dueSoon.length),
              tone: groups.overdue.length > 0 ? ("danger" as const) : ("pause" as const),
              href: "/homework",
            },
            {
              label: "Work tonight",
              value: workMinutes > 0 ? formatDurationCompact(workMinutes) : "None",
              tone: "brand" as const,
              href: "/plan",
            },
          ]}
        />
      </Reveal>

      {/*
        A 12-column grid, not a stack.

        The splits start at xl rather than lg because of the sidebar: it takes
        264px, so at a 1024px window the content area is only ~660px and an 8/4
        split would leave a 220px rail — narrower than the cards need. At xl
        the same split is 592/296, which works. Below xl everything stacks,
        which is the right answer at those widths anyway.
      */}
      <div className="mt-rhythm space-y-rhythm md:space-y-rhythm-lg">
        <Block aria-label="Right now">
          <div className="grid gap-6 lg:gap-8 xl:grid-cols-12">
            <Reveal className="h-full xl:col-span-8">
              {/* Live: re-resolves on a timer so the countdown counts down. */}
            <LiveActivity initial={state} />
            </Reveal>

            {/*
              "Up next" used to sit above this, and the next lesson appeared
              on this screen three times: the hero ends with "Then Java at
              10:00", the card restated it in large type, and it is the first
              row of the list below. Two of those were the same sentence in
              different fonts. The hero states it in context and this list
              states it with everything that follows, which is the part
              nothing else answers.
            */}
            <Reveal index={1} className="h-full xl:col-span-4">
              <RestOfDay entries={restOfDay} />
            </Reveal>
          </div>
        </Block>

        <SchoolLocked label="Your evening plan unlocks after school">
        <Block id="evening">
          <Reveal>
            <BlockHeading
              eyebrow="After school"
              tone="revise"
              title="When you get home."
              description={
                // A suggestion's label already reads as a sentence ("Chemistry,
                // ready for tomorrow"), so wrapping it in "Start with …" makes
                // a comma splice. Its reason is the better line anyway.
                plan.startWith?.reason
                  ? `${plan.startWith.reason} Finish by ${plan.endsBy}.`
                  : plan.startWith
                    ? `Start with ${plan.startWith.label}, and finish by ${plan.endsBy}.`
                    : "Nothing outstanding. The evening is yours."
              }
            />
          </Reveal>

          {/* Tonight's order is the widest because it is a timeline; due-soon
              sits beside it; the ring needs the least but has a hard floor —
              148px plus 72px of padding is 220px, so the 3-up arrangement
              waits for 2xl. At xl it would resolve to 206px and overflow. */}
          {/* "What to study" takes the slot due-soon had at 2xl, and due-soon
              drops to its own full-width row — it is a list, so it loses
              nothing by being wide, and the three cards that read as a set
              stay on one line. */}
          <div className="grid gap-6 lg:grid-cols-12 lg:gap-8">
            <Reveal index={1} className="h-full lg:col-span-7 2xl:col-span-5">
              <HomePlanPreview plan={plan} />
            </Reveal>
            <Reveal index={2} className="h-full lg:col-span-5 2xl:col-span-3">
              <TodayProgress done={doneToday} total={trackedToday.length} />
            </Reveal>
            <Reveal index={3} className="h-full lg:col-span-7 2xl:col-span-4">
              <StudyFromTimetable suggestions={guidance.suggestions} />
            </Reveal>
            <Reveal index={4} className="h-full lg:col-span-5 2xl:col-span-12">
              <DueSoonList assignments={dueSoon} />
            </Reveal>
          </div>
        </Block>
        </SchoolLocked>

        {/*
          Outside the school-mode lock, on purpose.

          School mode leaves exactly one thing available: writing something
          down before it is lost. "I did not follow that" is the same kind of
          capture as "we were set this" — and it is only ever true DURING the
          lesson. Locking it until she gets home would mean the list only ever
          catches what survived the bus ride, which is the half that was never
          the problem.
        */}
        <Block id="stuck">
          <Reveal>
            <BlockHeading
              eyebrow="Stuck on"
              tone={help.open.length > 0 ? "danger" : "brand"}
              title={
                help.open.length > 0
                  ? "Things that have not clicked yet."
                  : "Nothing you have flagged."
              }
              count={help.open.length}
              description="Write down what you do not understand. Whoever supports you sees this list, so putting it here counts as asking."
              action={<HelpDialog subjects={subjects} />}
            />
          </Reveal>
          <Reveal index={1}>
            {help.pendingMigration ? (
              <HelpMigrationNotice />
            ) : (
              <HelpList
                entries={help.open.slice(0, 6)}
                emptyLabel="Nothing on the list. When something does not make sense, put it here rather than hoping it comes up again."
              />
            )}
          </Reveal>
        </Block>
      </div>

    </PageContainer>
  );
}
