/** Where an authenticated user lands when no destination was requested. */
export const DEFAULT_DESTINATION = "/dashboard";

/** Paths that only make sense to a signed-out visitor. */
export const AUTH_ROUTES = ["/login", "/signup", "/forgot-password"] as const;

/** Paths that require a session. */
export const PROTECTED_PREFIXES = [
  "/dashboard",
  "/timetable",
  "/homework",
  "/plan",
  "/settings",
  "/admin",
] as const;

/**
 * An open redirect is the classic way a login page gets weaponised: a crafted
 * `?next=https://evil.example` sends the user somewhere hostile carrying the
 * trust of our domain. Protocol-relative `//evil.example` does the same thing
 * while still looking like a path, which is why it is rejected separately.
 *
 * Only same-origin absolute paths survive.
 */
export function sanitiseNext(value: unknown): string {
  if (typeof value !== "string") return DEFAULT_DESTINATION;
  if (!value.startsWith("/")) return DEFAULT_DESTINATION;
  if (value.startsWith("//")) return DEFAULT_DESTINATION;
  if (value.includes("\\")) return DEFAULT_DESTINATION;
  return value;
}

export function isAuthRoute(pathname: string): boolean {
  return AUTH_ROUTES.some((route) => pathname === route || pathname.startsWith(`${route}/`));
}

export function isProtectedRoute(pathname: string): boolean {
  return PROTECTED_PREFIXES.some(
    (prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`),
  );
}
