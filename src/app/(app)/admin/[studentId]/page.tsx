import type { Metadata } from "next";
import { notFound, redirect } from "next/navigation";
import { Activity, NotebookPen } from "lucide-react";

import { PageContainer } from "@/components/layout/app-shell";
import { PageHeader } from "@/components/layout/page-header";
import { ActivityFeed } from "@/components/admin/activity-feed";
import { WeeklyReportCard } from "@/components/admin/weekly-report";
import { OverdueBadge, PriorityBadge, StatusBadge, SubjectDot } from "@/components/shared/badges";
import { ItemCard, ItemGrid } from "@/components/shared/item-card";
import { Reveal } from "@/components/shared/reveal";
import { Block, BlockHeading } from "@/components/shared/surface";
import { DayStats } from "@/components/today/sections";
import { EmptyState } from "@/components/ui/empty-state";
import { requireSessionContext } from "@/lib/auth";
import { byUrgency, groupAssignments } from "@/lib/tasks/ordering";
import { getWeeklyReport } from "@/lib/data/report";
import { getActivityFeed, getLinksAsAdmin, isLive } from "@/lib/data/support";
import { createClient } from "@/lib/supabase/server";
import { formatDueLabel, formatOverdueLabel } from "@/lib/format";
import { formatDuration } from "@/lib/timetable/types";
import { isOverdue, type Assignment } from "@/types/database";

export const metadata: Metadata = { title: "Student record" };

/**
 * One student's academic record, for a support account holding a live link.
 *
 * Every read below is an ordinary authenticated query. There is no
 * service-role key here and no elevation of any kind — RLS is what decides
 * whether these return rows. If the link is revoked while this page is open,
 * the next request returns nothing.
 *
 * Read-only by construction, not by convention: no policy in the schema grants
 * a support account UPDATE, INSERT or DELETE on another user's record, so
 * there is no write path to leave out.
 */
export default async function StudentRecordPage({
  params,
}: {
  params: Promise<{ studentId: string }>;
}) {
  const { studentId } = await params;
  const session = await requireSessionContext();
  if (session.profile?.role !== "admin") redirect("/dashboard");

  // The link check is for a clear 404 rather than an unexplained empty page;
  // RLS would return nothing regardless.
  const links = await getLinksAsAdmin();
  const link = links.find((l) => l.student_id === studentId && isLive(l));
  if (!link) notFound();

  const now = new Date();
  const supabase = await createClient();

  const [{ data: rows }, activity, report] = await Promise.all([
    supabase
      .from("assignments")
      .select("*, subjects(name, color_token)")
      .eq("user_id", studentId)
      .order("due_date"),
    getActivityFeed(studentId),
    getWeeklyReport(studentId),
  ]);

  const assignments = ((rows ?? []) as never[]).map((row: Assignment & {
    subjects: { name: string; color_token: string } | null;
  }) => ({
    ...row,
    subject: row.subjects,
    overdue: isOverdue(row, now),
    dueAt: new Date(`${row.due_date}T${row.due_time ?? "23:59:59"}`),
  }));

  const groups = groupAssignments(assignments, now);
  const outstanding = [...groups.overdue, ...groups.dueSoon, ...groups.upcoming].sort(
    byUrgency,
  );

  return (
    <PageContainer>
      <PageHeader
        eyebrow="Student record"
        title={`${link.counterpartName ?? "Student record"}.`}
        description="Read-only. They can revoke your access at any time, and they can see that you have it."
      />

      <Reveal>
        <WeeklyReportCard report={report} name={link.counterpartName ?? "This student"} />
      </Reveal>

      <Reveal index={1} className="mt-rhythm block">
        <DayStats
          stats={[
            {
              label: "Overdue",
              value: String(groups.overdue.length),
              tone: groups.overdue.length > 0 ? "danger" : "default",
              href: `/admin/${studentId}#homework`,
            },
            {
              label: "Outstanding",
              value: String(outstanding.length),
              tone: "lesson",
              href: `/admin/${studentId}#homework`,
            },
            {
              label: "Completed",
              value: String(groups.completed.length),
              tone: "brand",
              href: `/admin/${studentId}#homework`,
            },
          ]}
        />
      </Reveal>

      <div className="mt-rhythm space-y-rhythm md:space-y-rhythm-lg">
        <Block id="homework">
          <Reveal>
            <BlockHeading
              eyebrow="Homework"
              tone="lesson"
              title="What they owe."
              count={outstanding.length}
            />
          </Reveal>
          <Reveal index={1}>
            {outstanding.length === 0 ? (
              <EmptyState
                icon={NotebookPen}
                headline="Nothing outstanding."
                body="Everything they have logged is done."
              />
            ) : (
              <ItemGrid>
                {outstanding.map((a, i) => (
                  <ItemCard
                    key={a.id}
                    index={i}
                    accent={a.overdue ? "danger" : "lesson"}
                    title={a.title}
                    trailing={
                      a.overdue ? (
                        <OverdueBadge>Overdue</OverdueBadge>
                      ) : (
                        <PriorityBadge priority={a.priority} />
                      )
                    }
                    meta={
                      <>
                        <span className="inline-flex items-center gap-1.5">
                          <SubjectDot colorToken={a.subject?.color_token ?? null} />
                          {a.subject?.name ?? "No subject"}
                        </span>
                        <span className={a.overdue ? "font-medium text-danger" : undefined}>
                          {a.overdue
                            ? formatOverdueLabel(a.due_date, a.due_time)
                            : formatDueLabel(a.due_date, a.due_time)}
                        </span>
                        <span data-numeric>{formatDuration(a.estimated_minutes)}</span>
                      </>
                    }
                    footer={<StatusBadge status={a.status} />}
                  />
                ))}
              </ItemGrid>
            )}
          </Reveal>
        </Block>

        <Block id="activity">
          <Reveal>
            <BlockHeading
              eyebrow="Activity"
              tone="revise"
              title="What they have been doing."
              description="Academic events inside StudyFlow, newest first. Nothing outside this app is recorded."
            />
          </Reveal>
          <Reveal index={1}>
            {activity.length === 0 ? (
              <EmptyState
                icon={Activity}
                headline="No activity yet."
                body="Events appear here as they add, start and complete work."
              />
            ) : (
              <ActivityFeed entries={activity} />
            )}
          </Reveal>
        </Block>
      </div>
    </PageContainer>
  );
}
