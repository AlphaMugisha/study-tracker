import type { Metadata } from "next";
import { BookMarked, ListChecks, NotebookPen } from "lucide-react";

import { PageContainer } from "@/components/layout/app-shell";
import { PageHeader } from "@/components/layout/page-header";
import { DeferredList, PlanTimeline, StartWithCard } from "@/components/plan/evening-plan";
import { RowSessionButton } from "@/components/plan/session-controls";
import { PriorityBadge, StatusBadge, SubjectDot } from "@/components/shared/badges";
import { Reveal } from "@/components/shared/reveal";
import { Block, BlockHeading, Surface } from "@/components/shared/surface";
import { EmptyState } from "@/components/ui/empty-state";
import { getOpenSession } from "@/lib/actions/sessions";
import { requireSessionContext } from "@/lib/auth";
import { byUrgency, getAssignments, getRevisionTasks, type RevisionView } from "@/lib/data/tasks";
import { getActiveTimetable } from "@/lib/data/timetable";
import { formatDueLabel } from "@/lib/format";
import { buildEveningPlan, timeToMinutesSafe } from "@/lib/planner/build-plan";
import { formatDuration, toDayOfWeek } from "@/lib/timetable/types";
import type { AssignmentView } from "@/lib/data/tasks";

export const metadata: Metadata = { title: "Home plan" };

export default async function PlanPage() {
  const now = new Date();
  const [session, { entries }, assignments, revision, openSession] = await Promise.all([
    requireSessionContext(),
    getActiveTimetable(),
    getAssignments(now),
    getRevisionTasks(),
    getOpenSession(),
  ]);

  const today = toDayOfWeek(now);
  const todaysEntries = entries.filter((e) => e.dayOfWeek === today);
  const schoolEndsMinutes =
    todaysEntries.length > 0 ? Math.max(...todaysEntries.map((e) => e.endMinutes)) : null;

  const plan = buildEveningPlan({
    schoolEndsMinutes,
    settleMinutes: session.profile?.settle_minutes ?? 30,
    studyUntilMinutes: timeToMinutesSafe(session.profile?.study_until, 21 * 60),
    assignments,
    revision,
    nowMinutes: now.getHours() * 60 + now.getMinutes(),
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
              >
                {outstanding.slice(0, 8).map((a) => (
                  <HomeworkRow
                    key={a.id}
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
                empty="No revision tasks planned."
                count={openRevision.length}
              >
                {openRevision.map((r) => (
                  <RevisionRow key={r.id} task={r} />
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
  children,
}: {
  title: string;
  icon: typeof ListChecks;
  empty: string;
  count: number;
  children: React.ReactNode;
}) {
  return (
    <Surface className="flex h-full flex-col">
      <div className="mb-6 flex items-baseline justify-between">
        <h3 className="text-section text-ink">{title}</h3>
        <span className="text-[0.95rem] text-ink-subtle" data-numeric>
          {count}
        </span>
      </div>
      {count === 0 ? (
        <EmptyState icon={Icon} headline={empty} className="border-0 py-8" />
      ) : (
        <ul className="divide-y divide-border">{children}</ul>
      )}
    </Surface>
  );
}

function HomeworkRow({
  assignment,
  openSessionId,
  isActive,
}: {
  assignment: AssignmentView;
  openSessionId: string | null;
  isActive: boolean;
}) {
  return (
    <li className="flex items-start gap-4 py-4">
      <SubjectDot
        colorToken={assignment.subject?.color_token ?? null}
        className="mt-2 size-2.5"
      />
      <span className="min-w-0 flex-1">
        <span className="block truncate text-body font-medium text-ink">
          {assignment.title}
        </span>
        <span className="mt-1.5 flex flex-wrap items-center gap-x-3 text-[0.9rem] text-ink-subtle">
          <span>{assignment.subject?.name ?? "No subject"}</span>
          <span aria-hidden="true">·</span>
          <span className={assignment.overdue ? "font-medium text-danger" : undefined}>
            {assignment.overdue
              ? "Overdue"
              : formatDueLabel(assignment.due_date, assignment.due_time)}
          </span>
          <span aria-hidden="true">·</span>
          <span data-numeric>{formatDuration(assignment.estimated_minutes)}</span>
        </span>
      </span>
      <span className="flex shrink-0 items-center gap-2">
        <PriorityBadge priority={assignment.priority} />
        <RowSessionButton
          taskId={assignment.id}
          openSessionId={openSessionId}
          isActive={isActive}
        />
      </span>
    </li>
  );
}

function RevisionRow({ task }: { task: RevisionView }) {
  return (
    <li className="flex items-start gap-4 py-4">
      <SubjectDot colorToken={task.subject?.color_token ?? null} className="mt-2 size-2.5" />
      <span className="min-w-0 flex-1">
        <span className="block truncate text-body font-medium text-ink">{task.title}</span>
        <span className="mt-1.5 flex flex-wrap items-center gap-x-3 text-[0.9rem] text-ink-subtle">
          <span>{task.subject?.name ?? "General"}</span>
          <span aria-hidden="true">·</span>
          <span data-numeric>{formatDuration(task.estimated_minutes)}</span>
        </span>
      </span>
      <span className="shrink-0">
        <StatusBadge status={task.status} />
      </span>
    </li>
  );
}
