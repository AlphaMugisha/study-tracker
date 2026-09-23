import type { Metadata } from "next";
import Link from "next/link";
import { KeyRound, LogOut } from "lucide-react";

import { PageContainer } from "@/components/layout/app-shell";
import { PageHeader } from "@/components/layout/page-header";
import { RoleBadge } from "@/components/layout/account-menu";
import { ProfileForm } from "@/components/settings/profile-form";
import { SubjectManager } from "@/components/settings/subject-manager";
import { SupportAccess } from "@/components/settings/support-access";
import { Reveal } from "@/components/shared/reveal";
import { Button } from "@/components/ui/button";
import { signOutAction } from "@/lib/actions/auth";
import { displayName, requireSessionContext } from "@/lib/auth";
import { getLinksAsStudent } from "@/lib/data/support";
import { getSubjects } from "@/lib/data/timetable";
import { cn } from "@/lib/utils";

export const metadata: Metadata = { title: "Settings" };

function Panel({
  title,
  description,
  children,
  className,
}: {
  title: string;
  description?: string;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <section
      className={cn("rounded-xl border border-border bg-card p-7 shadow-card sm:p-9", className)}
    >
      <h2 className="text-section text-ink">{title}</h2>
      {description ? (
        <p className="mt-2.5 max-w-[52ch] text-[0.95rem] leading-relaxed text-ink-muted">
          {description}
        </p>
      ) : null}
      <div className="mt-5">{children}</div>
    </section>
  );
}

export default async function SettingsPage() {
  const [session, subjects, supportLinks] = await Promise.all([
    requireSessionContext(),
    getSubjects(),
    getLinksAsStudent(),
  ]);
  const { user, profile } = session;

  return (
    <PageContainer>
      <PageHeader
          eyebrow="Settings"
          title="Your account."
          description="Your account, and who can see your academic progress."
        />

      <div className="@container">
        <div className="grid gap-5 @3xl:grid-cols-2 @3xl:gap-6">
        <Reveal index={1} className="@3xl:col-span-2">
          <Panel
            title="Your details"
            description="Your timezone is how StudyFlow works out what you're doing right now, so keep it accurate if you travel."
          >
            <ProfileForm
              fullName={displayName(session)}
              timezone={profile?.timezone ?? "UTC"}
              studyUntil={profile?.study_until ?? "21:00"}
              settleMinutes={profile?.settle_minutes ?? 30}
            />
          </Panel>
        </Reveal>

        <Reveal index={1} className="@3xl:col-span-2">
          <Panel
            title="Subjects"
            description="What you study. Subjects colour your homework, timetable and plan."
          >
            <SubjectManager subjects={subjects} />
          </Panel>
        </Reveal>

        <Reveal index={2}>
          <Panel title="Account">
            <dl className="grid gap-4 sm:grid-cols-2">
              <div>
                <dt className="text-[0.95rem] text-ink-muted">Email</dt>
                <dd className="mt-1 truncate text-body font-medium text-ink">
                  {user.email}
                </dd>
              </div>
              <div>
                <dt className="text-[0.95rem] text-ink-muted">Role</dt>
                <dd className="mt-2.5">
                  <RoleBadge role={profile?.role ?? "student"} />
                  <span className="mt-2.5 block max-w-[52ch] text-[0.9rem] leading-relaxed text-ink-subtle">
                    {profile?.role === "admin"
                      ? "You can read the record of students who have approved you, and only while they keep that approval. You cannot edit anyone's work."
                      : "Your work is yours. Nobody can see it unless you approve a request, and you can withdraw that at any time."}
                  </span>
                </dd>
              </div>
            </dl>
            <p className="mt-4 text-xs leading-5 text-ink-subtle">
              Your email and role can&apos;t be changed here. Roles are set by an
              operator — the database refuses to let an account change its own, which
              is what stops anyone granting themselves access.
            </p>
          </Panel>
        </Reveal>

        <Reveal index={3}>
          <Panel
            title="Security"
            description="Change your password by email — we send a link rather than asking for the old one."
          >
            <div className="flex flex-wrap gap-2">
              <Button asChild variant="outline">
                <Link href="/forgot-password">
                  <KeyRound aria-hidden="true" />
                  Change password
                </Link>
              </Button>
              <form action={signOutAction}>
                <Button type="submit" variant="outline">
                  <LogOut aria-hidden="true" />
                  Sign out
                </Button>
              </form>
            </div>
          </Panel>
        </Reveal>

        <Reveal index={4} className="@3xl:col-span-2">
          <Panel
            title="Support access"
            description="Who can see your academic progress. You decide, and you can change your mind at any time."
          >
            <SupportAccess links={supportLinks} />
          </Panel>
        </Reveal>
        </div>
      </div>
    </PageContainer>
  );
}
