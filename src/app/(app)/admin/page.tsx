import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { ArrowRight, ShieldCheck, Users } from "lucide-react";

import { PageContainer } from "@/components/layout/app-shell";
import { PageHeader } from "@/components/layout/page-header";
import { RequestAccessDialog } from "@/components/admin/request-access-dialog";
import { WithdrawButton } from "@/components/admin/link-actions";
import { OversightMigrationNotice } from "@/components/admin/oversight-notice";
import { ItemCard, ItemGrid } from "@/components/shared/item-card";
import { Reveal } from "@/components/shared/reveal";
import { Block, BlockHeading, Eyebrow, Surface } from "@/components/shared/surface";
import { Badge } from "@/components/ui/badge";
import { EmptyState } from "@/components/ui/empty-state";
import { requireSessionContext } from "@/lib/auth";
import { getOversight } from "@/lib/data/oversight";
import { getLinksAsAdmin, isLive } from "@/lib/data/support";

export const metadata: Metadata = { title: "Students" };

/**
 * The support portal: every student, and whatever is still outstanding on the
 * old request-and-approve route.
 *
 * Since 0008 this lists all students rather than only the ones who approved
 * you — `oversight_counterparts` is the listing and `has_student_access` is
 * the access, and both now treat "is a support account" as sufficient.
 *
 * The link table has not stopped mattering, which is why both are read here.
 * A live link is what `can_manage_timetable` still checks, so it is the
 * difference between a student whose record you can read and a student whose
 * timetable you can also edit. The cards say which.
 *
 * The guard below is a courtesy, not the security boundary. A student who
 * reaches this URL sees an empty list either way, because every query runs
 * under RLS and both predicates key off the caller's own role.
 */
export default async function AdminPage() {
  const session = await requireSessionContext();
  if (session.profile?.role !== "admin") redirect("/dashboard");

  const [{ counterparts, pendingMigration }, links] = await Promise.all([
    getOversight(),
    getLinksAsAdmin(),
  ]);

  // Which students additionally granted the timetable-edit link from 0007.
  const live = links.filter(isLive);
  const canEdit = new Map(live.map((l) => [l.student_id, l]));
  const pending = links.filter((l) => l.status === "pending");

  /**
   * Without 0008 the oversight function does not exist, so fall back to the
   * pre-0008 list rather than showing nothing. An admin who already holds live
   * links would otherwise watch their students vanish the moment this code
   * deployed and before the migration was applied — a deploy that takes
   * working access away is a worse failure than one that has not added any.
   */
  const students = pendingMigration
    ? live.map((l) => ({ id: l.student_id, name: l.counterpartName ?? "Name unavailable" }))
    : counterparts;

  return (
    <PageContainer>
      <PageHeader
        eyebrow="Support"
        title="Students you look after."
        description="You can read every student's academic record and change none of it. Editing a timetable still needs that student to grant it."
        action={<RequestAccessDialog />}
      />

      <div className="space-y-rhythm md:space-y-rhythm-lg">
        <Block id="active">
          <Reveal>
            <BlockHeading
              eyebrow="Students"
              title="Who you can see."
              count={students.length}
              description="Everyone with a student account, including anyone who registers from now on."
            />
          </Reveal>

          {pendingMigration ? (
            <Reveal index={1} className="mb-5 block">
              <OversightMigrationNotice />
            </Reveal>
          ) : null}

          <Reveal index={2}>
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
                    ? "Apply 0008 and every student appears here, or request access with a student's email in the meantime."
                    : "Every account that signs up as a student appears here automatically — there is nothing to approve."
                }
                action={pendingMigration ? <RequestAccessDialog /> : undefined}
              />
            ) : (
              <div className="@container">
                <div className="grid gap-5 @3xl:grid-cols-2 @6xl:grid-cols-3">
                {students.map((student) => {
                  const link = canEdit.get(student.id);
                  return (
                    <Surface key={student.id} interactive lift className="flex flex-col">
                      <Eyebrow tone={link ? "brand" : "lesson"}>
                        {link ? "Can read and edit timetable" : "Can read"}
                      </Eyebrow>
                      <h3 className="mt-4 text-[1.5rem] font-semibold tracking-[-0.025em] text-ink">
                        {student.name}
                      </h3>
                      {link?.note ? (
                        <p className="mt-2.5 text-[0.95rem] text-ink-subtle">
                          “{link.note}”
                        </p>
                      ) : null}
                      <div className="mt-7 flex items-center justify-between gap-4">
                        <Link
                          href={`/admin/${student.id}`}
                          className="inline-flex items-center gap-2 text-body font-medium text-brand-ink transition-colors duration-150 ease-out-flat hover:text-ink"
                        >
                          Open record <ArrowRight aria-hidden="true" className="size-4" />
                        </Link>
                        {link ? <WithdrawButton id={link.id} label="Hand back edit" /> : null}
                      </div>
                    </Surface>
                  );
                })}
                </div>
              </div>
            )}
          </Reveal>
        </Block>

        {pending.length > 0 ? (
          <Block id="pending">
            <Reveal>
              <BlockHeading
                eyebrow="Waiting"
                tone="pause"
                title="Requests they have not answered."
                count={pending.length}
              />
            </Reveal>
            <Reveal index={1}>
              <ItemGrid>
                {pending.map((link, i) => (
                  <ItemCard
                    key={link.id}
                    index={i}
                    accent="pause"
                    title={link.counterpartName ?? "Name unavailable"}
                    trailing={<Badge className="bg-pause-soft text-pause-ink">Pending</Badge>}
                    meta={<span>Waiting on their approval</span>}
                    footer={<WithdrawButton id={link.id} label="Withdraw" />}
                  />
                ))}
              </ItemGrid>
            </Reveal>
          </Block>
        ) : null}

        <Block id="limits">
          <Reveal>
            <Surface className="border-border">
              <div className="flex items-start gap-4">
                <ShieldCheck aria-hidden="true" className="mt-1 size-5 shrink-0 text-brand" />
                <div className="min-w-0">
                  <h3 className="text-section text-ink">What you can and cannot see</h3>
                  <p className="mt-3 max-w-[60ch] text-[0.95rem] leading-relaxed text-ink-muted">
                    Homework, revision, study sessions, the timetable and the
                    academic activity log, for every student account — no
                    approval needed, and new registrations included.
                  </p>
                  {/*
                    Stated because it is the honest limit of what changed. The
                    read side is open; the write side is not, and a parent who
                    assumes they can tick off their daughter's homework from
                    here needs to find that out from this paragraph rather than
                    from a button that does nothing.
                  */}
                  <p className="mt-3 max-w-[60ch] text-[0.95rem] leading-relaxed text-ink-muted">
                    You cannot change any of it. The one exception is a
                    student&apos;s timetable, which you may edit only if that
                    student has granted it — ask with their email above, and
                    every edit you make is recorded in the log they read.
                  </p>
                  <p className="mt-3 max-w-[60ch] text-[0.95rem] leading-relaxed text-ink-muted">
                    Every student can see that you can see them, on their own
                    Settings page. That disclosure is not optional.
                  </p>
                  <p className="mt-3 max-w-[60ch] text-[0.95rem] leading-relaxed text-ink-subtle">
                    Nothing outside StudyFlow is recorded or visible — no
                    keystrokes, no browsing, no location, no device activity.
                    The activity log is a closed list of academic events.
                  </p>
                </div>
              </div>
            </Surface>
          </Reveal>
        </Block>
      </div>
    </PageContainer>
  );
}
