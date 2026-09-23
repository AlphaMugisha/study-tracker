"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState } from "react";
import { PanelLeft, Plus } from "lucide-react";

import { LogoMark } from "@/components/layout/logo";
import { isNavItemActive, primaryNav, secondaryNavFor, type NavItem } from "@/lib/nav";
import { cn } from "@/lib/utils";

/**
 * The sidebar has two axes, which is why the classes look busy:
 *
 *   viewport  — the sidebar is ALWAYS rendered. It is a 72px icon rail at any
 *               width, widening to a 264px panel with labels from md.
 *
 *               It used to disappear below a breakpoint, handing over to a
 *               bottom tab bar. That was defensible and it was also wrong in
 *               practice: it vanished whenever a window was narrow or the
 *               browser was zoomed, it took the support account's only route
 *               to its own page with it, and it produced six separate reports
 *               of "the sidebar is gone" for six different reasons. A 72px
 *               rail costs 72px. Losing navigation costs more.
 *
 *   collapsed — the student's own choice, honoured from md up.
 *
 * `collapsed` is persisted in a cookie rather than localStorage so the server
 * renders the correct width on first paint; reading it on the client would
 * flash the wrong layout on every navigation.
 */
export function Sidebar({
  defaultCollapsed,
  role,
}: {
  defaultCollapsed: boolean;
  /** A support account also gets "Students". Resolved here rather than passed
   *  in, because NavItem carries an icon component and functions cannot cross
   *  the server/client props boundary. */
  role: string;
}) {
  const secondaryItems = secondaryNavFor(role);
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
        "sticky top-0 flex h-dvh shrink-0 flex-col border-r border-border bg-sidebar",
        "transition-[width] duration-200 ease-out",
        collapsed ? "w-[72px]" : "w-[72px] md:w-[264px]",
      )}
    >
      {/* brand + collapse */}
      <div
        className={cn(
          "flex h-20 items-center justify-center px-3",
          !collapsed && "md:justify-between md:px-5",
        )}
      >
        <Link
          href="/dashboard"
          className="flex items-center gap-2.5 rounded-md"
          aria-label="StudyFlow home"
        >
          <LogoMark className="size-8" />
          <span
            className={cn(
              "text-[1.0625rem] font-semibold tracking-[-0.015em] text-ink",
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
      <div className={cn("px-3 pb-5", !collapsed && "md:px-4")}>
        <Link
          href="/homework?new=1"
          title="Add homework"
          className={cn(
            "flex size-12 items-center justify-center gap-2.5 rounded-xl bg-primary font-medium text-primary-foreground shadow-[0_2px_10px_-2px_var(--brand-glow)]",
            "transition-all duration-200 ease-out-flat hover:-translate-y-0.5 hover:bg-brand-bright hover:shadow-[0_12px_28px_-6px_var(--brand-glow)]",
            !collapsed && "md:h-13 md:w-full md:text-[0.95rem]",
          )}
        >
          <Plus aria-hidden="true" className="size-5 shrink-0" />
          <span className={wideOnly}>Add homework</span>
          <span className={cn("sr-only", !collapsed && "md:hidden")}>Add homework</span>
        </Link>
      </div>

      <nav
        aria-label="Main"
        className={cn("flex flex-1 flex-col gap-1.5 px-3", !collapsed && "md:px-4")}
      >
        {primaryNav.map((item) => (
          <SidebarLink
            key={item.href}
            item={item}
            active={isNavItemActive(pathname, item.href)}
            collapsed={collapsed}
          />
        ))}

        <div className="my-4 h-px bg-sidebar-border" />

        {secondaryItems.map((item) => (
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
        "group flex h-12 w-12 items-center justify-center rounded-xl text-[0.95rem] font-medium transition-colors duration-150 ease-out-flat",
        !collapsed && "md:w-full md:justify-start md:gap-3 md:px-3",
        active
          ? "bg-sidebar-accent text-sidebar-accent-foreground"
          : "text-ink-muted hover:bg-surface-raised hover:text-ink",
      )}
    >
      <Icon
        aria-hidden="true"
        className={cn(
          "size-[21px] shrink-0 transition-colors duration-150",
          active ? "text-brand-ink" : "text-ink-subtle group-hover:text-ink-muted",
        )}
      />
      <span className={collapsed ? "sr-only" : "sr-only md:not-sr-only"}>
        {item.label}
      </span>
    </Link>
  );
}
