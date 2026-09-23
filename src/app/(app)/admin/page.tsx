import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { ArrowRight, ShieldCheck, Users } from "lucide-react";

import { PageContainer } from "@/components/layout/app-shell";
import { PageHeader } from "@/components/layout/page-header";
import { RequestAccessDialog } from "@/components/admin/request-access-dialog";
import { WithdrawButton } from "@/components/admin/link-actions";
import { Reveal } from "@/components/shared/reveal";
import { Block, BlockHeading, Eyebrow, Surface } from "@/components/shared/surface";
import { Badge } from "@/components/ui/badge";
import { EmptyState } from "@/components/ui/empty-state";
import { requireSessionContext } from "@/lib/auth";
import { getLinksAsAdmin, isLive } from "@/lib/data/support";

export const metadata: Metadata = { title: "Students" };

/**
 * The support dashboard: students who have granted access, and requests still
 * waiting on them.
 *
 * The guard below is a courtesy, not the security boundary. A student who
 * reaches this URL sees an empty list either way, because every query runs
 * under RLS and `has_student_access` returns nothing without a live link.
 * Redirecting is just a better experience than an empty page.
 */
export default async function AdminPage() {
  const session = await requireSessionContext();
  if (session.profile?.role !== "admin") redirect("/dashboard");

  const links = await getLinksAsAdmin();
  const active = links.filter(isLive);
  const pending = links.filter((l) => l.status === "pending");

  return (
    <PageContainer>
      <PageHeader
        eyebrow="Support"
        title="Students who trust you."
        description="You can read the academic record of anyone who has approved you, and nothing else. Access ends the moment they revoke it."
        action={<RequestAccessDialog />}
      />

      <div className="space-y-rhythm md:space-y-rhythm-lg">
        <Block id="active">
          <Reveal>
            <BlockHeading
              eyebrow="Active"
              title="Who you can see."
              count={active.length}
            />
          </Reveal>

          <Reveal index={1}>
            {active.length === 0 ? (
              <EmptyState
                icon={Users}
                headline="Nobody has approved you yet."
                body="Request access with a student's email. They decide, and they can undo it at any time."
                action={<RequestAccessDialog />}
              />
            ) : (
              <div className="grid gap-5 lg:grid-cols-2">
                {active.map((link) => (
                  <Surface key={link.id} interactive lift className="flex flex-col">
                    <Eyebrow tone="brand">Active access</Eyebrow>
                    <h3 className="mt-4 text-[1.5rem] font-semibold tracking-[-0.025em] text-ink">
                      {link.counterpartName ?? "Name unavailable"}
                    </h3>
                    {link.counterpartName === null ? (
                      // Reading a linked student's name needs the widened
                      // profiles policy from 0005. Saying so beats showing a
                      // generic word that looks like their actual name.
                      <p className="mt-2 text-[0.9rem] text-pause-ink">
                        Run migration 0005 to show names.
                      </p>
                    ) : null}
                    {link.note ? (
                      <p className="mt-2.5 text-[0.95rem] text-ink-subtle">
                        “{link.note}”
                      </p>
                    ) : null}
                    <div className="mt-7 flex items-center justify-between gap-4">
                      <Link
                        href={`/admin/${link.student_id}`}
                        className="inline-flex items-center gap-2 text-body font-medium text-brand-ink transition-colors duration-150 ease-out-flat hover:text-ink"
                      >
                        Open record <ArrowRight aria-hidden="true" className="size-4" />
                      </Link>
                      <WithdrawButton id={link.id} label="Hand back" />
                    </div>
                  </Surface>
                ))}
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
              <Surface>
                <ul className="-my-2 divide-y divide-border">
                  {pending.map((link) => (
                    <li
                      key={link.id}
                      className="flex items-center justify-between gap-4 py-4"
                    >
                      <span className="min-w-0">
                        <span className="block truncate text-body font-medium text-ink">
                          {link.counterpartName ?? "Name unavailable"}
                        </span>
                        <span className="mt-1 block text-[0.9rem] text-ink-subtle">
                          Waiting on their approval
                        </span>
                      </span>
                      <span className="flex shrink-0 items-center gap-3">
                        <Badge className="bg-pause-soft text-pause-ink">Pending</Badge>
                        <WithdrawButton id={link.id} label="Withdraw" />
                      </span>
                    </li>
                  ))}
                </ul>
              </Surface>
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
                    academic activity log — for students who approved you, and
                    only while they keep that approval. You cannot edit any of
                    it: no policy anywhere grants a support account write access
                    to a student&apos;s record.
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
