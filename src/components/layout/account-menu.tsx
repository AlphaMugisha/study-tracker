"use client";

import Link from "next/link";
import { ChevronsUpDown, LogOut, Settings, ShieldCheck } from "lucide-react";

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
/**
 * What the account is allowed to do, in one word.
 *
 * `admin` is called "Support account" in the interface: it is what the role
 * actually is, and it does not imply the power "admin" suggests — a support
 * account can read the record of students who approved it, and nothing else.
 */
export function RoleBadge({ role, className }: { role: string; className?: string }) {
  const isAdmin = role === "admin";
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[0.75rem] font-medium",
        isAdmin ? "bg-revise-soft text-revise-ink" : "bg-lesson-soft text-lesson-ink",
        className,
      )}
    >
      <ShieldCheck aria-hidden="true" className="size-3.5" />
      {isAdmin ? "Support account" : "Student"}
    </span>
  );
}

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
        aria-label={compact ? `Account: ${account.name}, ${account.role}` : undefined}
        className={cn(
          "flex items-center rounded-md text-left transition-colors",
          compact
            ? "size-9 shrink-0 justify-center hover:bg-surface-raised"
            : "w-full gap-2.5 px-2 py-2 hover:bg-sidebar-accent/60",
          className,
        )}
      >
        <span className="flex size-8 shrink-0 items-center justify-center rounded-full bg-brand-soft text-[11px] font-semibold text-brand-ink ring-1 ring-border-strong">
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

      <DropdownMenuContent align="end" side={compact ? "bottom" : "top"} className="w-64">
        <DropdownMenuLabel className="font-normal">
          <span className="block text-[0.95rem] font-medium text-ink">{account.name}</span>
          <span className="mt-0.5 block truncate text-[0.8rem] text-ink-muted">
            {account.email}
          </span>
          {/* The role decides whether "Students" exists at all, so it belongs
              here rather than only on a settings page you have to go looking
              for. */}
          <span className="mt-2.5 block">
            <RoleBadge role={account.role} />
          </span>
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
