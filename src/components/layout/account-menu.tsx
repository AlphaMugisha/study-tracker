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

export function AccountMenu({
  account,
  className,
}: {
  account: AccountSummary;
  className?: string;
}) {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        className={cn(
          "flex w-full items-center gap-2.5 rounded-md px-2 py-2 text-left",
          "transition-colors hover:bg-sidebar-accent/60",
          className,
        )}
      >
        <span className="flex size-8 shrink-0 items-center justify-center rounded-md bg-sage-soft text-[11px] font-semibold text-sage-strong">
          {initials(account.name)}
        </span>
        <span className="min-w-0 flex-1">
          <span className="block truncate text-[13px] font-medium text-ink">
            {account.name}
          </span>
          <span className="block truncate text-[11px] capitalize text-ink-subtle">
            {account.role}
          </span>
        </span>
        <ChevronsUpDown aria-hidden="true" className="size-3.5 shrink-0 text-ink-subtle" />
      </DropdownMenuTrigger>

      <DropdownMenuContent align="end" side="top" className="w-56">
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
