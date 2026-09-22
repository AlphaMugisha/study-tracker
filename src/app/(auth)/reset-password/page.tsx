import type { Metadata } from "next";

import { AuthShell } from "@/components/auth/auth-shell";
import { ResetPasswordForm } from "@/components/auth/password-reset-forms";
import { getUser } from "@/lib/auth";

export const metadata: Metadata = { title: "Choose a new password" };

export default async function ResetPasswordPage() {
  // The emailed recovery link runs through /auth/callback, which exchanges the
  // code for a session. No session here means the link is stale or reused.
  const user = await getUser();

  return (
    <AuthShell
      title="Choose a new password"
      subtitle="Pick something you will remember. You will stay signed in afterwards."
    >
      <ResetPasswordForm hasSession={Boolean(user)} />
    </AuthShell>
  );
}
