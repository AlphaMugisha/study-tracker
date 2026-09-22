"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Plus } from "lucide-react";

import { AccountMenu, type AccountSummary } from "@/components/layout/account-menu";
import { Logo } from "@/components/layout/logo";
import { isNavItemActive, primaryNav, type NavItem } from "@/lib/nav";
import { cn } from "@/lib/utils";

function SidebarLink({ item, active }: { item: NavItem; active: boolean }) {
  const Icon = item.icon;

  return (
    <Link
      href={item.href}
      aria-current={active ? "page" : undefined}
      className={cn(
        "group relative flex items-center gap-3 rounded-md px-3 py-2 text-sm font-medium",
        "transition-colors duration-150",
        active
          ? "bg-sidebar-accent text-sidebar-accent-foreground"
          : "text-ink-muted hover:bg-sidebar-accent/60 hover:text-ink",
      )}
    >
      {/* A 2px rail rather than a filled pill: quieter, and it survives on a
          tinted sidebar where a fill would fight the background. */}
      <span
        aria-hidden="true"
        className={cn(
          "absolute left-0 h-4 w-0.5 rounded-r-full bg-sage transition-opacity duration-150",
          active ? "opacity-100" : "opacity-0",
        )}
      />
      <Icon
        aria-hidden="true"
        className={cn(
          "size-4 shrink-0 transition-colors duration-150",
          active ? "text-sage" : "text-ink-subtle group-hover:text-ink-muted",
        )}
      />
      {item.label}
    </Link>
  );
}

/** Desktop navigation. Hidden below `lg`, where the tab bar takes over. */
export function Sidebar({ account }: { account: AccountSummary }) {
  const pathname = usePathname();

  return (
    <aside className="sticky top-0 hidden h-dvh w-60 shrink-0 flex-col border-r border-sidebar-border bg-sidebar lg:flex">
      <div className="px-5 pb-4 pt-5">
        <Link href="/dashboard" className="rounded-md">
          <Logo />
        </Link>
      </div>

      {/* One primary action, always reachable. `?new=1` opens the homework
          dialog on arrival so this is a single click from anywhere. */}
      <div className="px-3 pb-4">
        <Link
          href="/homework?new=1"
          className={cn(
            "flex h-9 w-full items-center justify-center gap-1.5 rounded-md",
            "bg-primary text-[13px] font-medium text-primary-foreground",
            "transition-colors hover:bg-primary/90",
          )}
        >
          <Plus aria-hidden="true" className="size-4" />
          Add homework
        </Link>
      </div>

      <p className="px-3 pb-1.5 text-eyebrow uppercase text-ink-subtle">Your day</p>

      <nav aria-label="Main" className="flex flex-1 flex-col gap-0.5 px-3">
        {primaryNav.map((item) => (
          <SidebarLink
            key={item.href}
            item={item}
            active={isNavItemActive(pathname, item.href)}
          />
        ))}
      </nav>

      <div className="border-t border-sidebar-border p-3">
        <AccountMenu account={account} />
      </div>
    </aside>
  );
}
