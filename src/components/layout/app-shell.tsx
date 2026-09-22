import Link from "next/link";
import { Settings } from "lucide-react";

import { Logo } from "@/components/layout/logo";
import { MobileNav } from "@/components/layout/mobile-nav";
import { Sidebar } from "@/components/layout/sidebar";
import { cn } from "@/lib/utils";

/**
 * Two designed layouts, not one shrunk layout:
 *   < lg : slim top bar + fixed bottom tab bar, single column
 *   >= lg: persistent 240px sidebar, no bottom bar
 */
export function AppShell({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex min-h-dvh bg-background">
      <Sidebar />

      <div className="flex min-w-0 flex-1 flex-col">
        <header className="sticky top-0 z-30 flex h-14 items-center justify-between border-b border-border bg-background/90 px-5 backdrop-blur-sm lg:hidden">
          <Link href="/dashboard" className="rounded-md">
            <Logo />
          </Link>
          <Link
            href="/settings"
            aria-label="Settings"
            className="rounded-md p-2 text-ink-subtle transition-colors hover:text-ink"
          >
            <Settings aria-hidden="true" className="size-5" />
          </Link>
        </header>

        <main id="main" className="flex-1 pb-20 lg:pb-0">
          {children}
        </main>

        <MobileNav />
      </div>
    </div>
  );
}

/**
 * Page gutter and max width. 1200px keeps the dashboard's 12-column grid from
 * stretching so wide that "currently" and "up next" lose their relationship.
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
        "mx-auto w-full max-w-[1200px] px-5 py-6 sm:px-8 lg:px-12 lg:py-10",
        className,
      )}
    >
      {children}
    </div>
  );
}
