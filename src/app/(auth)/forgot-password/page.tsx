import type { Metadata } from "next";

import { AuthShell } from "@/components/auth/auth-shell";
import { ForgotPasswordForm } from "@/components/auth/password-reset-forms";
import { SetupNotice } from "@/components/auth/setup-notice";

export const metadata: Metadata = { title: "Reset your password" };

export default function ForgotPasswordPage() {
  return (
    <AuthShell
      title="Reset your password"
      subtitle="Enter your email and we will send you a link to choose a new one."
    >
      <SetupNotice />
      <ForgotPasswordForm />
    </AuthShell>
  );
}
