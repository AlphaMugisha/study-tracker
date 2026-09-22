"use client";

import { useActionState } from "react";

import { AuthCard, AuthCardFooter, AuthLink } from "@/components/auth/auth-shell";
import { Field, FormAlert, fieldA11yProps } from "@/components/auth/form-field";
import { PasswordInput } from "@/components/auth/password-input";
import { SubmitButton } from "@/components/auth/submit-button";
import { Input } from "@/components/ui/input";
import { forgotPasswordAction, resetPasswordAction } from "@/lib/actions/auth";
import { emptyAuthFormState } from "@/lib/actions/auth-state";
import { PASSWORD_MIN } from "@/lib/validation/auth";

/** Step 1: ask for the email, send the recovery link. */
export function ForgotPasswordForm() {
  const [state, action] = useActionState(forgotPasswordAction, emptyAuthFormState);
  const fieldErrors = state.fieldErrors ?? {};

  if (state.notice) {
    return (
      <AuthCard>
        <div className="px-7 py-7">
          <FormAlert variant="success" title={state.notice.title}>
            {state.notice.body}
          </FormAlert>
          <p className="mt-4 text-center text-sm text-ink-muted">
            <AuthLink href="/login">Back to sign in</AuthLink>
          </p>
        </div>
      </AuthCard>
    );
  }

  return (
    <AuthCard>
      <form action={action} className="grid gap-5 px-7 py-7" noValidate>
        {state.formError ? <FormAlert>{state.formError}</FormAlert> : null}

        <Field id="email" label="Email" error={fieldErrors.email}>
          <Input
            {...fieldA11yProps("email", fieldErrors.email)}
            name="email"
            type="email"
            inputMode="email"
            autoComplete="email"
            autoFocus
            required
            placeholder="ava@school.com"
            defaultValue={state.values?.email ?? ""}
            className="h-10"
          />
        </Field>

        <SubmitButton pendingLabel="Sending">Send reset link</SubmitButton>
      </form>

      <AuthCardFooter>
        Remembered it? <AuthLink href="/login">Sign in</AuthLink>
      </AuthCardFooter>
    </AuthCard>
  );
}

/** Step 2: reached via the emailed link, which has already set a session. */
export function ResetPasswordForm({ hasSession }: { hasSession: boolean }) {
  const [state, action] = useActionState(resetPasswordAction, emptyAuthFormState);
  const fieldErrors = state.fieldErrors ?? {};

  if (!hasSession) {
    return (
      <AuthCard>
        <div className="px-7 py-7">
          <FormAlert>
            This reset link has expired or has already been used. Request a new one.
          </FormAlert>
          <p className="mt-4 text-center text-sm text-ink-muted">
            <AuthLink href="/forgot-password">Send a new link</AuthLink>
          </p>
        </div>
      </AuthCard>
    );
  }

  return (
    <AuthCard>
      <form action={action} className="grid gap-5 px-7 py-7" noValidate>
        {state.formError ? <FormAlert>{state.formError}</FormAlert> : null}

        <Field
          id="password"
          label="New password"
          error={fieldErrors.password}
          hint={`At least ${PASSWORD_MIN} characters.`}
        >
          <PasswordInput
            {...fieldA11yProps(
              "password",
              fieldErrors.password,
              `At least ${PASSWORD_MIN} characters.`,
            )}
            name="password"
            autoComplete="new-password"
            autoFocus
            required
            minLength={PASSWORD_MIN}
            placeholder="Choose a new password"
          />
        </Field>

        <Field
          id="confirmPassword"
          label="Confirm new password"
          error={fieldErrors.confirmPassword}
        >
          <PasswordInput
            {...fieldA11yProps("confirmPassword", fieldErrors.confirmPassword)}
            name="confirmPassword"
            describes="password confirmation"
            autoComplete="new-password"
            required
            placeholder="Type it again"
          />
        </Field>

        <SubmitButton pendingLabel="Saving">Save new password</SubmitButton>
      </form>
    </AuthCard>
  );
}
