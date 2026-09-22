"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Settings } from "lucide-react";

import { LiveClock } from "@/components/layout/live-clock";
import { Logo } from "@/components/layout/logo";
import { isNavItemActive, primaryNav, secondaryNav } from "@/lib/nav";

/**
 * A slim bar above every authenticated page: the current section on the left,
 * the student's local time on the right.
 *
 * The account menu deliberately lives only in the sidebar. The reference puts
 * an avatar up here too, but with a persistent sidebar that is the same
 * control in two places.
 */
export function TopBar({ timezone }: { timezone: string }) {
  const pathname = usePathname();
  const current =
    [...primaryNav, ...secondaryNav].find((item) => isNavItemActive(pathname, item.href)) ??
    primaryNav[0];

  return (
    <header className="sticky top-0 z-30 flex h-14 items-center gap-3 border-b border-border bg-background/85 px-5 backdrop-blur-md lg:px-8">
      {/* Mobile has no sidebar, so the brand lives here instead. */}
      <Link href="/dashboard" className="rounded-md lg:hidden">
        <Logo />
      </Link>
      <span className="hidden text-[15px] font-semibold tracking-[-0.01em] text-ink lg:block">
        {current.label}
      </span>

      <div className="ml-auto flex items-center gap-1 sm:gap-3">
        <LiveClock timezone={timezone} />
        <Link
          href="/settings"
          aria-label="Settings"
          className="rounded-md p-2 text-ink-subtle transition-colors hover:text-ink lg:hidden"
        >
          <Settings aria-hidden="true" className="size-5" />
        </Link>
      </div>
    </header>
  );
}
