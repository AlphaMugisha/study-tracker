import type { Metadata } from "next";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { ArrowLeft } from "lucide-react";

import { DailyReportCard } from "@/components/admin/daily-report-card";
import { PageContainer } from "@/components/layout/app-shell";
import { PageHeader } from "@/components/layout/page-header";
import { Reveal } from "@/components/shared/reveal";
import { StatRail } from "@/components/shared/stat-rail";
import { Block, Eyebrow, Surface } from "@/components/shared/surface";
import { Button } from "@/components/ui/button";
import { requireSessionContext } from "@/lib/auth";
import { getDailyReports } from "@/lib/data/daily-report";
import { getStudentSnapshot } from "@/lib/data/student-view";
import { getLinksAsAdmin, isLive } from "@/lib/data/support";
import { summarise } from "@/lib/report/daily";
import { formatDurationCompact } from "@/lib/timetable/types";
import { cn } from "@/lib/utils";

export const metadata: Metadata = { title: "Daily reports" };

/** The ranges offered. 7 leads because "last week" is the usual question. */
const RANGES = [7, 14, 30] as const;
const DEFAULT_RANGE = 7;

type SearchParams = Promise<Record<string, string | string[] | undefined>>;

/**
 * A report for every day, newest first.
 *
 * Each day's numbers are worked out when you open the page, from the activity
 * log — which is append-only and cannot be edited or deleted by anybody,
 * including her. So a finished day's report is already final and stays final;
 * nothing has to run at midnight to freeze it, and there is no nightly job to
 * notice has stopped working.
 *
 * What midnight does mean here is real: the days are cut at 00:00 in HER
 * timezone. Homework she finishes at 00:20 belongs to the new day, which is
 * the answer a UTC-bucketed report gets wrong for anyone east of London.
 */
export default async function DailyReportsPage({
  params,
  searchParams,
}: {
  params: Promise<{ studentId: string }>;
  searchParams: SearchParams;
}) {
  const { studentId } = await params;
  const query = await searchParams;
  const session = await requireSessionContext();
  if (session.profile?.role !== "admin") redirect("/dashboard");

  const links = await getLinksAsAdmin();
  const link = links.find((l) => l.student_id === studentId && isLive(l));
  if (!link) notFound();

  const asked = Number(typeof query.days === "string" ? query.days : DEFAULT_RANGE);
  const days = RANGES.includes(asked as (typeof RANGES)[number]) ? asked : DEFAULT_RANGE;

  const snapshot = await getStudentSnapshot(studentId, link.counterpartName ?? "This student");
  const reports = await getDailyReports(studentId, snapshot.timezone, days);
  const totals = summarise(reports);

  return (
    <PageContainer>
      <PageHeader
        eyebrow="Daily reports"
        title={`${snapshot.firstName}, day by day.`}
        description={`One report per day, closed at midnight in ${snapshot.timezone.split("/").pop()?.replace(/_/g, " ")} — her clock, not yours.`}
        action={
          <Button asChild variant="outline">
            <Link href={`/admin/${studentId}`}>
              <ArrowLeft aria-hidden="true" />
              Full record
            </Link>
          </Button>
        }
      />

      <Reveal>
        <StatRail
          stats={[
            {
              label: "Finished",
              value: String(totals.completed),
              hint: `Across the last ${days} days`,
              tone: "brand",
              href: `/admin/${studentId}#homework`,
            },
            {
              label: "Added",
              value: String(totals.added),
              hint: "Homework written down",
              tone: "lesson",
              href: `/admin/${studentId}#homework`,
            },
            {
              label: "Active days",
              value: `${totals.activeDays}/${totals.countedDays}`,
              hint: "Days with anything logged at all",
              tone: totals.activeDays === 0 ? "pause" : "revise",
              href: `/admin/${studentId}#activity`,
            },
            {
              label: "Missed",
              value: String(totals.missed),
              hint: "Due and not finished that day",
              tone: totals.missed > 0 ? "danger" : "default",
              href: `/admin/${studentId}#homework`,
            },
          ]}
        />
      </Reveal>

      {/* The range switch is three links, not a dropdown: three options do not
          justify hiding two of them behind a click. */}
      <nav aria-label="Report range" className="mt-rhythm flex flex-wrap items-center gap-2.5">
        {RANGES.map((range) => (
          <Link
            key={range}
            href={`/admin/${studentId}/reports?days=${range}`}
            aria-current={range === days ? "page" : undefined}
            className={cn(
              "rounded-lg border px-4 py-2 text-[0.9rem] transition-colors duration-200 ease-out-flat",
              range === days
                ? "border-brand/60 bg-brand-soft text-brand-ink"
                : "border-border text-ink-muted hover:border-border-strong hover:bg-surface-raised hover:text-ink",
            )}
          >
            {`${range} days`}
          </Link>
        ))}

        {totals.studiedMinutes > 0 ? (
          <span className="ml-auto text-[0.9rem] text-ink-subtle">
            {formatDurationCompact(totals.studiedMinutes)} recorded in this range
          </span>
        ) : null}
      </nav>

      <Block className="mt-rhythm">
        <Eyebrow tone="subtle" className="mb-6">
          Newest first
        </Eyebrow>

        {/* Container queries: this list sits in the content column, whose width
            depends on the sidebar as well as the window. */}
        <div className="@container">
          <ul className="grid grid-cols-1 gap-4 @2xl:grid-cols-2 @5xl:grid-cols-3">
            {reports.map((report, i) => (
              <Reveal key={report.date} index={i} className="h-full">
                <DailyReportCard report={report} />
              </Reveal>
            ))}
          </ul>
        </div>
      </Block>

      <Surface inset="tight" className="mt-rhythm border-dashed bg-transparent shadow-none">
        <p className="max-w-[72ch] text-[0.9rem] leading-relaxed text-ink-subtle">
          These are worked out from her activity log each time you open this
          page, so a finished day never changes and nothing has to run
          overnight. The one exception is <span className="text-ink-muted">Due this day, not
          finished</span>, which reads her current homework — if she deletes an
          old assignment, it stops appearing there.
        </p>
      </Surface>
    </PageContainer>
  );
}
