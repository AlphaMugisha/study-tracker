"use client";

import { useActionState } from "react";

import { AuthCard, AuthCardFooter, AuthLink } from "@/components/auth/auth-shell";
import { Field, FormAlert, fieldA11yProps } from "@/components/auth/form-field";
import { PasswordInput } from "@/components/auth/password-input";
import { SubmitButton, TimezoneField } from "@/components/auth/submit-button";
import { Input } from "@/components/ui/input";
import { signUpAction } from "@/lib/actions/auth";
import { emptyAuthFormState } from "@/lib/actions/auth-state";
import { PASSWORD_MIN } from "@/lib/validation/auth";

export function SignupForm({ next }: { next: string }) {
  const [state, action] = useActionState(signUpAction, emptyAuthFormState);
  const fieldErrors = state.fieldErrors ?? {};

  // Email confirmation is on: the account exists but there is no session yet.
  if (state.notice) {
    return (
      <AuthCard>
        <div className="px-7 py-7">
          <FormAlert variant="success" title={state.notice.title}>
            {state.notice.body}
          </FormAlert>
          <p className="mt-4 text-center text-sm text-ink-muted">
            Already confirmed? <AuthLink href="/login">Sign in</AuthLink>
          </p>
        </div>
      </AuthCard>
    );
  }

  return (
    <AuthCard>
      <form action={action} className="grid gap-5 px-7 py-7" noValidate>
        <input type="hidden" name="next" value={next} />
        <TimezoneField />

        {state.formError ? <FormAlert>{state.formError}</FormAlert> : null}

        <Field id="fullName" label="Full name" error={fieldErrors.fullName}>
          <Input
            {...fieldA11yProps("fullName", fieldErrors.fullName)}
            name="fullName"
            type="text"
            autoComplete="name"
            autoFocus
            required
            placeholder="Ava Mukamana"
            defaultValue={state.values?.fullName ?? ""}
            className="h-10"
          />
        </Field>

        <Field id="email" label="Email" error={fieldErrors.email}>
          <Input
            {...fieldA11yProps("email", fieldErrors.email)}
            name="email"
            type="email"
            inputMode="email"
            autoComplete="email"
            required
            placeholder="ava@school.com"
            defaultValue={state.values?.email ?? ""}
            className="h-10"
          />
        </Field>

        <Field
          id="password"
          label="Password"
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
            required
            minLength={PASSWORD_MIN}
            placeholder="Choose a password"
          />
        </Field>

        <Field
          id="confirmPassword"
          label="Confirm password"
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

        <SubmitButton pendingLabel="Creating account">Create account</SubmitButton>
      </form>

      <AuthCardFooter>
        Already have an account? <AuthLink href="/login">Sign in</AuthLink>
      </AuthCardFooter>
    </AuthCard>
  );
}
