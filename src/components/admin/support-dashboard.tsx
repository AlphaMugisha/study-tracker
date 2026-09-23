import Link from "next/link";
import { ArrowRight, Users } from "lucide-react";

import { PageContainer } from "@/components/layout/app-shell";
import { WeeklyReportCard } from "@/components/admin/weekly-report";
import { ActivityFeed } from "@/components/admin/activity-feed";
import { Reveal, RevealWords } from "@/components/shared/reveal";
import { Block, BlockHeading, Eyebrow, Surface } from "@/components/shared/surface";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { displayName, type SessionContext } from "@/lib/auth";
import { getActivityFeed, getLinksAsAdmin, isLive } from "@/lib/data/support";
import { getWeeklyReport } from "@/lib/data/report";
import { firstNameOf, formatFullDate, greeting } from "@/lib/format";

/**
 * The parent's Today.
 *
 * Same shape as the student's — a greeting, then what matters now — but about
 * the people they support rather than about themselves. Everything on it is
 * read-only, because every query runs under the same RLS that forbids a
 * support account from writing to a student's record.
 */
export async function SupportDashboard({ session }: { session: SessionContext }) {
  const now = new Date();
  const links = (await getLinksAsAdmin()).filter(isLive);

  // One student is the common case; this stays correct for several.
  const students = await Promise.all(
    links.map(async (link) => ({
      link,
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
          {students.map(({ link, report, activity }) => {
            const name = link.counterpartName ?? "Your student";
            return (
              <div key={link.id} className="space-y-rhythm">
                <Block id={`report-${link.student_id}`}>
                  <Reveal>
                    <WeeklyReportCard report={report} name={name} />
                  </Reveal>
                </Block>

                <Block id={`activity-${link.student_id}`}>
                  <Reveal>
                    <BlockHeading
                      eyebrow="As it happens"
                      tone="lesson"
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
