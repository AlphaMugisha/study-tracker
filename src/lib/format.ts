/**
 * Display formatting. Everything takes an explicit `now` so callers (and
 * tests) control the clock rather than reaching for Date.now() mid-render.
 */

const MS_PER_DAY = 86_400_000;

function startOfDay(d: Date): Date {
  const copy = new Date(d);
  copy.setHours(0, 0, 0, 0);
  return copy;
}

export function daysBetween(from: Date, to: Date): number {
  return Math.round((startOfDay(to).getTime() - startOfDay(from).getTime()) / MS_PER_DAY);
}

/** "Tuesday, 22 September" — the date line under the page title. */
export function formatFullDate(date: Date): string {
  return date.toLocaleDateString("en-GB", {
    weekday: "long",
    day: "numeric",
    month: "long",
  });
}

/**
 * "Today", "Tomorrow", "Friday", "22 Sept" — a due date the way a person
 * would say it, with the time appended when one is set.
 */
export function formatDueLabel(
  dueDate: string,
  dueTime: string | null,
  now = new Date(),
): string {
  const due = new Date(`${dueDate}T${dueTime ?? "23:59:59"}`);
  const days = daysBetween(now, due);
  const time = dueTime ? `, ${dueTime.slice(0, 5)}` : "";

  if (days === 0) return `Today${time}`;
  if (days === 1) return `Tomorrow${time}`;
  if (days === -1) return `Yesterday${time}`;
  if (days < -1) return `${Math.abs(days)} days ago`;
  if (days > 1 && days <= 6) {
    return `${due.toLocaleDateString("en-GB", { weekday: "long" })}${time}`;
  }
  return due.toLocaleDateString("en-GB", { day: "numeric", month: "short" });
}

/** "Overdue by 2 days" — only ever shown on something genuinely late. */
export function formatOverdueLabel(
  dueDate: string,
  dueTime: string | null,
  now = new Date(),
): string {
  const due = new Date(`${dueDate}T${dueTime ?? "23:59:59"}`);
  const days = daysBetween(now, due);
  if (days === 0) return "Overdue";
  return `Overdue by ${Math.abs(days)} day${Math.abs(days) === 1 ? "" : "s"}`;
}

/** Greeting keyed to the hour. Kept quiet — it is not the point of the page. */
export function greeting(now = new Date()): string {
  const h = now.getHours();
  if (h < 12) return "Good morning";
  if (h < 17) return "Good afternoon";
  return "Good evening";
}

/** "alpha mugisha" → "Alpha". Seeded names are not always capitalised. */
export function firstNameOf(fullName: string): string {
  const first = fullName.trim().split(/\s+/)[0] ?? "";
  return first ? first[0].toUpperCase() + first.slice(1) : "there";
}
