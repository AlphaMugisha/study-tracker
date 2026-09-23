"use client";

import Link from "next/link";
import { ChevronsUpDown, LogOut, Settings, ShieldCheck, Users } from "lucide-react";

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

/**
 * `variant` decides how much the trigger says on its own:
 *
 *   full    avatar, name, role, chevron — for the drawer, which has the width
 *   header  avatar plus name and role, collapsing to the avatar when the bar
 *           runs out of room. A bare initials circle tells you nothing about
 *           WHOSE account you are looking at without clicking it, which is
 *           the wrong default for the one control that answers that.
 *   compact avatar only
 */
export function AccountMenu({
  account,
  className,
  compact = false,
  variant = compact ? "compact" : "full",
}: {
  account: AccountSummary;
  className?: string;
  /** @deprecated use `variant` */
  compact?: boolean;
  variant?: "full" | "header" | "compact";
}) {
  const isAdmin = account.role === "admin";

  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        aria-label={`Account: ${account.name}, ${isAdmin ? "support account" : "student"}`}
        className={cn(
          "flex items-center rounded-xl text-left transition-colors duration-150 ease-out-flat",
          variant === "compact" && "size-10 shrink-0 justify-center hover:bg-surface-raised",
          variant === "header" &&
            "h-11 shrink-0 gap-2.5 rounded-full border border-border bg-surface-sunken pr-2 pl-1.5 hover:border-border-strong hover:bg-surface-raised",
          variant === "full" && "w-full gap-2.5 px-2 py-2 hover:bg-sidebar-accent/60",
          className,
        )}
      >
        <span
          className={cn(
            "flex size-8 shrink-0 items-center justify-center rounded-full text-[11px] font-semibold ring-1 ring-border-strong",
            isAdmin ? "bg-revise-soft text-revise-ink" : "bg-brand-soft text-brand-ink",
          )}
        >
          {initials(account.name)}
        </span>

        {variant === "header" ? (
          <>
            {/* Below lg the bar is tight, so this falls back to the avatar. */}
            <span className="hidden min-w-0 lg:block">
              <span className="block max-w-[11rem] truncate text-[0.9rem] font-medium leading-tight text-ink">
                {account.name}
              </span>
              <span
                className={cn(
                  "block text-[0.75rem] leading-tight",
                  isAdmin ? "text-revise-ink" : "text-ink-subtle",
                )}
              >
                {isAdmin ? "Support account" : "Student"}
              </span>
            </span>
            <ChevronsUpDown
              aria-hidden="true"
              className="hidden size-3.5 shrink-0 text-ink-subtle lg:block"
            />
          </>
        ) : null}
        {variant === "full" ? (
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

      <DropdownMenuContent
        align="end"
        side={variant === "full" ? "top" : "bottom"}
        className="w-72"
      >
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
        {isAdmin ? (
          <DropdownMenuItem asChild>
            <Link href="/admin">
              <Users aria-hidden="true" />
              Students
            </Link>
          </DropdownMenuItem>
        ) : null}
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
