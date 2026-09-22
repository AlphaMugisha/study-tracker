import { cookies } from "next/headers";

import type { AccountSummary } from "@/components/layout/account-menu";
import { MobileNav } from "@/components/layout/mobile-nav";
import { Sidebar } from "@/components/layout/sidebar";
import { TopBar } from "@/components/layout/top-bar";
import { displayName, requireSessionContext } from "@/lib/auth";
import { cn } from "@/lib/utils";

/**
 * Two designed layouts, not one shrunk layout:
 *   < md : top bar with the brand + fixed bottom tab bar, single column
 *   >= md: a 60px icon rail, expanding to a full panel from lg, plus a top
 *          bar carrying the section name, search, the clock and the account
 */
export async function AppShell({ children }: { children: React.ReactNode }) {
  const session = await requireSessionContext();
  // Read on the server so the first paint is already the right width.
  const collapsed = (await cookies()).get("sf-sidebar")?.value === "collapsed";

  const account: AccountSummary = {
    name: displayName(session),
    email: session.user.email ?? "",
    role: session.profile?.role ?? "student",
  };

  return (
    <div className="flex min-h-dvh bg-background">
      <Sidebar defaultCollapsed={collapsed} />

      <div className="flex min-w-0 flex-1 flex-col">
        <TopBar timezone={session.profile?.timezone ?? "UTC"} account={account} />

        <main id="main" className="flex-1 pb-24 md:pb-0">
          {children}
        </main>

        <MobileNav />
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
        "mx-auto w-full max-w-[1440px] px-5 pb-24 pt-10 sm:px-8 sm:pt-14 md:px-10 md:pb-32 md:pt-16 2xl:max-w-[1680px]",
        className,
      )}
    >
      {children}
    </div>
  );
}
