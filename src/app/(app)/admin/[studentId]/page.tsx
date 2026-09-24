import type { Metadata } from "next";
import { notFound, redirect } from "next/navigation";
import { Activity, NotebookPen } from "lucide-react";

import { PageContainer } from "@/components/layout/app-shell";
import { PageHeader } from "@/components/layout/page-header";
import { ActivityFeed } from "@/components/admin/activity-feed";
import { StudentHomework } from "@/components/admin/student-homework";
import { StudentPresence } from "@/components/admin/student-presence";
import { WeeklyReportCard } from "@/components/admin/weekly-report";
import { HelpList, HelpMigrationNotice } from "@/components/help/help-list";
import { Reveal } from "@/components/shared/reveal";
import { Block, BlockHeading } from "@/components/shared/surface";
import { DayStats } from "@/components/today/sections";
import { EmptyState } from "@/components/ui/empty-state";
import { requireSessionContext } from "@/lib/auth";
import { getWeeklyReport } from "@/lib/data/report";
import { getStudentSnapshot } from "@/lib/data/student-view";
import { getActivityFeed, getLinksAsAdmin, isLive } from "@/lib/data/support";

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

  const [snapshot, activity, report] = await Promise.all([
    getStudentSnapshot(studentId, link.counterpartName ?? "This student"),
    getActivityFeed(studentId),
    getWeeklyReport(studentId),
  ]);

  const openHelp = snapshot.help.open;
  const done = snapshot.recentlyCompleted;

  return (
    <PageContainer>
      <PageHeader
        eyebrow="Student record"
        title={`${snapshot.name}.`}
        description="Read-only. They can revoke your access at any time, and they can see that you have it."
      />

      <Reveal>
        <StudentPresence
          name={snapshot.firstName}
          entries={snapshot.entries}
          timezone={snapshot.timezone}
          studyUntilMinutes={snapshot.studyUntilMinutes}
          settleMinutes={snapshot.settleMinutes}
          initial={snapshot.presence}
          initialNowMinutes={snapshot.nowMinutes}
          lastSeen={snapshot.lastSeen}
        />
      </Reveal>

      <Reveal index={1} className="mt-rhythm block">
        <DayStats
          stats={[
            {
              label: "Overdue",
              value: String(snapshot.overdueCount),
              tone: snapshot.overdueCount > 0 ? "danger" : "default",
              href: `/admin/${studentId}#homework`,
            },
            {
              label: "Outstanding",
              value: String(snapshot.outstanding.length),
              tone: "lesson",
              href: `/admin/${studentId}#homework`,
            },
            {
              label: "Stuck on",
              value: String(openHelp.length),
              tone: openHelp.length > 0 ? "pause" : "brand",
              href: `/admin/${studentId}#stuck`,
            },
            {
              label: "Completed",
              value: String(snapshot.completedCount),
              tone: "brand",
              href: `/admin/${studentId}#homework`,
            },
          ]}
        />
      </Reveal>

      <div className="mt-rhythm space-y-rhythm md:space-y-rhythm-lg">
        <Reveal>
          <WeeklyReportCard report={report} name={snapshot.firstName} />
        </Reveal>

        <Block id="homework">
          <Reveal>
            <BlockHeading
              eyebrow="Homework"
              tone="lesson"
              title="What they owe."
              count={snapshot.outstanding.length}
            />
          </Reveal>
          <Reveal index={1}>
            {snapshot.outstanding.length === 0 ? (
              <EmptyState
                icon={NotebookPen}
                headline="Nothing outstanding."
                body="Everything they have logged is done."
              />
            ) : (
              <StudentHomework assignments={snapshot.outstanding} />
            )}
          </Reveal>
        </Block>

        <Block id="stuck">
          <Reveal>
            <BlockHeading
              eyebrow="Stuck on"
              tone={openHelp.length > 0 ? "danger" : "brand"}
              title="What they say they do not understand."
              count={openHelp.length}
              description="Written by them, for them. You cannot add to this list or close anything on it — that is what keeps it honest."
            />
          </Reveal>
          <Reveal index={1}>
            {snapshot.help.pendingMigration ? (
              <HelpMigrationNotice />
            ) : (
              <HelpList
                entries={openHelp}
                readOnly
                emptyLabel="Nothing flagged. That is not the same as nothing being hard — it means nothing has been written down."
              />
            )}
          </Reveal>
        </Block>

        {snapshot.help.resolved.length > 0 ? (
          <Block id="sorted">
            <Reveal>
              <BlockHeading
                eyebrow="Worked out"
                tone="brand"
                title="Things they got past."
                description="Flagged, then closed by them. Worth reading — a topic that keeps coming back is the useful signal here."
              />
            </Reveal>
            <Reveal index={1}>
              <HelpList entries={snapshot.help.resolved} readOnly />
            </Reveal>
          </Block>
        ) : null}

        {done.length > 0 ? (
          <Block id="finished">
            <Reveal>
              <BlockHeading
                eyebrow="Finished"
                tone="brand"
                title="Recently ticked off."
                description="The half of the picture that does not show up as a number."
              />
            </Reveal>
            <Reveal index={1}>
              <StudentHomework assignments={done} />
            </Reveal>
          </Block>
        ) : null}

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
