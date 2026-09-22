import type { Metadata } from "next";
import { AlertCircle } from "lucide-react";

import { SignOutButton } from "@/components/auth/sign-out-button";
import { PageContainer } from "@/components/layout/app-shell";
import { Eyebrow, PageHeader } from "@/components/layout/page-header";
import { Badge } from "@/components/ui/badge";
import { requireSessionContext, displayName, firstName } from "@/lib/auth";

export const metadata: Metadata = { title: "Today" };

/**
 * Phase 1 placeholder. Its only job is to prove the session survives a
 * refresh and that the profile row was created. The real Today dashboard --
 * current activity, up next, home plan -- is Phases 5 to 7.
 */
export default async function DashboardPage() {
  const session = await requireSessionContext();
  const { user, profile } = session;

  return (
    <PageContainer>
      <PageHeader
        eyebrow={`Signed in as ${user.email}`}
        title={`Welcome to StudyFlow, ${firstName(session)}`}
        description="Your account is set up. The real dashboard is still to come."
        action={<SignOutButton />}
      />

      <div className="max-w-xl rounded-lg border border-border bg-card p-6 shadow-card">
        <Eyebrow>Account</Eyebrow>

        <dl className="mt-4 grid gap-4 sm:grid-cols-2">
          <div>
            <dt className="text-[13px] text-ink-muted">Name</dt>
            <dd className="mt-0.5 text-[15px] font-medium text-ink">
              {displayName(session)}
            </dd>
          </div>
          <div>
            <dt className="text-[13px] text-ink-muted">Email</dt>
            <dd className="mt-0.5 text-[15px] font-medium text-ink">{user.email}</dd>
          </div>
          <div>
            <dt className="text-[13px] text-ink-muted">Role</dt>
            <dd className="mt-1">
              <Badge className="bg-sage-soft text-sage-strong capitalize">
                {profile?.role ?? "unknown"}
              </Badge>
            </dd>
          </div>
          <div>
            <dt className="text-[13px] text-ink-muted">Timezone</dt>
            <dd className="mt-0.5 text-[15px] font-medium text-ink">
              {profile?.timezone ?? "—"}
            </dd>
          </div>
        </dl>

        {!profile ? (
          <div className="mt-5 flex gap-2.5 rounded-md border border-warn/25 bg-warn-soft px-3.5 py-3 text-[13px] leading-5 text-warn">
            <AlertCircle aria-hidden="true" className="mt-0.5 size-4 shrink-0" />
            <div>
              <p className="font-medium">No profile row for this account.</p>
              <p className="mt-0.5">
                Run <code className="font-mono">supabase/migrations/0001_auth_and_profiles.sql</code>{" "}
                against your project. It installs the trigger that creates
                profiles, and backfills any account made before it ran.
              </p>
            </div>
          </div>
        ) : null}
      </div>

      <p className="mt-6 text-sm text-ink-subtle">
        Placeholder for Phase 1 · the Today dashboard is built in Phases 5–7.
      </p>
    </PageContainer>
  );
}
