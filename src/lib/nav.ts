import {
  CalendarDays,
  ClipboardList,
  ListChecks,
  Settings,
  Sun,
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
 * The four things the student actually does. "Today" leads because the
 * product's whole promise is answering "what am I doing right now?".
 */
export const primaryNav: NavItem[] = [
  { href: "/dashboard", label: "Today", icon: Sun },
  { href: "/timetable", label: "Timetable", icon: CalendarDays, shortLabel: "Classes" },
  { href: "/homework", label: "Homework", icon: ClipboardList },
  { href: "/plan", label: "Home plan", icon: ListChecks, shortLabel: "Plan" },
];

export const secondaryNav: NavItem[] = [
  { href: "/settings", label: "Settings", icon: Settings },
];

/** `/timetable/upload` should still light up the "Timetable" tab. */
export function isNavItemActive(pathname: string, href: string): boolean {
  return pathname === href || pathname.startsWith(`${href}/`);
}
