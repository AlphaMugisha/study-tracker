"use server";

import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import type { AuthError } from "@supabase/supabase-js";

import type { AuthFormState } from "@/lib/actions/auth-state";
import { DEFAULT_DESTINATION, sanitiseNext } from "@/lib/auth-redirect";
import { isSupabaseConfigured } from "@/lib/env";
import { createClient } from "@/lib/supabase/server";
import {
  fieldErrorsFrom,
  forgotPasswordSchema,
  resetPasswordSchema,
  signInSchema,
  signUpSchema,
} from "@/lib/validation/auth";

const NOT_CONFIGURED =
  "StudyFlow is not connected to its database yet. Add your Supabase keys to .env.local and restart the dev server.";

function text(formData: FormData, key: string): string {
  const value = formData.get(key);
  return typeof value === "string" ? value.trim() : "";
}

async function siteOrigin(): Promise<string> {
  const headerList = await headers();
  const origin = headerList.get("origin");
  if (origin) return origin;

  const host = headerList.get("host") ?? "localhost:3000";
  const protocol = host.startsWith("localhost") || host.startsWith("127.") ? "http" : "https";
  return `${protocol}://${host}`;
}

/**
 * Supabase speaks in API terms. The student should not have to.
 * Anything unrecognised falls through to the raw message rather than a
 * useless "something went wrong" -- an unhelpful specific beats an
 * unhelpful generic when we are debugging.
 */
function describeAuthError(error: AuthError): string {
  const message = error.message.toLowerCase();

  if (message.includes("invalid login credentials")) {
    return "That email and password do not match an account.";
  }
  if (message.includes("email not confirmed")) {
    return "Confirm your email address first. Check your inbox for the link we sent.";
  }
  if (message.includes("user already registered") || message.includes("already been registered")) {
    return "An account already exists with that email. Try signing in instead.";
  }
  if (message.includes("password should be")) {
    return "That password is too weak. Use at least 8 characters.";
  }
  if (message.includes("rate limit") || message.includes("too many requests")) {
    return "Too many attempts. Wait a minute and try again.";
  }
  if (message.includes("fetch failed") || message.includes("network")) {
    return "Could not reach the server. Check your connection and try again.";
  }

  return error.message;
}

// ---------------------------------------------------------------------------
// Sign up
// ---------------------------------------------------------------------------

export async function signUpAction(
  _prevState: AuthFormState,
  formData: FormData,
): Promise<AuthFormState> {
  const values = {
    fullName: text(formData, "fullName"),
    email: text(formData, "email").toLowerCase(),
  };

  if (!isSupabaseConfigured()) {
    return { formError: NOT_CONFIGURED, values };
  }

  const parsed = signUpSchema.safeParse({
    fullName: values.fullName,
    email: values.email,
    password: formData.get("password"),
    confirmPassword: formData.get("confirmPassword"),
  });

  if (!parsed.success) {
    return { fieldErrors: fieldErrorsFrom(parsed.error), values };
  }

  const supabase = await createClient();
  const origin = await siteOrigin();
  const next = sanitiseNext(formData.get("next"));

  const { data, error } = await supabase.auth.signUp({
    email: parsed.data.email,
    password: parsed.data.password,
    options: {
      // Read by the on_auth_user_created trigger to populate the profile.
      data: {
        full_name: parsed.data.fullName,
        timezone: text(formData, "timezone") || "UTC",
      },
      emailRedirectTo: `${origin}/auth/callback?next=${encodeURIComponent(next)}`,
    },
  });

  if (error) {
    return { formError: describeAuthError(error), values };
  }

  // When email confirmation is on, Supabase returns a decoy user with no
  // identities for an address that already exists, rather than admitting the
  // account is there. Surfacing it is the right trade-off for a single-student
  // product: the alternative is a signup that silently appears to work.
  if (data.user && Array.isArray(data.user.identities) && data.user.identities.length === 0) {
    return {
      formError: "An account already exists with that email. Try signing in instead.",
      values,
    };
  }

  // No session means email confirmation is enabled. Stop here and say so.
  if (!data.session) {
    return {
      notice: {
        title: "Check your email",
        body: `We sent a confirmation link to ${parsed.data.email}. Open it to finish setting up your account.`,
      },
    };
  }

  revalidatePath("/", "layout");
  redirect(next);
}

// ---------------------------------------------------------------------------
// Sign in
// ---------------------------------------------------------------------------

export async function signInAction(
  _prevState: AuthFormState,
  formData: FormData,
): Promise<AuthFormState> {
  const values = { email: text(formData, "email").toLowerCase() };

  if (!isSupabaseConfigured()) {
    return { formError: NOT_CONFIGURED, values };
  }

  const parsed = signInSchema.safeParse({
    email: values.email,
    password: formData.get("password"),
  });

  if (!parsed.success) {
    return { fieldErrors: fieldErrorsFrom(parsed.error), values };
  }

  const supabase = await createClient();
  const { error } = await supabase.auth.signInWithPassword({
    email: parsed.data.email,
    password: parsed.data.password,
  });

  if (error) {
    return { formError: describeAuthError(error), values };
  }

  revalidatePath("/", "layout");
  redirect(sanitiseNext(formData.get("next")));
}

// ---------------------------------------------------------------------------
// Sign out
// ---------------------------------------------------------------------------

export async function signOutAction(): Promise<void> {
  if (isSupabaseConfigured()) {
    const supabase = await createClient();
    await supabase.auth.signOut();
  }

  revalidatePath("/", "layout");
  redirect("/login");
}

// ---------------------------------------------------------------------------
// Forgot / reset password
// ---------------------------------------------------------------------------

export async function forgotPasswordAction(
  _prevState: AuthFormState,
  formData: FormData,
): Promise<AuthFormState> {
  const values = { email: text(formData, "email").toLowerCase() };

  if (!isSupabaseConfigured()) {
    return { formError: NOT_CONFIGURED, values };
  }

  const parsed = forgotPasswordSchema.safeParse({ email: values.email });
  if (!parsed.success) {
    return { fieldErrors: fieldErrorsFrom(parsed.error), values };
  }

  const supabase = await createClient();
  const origin = await siteOrigin();

  const { error } = await supabase.auth.resetPasswordForEmail(parsed.data.email, {
    redirectTo: `${origin}/auth/callback?next=${encodeURIComponent("/reset-password")}`,
  });

  if (error) {
    return { formError: describeAuthError(error), values };
  }

  // Deliberately the same response whether or not the address exists -- this
  // endpoint is unauthenticated, so confirming which emails have accounts
  // would hand an attacker a list.
  return {
    notice: {
      title: "Check your email",
      body: `If an account exists for ${parsed.data.email}, we have sent it a link to choose a new password.`,
    },
  };
}

export async function resetPasswordAction(
  _prevState: AuthFormState,
  formData: FormData,
): Promise<AuthFormState> {
  if (!isSupabaseConfigured()) {
    return { formError: NOT_CONFIGURED };
  }

  const parsed = resetPasswordSchema.safeParse({
    password: formData.get("password"),
    confirmPassword: formData.get("confirmPassword"),
  });

  if (!parsed.success) {
    return { fieldErrors: fieldErrorsFrom(parsed.error) };
  }

  const supabase = await createClient();

  // The recovery link established a session in /auth/callback; without one
  // there is nothing to update.
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return {
      formError: "That reset link has expired. Request a new one and try again.",
    };
  }

  const { error } = await supabase.auth.updateUser({ password: parsed.data.password });

  if (error) {
    return { formError: describeAuthError(error) };
  }

  revalidatePath("/", "layout");
  redirect(DEFAULT_DESTINATION);
}
