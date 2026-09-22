import type { AccountSummary } from "@/components/layout/account-menu";
import { MobileNav } from "@/components/layout/mobile-nav";
import { Sidebar } from "@/components/layout/sidebar";
import { TopBar } from "@/components/layout/top-bar";
import { displayName, requireSessionContext } from "@/lib/auth";
import { cn } from "@/lib/utils";

/**
 * Two designed layouts, not one shrunk layout:
 *   < lg : top bar with the brand + fixed bottom tab bar, single column
 *   >= lg: persistent sidebar with the account menu at its foot, and a slim
 *          top bar carrying the section name and the local clock
 */
export async function AppShell({ children }: { children: React.ReactNode }) {
  const session = await requireSessionContext();

  const account: AccountSummary = {
    name: displayName(session),
    email: session.user.email ?? "",
    role: session.profile?.role ?? "student",
  };

  return (
    <div className="flex min-h-dvh bg-background">
      <Sidebar account={account} />

      <div className="flex min-w-0 flex-1 flex-col">
        <TopBar timezone={session.profile?.timezone ?? "UTC"} />

        <main id="main" className="flex-1 pb-24 lg:pb-0">
          {children}
        </main>

        <MobileNav />
      </div>
    </div>
  );
}

/**
 * Page gutter and max width. 1200px keeps the dashboard grid from stretching
 * so wide that "currently" and "up next" lose their relationship.
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
        "mx-auto w-full max-w-[1200px] px-5 py-6 sm:px-8 lg:px-10 lg:py-9",
        className,
      )}
    >
      {children}
    </div>
  );
}
