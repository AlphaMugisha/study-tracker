"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState } from "react";
import { Menu, Plus, X } from "lucide-react";

import { AccountMenu, type AccountSummary } from "@/components/layout/account-menu";
import { LogoMark } from "@/components/layout/logo";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog";
import { isNavItemActive, primaryNav, secondaryNav, type NavItem } from "@/lib/nav";
import { cn } from "@/lib/utils";

/**
 * The sidebar, as a drawer, for widths where the rail cannot fit.
 *
 * The persistent sidebar starts at `md` (768px). Below that it is replaced by
 * the bottom tab bar, which carries only the four primary destinations — so
 * Settings, the account menu and "Add homework" had no home on a narrow
 * window. Worse, "narrow" includes a perfectly ordinary desktop window once
 * the browser is zoomed in, which is how the sidebar kept appearing to vanish.
 *
 * This makes the full navigation reachable at every width. The trigger lives
 * in the top bar and is hidden from `md` up, where the real sidebar exists.
 */
export function NavDrawer({ account }: { account: AccountSummary }) {
  const pathname = usePathname();
  const [open, setOpen] = useState(false);

  // Every link closes the drawer on click rather than an effect watching the
  // pathname: setState inside useEffect is the cascading-render pattern this
  // codebase has been bitten by before, and the lint rule forbids it.
  const close = () => setOpen(false);

  return (
    <>
      <Button
        type="button"
        size="icon"
        variant="ghost"
        aria-label="Open navigation"
        onClick={() => setOpen(true)}
        className="md:hidden"
      >
        <Menu aria-hidden="true" />
      </Button>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent
          showCloseButton={false}
          // Anchored left and full height: a drawer, not a centred modal.
          className="top-0 left-0 h-dvh max-w-[19rem] translate-x-0 translate-y-0 gap-0 overflow-y-auto rounded-none border-r border-border bg-sidebar p-0 sm:max-w-[19rem]"
        >
          <DialogTitle className="sr-only">Navigation</DialogTitle>

          <div className="flex h-20 items-center justify-between px-5">
            <Link href="/dashboard" onClick={close} className="flex items-center gap-2.5">
              <LogoMark className="size-8" />
              <span className="text-[1.0625rem] font-semibold tracking-[-0.015em] text-ink">
                StudyFlow
              </span>
            </Link>
            <Button
              type="button"
              size="icon-sm"
              variant="ghost"
              aria-label="Close navigation"
              onClick={() => setOpen(false)}
            >
              <X aria-hidden="true" />
            </Button>
          </div>

          <div className="px-4 pb-5">
            <Link
              href="/homework?new=1"
              onClick={close}
              className="flex h-13 w-full items-center justify-center gap-2.5 rounded-xl bg-primary text-[0.95rem] font-medium text-primary-foreground shadow-[0_2px_10px_-2px_var(--brand-glow)] transition-colors duration-150 ease-out-flat hover:bg-brand-bright"
            >
              <Plus aria-hidden="true" className="size-5 shrink-0" />
              Add homework
            </Link>
          </div>

          <nav aria-label="All pages" className="flex flex-col gap-1.5 px-4">
            {primaryNav.map((item) => (
              <DrawerLink
                key={item.href}
                item={item}
                active={isNavItemActive(pathname, item.href)}
                onNavigate={close}
              />
            ))}

            <div className="my-4 h-px bg-sidebar-border" />

            {secondaryNav.map((item) => (
              <DrawerLink
                key={item.href}
                item={item}
                active={isNavItemActive(pathname, item.href)}
                onNavigate={close}
              />
            ))}
          </nav>

          <div className="mt-auto border-t border-sidebar-border p-3">
            <AccountMenu account={account} />
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}

function DrawerLink({
  item,
  active,
  onNavigate,
}: {
  item: NavItem;
  active: boolean;
  onNavigate: () => void;
}) {
  const Icon = item.icon;

  return (
    <Link
      href={item.href}
      onClick={onNavigate}
      aria-current={active ? "page" : undefined}
      className={cn(
        "flex h-12 items-center gap-3.5 rounded-xl px-4 text-[0.95rem] font-medium transition-colors duration-150 ease-out-flat",
        active
          ? "bg-sidebar-accent text-sidebar-accent-foreground"
          : "text-ink-muted hover:bg-surface-raised hover:text-ink",
      )}
    >
      <Icon
        aria-hidden="true"
        className={cn("size-[21px] shrink-0", active ? "text-brand-ink" : "text-ink-subtle")}
      />
      {item.label}
    </Link>
  );
}
