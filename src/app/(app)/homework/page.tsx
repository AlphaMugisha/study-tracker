import type { Metadata } from "next";
import { NotebookPen } from "lucide-react";

import { AssignmentCard } from "@/components/homework/assignment-card";
import { AssignmentDialog } from "@/components/homework/assignment-dialog";
import { PageContainer } from "@/components/layout/app-shell";
import { PageHeader } from "@/components/layout/page-header";
import { Reveal } from "@/components/shared/reveal";
import { EmptyState } from "@/components/ui/empty-state";
import {
  byUrgency,
  getAssignments,
  groupAssignments,
  type AssignmentView,
} from "@/lib/data/tasks";
import { getSubjects } from "@/lib/data/timetable";
import type { Subject } from "@/types/database";

export const metadata: Metadata = { title: "Homework" };

export default async function HomeworkPage() {
  const now = new Date();
  const [assignments, subjects] = await Promise.all([getAssignments(now), getSubjects()]);
  const groups = groupAssignments(assignments, now);

  const outstanding =
    groups.overdue.length + groups.dueSoon.length + groups.upcoming.length;

  return (
    <PageContainer>
      <Reveal>
        <PageHeader
          title="Homework"
          description="Everything due, with what needs attention first."
          action={<AssignmentDialog subjects={subjects} />}
        />
      </Reveal>

      {assignments.length === 0 ? (
        <Reveal index={1}>
          <EmptyState
            icon={NotebookPen}
            headline="Nothing due yet."
            body="Enjoy the free time, or add a task if you have one."
            action={<AssignmentDialog subjects={subjects} />}
          />
        </Reveal>
      ) : (
        <div className="space-y-10">
          <Section
            title="Overdue"
            tone="danger"
            assignments={groups.overdue.sort(byUrgency)}
            subjects={subjects}
            index={1}
          />
          <Section
            title="Due soon"
            assignments={groups.dueSoon.sort(byUrgency)}
            subjects={subjects}
            index={2}
            emptyMessage={
              outstanding === 0 ? undefined : "Nothing due in the next few days."
            }
          />
          <Section
            title="Upcoming"
            assignments={groups.upcoming.sort(byUrgency)}
            subjects={subjects}
            index={3}
          />
          <Section
            title="Completed"
            assignments={groups.completed}
            subjects={subjects}
            index={4}
            muted
          />
        </div>
      )}
    </PageContainer>
  );
}

function Section({
  title,
  assignments,
  subjects,
  index,
  tone,
  muted,
  emptyMessage,
}: {
  title: string;
  assignments: AssignmentView[];
  subjects: Subject[];
  index: number;
  tone?: "danger";
  muted?: boolean;
  emptyMessage?: string;
}) {
  // An empty section is usually just noise; only show one when the copy earns it.
  if (assignments.length === 0 && !emptyMessage) return null;

  return (
    <Reveal index={index}>
      <section>
        <div className="mb-3 flex items-baseline gap-2.5">
          <h2
            className={`text-lg font-semibold ${
              tone === "danger" ? "text-danger" : muted ? "text-ink-muted" : "text-ink"
            }`}
          >
            {title}
          </h2>
          <span className="text-[13px] text-ink-subtle" data-numeric>
            {assignments.length}
          </span>
        </div>

        {assignments.length === 0 ? (
          <p className="rounded-lg border border-dashed border-border bg-card/60 px-4 py-6 text-center text-sm text-ink-muted">
            {emptyMessage}
          </p>
        ) : (
          <div className="grid gap-3">
            {assignments.map((a) => (
              <AssignmentCard key={a.id} assignment={a} subjects={subjects} />
            ))}
          </div>
        )}
      </section>
    </Reveal>
  );
}
