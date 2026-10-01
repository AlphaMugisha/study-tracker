import type { Metadata } from "next";
import Link from "next/link";
import { BookMarked, ListChecks, NotebookPen, Plus } from "lucide-react";

import { PageContainer } from "@/components/layout/app-shell";
import { PageHeader } from "@/components/layout/page-header";
import { DeferredList, PlanTimeline, StartWithCard } from "@/components/plan/evening-plan";
import { RevisionActions } from "@/components/plan/revision-actions";
import { RevisionDialog } from "@/components/plan/revision-dialog";
import { RowSessionButton } from "@/components/plan/session-controls";
import { StudySlots, SuggestionList } from "@/components/plan/study-suggestions";
import { PriorityBadge, StatusBadge, SubjectDot } from "@/components/shared/badges";
import { ItemCard, ItemGrid } from "@/components/shared/item-card";
import { Reveal } from "@/components/shared/reveal";
import { Block, BlockHeading, Surface } from "@/components/shared/surface";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { getOpenSession } from "@/lib/actions/sessions";
import { requireSessionContext } from "@/lib/auth";
import { getStudyRecency } from "@/lib/data/study-history";
import { byUrgency, getAssignments, getRevisionTasks, type RevisionView } from "@/lib/data/tasks";
import { getActiveTimetable, getSubjects } from "@/lib/data/timetable";
import { formatDueLabel } from "@/lib/format";
import { buildEveningPlan, timeToMinutesSafe } from "@/lib/planner/build-plan";
import { suggestStudy } from "@/lib/planner/suggest-study";
import { clockIn } from "@/lib/timetable/resolve";
import { formatDuration } from "@/lib/timetable/types";
import type { AssignmentView } from "@/lib/data/tasks";
import type { DayOfWeek } from "@/types/database";

export const metadata: Metadata = { title: "Home plan" };

export default async function PlanPage() {
  const now = new Date();
  const [session, { entries }, assignments, revision, openSession, subjects, studiedDaysAgo] =
    await Promise.all([
      requireSessionContext(),
      getActiveTimetable(),
      getAssignments(now),
      getRevisionTasks(),
      getOpenSession(),
      getSubjects(),
      getStudyRecency(),
    ]);

  /**
   * Her clock, not the server's — the dashboard has always done this and this
   * page had not. It mattered less when the timetable was read for one number;
   * now that the suggestions turn on which day it is and what has already been
   * taught today, a server an hour ahead would recommend tomorrow's subjects a
   * day early and file this morning's lessons as still to come.
   */
  const { minutes: nowMinutes, dayOfWeek: today } = clockIn(
    session.profile?.timezone ?? "UTC",
    now,
  );
  const todaysEntries = entries.filter((e) => e.dayOfWeek === today);
  const schoolEndsMinutes =
    todaysEntries.length > 0 ? Math.max(...todaysEntries.map((e) => e.endMinutes)) : null;

  /**
   * What the timetable says to study, worked out before the plan is built so
   * the planner can spend leftover time on it. Until now the timetable was
   * read for exactly one number here — when school finishes — and the rest of
   * the week it describes went unused.
   */
  const guidance = suggestStudy({
    entries,
    // `clockIn` is typed `number` because it falls back to a lookup that
    // cannot be proven exhaustive; every branch of it returns 1–7.
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

  const outstanding = assignments.filter((a) => a.status !== "completed").sort(byUrgency);
  const openRevision = revision.filter((r) => r.status !== "completed");
  const activeTaskId = openSession?.assignmentId ?? null;

  return (
    <PageContainer>
      <PageHeader
        eyebrow="Home plan"
        title="When you get home."
        description={`Ordered by what is most urgent, fitted into the time you actually have, and finished by ${plan.endsBy}.`}
      />

      <div className="space-y-rhythm md:space-y-rhythm-lg">
        <Block id="start-with">
          <Reveal>
            <StartWithCard
              plan={plan}
              openSessionId={openSession?.id ?? null}
              activeTaskId={activeTaskId}
            />
          </Reveal>
        </Block>

        {plan.deferred.length > 0 ? (
          <Block id="deferred">
            <Reveal>
              <DeferredList plan={plan} />
            </Reveal>
          </Block>
        ) : null}

        <Block id="tonight">
          <Reveal>
            <BlockHeading
              eyebrow="Tonight"
              tone="revise"
              title="The order to work in."
              description="Long tasks are split into sittings, with a break once enough work has built up."
            />
          </Reveal>
          <Reveal index={1}>
            <PlanTimeline plan={plan} activeTaskId={activeTaskId} />
          </Reveal>
        </Block>

        {/*
          Read off the timetable, not off a to-do list. This sits below the
          plan rather than above it because homework has a deadline and this
          does not — but it is the only section on the page that can tell her
          about a subject nobody has set anything for.
        */}
        <Block id="study">
          <Reveal>
            <BlockHeading
              eyebrow="From your timetable"
              tone="revise"
              title="What to study."
              description="Ranked by what is coming up, what was just taught, and what nothing else in here would ever raise. Each one says why."
            />
          </Reveal>
          <Reveal index={1}>
            <SuggestionList guidance={guidance} />
          </Reveal>

          {guidance.slots.length > 0 ? (
            <Reveal index={2} className="mt-6">
              <StudySlots slots={guidance.slots} />
            </Reveal>
          ) : null}
        </Block>

        <Block id="outstanding">
          <Reveal>
            <BlockHeading
              eyebrow="Still to do"
              tone="lesson"
              title="What the plan is built from."
              description="Everything outstanding, and the revision you have queued."
            />
          </Reveal>
          <div className="grid gap-6 lg:grid-cols-2 lg:gap-8">
            <Reveal index={1}>
              <TaskPanel
                title="Homework to do"
                icon={NotebookPen}
                empty="Nothing outstanding. You're all caught up."
                count={outstanding.length}
                action={
                  <Button asChild variant="ghost" size="sm">
                    <Link href="/homework?new=1">
                      <Plus aria-hidden="true" />
                      Add
                    </Link>
                  </Button>
                }
              >
                {outstanding.slice(0, 8).map((a, i) => (
                  <HomeworkRow
                    key={a.id}
                    index={i}
                    assignment={a}
                    openSessionId={openSession?.id ?? null}
                    isActive={activeTaskId === a.id}
                  />
                ))}
              </TaskPanel>
            </Reveal>

            <Reveal index={2}>
              <TaskPanel
                title="Revision"
                icon={BookMarked}
                empty="Nothing to revise yet. Add something to study."
                count={openRevision.length}
                action={<RevisionDialog subjects={subjects} />}
              >
                {openRevision.map((r, i) => (
                  <RevisionRow key={r.id} task={r} index={i} />
                ))}
              </TaskPanel>
            </Reveal>
          </div>
        </Block>
      </div>
    </PageContainer>
  );
}

function TaskPanel({
  title,
  icon: Icon,
  empty,
  count,
  action,
  children,
}: {
  title: string;
  icon: typeof ListChecks;
  empty: string;
  count: number;
  action?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <Surface className="flex h-full flex-col">
      <div className="mb-6 flex items-center justify-between gap-4">
        <div className="flex items-baseline gap-3">
          <h3 className="text-section text-ink">{title}</h3>
          <span className="text-[0.95rem] text-ink-subtle" data-numeric>
            {count}
          </span>
        </div>
        {action}
      </div>
      {count === 0 ? (
        <EmptyState icon={Icon} headline={empty} action={action} className="border-0 py-8" />
      ) : (
        <ItemGrid className="@md:grid-cols-1 @3xl:grid-cols-2">{children}</ItemGrid>
      )}
    </Surface>
  );
}

function HomeworkRow({
  assignment,
  openSessionId,
  isActive,
  index,
}: {
  assignment: AssignmentView;
  openSessionId: string | null;
  isActive: boolean;
  index: number;
}) {
  return (
    <ItemCard
      index={index}
      active={isActive}
      accent={assignment.overdue ? "danger" : "lesson"}
      title={assignment.title}
      trailing={<PriorityBadge priority={assignment.priority} />}
      meta={
        <>
          <span className="inline-flex items-center gap-1.5">
            <SubjectDot colorToken={assignment.subject?.color_token ?? null} />
            {assignment.subject?.name ?? "No subject"}
          </span>
          <span className={assignment.overdue ? "font-medium text-danger" : undefined}>
            {assignment.overdue
              ? "Overdue"
              : formatDueLabel(assignment.due_date, assignment.due_time)}
          </span>
          <span data-numeric>{formatDuration(assignment.estimated_minutes)}</span>
        </>
      }
      footer={
        <RowSessionButton
          taskId={assignment.id}
          openSessionId={openSessionId}
          isActive={isActive}
        />
      }
    />
  );
}

function RevisionRow({ task, index }: { task: RevisionView; index: number }) {
  return (
    <ItemCard
      index={index}
      accent="revise"
      title={task.title}
      trailing={<StatusBadge status={task.status} />}
      meta={
        <>
          <span className="inline-flex items-center gap-1.5">
            <SubjectDot colorToken={task.subject?.color_token ?? null} />
            {task.subject?.name ?? "General"}
          </span>
          <span data-numeric>{formatDuration(task.estimated_minutes)}</span>
        </>
      }
      footer={<RevisionActions id={task.id} status={task.status} />}
    />
  );
}
