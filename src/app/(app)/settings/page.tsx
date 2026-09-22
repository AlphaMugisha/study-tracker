import type { Metadata } from "next";
import Link from "next/link";
import { KeyRound, LogOut, ShieldCheck } from "lucide-react";

import { PageContainer } from "@/components/layout/app-shell";
import { Eyebrow, PageHeader } from "@/components/layout/page-header";
import { ProfileForm } from "@/components/settings/profile-form";
import { Reveal } from "@/components/shared/reveal";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { signOutAction } from "@/lib/actions/auth";
import { displayName, requireSessionContext } from "@/lib/auth";
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
      className={cn("rounded-xl border border-border bg-card p-5 sm:p-6", className)}
    >
      <h2 className="text-section text-ink">{title}</h2>
      {description ? (
        <p className="mt-1 max-w-prose text-[13px] leading-5 text-ink-muted">
          {description}
        </p>
      ) : null}
      <div className="mt-5">{children}</div>
    </section>
  );
}

export default async function SettingsPage() {
  const session = await requireSessionContext();
  const { user, profile } = session;

  return (
    <PageContainer>
      <PageHeader
          eyebrow="Settings"
          title="Your account."
          description="Your account, and who can see your academic progress."
        />

      <div className="grid gap-4 md:grid-cols-2 md:gap-5">
        <Reveal index={1} className="md:col-span-2">
          <Panel
            title="Your details"
            description="Your timezone is how StudyFlow works out what you're doing right now, so keep it accurate if you travel."
          >
            <ProfileForm
              fullName={displayName(session)}
              timezone={profile?.timezone ?? "UTC"}
            />
          </Panel>
        </Reveal>

        <Reveal index={2}>
          <Panel title="Account">
            <dl className="grid gap-4 sm:grid-cols-2">
              <div>
                <dt className="text-[13px] text-ink-muted">Email</dt>
                <dd className="mt-0.5 truncate text-[15px] font-medium text-ink">
                  {user.email}
                </dd>
              </div>
              <div>
                <dt className="text-[13px] text-ink-muted">Role</dt>
                <dd className="mt-1.5">
                  <Badge className="bg-sage-soft capitalize text-sage-ink">
                    {profile?.role ?? "student"}
                  </Badge>
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

        <Reveal index={4} className="md:col-span-2">
          <Panel title="Support access">
            <div className="rounded-md border border-border bg-surface-sunken/60 p-4">
              <div className="flex items-start gap-2.5">
                <ShieldCheck aria-hidden="true" className="mt-0.5 size-4 shrink-0 text-sage" />
                <div>
                  <Eyebrow className="text-sage-ink">Nobody has access</Eyebrow>
                  <p className="mt-1.5 max-w-prose text-[13px] leading-5 text-ink-muted">
                    A support account can only see your academic progress if you
                    approve a request, and you can revoke it at any time. When
                    someone has access you will see them listed here, along with
                    exactly what they can read.
                  </p>
                  <p className="mt-2 max-w-prose text-xs leading-5 text-ink-subtle">
                    Support accounts can never edit your work, and never see
                    anything outside StudyFlow.
                  </p>
                </div>
              </div>
            </div>
            <p className="mt-3 text-xs text-ink-subtle">
              Managing support access arrives with the admin dashboard.
            </p>
          </Panel>
        </Reveal>
      </div>
    </PageContainer>
  );
}
