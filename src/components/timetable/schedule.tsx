import Link from "next/link";
import { CalendarPlus, Pencil } from "lucide-react";

import { activityStyle, ActivityChip } from "@/components/shared/badges";
import { ItemCard, ItemGrid, type ItemAccent } from "@/components/shared/item-card";
import { DeleteEntryButton } from "@/components/timetable/entry-actions";
import { TimetableEntryDialog } from "@/components/timetable/entry-dialog";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import type { Subject } from "@/types/database";
import { DAY_NAMES, DAY_SHORT, formatDuration, type ResolvedEntry } from "@/lib/timetable/types";
import { cn } from "@/lib/utils";

/**
 * A school schedule, not a calendar app: entries sit in a simple chronological
 * column with the time in a fixed gutter, because a school day is a list of
 * named slots rather than arbitrary blocks on a grid.
 */

const ACCENT: Record<string, ItemAccent> = {
  class: "lesson",
  break: "pause",
  free: "pause",
  study: "revise",
  other: "brand",
};

export function DaySchedule({
  entries,
  subjects = [],
  editable = false,
  emptyMessage = "Nothing timetabled for this day.",
}: {
  entries: ResolvedEntry[];
  subjects?: Subject[];
  /** Shows the edit and remove controls on each slot. */
  editable?: boolean;
  emptyMessage?: string;
}) {
  if (entries.length === 0) {
    return <EmptyState icon={CalendarPlus} headline="Nothing timetabled" body={emptyMessage} />;
  }

  return (
    <ItemGrid>
      {entries.map((entry, i) => {
        const isLesson = entry.activityType === "class";

        return (
          <ItemCard
            key={entry.id}
            index={i}
            muted={!isLesson}
            accent={ACCENT[entry.activityType] ?? "none"}
            href={
              !editable && entry.subjectId ? `/homework?subject=${entry.subjectId}` : null
            }
            lead={`${entry.startLabel} – ${entry.endLabel}`}
            trailing={
              <span className="flex items-center gap-2">
                <ActivityChip kind={entry.activityType} />
                <span className="text-[0.85rem] text-ink-subtle" data-numeric>
                  {formatDuration(entry.durationMinutes)}
                </span>
              </span>
            }
            title={entry.label}
            meta={entry.detail ? <span>{entry.detail}</span> : null}
            footer={
              editable ? (
                <>
                  <TimetableEntryDialog
                    subjects={subjects}
                    entry={entry}
                    trigger={
                      // Visible text plus an accessible name: "Edit" alone is
                      // ambiguous when a dozen cards each have one.
                      <Button
                        type="button"
                        size="sm"
                        variant="ghost"
                        aria-label={`Edit ${entry.label}`}
                      >
                        <Pencil aria-hidden="true" />
                        Edit
                      </Button>
                    }
                  />
                  <DeleteEntryButton id={entry.id} label={entry.label} />
                  {entry.subjectId ? (
                    <Button asChild size="sm" variant="ghost" className="ml-auto">
                      <Link href={`/homework?subject=${entry.subjectId}`}>Homework</Link>
                    </Button>
                  ) : null}
                </>
              ) : null
            }
          />
        );
      })}
    </ItemGrid>
  );
}

/**
 * Monday–Friday side by side on desktop, stacked on mobile. Deliberately not
 * time-proportional: a proportional grid buys prettiness and costs legibility
 * at the widths a student actually uses.
 */
export function WeekGrid({
  entries,
  today,
}: {
  entries: ResolvedEntry[];
  today: number;
}) {
  const days = [1, 2, 3, 4, 5];

  return (
    <div className="grid gap-4 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-5">
      {days.map((day) => {
        const dayEntries = entries
          .filter((e) => e.dayOfWeek === day)
          .sort((a, b) => a.startMinutes - b.startMinutes);
        const isToday = day === today;

        return (
          <section
            key={day}
            className={cn(
              "rounded-xl border bg-card p-4",
              isToday ? "border-brand/50" : "border-border",
            )}
          >
            <div className="mb-3 flex items-baseline justify-between">
              <h3
                className={cn(
                  "text-sm font-semibold",
                  isToday ? "text-brand-ink" : "text-ink",
                )}
              >
                <span className="lg:hidden">{DAY_NAMES[day]}</span>
                <span className="hidden lg:inline">{DAY_SHORT[day]}</span>
              </h3>
              {isToday ? (
                <span className="text-eyebrow uppercase text-brand-ink">Today</span>
              ) : null}
            </div>

            {dayEntries.length === 0 ? (
              <p className="py-4 text-xs text-ink-subtle">Nothing timetabled.</p>
            ) : (
              <ul className="space-y-1">
                {dayEntries.map((entry) => {
                  const style = activityStyle(entry.activityType);
                  const isLesson = entry.activityType === "class";

                  return (
                    <li key={entry.id}>
                      <EntryShell
                        href={
                          entry.subjectId ? `/homework?subject=${entry.subjectId}` : null
                        }
                        className={cn(
                          "flex items-start gap-2 rounded-lg px-2 py-2 transition-colors duration-150 ease-out-flat",
                          isLesson ? "bg-card" : "bg-surface-sunken",
                          entry.subjectId && "group/entry hover:bg-surface-raised",
                        )}
                      >
                      <span
                        aria-hidden="true"
                        className={cn("mt-1.5 h-6 w-0.5 shrink-0 rounded-full", style.rail)}
                      />
                      <span className="min-w-0 flex-1">
                        <span
                          className={cn(
                            "block truncate text-[0.9rem] transition-colors duration-150 ease-out-flat",
                            isLesson ? "font-medium text-ink" : "text-ink-muted",
                            entry.subjectId && "group-hover/entry:text-brand-ink",
                          )}
                        >
                          {entry.label}
                        </span>
                        <span className="block text-[11px] text-ink-subtle" data-numeric>
                          {entry.startLabel}–{entry.endLabel}
                        </span>
                      </span>
                      </EntryShell>
                    </li>
                  );
                })}
              </ul>
            )}
          </section>
        );
      })}
    </div>
  );
}

/**
 * A timetable entry, as a link when it has a subject to open and a plain block
 * when it does not. Separate branches rather than a polymorphic component,
 * whose props cannot be typed as a union of Link's and div's without a cast.
 */
function EntryShell({
  href,
  className,
  children,
}: {
  href: string | null;
  className?: string;
  children: React.ReactNode;
}) {
  if (!href) return <div className={className}>{children}</div>;
  return (
    <Link href={href} className={className}>
      {children}
    </Link>
  );
}
