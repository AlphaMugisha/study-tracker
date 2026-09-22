import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import type { User } from "@supabase/supabase-js";

import { isSupabaseConfigured } from "@/lib/env";
import { createClient } from "@/lib/supabase/server";
import type { Profile } from "@/types/database";

/**
 * Server-side session helpers. Import these only from Server Components,
 * Server Actions and Route Handlers -- never from a Client Component.
 */

export type SessionContext = {
  user: User;
  /**
   * Null only if the `on_auth_user_created` trigger has not been installed.
   * Callers should degrade gracefully rather than crash; the setup notice on
   * the dashboard tells the operator what to fix.
   */
  profile: Profile | null;
};

/**
 * The authenticated user, or null.
 *
 * Always `getUser()`, never `getSession()`: only `getUser()` revalidates the
 * JWT against the auth server. `getSession()` trusts whatever the cookie says,
 * which is fine in the browser and not fine on the server.
 */
export async function getUser(): Promise<User | null> {
  // Touch cookies unconditionally. Without this, a build with no Supabase
  // configuration short-circuits before any dynamic API is called, and Next
  // happily prerenders session-dependent pages as static HTML.
  await cookies();

  if (!isSupabaseConfigured()) return null;

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  return user;
}

export async function getSessionContext(): Promise<SessionContext | null> {
  const user = await getUser();
  if (!user) return null;

  const supabase = await createClient();
  const { data: profile } = await supabase
    .from("profiles")
    .select("*")
    .eq("id", user.id)
    .maybeSingle();

  return { user, profile: profile ?? null };
}

/**
 * For pages that must not render to a signed-out visitor.
 *
 * `src/proxy.ts` already redirects them, so reaching this branch means the
 * proxy was bypassed. Keeping the check here too means a page is never
 * one config edit away from leaking.
 */
export async function requireSessionContext(): Promise<SessionContext> {
  const context = await getSessionContext();
  if (!context) redirect("/login");
  return context;
}

/** First name where we have one, otherwise something sensible to greet. */
export function displayName(context: SessionContext): string {
  const fromProfile = context.profile?.full_name?.trim();
  if (fromProfile) return fromProfile;

  const fromMetadata = (context.user.user_metadata?.full_name as string | undefined)?.trim();
  if (fromMetadata) return fromMetadata;

  return context.user.email?.split("@")[0] ?? "there";
}

export function firstName(context: SessionContext): string {
  return displayName(context).split(" ")[0];
}
