import { cookies } from "next/headers";

import type { AccountSummary } from "@/components/layout/account-menu";
import { Sidebar } from "@/components/layout/sidebar";
import { TopBar } from "@/components/layout/top-bar";
import { displayName, requireSessionContext } from "@/lib/auth";
import { getSupportSummary } from "@/lib/data/support";

import { cn } from "@/lib/utils";

/**
 * Two designed layouts, not one shrunk layout:
 *   The sidebar is always present — a 72px icon rail, widening to a labelled
 *   264px panel from md. The top bar carries the section name, search, the
 *   clock and the account; the drawer adds labelled navigation below md,
 *   where the rail shows icons only.
 */
export async function AppShell({ children }: { children: React.ReactNode }) {
  const [session, support] = await Promise.all([
    requireSessionContext(),
    getSupportSummary(),
  ]);
  // Read on the server so the first paint is already the right width.
  const collapsed = (await cookies()).get("sf-sidebar")?.value === "collapsed";

  // The ROLE crosses the server/client boundary, not the nav array: every
  // NavItem carries an `icon`, and a component is a function, which React
  // refuses to serialise into a Client Component's props. The client resolves
  // the items itself from this string.
  const role = session.profile?.role ?? "student";

  const account: AccountSummary = {
    name: displayName(session),
    email: session.user.email ?? "",
    role: session.profile?.role ?? "student",
  };

  return (
    <div className="flex min-h-dvh bg-background">
      <Sidebar defaultCollapsed={collapsed} role={role} />

      <div className="flex min-w-0 flex-1 flex-col">
        <TopBar
          timezone={session.profile?.timezone ?? "UTC"}
          account={account}
          role={role}
          support={support}
        />

        <main id="main" className="flex-1">
          {children}
        </main>

      </div>
    </div>
  );
}

/**
 * Page gutter and max width. The cap steps up on big screens rather than
 * holding at 1200px -- on a 1080p or wider monitor that left a third of the
 * window empty on either side.
 */
export function PageContainer({
  children,
  className,
}: {
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <div
      className={cn(
        "mx-auto w-full max-w-[1500px] px-5 pb-28 pt-12 sm:px-8 sm:pt-16 md:px-12 md:pb-36 md:pt-20 lg:px-16 2xl:max-w-[1760px]",
        className,
      )}
    >
      {children}
    </div>
  );
}
