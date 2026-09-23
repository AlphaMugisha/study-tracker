"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Search, Settings } from "lucide-react";

import { AccountMenu, type AccountSummary } from "@/components/layout/account-menu";
import { CommandPalette, useCommandPalette } from "@/components/layout/command-palette";
import { useScrolled } from "@/components/layout/use-scrolled";
import { LiveClock } from "@/components/layout/live-clock";
import { Logo } from "@/components/layout/logo";
import { isNavItemActive, primaryNav, secondaryNav } from "@/lib/nav";
import { cn } from "@/lib/utils";

/**
 * Section name on the left, search in the middle, clock and account on the
 * right. The search box is a button rather than an input: it opens the
 * palette, and a real input here would give two places to type the same query.
 */
export function TopBar({
  timezone,
  account,
}: {
  timezone: string;
  account: AccountSummary;
}) {
  const pathname = usePathname();
  const { open, setOpen } = useCommandPalette();
  const scrolled = useScrolled();

  const current =
    [...primaryNav, ...secondaryNav].find((item) => isNavItemActive(pathname, item.href)) ??
    primaryNav[0];

  return (
    <>
      {/* Transparent at rest, solid once the page moves under it -- the bar
          should not draw a line across a page that has not been scrolled. */}
      <header
        className={cn(
          "sticky top-0 z-30 flex h-20 items-center gap-4 px-5 transition-colors duration-300 ease-out-flat md:px-8 lg:px-12",
          scrolled
            ? "border-b border-border bg-background/90 backdrop-blur-md"
            : "border-b border-transparent bg-transparent",
        )}
      >
        {/* Below md there is no sidebar, so the brand lives here instead. */}
        <Link href="/dashboard" className="rounded-md md:hidden">
          <Logo />
        </Link>
        <span className="hidden shrink-0 text-section text-ink md:block">{current.label}</span>

        <button
          type="button"
          onClick={() => setOpen(true)}
          className="ml-auto hidden h-11 w-full max-w-[340px] items-center gap-3 rounded-xl border border-border bg-surface-sunken px-4 text-left text-[0.95rem] text-ink-subtle transition-colors duration-150 ease-out-flat hover:border-border-strong hover:bg-surface-raised hover:text-ink-muted md:flex lg:ml-10 lg:mr-auto"
        >
          <Search aria-hidden="true" className="size-[18px] shrink-0" />
          <span className="flex-1 truncate">Search</span>
          <kbd className="rounded-md border border-border px-2 py-1 text-[0.75rem] font-medium">
            Ctrl K
          </kbd>
        </button>

        <div className="ml-auto flex shrink-0 items-center gap-1 sm:gap-3 md:ml-0">
          <button
            type="button"
            onClick={() => setOpen(true)}
            aria-label="Search"
            className="rounded-md p-2 text-ink-subtle transition-colors hover:text-ink md:hidden"
          >
            <Search aria-hidden="true" className="size-5" />
          </button>

          <LiveClock timezone={timezone} />

          <Link
            href="/settings"
            aria-label="Settings"
            className="rounded-md p-2 text-ink-subtle transition-colors hover:text-ink md:hidden"
          >
            <Settings aria-hidden="true" className="size-5" />
          </Link>

          <span className="hidden md:block">
            <AccountMenu account={account} compact />
          </span>
        </div>
      </header>

      <CommandPalette open={open} onOpenChange={setOpen} />
    </>
  );
}
