import Link from "next/link";
import { ArrowRight, NotebookPen, Users } from "lucide-react";

import { PageContainer } from "@/components/layout/app-shell";
import { ActivityFeed } from "@/components/admin/activity-feed";
import { StudentHomework } from "@/components/admin/student-homework";
import { StudentPresence } from "@/components/admin/student-presence";
import { WeeklyReportCard } from "@/components/admin/weekly-report";
import { HelpList, HelpMigrationNotice } from "@/components/help/help-list";
import { Reveal, RevealWords } from "@/components/shared/reveal";
import { StatRail } from "@/components/shared/stat-rail";
import { Block, BlockHeading, Eyebrow, Surface } from "@/components/shared/surface";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { displayName, type SessionContext } from "@/lib/auth";
import { getOversight } from "@/lib/data/oversight";
import { getActivityFeed, getLinksAsAdmin, isLive } from "@/lib/data/support";
import { getStudentSnapshot } from "@/lib/data/student-view";
import { getWeeklyReport } from "@/lib/data/report";
import { firstNameOf, formatFullDate, greeting } from "@/lib/format";

/**
 * The parent's Today.
 *
 * Same shape as the student's — a greeting, then what matters now — but about
 * the people they support rather than about themselves. Everything on it is
 * read-only: `has_student_access` is the SELECT predicate behind every query
 * here, and the only write a support account has anywhere is the timetable,
 * which is not on this page.
 *
 * The order is the argument. "Where she should be" comes first because it is
 * the question a parent actually has at 14:20 on a Tuesday; what she owes and
 * what she is stuck on come next, because those are the ones they can help
 * with; the week's numbers come last, because nobody opens an app to read a
 * summary of something they already watched happen.
 */
/**
 * How many students get the full treatment on this page.
 *
 * Each one costs four round trips and renders six blocks, which was fine when
 * the list was "people who approved you" and was therefore one or two. Since
 * 0008 it is every student who ever registers, so it needs a ceiling — a
 * parent's home page that grows a screen longer with each sign-up stops being
 * a home page.
 */
const MAX_DASHBOARD_STUDENTS = 3;

export async function SupportDashboard({ session }: { session: SessionContext }) {
  const now = new Date();

  /**
   * Who this dashboard is about.
   *
   * Was the live links; since 0008 it is every student. The link is still
   * looked up for the fallback path, because an admin running this before the
   * migration is applied should still see the students they were already
   * linked to rather than an empty greeting.
   */
  const [{ counterparts, pendingMigration }, links] = await Promise.all([
    getOversight(),
    getLinksAsAdmin(),
  ]);

  const roster = pendingMigration
    ? links
        .filter(isLive)
        .map((l) => ({ id: l.student_id, name: l.counterpartName ?? "Your student" }))
    : counterparts;

  /**
   * One student is the common case; this stays correct for several — but it is
   * now bounded, which it did not have to be when the list was "people who
   * approved you". Each entry costs four round trips, so a school's worth of
   * registrations would otherwise turn the parent's home page into a report
   * job. Beyond this, the portal at /admin is the right place to go.
   */
  const shown = roster.slice(0, MAX_DASHBOARD_STUDENTS);

  const students = await Promise.all(
    shown.map(async (student) => ({
      student,
      snapshot: await getStudentSnapshot(student.id, student.name),
      report: await getWeeklyReport(student.id),
      activity: await getActivityFeed(student.id, 25),
    })),
  );

  const hidden = roster.length - shown.length;

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
          headline={
            pendingMigration
              ? "Nobody has approved you yet."
              : "No student accounts yet."
          }
          body={
            pendingMigration
              ? "Apply migration 0008 to see every student, or request access with a student's email in the meantime."
              : "Anyone who signs up as a student appears here on their own — there is nothing to approve."
          }
          action={
            <Button asChild>
              <Link href="/admin">Go to Students</Link>
            </Button>
          }
        />
      ) : (
        <div className="space-y-rhythm md:space-y-rhythm-lg">
          {students.map(({ student, snapshot, report, activity }) => {
            const name = snapshot.firstName;
            const openHelp = snapshot.help.open;

            return (
              <div key={student.id} className="space-y-rhythm md:space-y-rhythm-lg">
                {/*
                  7/5 at xl and stretched, not stacked. `items-stretch` is what
                  makes the rail end level with the card — without it the
                  numbers sit in a short box with dead space under it.
                */}
                <Block aria-label={`Right now — ${name}`}>
                  <div className="grid items-stretch gap-6 lg:gap-8 xl:grid-cols-12">
                    <Reveal className="h-full xl:col-span-7">
                      {/* Live: re-resolves on a timer, in HER timezone. */}
                      <StudentPresence
                        name={name}
                        entries={snapshot.entries}
                        timezone={snapshot.timezone}
                        studyUntilMinutes={snapshot.studyUntilMinutes}
                        settleMinutes={snapshot.settleMinutes}
                        initial={snapshot.presence}
                        initialNowMinutes={snapshot.nowMinutes}
                        lastSeen={snapshot.lastSeen}
                      />
                    </Reveal>

                    <Reveal index={1} className="h-full xl:col-span-5">
                      <StatRail
                        stats={[
                          {
                            label: "Outstanding",
                            value: String(snapshot.outstanding.length),
                            hint: "Homework she has logged and not finished",
                            tone: "lesson" as const,
                            href: `/admin/${student.id}#homework`,
                          },
                          {
                            label: "Overdue",
                            value: String(snapshot.overdueCount),
                            hint: "Past its due date",
                            tone:
                              snapshot.overdueCount > 0
                                ? ("danger" as const)
                                : ("default" as const),
                            href: `/admin/${student.id}#homework`,
                          },
                          {
                            label: "Stuck on",
                            value: String(openHelp.length),
                            hint: "Things she says she does not understand",
                            tone: openHelp.length > 0 ? ("pause" as const) : ("brand" as const),
                            href: `/admin/${student.id}#stuck`,
                          },
                        ]}
                      />
                    </Reveal>
                  </div>
                </Block>

                <Block id={`homework-${student.id}`}>
                  <Reveal>
                    <BlockHeading
                      eyebrow="Homework"
                      tone="lesson"
                      title={`What ${name} owes.`}
                      count={snapshot.outstanding.length}
                      description="Everything she has logged and not finished, most urgent first."
                      action={
                        <Button asChild variant="outline">
                          <Link href={`/admin/${student.id}#homework`}>
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

                <Block id={`stuck-${student.id}`}>
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
                  <Block id={`done-${student.id}`}>
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

                <Block id={`report-${student.id}`}>
                  <Reveal>
                    <WeeklyReportCard report={report} name={name} />
                  </Reveal>
                  <Reveal index={1}>
                    <div className="flex justify-end">
                      <Button asChild variant="outline">
                        <Link href={`/admin/${student.id}/reports`}>
                          Day by day <ArrowRight aria-hidden="true" />
                        </Link>
                      </Button>
                    </div>
                  </Reveal>
                </Block>

                <Block id={`activity-${student.id}`}>
                  <Reveal>
                    <BlockHeading
                      eyebrow="As it happens"
                      tone="revise"
                      title={`What ${name} has been doing.`}
                      description="Every piece of homework added, started and finished, newest first. This updates as she uses the app."
                      action={
                        <Button asChild variant="outline">
                          <Link href={`/admin/${student.id}`}>
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

          {/*
            Said rather than silently dropped. A page that shows three of
            eleven students and gives no hint of the other eight is telling a
            parent their household is smaller than it is.
          */}
          {hidden > 0 ? (
            <Reveal>
              <Surface>
                <p className="text-body text-ink-muted">
                  {hidden === 1
                    ? "One more student is not shown here."
                    : `${hidden} more students are not shown here.`}{" "}
                  This page goes into detail on {MAX_DASHBOARD_STUDENTS}; the{" "}
                  <Link
                    href="/admin"
                    className="font-medium text-brand-ink underline-offset-4 hover:underline"
                  >
                    Students portal
                  </Link>{" "}
                  lists everyone.
                </p>
              </Surface>
            </Reveal>
          ) : null}
        </div>
      )}
    </PageContainer>
  );
}
