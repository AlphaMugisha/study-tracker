"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Search, Settings } from "lucide-react";

import { AccountMenu, type AccountSummary } from "@/components/layout/account-menu";
import { CommandPalette, useCommandPalette } from "@/components/layout/command-palette";
import { useScrolled } from "@/components/layout/use-scrolled";
import { HeaderSupport } from "@/components/layout/header-support";
import { LiveClock } from "@/components/layout/live-clock";
import { NavDrawer } from "@/components/layout/nav-drawer";
import { isNavItemActive, primaryNavFor, secondaryNav } from "@/lib/nav";
import { cn } from "@/lib/utils";

/**
 * Section name on the left, search in the middle, clock and account on the
 * right. The search box is a button rather than an input: it opens the
 * palette, and a real input here would give two places to type the same query.
 */
export function TopBar({
  timezone,
  account,
  role,
  support,
  alongside,
}: {
  timezone: string;
  account: AccountSummary;
  role: string;
  support: { studentsVisible: number; pendingForMe: number };
  /** A second clock — the student a parent is watching. */
  alongside?: { label: string; timezone: string } | null;
}) {
  const primaryItems = primaryNavFor(role);
  const secondaryItems = secondaryNav;
  const pathname = usePathname();
  const { open, setOpen } = useCommandPalette();
  const scrolled = useScrolled();

  const current =
    [...primaryItems, ...secondaryItems].find((item) => isNavItemActive(pathname, item.href)) ??
    primaryItems[0];

  return (
    <>
      {/* Transparent at rest, solid once the page moves under it -- the bar
          should not draw a line across a page that has not been scrolled. */}
      <header
        className={cn(
          "sticky top-0 z-30 flex h-20 items-center gap-4 px-5 transition-colors duration-300 ease-out-flat md:px-8 lg:px-12",
          // Always a hairline. Fully transparent at rest looked like the top
          // bar was missing rather than restrained; the fill is what changes
          // on scroll now, not whether the bar exists.
          scrolled
            ? "border-b border-border bg-background/90 backdrop-blur-md"
            : "border-b border-border/60 bg-background/40 backdrop-blur-sm",
        )}
      >
        {/* The rail below md shows icons only, so the drawer stays available
            there for labelled navigation. The brand is not repeated here —
            the rail carries it at every width now. */}
        <NavDrawer account={account} role={role} />
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

          <HeaderSupport
            role={role}
            studentsVisible={support.studentsVisible}
            pendingForMe={support.pendingForMe}
          />

          <LiveClock timezone={timezone} alongside={alongside} />

          <Link
            href="/settings"
            aria-label="Settings"
            className="rounded-md p-2 text-ink-subtle transition-colors hover:text-ink md:hidden"
          >
            <Settings aria-hidden="true" className="size-5" />
          </Link>

          {/* Who you are, said out loud rather than hidden behind an
              initials circle. Falls back to the avatar when the bar is
              tight. */}
          <span className="hidden md:block">
            <AccountMenu account={account} variant="header" />
          </span>
        </div>
      </header>

      <CommandPalette open={open} onOpenChange={setOpen} />
    </>
  );
}
