"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

import { adminNav, isNavItemActive, primaryNav } from "@/lib/nav";
import { cn } from "@/lib/utils";

/**
 * Thumb-reachable tab bar, below sm only -- from sm up the icon rail takes
 * over. Settings lives in the top bar and the drawer.
 */
export function MobileNav({ role }: { role: string }) {
  const pathname = usePathname();
  // A support account gets Students here too. Five tabs at 320px is 64px
  // each — still above the 44px touch minimum, and far better than the one
  // page they need being reachable only from a drawer.
  const items = role === "admin" ? [...primaryNav, ...adminNav] : primaryNav;

  return (
    <nav
      aria-label="Main"
      className="fixed inset-x-0 bottom-0 z-40 border-t border-border bg-sidebar/95 backdrop-blur-sm sm:hidden"
      style={{ paddingBottom: "env(safe-area-inset-bottom)" }}
    >
      <ul className="mx-auto flex max-w-lg items-stretch">
        {items.map((item) => {
          const active = isNavItemActive(pathname, item.href);
          const Icon = item.icon;

          return (
            <li key={item.href} className="flex-1">
              <Link
                href={item.href}
                aria-current={active ? "page" : undefined}
                className={cn(
                  "flex min-h-14 flex-col items-center justify-center gap-1 px-1 py-2",
                  "text-[11px] font-medium transition-colors duration-150",
                  active ? "text-brand-ink" : "text-ink-subtle",
                )}
              >
                <Icon aria-hidden="true" className="size-5" />
                <span className="leading-none">{item.shortLabel ?? item.label}</span>
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
