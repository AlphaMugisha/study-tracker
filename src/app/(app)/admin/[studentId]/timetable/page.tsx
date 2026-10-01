import type { Metadata } from "next";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { ArrowLeft, Lock, Users } from "lucide-react";

import { PageContainer } from "@/components/layout/app-shell";
import { PageHeader } from "@/components/layout/page-header";
import { Reveal } from "@/components/shared/reveal";
import { Surface } from "@/components/shared/surface";
import { ImportWizard } from "@/components/timetable/import-wizard";
import { Button } from "@/components/ui/button";
import { requireSessionContext } from "@/lib/auth";
import { getOversight } from "@/lib/data/oversight";
import { getLinksAsAdmin, isLive } from "@/lib/data/support";

export const metadata: Metadata = { title: "Set timetable" };

/**
 * A support account setting a student's timetable.
 *
 * The one thing a linked admin may write, added in migration 0007. Everything
 * else on this side of the app is still read-only, and the database is what
 * enforces that — `can_manage_timetable` covers the timetable and the subjects
 * a lesson needs, and no policy anywhere grants write access to her homework,
 * her revision, her sessions or her list of things she does not understand.
 *
 * It is not silent. The confirmation writes an activity log entry against her
 * record with the parent as `actor_id`, so it appears in her own feed
 * attributed to them. A change she could not see would make the link she
 * agreed to into something else.
 */
export default async function SupportTimetablePage({
  params,
}: {
  params: Promise<{ studentId: string }>;
}) {
  const { studentId } = await params;
  const session = await requireSessionContext();
  if (session.profile?.role !== "admin") redirect("/dashboard");

  /**
   * This page keeps its link check, and 0008 did not touch it.
   *
   * Oversight widened the READ predicate. Writing a timetable goes through
   * `can_manage_timetable`, which still requires the student's live link — so
   * without one this wizard would walk a parent through an import that the
   * database then refuses on the final step. The gate is here because the
   * answer is genuinely no.
   *
   * It is no longer a 404, though. A support account can now see this student,
   * so "does not exist" is false; what is true is that they have not granted
   * this. `notFound()` stays only for an id that is not a student at all.
   */
  const [{ counterparts, pendingMigration }, links] = await Promise.all([
    getOversight(),
    getLinksAsAdmin(),
  ]);

  const link = links.find((l) => l.student_id === studentId && isLive(l)) ?? null;
  const student = counterparts.find((c) => c.id === studentId) ?? null;

  if (!student && !(pendingMigration && link)) notFound();

  const name = student?.name ?? link?.counterpartName ?? "this student";
  const firstName = name.split(/\s+/)[0] ?? name;

  if (!link) return <TimetableEditNotGranted studentId={studentId} firstName={firstName} />;

  return (
    <PageContainer>
      <PageHeader
        eyebrow="Set timetable"
        title={`${firstName}'s school week.`}
        description={`Upload a photo of the timetable, or type the week out a line at a time. Either way you check every row, and either way it replaces whatever ${firstName} has now.`}
      />

      <Reveal>
        <Surface inset="tight" className="mb-rhythm border-dashed bg-transparent shadow-none">
          <p className="max-w-[70ch] text-[0.9rem] leading-relaxed text-ink-subtle">
            {firstName} will see this in her activity feed with your name on it.
            The timetable is the only thing you can change — her homework,
            revision and the list of things she is stuck on stay hers, and the
            database refuses those writes rather than the interface hiding them.
          </p>
        </Surface>
      </Reveal>

      <Reveal index={1}>
        <ImportWizard
          studentId={studentId}
          studentName={firstName}
          returnTo={`/admin/${studentId}`}
        />
      </Reveal>
    </PageContainer>
  );
}

/**
 * Seen but not granted.
 *
 * The honest page for the state 0008 created: a support account can read this
 * student's whole record and still cannot touch their timetable. Saying so,
 * with the way to ask, beats a 404 that implies the student is not there —
 * and beats letting the wizard run to a write the database will reject.
 */
function TimetableEditNotGranted({
  studentId,
  firstName,
}: {
  studentId: string;
  firstName: string;
}) {
  return (
    <PageContainer>
      <PageHeader
        eyebrow="Set timetable"
        title={`${firstName} has not granted this.`}
        description={`You can read ${firstName}'s record, but changing their timetable is a separate permission and only they can give it.`}
      />

      <Reveal>
        <Surface className="border-pause/30">
          <div className="flex items-start gap-4">
            <Lock aria-hidden="true" className="mt-1 size-5 shrink-0 text-pause" />
            <div className="min-w-0 flex-1">
              <h3 className="text-section text-ink">How to get it</h3>
              <p className="mt-3 max-w-[60ch] text-[0.95rem] leading-relaxed text-ink-muted">
                Ask from the Students portal using {firstName}&apos;s email
                address. The request appears in their Settings and they decide.
                Until then the timetable stays theirs to set — the database
                refuses the write, so there is nothing this page could usefully
                show you.
              </p>

              <div className="mt-7 flex flex-wrap gap-3">
                <Button asChild>
                  <Link href="/admin">
                    <Users aria-hidden="true" />
                    Students portal
                  </Link>
                </Button>
                <Button asChild variant="outline">
                  <Link href={`/admin/${studentId}`}>
                    <ArrowLeft aria-hidden="true" />
                    Back to the record
                  </Link>
                </Button>
              </div>
            </div>
          </div>
        </Surface>
      </Reveal>
    </PageContainer>
  );
}
