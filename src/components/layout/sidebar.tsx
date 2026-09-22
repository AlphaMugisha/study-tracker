"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState } from "react";
import { PanelLeft, Plus } from "lucide-react";

import { LogoMark } from "@/components/layout/logo";
import { isNavItemActive, primaryNav, secondaryNav, type NavItem } from "@/lib/nav";
import { cn } from "@/lib/utils";

/**
 * The sidebar has two axes, which is why the classes look busy:
 *
 *   viewport  — below md there is no sidebar at all (the bottom tab bar takes
 *               over); from md up it is a full 240px panel with labels.
 *   collapsed — the student's own choice, a 60px icon rail, honoured from md.
 *
 * `collapsed` is persisted in a cookie rather than localStorage so the server
 * renders the correct width on first paint; reading it on the client would
 * flash the wrong layout on every navigation.
 */
export function Sidebar({ defaultCollapsed }: { defaultCollapsed: boolean }) {
  const pathname = usePathname();
  const [collapsed, setCollapsed] = useState(defaultCollapsed);

  const toggle = () => {
    const next = !collapsed;
    setCollapsed(next);
    document.cookie = `sf-sidebar=${next ? "collapsed" : "expanded"}; path=/; max-age=31536000; samesite=lax`;
  };

  /** Applied to anything that should only appear in the full panel. */
  const wideOnly = collapsed ? "hidden" : "hidden md:block";

  return (
    <aside
      className={cn(
        "sticky top-0 hidden h-dvh shrink-0 flex-col border-r border-border bg-sidebar md:flex",
        "transition-[width] duration-200 ease-out",
        collapsed ? "w-[60px]" : "w-[60px] md:w-[240px]",
      )}
    >
      {/* brand + collapse */}
      <div
        className={cn(
          "flex h-14 items-center justify-center px-2",
          !collapsed && "md:justify-between md:px-4",
        )}
      >
        <Link
          href="/dashboard"
          className="flex items-center gap-2.5 rounded-md"
          aria-label="StudyFlow home"
        >
          <LogoMark className="size-7" />
          <span
            className={cn(
              "text-[15px] font-semibold tracking-[-0.01em] text-ink",
              wideOnly,
            )}
          >
            StudyFlow
          </span>
        </Link>
        <button
          type="button"
          onClick={toggle}
          aria-label="Collapse sidebar"
          className={cn(
            "rounded-md p-1.5 text-ink-subtle transition-colors hover:bg-surface-raised hover:text-ink",
            wideOnly,
          )}
        >
          <PanelLeft aria-hidden="true" className="size-4" />
        </button>
      </div>

      {/* primary action */}
      <div className={cn("px-2 pb-3", !collapsed && "md:px-3")}>
        <Link
          href="/homework?new=1"
          title="Add homework"
          className={cn(
            "flex size-11 items-center justify-center gap-2 rounded-lg bg-primary font-medium text-primary-foreground",
            "transition-colors hover:bg-indigo-bright",
            !collapsed && "md:h-11 md:w-full md:text-[13px]",
          )}
        >
          <Plus aria-hidden="true" className="size-4 shrink-0" />
          <span className={wideOnly}>Add homework</span>
          <span className={cn("sr-only", !collapsed && "md:hidden")}>Add homework</span>
        </Link>
      </div>

      <nav
        aria-label="Main"
        className={cn("flex flex-1 flex-col gap-0.5 px-2", !collapsed && "md:px-3")}
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

      {/* The account menu lives in the top bar; this foot is just the toggle,
          and only while the rail is narrow -- expanded, it sits by the brand. */}
      <div
        className={cn(
          "border-t border-sidebar-border p-1.5",
          !collapsed && "md:hidden",
        )}
      >
        <button
          type="button"
          onClick={toggle}
          aria-label={collapsed ? "Expand sidebar" : "Collapse sidebar"}
          className="flex w-full items-center justify-center rounded-md p-2 text-ink-subtle transition-colors hover:bg-surface-raised hover:text-ink"
        >
          <PanelLeft
            aria-hidden="true"
            className={cn("size-4", collapsed && "rotate-180")}
          />
        </button>
      </div>
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
      title={item.label}
      aria-current={active ? "page" : undefined}
      className={cn(
        "group flex h-10 w-10 items-center justify-center rounded-lg text-[13px] font-medium transition-colors duration-150",
        !collapsed && "md:w-full md:justify-start md:gap-3 md:px-3",
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
      <span className={collapsed ? "sr-only" : "sr-only md:not-sr-only"}>
        {item.label}
      </span>
    </Link>
  );
}
