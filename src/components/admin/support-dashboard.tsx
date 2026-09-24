import Link from "next/link";
import { ArrowRight, NotebookPen, Users } from "lucide-react";

import { PageContainer } from "@/components/layout/app-shell";
import { ActivityFeed } from "@/components/admin/activity-feed";
import { StudentHomework } from "@/components/admin/student-homework";
import { StudentPresence } from "@/components/admin/student-presence";
import { WeeklyReportCard } from "@/components/admin/weekly-report";
import { HelpList, HelpMigrationNotice } from "@/components/help/help-list";
import { Reveal, RevealWords } from "@/components/shared/reveal";
import { Block, BlockHeading, Eyebrow, Surface } from "@/components/shared/surface";
import { DayStats } from "@/components/today/sections";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { displayName, type SessionContext } from "@/lib/auth";
import { getActivityFeed, getLinksAsAdmin, isLive } from "@/lib/data/support";
import { getStudentSnapshot } from "@/lib/data/student-view";
import { getWeeklyReport } from "@/lib/data/report";
import { firstNameOf, formatFullDate, greeting } from "@/lib/format";

/**
 * The parent's Today.
 *
 * Same shape as the student's — a greeting, then what matters now — but about
 * the people they support rather than about themselves. Everything on it is
 * read-only, because every query runs under the same RLS that forbids a
 * support account from writing to a student's record.
 *
 * The order is the argument. "Where she should be" comes first because it is
 * the question a parent actually has at 14:20 on a Tuesday; what she owes and
 * what she is stuck on come next, because those are the ones they can help
 * with; the week's numbers come last, because nobody opens an app to read a
 * summary of something they already watched happen.
 */
export async function SupportDashboard({ session }: { session: SessionContext }) {
  const now = new Date();
  const links = (await getLinksAsAdmin()).filter(isLive);

  // One student is the common case; this stays correct for several.
  const students = await Promise.all(
    links.map(async (link) => ({
      link,
      snapshot: await getStudentSnapshot(link.student_id, link.counterpartName ?? "Your student"),
      report: await getWeeklyReport(link.student_id),
      activity: await getActivityFeed(link.student_id, 25),
    })),
  );

  return (
    <PageContainer>
      <header className="mb-rhythm max-w-[20ch] pt-2 sm:max-w-none md:pt-6">
        <Eyebrow tone="accent" className="mb-7">
          {formatFullDate(now)}
        </Eyebrow>
        <h1 className="text-greeting text-balance text-ink">
          <RevealWords text={`${greeting(now)}, ${firstNameOf(displayName(session))}.`} />
        </h1>
      </header>

      {students.length === 0 ? (
        <EmptyState
          icon={Users}
          headline="Nobody has approved you yet."
          body="Request access with a student's email. They decide, and they can undo it at any time."
          action={
            <Button asChild>
              <Link href="/admin">Go to Students</Link>
            </Button>
          }
        />
      ) : (
        <div className="space-y-rhythm md:space-y-rhythm-lg">
          {students.map(({ link, snapshot, report, activity }) => {
            const name = snapshot.firstName;
            const openHelp = snapshot.help.open;

            return (
              <div key={link.id} className="space-y-rhythm md:space-y-rhythm-lg">
                <Block aria-label={`Right now — ${name}`}>
                  <div className="grid gap-6 lg:gap-8 xl:grid-cols-12">
                    <Reveal className="h-full xl:col-span-7">
                      {/* Live: re-resolves on a timer, in HER timezone. */}
                      <StudentPresence
                        name={name}
                        entries={snapshot.entries}
                        timezone={snapshot.timezone}
                        studyUntilMinutes={snapshot.studyUntilMinutes}
                        settleMinutes={snapshot.settleMinutes}
                        initial={snapshot.presence}
                        lastSeen={snapshot.lastSeen}
                      />
                    </Reveal>

                    <Reveal index={1} className="h-full xl:col-span-5">
                      <DayStats
                        stats={[
                          {
                            label: "Outstanding",
                            value: String(snapshot.outstanding.length),
                            tone: "lesson" as const,
                            href: `/admin/${link.student_id}#homework`,
                          },
                          {
                            label: "Overdue",
                            value: String(snapshot.overdueCount),
                            tone:
                              snapshot.overdueCount > 0
                                ? ("danger" as const)
                                : ("default" as const),
                            href: `/admin/${link.student_id}#homework`,
                          },
                          {
                            label: "Stuck on",
                            value: String(openHelp.length),
                            tone: openHelp.length > 0 ? ("pause" as const) : ("brand" as const),
                            href: `/admin/${link.student_id}#stuck`,
                          },
                        ]}
                      />
                    </Reveal>
                  </div>
                </Block>

                <Block id={`homework-${link.student_id}`}>
                  <Reveal>
                    <BlockHeading
                      eyebrow="Homework"
                      tone="lesson"
                      title={`What ${name} owes.`}
                      count={snapshot.outstanding.length}
                      description="Everything she has logged and not finished, most urgent first."
                      action={
                        <Button asChild variant="outline">
                          <Link href={`/admin/${link.student_id}#homework`}>
                            Full record <ArrowRight aria-hidden="true" />
                          </Link>
                        </Button>
                      }
                    />
                  </Reveal>
                  <Reveal index={1}>
                    {snapshot.outstanding.length === 0 ? (
                      <EmptyState
                        icon={NotebookPen}
                        headline="Nothing outstanding."
                        body={`Everything ${name} has logged is done.`}
                      />
                    ) : (
                      <StudentHomework assignments={snapshot.outstanding.slice(0, 9)} />
                    )}
                  </Reveal>
                </Block>

                <Block id={`stuck-${link.student_id}`}>
                  <Reveal>
                    <BlockHeading
                      eyebrow="Stuck on"
                      tone={openHelp.length > 0 ? "danger" : "brand"}
                      title={
                        openHelp.length > 0
                          ? `What ${name} says she does not understand.`
                          : `${name} has not flagged anything.`
                      }
                      count={openHelp.length}
                      description="She writes these herself. You cannot add to this list or tick anything off it — that is what makes it worth her keeping."
                    />
                  </Reveal>
                  <Reveal index={1}>
                    {snapshot.help.pendingMigration ? (
                      <HelpMigrationNotice />
                    ) : (
                      <HelpList
                        entries={openHelp}
                        readOnly
                        emptyLabel={`Nothing flagged. That is not the same as nothing being hard — it means ${name} has not written anything down.`}
                      />
                    )}
                  </Reveal>
                </Block>

                {snapshot.recentlyCompleted.length > 0 ? (
                  <Block id={`done-${link.student_id}`}>
                    <Reveal>
                      <BlockHeading
                        eyebrow="Finished"
                        tone="brand"
                        title="Recently ticked off."
                        description="The half of the picture that does not show up as a number."
                      />
                    </Reveal>
                    <Reveal index={1}>
                      <StudentHomework assignments={snapshot.recentlyCompleted} />
                    </Reveal>
                  </Block>
                ) : null}

                <Block id={`report-${link.student_id}`}>
                  <Reveal>
                    <WeeklyReportCard report={report} name={name} />
                  </Reveal>
                </Block>

                <Block id={`activity-${link.student_id}`}>
                  <Reveal>
                    <BlockHeading
                      eyebrow="As it happens"
                      tone="revise"
                      title={`What ${name} has been doing.`}
                      description="Every piece of homework added, started and finished, newest first. This updates as she uses the app."
                      action={
                        <Button asChild variant="outline">
                          <Link href={`/admin/${link.student_id}`}>
                            Full record <ArrowRight aria-hidden="true" />
                          </Link>
                        </Button>
                      }
                    />
                  </Reveal>
                  <Reveal index={1}>
                    {activity.length === 0 ? (
                      <Surface>
                        <p className="text-body text-ink-muted">
                          Nothing logged yet. Events appear here as she adds,
                          starts and completes work.
                        </p>
                      </Surface>
                    ) : (
                      <ActivityFeed entries={activity} />
                    )}
                  </Reveal>
                </Block>
              </div>
            );
          })}
        </div>
      )}
    </PageContainer>
  );
}
