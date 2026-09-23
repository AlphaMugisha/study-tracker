import { cookies } from "next/headers";

import type { AccountSummary } from "@/components/layout/account-menu";
import { Sidebar } from "@/components/layout/sidebar";
import { TopBar } from "@/components/layout/top-bar";
import { displayName, requireSessionContext } from "@/lib/auth";
import { SchoolDayProvider } from "@/components/school-day/school-day-provider";
import { getSupportSummary } from "@/lib/data/support";
import { getActiveTimetable } from "@/lib/data/timetable";
import { clockIn, resolveNow } from "@/lib/timetable/resolve";

import { cn } from "@/lib/utils";

/**
 * Two designed layouts, not one shrunk layout:
 *   The sidebar is always present — a 72px icon rail, widening to a labelled
 *   264px panel from md. The top bar carries the section name, search, the
 *   clock and the account; the drawer adds labelled navigation below md,
 *   where the rail shows icons only.
 */
export async function AppShell({ children }: { children: React.ReactNode }) {
  const [session, support, timetable] = await Promise.all([
    requireSessionContext(),
    getSupportSummary(),
    // Cached, so the pages that also need this do not pay twice.
    getActiveTimetable(),
  ]);
  // Read on the server so the first paint is already the right width.
  const collapsed = (await cookies()).get("sf-sidebar")?.value === "collapsed";

  // The ROLE crosses the server/client boundary, not the nav array: every
  // NavItem carries an `icon`, and a component is a function, which React
  // refuses to serialise into a Client Component's props. The client resolves
  // the items itself from this string.
  const role = session.profile?.role ?? "student";
  const timezone = session.profile?.timezone ?? "UTC";

  /**
   * Resolved on the server so the first paint already knows where she is,
   * then re-resolved on a timer by the provider. Both use the STUDENT's
   * timezone, never the host's — on Vercel those are different clocks.
   */
  const { minutes, dayOfWeek } = clockIn(timezone);
  const initialState = resolveNow(timetable.entries, minutes, dayOfWeek);

  const account: AccountSummary = {
    name: displayName(session),
    email: session.user.email ?? "",
    role: session.profile?.role ?? "student",
  };

  return (
    <SchoolDayProvider
      entries={timetable.entries}
      timezone={timezone}
      // A support account is never locked: it is her school day, not theirs.
      lockable={role !== "admin"}
      initial={{ state: initialState, nowMinutes: minutes }}
    >
    <div className="flex min-h-dvh bg-background">
      <Sidebar defaultCollapsed={collapsed} role={role} />

      <div className="flex min-w-0 flex-1 flex-col">
        <TopBar
          timezone={timezone}
          account={account}
          role={role}
          support={support}
          alongside={support.watching}
        />

        <main id="main" className="flex-1">
          {children}
        </main>

      </div>
    </div>
    </SchoolDayProvider>
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
