import {
  CalendarDays,
  ClipboardList,
  FileText,
  HelpCircle,
  ListChecks,
  Settings,
  Sun,
  Users,
  type LucideIcon,
} from "lucide-react";

export type NavItem = {
  href: string;
  label: string;
  icon: LucideIcon;
  /** Shown in the mobile tab bar. Kept short so four items fit at 320px. */
  shortLabel?: string;
};

/**
 * What the student actually does. "Today" leads because the product's whole
 * promise is answering "what am I doing right now?".
 *
 * "Stuck on" is last and stays in the list rather than hiding under Settings:
 * a page you have to go looking for is a page nobody uses, and the whole value
 * of that list is that writing something down is easier than saying it.
 */
export const primaryNav: NavItem[] = [
  { href: "/dashboard", label: "Today", icon: Sun },
  { href: "/timetable", label: "Timetable", icon: CalendarDays, shortLabel: "Classes" },
  { href: "/homework", label: "Homework", icon: ClipboardList },
  { href: "/plan", label: "Home plan", icon: ListChecks, shortLabel: "Plan" },
  { href: "/help", label: "Stuck on", icon: HelpCircle, shortLabel: "Stuck" },
];

export const secondaryNav: NavItem[] = [
  { href: "/settings", label: "Settings", icon: Settings },
];

/**
 * Shown only to a support account. Kept out of `secondaryNav` so the nav a
 * student sees cannot accidentally include it — the page redirects anyway, and
 * RLS returns nothing regardless, but a link to a page you cannot use is a
 * bad experience rather than a security question.
 */
export const adminNav: NavItem[] = [
  { href: "/admin", label: "Students", icon: Users },
  { href: "/admin/reports", label: "Reports", icon: FileText },
];

/**
 * A support account's own Timetable, Homework and Home plan are empty by
 * definition — they are a parent, not a student, and those pages describe a
 * school day they do not have. Showing four links to nothing makes the app
 * look broken rather than focused.
 *
 * So the parent gets two destinations: Today, which is about the child, and
 * Students. Everything they can actually do lives in those.
 */
export function primaryNavFor(role: string | undefined): NavItem[] {
  if (role !== "admin") return primaryNav;
  return [
    { href: "/dashboard", label: "Today", icon: Sun },
    ...adminNav,
  ];
}

// There is no `secondaryNavFor`: Settings is the only secondary item and both
// roles get it. A parent's Students link is primary, not secondary.

/** `/timetable/upload` should still light up the "Timetable" tab. */
export function isNavItemActive(pathname: string, href: string): boolean {
  return pathname === href || pathname.startsWith(`${href}/`);
}

/**
 * Which single item is active, when more than one matches.
 *
 * `isNavItemActive` on its own is a prefix test, so `/admin/reports` matches
 * both `/admin` and `/admin/reports` and the sidebar lights up two rows at
 * once — which reads as a rendering fault rather than as navigation. The
 * longest matching href wins, because the more specific destination is the
 * one the reader is actually on.
 *
 * Callers pass every item they render, primary and secondary together: the
 * winner has to be chosen across the whole nav, not within each group.
 */
export function activeHrefFor(pathname: string, items: NavItem[]): string | null {
  let best: string | null = null;
  for (const item of items) {
    if (!isNavItemActive(pathname, item.href)) continue;
    if (best === null || item.href.length > best.length) best = item.href;
  }
  return best;
}
