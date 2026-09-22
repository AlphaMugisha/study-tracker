"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Search, Settings } from "lucide-react";

import { AccountMenu, type AccountSummary } from "@/components/layout/account-menu";
import { CommandPalette, useCommandPalette } from "@/components/layout/command-palette";
import { LiveClock } from "@/components/layout/live-clock";
import { Logo } from "@/components/layout/logo";
import { isNavItemActive, primaryNav, secondaryNav } from "@/lib/nav";

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

  const current =
    [...primaryNav, ...secondaryNav].find((item) => isNavItemActive(pathname, item.href)) ??
    primaryNav[0];

  return (
    <>
      <header className="sticky top-0 z-30 flex h-14 items-center gap-3 border-b border-border bg-background/80 px-5 backdrop-blur-md lg:px-8">
        {/* Mobile has no sidebar, so the brand lives here instead. */}
        <Link href="/dashboard" className="rounded-md lg:hidden">
          <Logo />
        </Link>
        <span className="hidden shrink-0 text-[15px] font-semibold tracking-[-0.01em] text-ink lg:block">
          {current.label}
        </span>

        <button
          type="button"
          onClick={() => setOpen(true)}
          className="ml-auto hidden h-9 w-full max-w-[320px] items-center gap-2.5 rounded-lg border border-border bg-surface-sunken px-3 text-left text-[13px] text-ink-subtle transition-colors hover:border-border-strong hover:text-ink-muted md:flex lg:ml-8 lg:mr-auto"
        >
          <Search aria-hidden="true" className="size-4 shrink-0" />
          <span className="flex-1 truncate">Search</span>
          <kbd className="rounded border border-border px-1.5 py-0.5 text-[10px] font-medium">
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
            className="rounded-md p-2 text-ink-subtle transition-colors hover:text-ink lg:hidden"
          >
            <Settings aria-hidden="true" className="size-5" />
          </Link>

          <span className="hidden lg:block">
            <AccountMenu account={account} compact />
          </span>
        </div>
      </header>

      <CommandPalette open={open} onOpenChange={setOpen} />
    </>
  );
}
