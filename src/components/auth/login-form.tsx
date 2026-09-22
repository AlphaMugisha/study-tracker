"use client";

import Link from "next/link";
import { useActionState } from "react";

import { AuthCard, AuthCardFooter, AuthLink } from "@/components/auth/auth-shell";
import { Field, FormAlert, fieldA11yProps } from "@/components/auth/form-field";
import { PasswordInput } from "@/components/auth/password-input";
import { SubmitButton } from "@/components/auth/submit-button";
import { Input } from "@/components/ui/input";
import { signInAction } from "@/lib/actions/auth";
import { emptyAuthFormState } from "@/lib/actions/auth-state";

export function LoginForm({ next }: { next: string }) {
  const [state, action] = useActionState(signInAction, emptyAuthFormState);
  const fieldErrors = state.fieldErrors ?? {};

  return (
    <>
      <AuthCard>
        <form action={action} className="grid gap-5 px-7 py-7" noValidate>
          <input type="hidden" name="next" value={next} />

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

          <div className="grid gap-1.5">
            <Field id="password" label="Password" error={fieldErrors.password}>
              <PasswordInput
                {...fieldA11yProps("password", fieldErrors.password)}
                name="password"
                autoComplete="current-password"
                required
                placeholder="Your password"
              />
            </Field>
            <div className="text-right">
              <Link
                href="/forgot-password"
                className="rounded-sm text-[13px] text-ink-muted underline-offset-4 transition-colors hover:text-sage-strong hover:underline"
              >
                Forgot password?
              </Link>
            </div>
          </div>

          <SubmitButton pendingLabel="Signing in">Sign in</SubmitButton>
        </form>

        <AuthCardFooter>
          Don&apos;t have an account? <AuthLink href="/signup">Create one</AuthLink>
        </AuthCardFooter>
      </AuthCard>
    </>
  );
}
