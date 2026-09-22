import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";

import { getSupabaseEnv, isSupabaseConfigured } from "@/lib/env";
import type { Database } from "@/types/database";

/**
 * Refreshes the Supabase auth session on every request and returns the
 * response carrying any rotated cookies.
 *
 * Next.js 16 renamed the `middleware.ts` convention to `proxy.ts` (same
 * behaviour, new file and export name), hence the filename. This helper is
 * wired into `src/proxy.ts` in Phase 1 -- Phase 0 ships no proxy at all, so
 * the app boots with zero configuration.
 */
export async function updateSession(request: NextRequest) {
  const response = NextResponse.next({ request });

  // No Supabase project yet: behave as a pass-through rather than crashing.
  if (!isSupabaseConfigured()) {
    return { response, user: null };
  }

  const env = getSupabaseEnv();

  const supabase = createServerClient<Database>(
    env.NEXT_PUBLIC_SUPABASE_URL,
    env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet) {
          for (const { name, value } of cookiesToSet) {
            request.cookies.set(name, value);
          }
          for (const { name, value, options } of cookiesToSet) {
            response.cookies.set(name, value, options);
          }
        },
      },
    },
  );

  // Always getUser(), never getSession(): only getUser() revalidates the JWT
  // against the auth server. getSession() trusts the cookie.
  const {
    data: { user },
  } = await supabase.auth.getUser();

  return { response, user };
}
