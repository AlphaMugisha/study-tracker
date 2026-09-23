import type { Metadata } from "next";
import Link from "next/link";
import { NotebookPen, X } from "lucide-react";

import { AssignmentCard } from "@/components/homework/assignment-card";
import { AssignmentDialog } from "@/components/homework/assignment-dialog";
import { PageContainer } from "@/components/layout/app-shell";
import { PageHeader } from "@/components/layout/page-header";
import { Reveal } from "@/components/shared/reveal";
import { Block, BlockHeading } from "@/components/shared/surface";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import {
  byUrgency,
  getAssignments,
  groupAssignments,
  type AssignmentView,
} from "@/lib/data/tasks";
import { getOpenSession } from "@/lib/actions/sessions";
import { getSubjects } from "@/lib/data/timetable";
import type { Subject } from "@/types/database";

export const metadata: Metadata = { title: "Homework" };

type SearchParams = Promise<Record<string, string | string[] | undefined>>;

export default async function HomeworkPage({
  searchParams,
}: {
  searchParams: SearchParams;
}) {
  const params = await searchParams;
  const openNew = params.new === "1";
  // Set by a lesson on the timetable, so "what do I owe for Maths?" is one tap.
  const subjectFilter = typeof params.subject === "string" ? params.subject : null;
  const now = new Date();
  const [assignments, subjects, openSession] = await Promise.all([
    getAssignments(now),
    getSubjects(),
    getOpenSession(),
  ]);
  const filtered = subjectFilter
    ? assignments.filter((a) => a.subject_id === subjectFilter)
    : assignments;
  const activeSubject = subjectFilter
    ? (subjects.find((s) => s.id === subjectFilter) ?? null)
    : null;

  const groups = groupAssignments(filtered, now);

  const outstanding =
    groups.overdue.length + groups.dueSoon.length + groups.upcoming.length;

  return (
    <PageContainer>
      <PageHeader
          eyebrow={activeSubject ? activeSubject.name : "Homework"}
          title={activeSubject ? `${activeSubject.name} homework.` : "Everything you owe."}
          description={
            activeSubject
              ? "Filtered to one subject. Clear the filter to see everything."
              : "Ordered by what needs attention first, not by when you wrote it down."
          }
          action={
            <>
              {activeSubject ? (
                <Button asChild variant="outline">
                  <Link href="/homework">
                    <X aria-hidden="true" />
                    All subjects
                  </Link>
                </Button>
              ) : null}
              <AssignmentDialog subjects={subjects} defaultOpen={openNew} />
            </>
          }
        />

      {filtered.length === 0 ? (
        <Reveal index={1}>
          <EmptyState
            icon={NotebookPen}
            headline={
              activeSubject ? `Nothing due for ${activeSubject.name}.` : "Nothing due yet."
            }
            body="Enjoy the free time, or add a task if you have one."
            action={<AssignmentDialog subjects={subjects} />}
          />
        </Reveal>
      ) : (
        <div className="space-y-rhythm md:space-y-rhythm-lg">
          <Section
            title="Overdue"
            tone="danger"
            assignments={groups.overdue.sort(byUrgency)}
            subjects={subjects}
            index={1}
            openSession={openSession}
          />
          <Section
            title="Due soon"
            assignments={groups.dueSoon.sort(byUrgency)}
            subjects={subjects}
            index={2}
            openSession={openSession}
            emptyMessage={
              outstanding === 0 ? undefined : "Nothing due in the next few days."
            }
          />
          <Section
            title="Upcoming"
            assignments={groups.upcoming.sort(byUrgency)}
            subjects={subjects}
            index={3}
            openSession={openSession}
          />
          <Section
            title="Completed"
            assignments={groups.completed}
            subjects={subjects}
            index={4}
            muted
            openSession={openSession}
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
  openSession,
}: {
  title: string;
  assignments: AssignmentView[];
  subjects: Subject[];
  index: number;
  tone?: "danger";
  muted?: boolean;
  emptyMessage?: string;
  openSession: { id: string; assignmentId: string | null } | null;
}) {
  // An empty section is usually just noise; only show one when the copy earns it.
  if (assignments.length === 0 && !emptyMessage) return null;

  return (
    <Block id={title.toLowerCase().replace(/\s+/g, "-")}>
      <Reveal index={index}>
        <BlockHeading
          tone={tone === "danger" ? "danger" : muted ? "subtle" : "lesson"}
          title={
            <span
              className={
                tone === "danger" ? "text-danger" : muted ? "text-ink-muted" : undefined
              }
            >
              {title}
            </span>
          }
          count={assignments.length}
        />
      </Reveal>

      <Reveal index={index}>
        {assignments.length === 0 ? (
          <p className="rounded-xl border border-dashed border-border px-5 py-8 text-center text-sm text-ink-muted">
            {emptyMessage}
          </p>
        ) : (
          <div className="grid gap-3">
            {assignments.map((a) => (
              <AssignmentCard
                key={a.id}
                assignment={a}
                subjects={subjects}
                openSessionId={openSession?.id ?? null}
                isActive={openSession?.assignmentId === a.id}
              />
            ))}
          </div>
        )}
      </Reveal>
    </Block>
  );
}
