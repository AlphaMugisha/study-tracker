"use client";

import Link from "next/link";
import { ChevronsUpDown, LogOut, Settings } from "lucide-react";

import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { signOutAction } from "@/lib/actions/auth";
import { cn } from "@/lib/utils";

export type AccountSummary = {
  name: string;
  email: string;
  role: string;
};

function initials(name: string): string {
  const parts = name.trim().split(/\s+/).slice(0, 2);
  return parts.map((p) => p[0]?.toUpperCase() ?? "").join("") || "?";
}

/**
 * `compact` renders just the avatar, for the top bar. The full form -- avatar,
 * name, role, chevron -- is for a sidebar foot.
 */
export function AccountMenu({
  account,
  className,
  compact = false,
}: {
  account: AccountSummary;
  className?: string;
  compact?: boolean;
}) {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        aria-label={compact ? `Account: ${account.name}` : undefined}
        className={cn(
          "flex items-center rounded-md text-left transition-colors",
          compact
            ? "size-9 shrink-0 justify-center hover:bg-surface-raised"
            : "w-full gap-2.5 px-2 py-2 hover:bg-sidebar-accent/60",
          className,
        )}
      >
        <span className="flex size-8 shrink-0 items-center justify-center rounded-full bg-indigo-soft text-[11px] font-semibold text-indigo-ink ring-1 ring-border-strong">
          {initials(account.name)}
        </span>
        {!compact ? (
          <>
            <span className="min-w-0 flex-1">
              <span className="block truncate text-[13px] font-medium text-ink">
                {account.name}
              </span>
              <span className="block truncate text-[11px] capitalize text-ink-subtle">
                {account.role}
              </span>
            </span>
            <ChevronsUpDown
              aria-hidden="true"
              className="size-3.5 shrink-0 text-ink-subtle"
            />
          </>
        ) : null}
      </DropdownMenuTrigger>

      <DropdownMenuContent align="end" side={compact ? "bottom" : "top"} className="w-56">
        <DropdownMenuLabel className="font-normal">
          <span className="block text-[13px] font-medium text-ink">{account.name}</span>
          <span className="block truncate text-xs text-ink-muted">{account.email}</span>
        </DropdownMenuLabel>
        <DropdownMenuSeparator />
        <DropdownMenuItem asChild>
          <Link href="/settings">
            <Settings aria-hidden="true" />
            Settings
          </Link>
        </DropdownMenuItem>
        <DropdownMenuSeparator />
        <DropdownMenuItem asChild variant="destructive">
          {/* A form, not a link: signing out is a mutation. */}
          <form action={signOutAction}>
            <button type="submit" className="flex w-full items-center gap-2">
              <LogOut aria-hidden="true" />
              Sign out
            </button>
          </form>
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
