import type { Metadata } from "next";
import { notFound, redirect } from "next/navigation";

import { PageContainer } from "@/components/layout/app-shell";
import { PageHeader } from "@/components/layout/page-header";
import { Reveal } from "@/components/shared/reveal";
import { Surface } from "@/components/shared/surface";
import { ImportWizard } from "@/components/timetable/import-wizard";
import { requireSessionContext } from "@/lib/auth";
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

  const link = (await getLinksAsAdmin()).find(
    (l) => l.student_id === studentId && isLive(l),
  );
  if (!link) notFound();

  const name = link.counterpartName ?? "this student";
  const firstName = name.split(/\s+/)[0] ?? name;

  return (
    <PageContainer>
      <PageHeader
        eyebrow="Set timetable"
        title={`${firstName}'s school week.`}
        description={`Upload a photo of the timetable and check what was read. This replaces whatever ${firstName} has now.`}
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
