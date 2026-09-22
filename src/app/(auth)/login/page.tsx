import type { Metadata } from "next";

import { AuthShell } from "@/components/auth/auth-shell";
import { FormAlert } from "@/components/auth/form-field";
import { LoginForm } from "@/components/auth/login-form";
import { SetupNotice } from "@/components/auth/setup-notice";
import { sanitiseNext } from "@/lib/auth-redirect";

export const metadata: Metadata = { title: "Sign in" };

type SearchParams = Promise<Record<string, string | string[] | undefined>>;

export default async function LoginPage({
  searchParams,
}: {
  searchParams: SearchParams;
}) {
  const params = await searchParams;
  // /auth/callback bounces expired or reused email links back here.
  const callbackError =
    typeof params.error === "string" ? params.error : undefined;

  return (
    <AuthShell
      title="Welcome back"
      subtitle="Sign in to continue managing your school day."
    >
      <SetupNotice />
      {callbackError ? (
        <div className="mb-4">
          <FormAlert>{callbackError}</FormAlert>
        </div>
      ) : null}
      <LoginForm next={sanitiseNext(params.next)} />
    </AuthShell>
  );
}
