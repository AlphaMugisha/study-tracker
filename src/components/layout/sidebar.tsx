"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState } from "react";
import { PanelLeft, Plus } from "lucide-react";

import { LogoMark } from "@/components/layout/logo";
import { isNavItemActive, primaryNav, secondaryNav, type NavItem } from "@/lib/nav";
import { cn } from "@/lib/utils";

/**
 * Collapsible sidebar: a 60px icon rail or a 236px panel.
 *
 * The collapsed state is persisted in a cookie rather than localStorage so the
 * server renders the correct width on the first paint — reading it on the
 * client would flash the wrong layout on every navigation.
 */
export function Sidebar({ defaultCollapsed }: { defaultCollapsed: boolean }) {
  const pathname = usePathname();
  const [collapsed, setCollapsed] = useState(defaultCollapsed);

  const toggle = () => {
    const next = !collapsed;
    setCollapsed(next);
    document.cookie = `sf-sidebar=${next ? "collapsed" : "expanded"}; path=/; max-age=31536000; samesite=lax`;
  };

  return (
    <aside
      className={cn(
        "sticky top-0 hidden h-dvh shrink-0 flex-col border-r border-sidebar-border bg-sidebar lg:flex",
        "transition-[width] duration-200 ease-out",
        collapsed ? "w-[60px]" : "w-[236px]",
      )}
    >
      {/* brand + collapse */}
      <div
        className={cn(
          "flex h-14 items-center",
          collapsed ? "justify-center px-2" : "justify-between px-4",
        )}
      >
        <Link
          href="/dashboard"
          className="flex items-center gap-2.5 rounded-md"
          aria-label="StudyFlow home"
        >
          <LogoMark className="size-7" />
          {!collapsed ? (
            <span className="text-[15px] font-semibold tracking-[-0.01em] text-ink">
              StudyFlow
            </span>
          ) : null}
        </Link>
        {!collapsed ? (
          <button
            type="button"
            onClick={toggle}
            aria-label="Collapse sidebar"
            className="rounded-md p-1.5 text-ink-subtle transition-colors hover:bg-surface-raised hover:text-ink"
          >
            <PanelLeft aria-hidden="true" className="size-4" />
          </button>
        ) : null}
      </div>

      {/* primary action */}
      <div className={cn("pb-3", collapsed ? "px-2" : "px-3")}>
        <Link
          href="/homework?new=1"
          title="Add homework"
          className={cn(
            "flex items-center justify-center gap-2 rounded-lg bg-primary font-medium text-primary-foreground",
            "transition-colors hover:bg-indigo-bright",
            collapsed ? "size-11" : "h-11 w-full text-[13px]",
          )}
        >
          <Plus aria-hidden="true" className="size-4 shrink-0" />
          {!collapsed ? "Add homework" : <span className="sr-only">Add homework</span>}
        </Link>
      </div>

      <nav
        aria-label="Main"
        className={cn("flex flex-1 flex-col gap-0.5", collapsed ? "px-2" : "px-3")}
      >
        {primaryNav.map((item) => (
          <SidebarLink
            key={item.href}
            item={item}
            active={isNavItemActive(pathname, item.href)}
            collapsed={collapsed}
          />
        ))}

        <div className="my-2 h-px bg-sidebar-border" />

        {secondaryNav.map((item) => (
          <SidebarLink
            key={item.href}
            item={item}
            active={isNavItemActive(pathname, item.href)}
            collapsed={collapsed}
          />
        ))}
      </nav>

      {/* The account menu lives in the top bar; this foot is just the toggle. */}
      {collapsed ? (
        <div className="border-t border-sidebar-border p-1.5">
          <button
            type="button"
            onClick={toggle}
            aria-label="Expand sidebar"
            className="flex w-full items-center justify-center rounded-md p-2 text-ink-subtle transition-colors hover:bg-surface-raised hover:text-ink"
          >
            <PanelLeft aria-hidden="true" className="size-4 rotate-180" />
          </button>
        </div>
      ) : null}
    </aside>
  );
}

function SidebarLink({
  item,
  active,
  collapsed,
}: {
  item: NavItem;
  active: boolean;
  collapsed: boolean;
}) {
  const Icon = item.icon;

  return (
    <Link
      href={item.href}
      title={collapsed ? item.label : undefined}
      aria-current={active ? "page" : undefined}
      className={cn(
        "group flex items-center rounded-lg text-[13px] font-medium transition-colors duration-150",
        collapsed ? "h-10 w-10 justify-center" : "h-10 gap-3 px-3",
        active
          ? "bg-sidebar-accent text-sidebar-accent-foreground"
          : "text-ink-muted hover:bg-surface-raised hover:text-ink",
      )}
    >
      <Icon
        aria-hidden="true"
        className={cn(
          "size-[18px] shrink-0 transition-colors duration-150",
          active ? "text-indigo-ink" : "text-ink-subtle group-hover:text-ink-muted",
        )}
      />
      {!collapsed ? item.label : <span className="sr-only">{item.label}</span>}
    </Link>
  );
}
