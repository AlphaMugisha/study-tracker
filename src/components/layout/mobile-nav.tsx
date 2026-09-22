"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

import { isNavItemActive, primaryNav } from "@/lib/nav";
import { cn } from "@/lib/utils";

/**
 * Thumb-reachable tab bar, below md only -- from md up the icon rail takes
 * over. Four items only: a fifth makes each target narrower than the 44px
 * minimum at 320px wide. Settings lives in the top bar.
 */
export function MobileNav() {
  const pathname = usePathname();

  return (
    <nav
      aria-label="Main"
      className="fixed inset-x-0 bottom-0 z-40 border-t border-border bg-sidebar/95 backdrop-blur-sm md:hidden"
      style={{ paddingBottom: "env(safe-area-inset-bottom)" }}
    >
      <ul className="mx-auto flex max-w-lg items-stretch">
        {primaryNav.map((item) => {
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
                  active ? "text-indigo-ink" : "text-ink-subtle",
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
