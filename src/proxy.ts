import { NextResponse, type NextRequest } from "next/server";

import { DEFAULT_DESTINATION, isAuthRoute, isProtectedRoute } from "@/lib/auth-redirect";
import { updateSession } from "@/lib/supabase/proxy";

/**
 * Next.js 16 renamed the `middleware.ts` convention to `proxy.ts` -- same
 * behaviour, new file and export name.
 *
 * Two jobs, in order:
 *   1. Refresh the Supabase session on every request so a rotated token is
 *      written back before any page renders.
 *   2. Route guarding: signed-out visitors cannot reach the app, and
 *      signed-in ones do not sit on the login page.
 *
 * This is a convenience layer, not the security boundary. The boundary is
 * Row Level Security in Postgres, plus `requireSessionContext()` on the pages
 * themselves -- a proxy can be misconfigured, a database policy cannot be
 * skipped.
 */
export async function proxy(request: NextRequest) {
  const { response, user } = await updateSession(request);
  const { pathname, search } = request.nextUrl;

  /**
   * A redirect discards the cookies `updateSession` just set, which would
   * drop a freshly rotated session token and log the user out at random.
   * Carry them over.
   */
  const redirectTo = (pathname: string, params?: Record<string, string>) => {
    const url = request.nextUrl.clone();
    url.pathname = pathname;
    url.search = "";
    for (const [key, value] of Object.entries(params ?? {})) {
      url.searchParams.set(key, value);
    }

    const redirect = NextResponse.redirect(url);
    for (const cookie of response.cookies.getAll()) {
      redirect.cookies.set(cookie);
    }
    return redirect;
  };

  if (!user && isProtectedRoute(pathname)) {
    // Remember where they were headed so sign-in can finish the journey.
    return redirectTo("/login", { next: `${pathname}${search}` });
  }

  if (user && isAuthRoute(pathname)) {
    return redirectTo(DEFAULT_DESTINATION);
  }

  return response;
}

export const config = {
  /**
   * Everything except static assets and image optimisation. `/auth/callback`
   * is intentionally included: the code exchange needs the cookie plumbing.
   */
  matcher: [
    "/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico|woff|woff2)$).*)",
  ],
};
