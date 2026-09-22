import type { Metadata } from "next";
import { BookMarked, ListChecks, NotebookPen } from "lucide-react";

import { PageContainer } from "@/components/layout/app-shell";
import { PageHeader } from "@/components/layout/page-header";
import { PriorityBadge, StatusBadge, SubjectDot } from "@/components/shared/badges";
import { Reveal } from "@/components/shared/reveal";
import { HomePlanPreview } from "@/components/today/sections";
import { EmptyState } from "@/components/ui/empty-state";
import { byUrgency, getAssignments, getRevisionTasks, type RevisionView } from "@/lib/data/tasks";
import { getActiveTimetable } from "@/lib/data/timetable";
import { formatDueLabel } from "@/lib/format";
import { buildHomePlanPreview } from "@/lib/temporary/home-plan-preview";
import { formatDuration, toDayOfWeek } from "@/lib/timetable/types";
import type { AssignmentView } from "@/lib/data/tasks";

export const metadata: Metadata = { title: "Home plan" };

export default async function PlanPage() {
  const now = new Date();
  const [{ entries }, assignments, revision] = await Promise.all([
    getActiveTimetable(),
    getAssignments(now),
    getRevisionTasks(),
  ]);

  const today = toDayOfWeek(now);
  const todaysEntries = entries.filter((e) => e.dayOfWeek === today);
  const schoolEndsMinutes =
    todaysEntries.length > 0 ? Math.max(...todaysEntries.map((e) => e.endMinutes)) : null;

  const plan = buildHomePlanPreview({ schoolEndsMinutes, assignments, revision });
  const outstanding = assignments.filter((a) => a.status !== "completed").sort(byUrgency);
  const openRevision = revision.filter((r) => r.status !== "completed");

  return (
    <PageContainer>
      <Reveal>
        <PageHeader
          title="When you get home"
          description={
            schoolEndsMinutes
              ? "A rough order of work for this evening, built from what's outstanding."
              : "A rough order of work, built from what's outstanding."
          }
        />
      </Reveal>

      <div className="grid gap-4 lg:grid-cols-12 lg:gap-5">
        <Reveal index={1} className="lg:col-span-7">
          <HomePlanPreview blocks={plan.blocks} startsAt={plan.startsAt} />
          <p className="mt-3 text-xs leading-5 text-ink-subtle">
            This is a preview, not a schedule yet. It lays outstanding work end to end
            with a break between each. Deadlines, priorities and a proper finish time
            come when the planner is built.
          </p>
        </Reveal>

        <div className="grid gap-4 lg:col-span-5 lg:gap-5">
          <Reveal index={2}>
            <TaskPanel
              title="Homework to do"
              icon={NotebookPen}
              empty="Nothing outstanding. You're all caught up."
              count={outstanding.length}
            >
              {outstanding.slice(0, 6).map((a) => (
                <HomeworkRow key={a.id} assignment={a} />
              ))}
            </TaskPanel>
          </Reveal>

          <Reveal index={3}>
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
    <section className="rounded-lg border border-border bg-card p-5 shadow-card">
      <div className="mb-3 flex items-baseline justify-between">
        <h2 className="text-base font-semibold text-ink">{title}</h2>
        <span className="text-[13px] text-ink-subtle" data-numeric>
          {count}
        </span>
      </div>
      {count === 0 ? (
        <EmptyState
          icon={Icon}
          headline={empty}
          className="border-0 bg-transparent py-6"
        />
      ) : (
        <ul className="divide-y divide-border/70">{children}</ul>
      )}
    </section>
  );
}

function HomeworkRow({ assignment }: { assignment: AssignmentView }) {
  return (
    <li className="flex items-start gap-3 py-2.5">
      <SubjectDot colorToken={assignment.subject?.color_token ?? null} className="mt-1.5" />
      <span className="min-w-0 flex-1">
        <span className="block truncate text-sm font-medium text-ink">
          {assignment.title}
        </span>
        <span className="mt-0.5 flex flex-wrap items-center gap-x-2 text-xs text-ink-subtle">
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
      <span className="shrink-0">
        <PriorityBadge priority={assignment.priority} />
      </span>
    </li>
  );
}

function RevisionRow({ task }: { task: RevisionView }) {
  return (
    <li className="flex items-start gap-3 py-2.5">
      <SubjectDot colorToken={task.subject?.color_token ?? null} className="mt-1.5" />
      <span className="min-w-0 flex-1">
        <span className="block truncate text-sm font-medium text-ink">{task.title}</span>
        <span className="mt-0.5 flex flex-wrap items-center gap-x-2 text-xs text-ink-subtle">
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
