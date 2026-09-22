import type { Metadata } from "next";

import { AuthShell } from "@/components/auth/auth-shell";
import { SetupNotice } from "@/components/auth/setup-notice";
import { SignupForm } from "@/components/auth/signup-form";
import { sanitiseNext } from "@/lib/auth-redirect";

export const metadata: Metadata = { title: "Create your account" };

type SearchParams = Promise<Record<string, string | string[] | undefined>>;

export default async function SignupPage({
  searchParams,
}: {
  searchParams: SearchParams;
}) {
  const params = await searchParams;

  return (
    <AuthShell
      title="Create your StudyFlow account"
      subtitle="Set up your personal space for school, homework and revision."
    >
      <SetupNotice />
      <SignupForm next={sanitiseNext(params.next)} />
    </AuthShell>
  );
}
