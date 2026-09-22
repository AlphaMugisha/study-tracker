import { NextResponse, type NextRequest } from "next/server";
import type { EmailOtpType } from "@supabase/supabase-js";

import { sanitiseNext } from "@/lib/auth-redirect";
import { isSupabaseConfigured } from "@/lib/env";
import { createClient } from "@/lib/supabase/server";

/**
 * Landing point for every link Supabase emails: confirm-signup and
 * password-recovery both come through here.
 *
 * Two shapes exist in the wild depending on how the email templates are
 * configured, so both are handled:
 *   ?code=...                  PKCE, the default for SSR clients
 *   ?token_hash=...&type=...   the newer OTP-style template
 */
export async function GET(request: NextRequest) {
  const { searchParams, origin } = new URL(request.url);
  const next = sanitiseNext(searchParams.get("next"));

  const failure = (reason: string) =>
    NextResponse.redirect(
      new URL(`/login?error=${encodeURIComponent(reason)}`, origin),
    );

  if (!isSupabaseConfigured()) {
    return failure("StudyFlow is not connected to its database yet.");
  }

  // Supabase can report the failure itself rather than sending a code.
  const providerError = searchParams.get("error_description") ?? searchParams.get("error");
  if (providerError) return failure(providerError);

  const code = searchParams.get("code");
  const tokenHash = searchParams.get("token_hash");
  const type = searchParams.get("type") as EmailOtpType | null;

  const supabase = await createClient();

  if (code) {
    const { error } = await supabase.auth.exchangeCodeForSession(code);
    if (error) return failure("That link has expired. Request a new one.");
  } else if (tokenHash && type) {
    const { error } = await supabase.auth.verifyOtp({ type, token_hash: tokenHash });
    if (error) return failure("That link has expired. Request a new one.");
  } else {
    return failure("That link is not valid. Request a new one.");
  }

  return NextResponse.redirect(new URL(next, origin));
}
