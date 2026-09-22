/**
 * Auth pages reflect session and configuration state, so they must never be
 * prerendered into static HTML.
 */
export const dynamic = "force-dynamic";

export default function AuthLayout({ children }: { children: React.ReactNode }) {
  return children;
}
