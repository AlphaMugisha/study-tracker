import { CalendarPlus } from "lucide-react";

import { activityStyle, ActivityChip } from "@/components/shared/badges";
import { EmptyState } from "@/components/ui/empty-state";
import { DAY_NAMES, DAY_SHORT, formatDuration, type ResolvedEntry } from "@/lib/timetable/types";
import { cn } from "@/lib/utils";

/**
 * A school schedule, not a calendar app: entries sit in a simple chronological
 * column with the time in a fixed gutter, because a school day is a list of
 * named slots rather than arbitrary blocks on a grid.
 */

export function DaySchedule({
  entries,
  emptyMessage = "Nothing timetabled for this day.",
}: {
  entries: ResolvedEntry[];
  emptyMessage?: string;
}) {
  if (entries.length === 0) {
    return (
      <EmptyState
        icon={CalendarPlus}
        headline="Nothing timetabled"
        body={emptyMessage}
      />
    );
  }

  return (
    <ol className="relative">
      {entries.map((entry, index) => {
        const style = activityStyle(entry.activityType);
        const isLesson = entry.activityType === "class";

        return (
          <li key={entry.id} className="flex gap-4">
            {/* time gutter */}
            <div className="w-14 shrink-0 pt-3 text-right sm:w-16">
              <span className="block text-[13px] font-medium text-ink" data-numeric>
                {entry.startLabel}
              </span>
              <span className="block text-[11px] text-ink-subtle" data-numeric>
                {entry.endLabel}
              </span>
            </div>

            {/* spine */}
            <div className="relative flex w-3 shrink-0 justify-center">
              <span
                aria-hidden="true"
                className={cn(
                  "absolute inset-y-0 w-px",
                  index === 0 && "top-4",
                  index === entries.length - 1 && "bottom-4",
                  "bg-border",
                )}
              />
              <span
                aria-hidden="true"
                className={cn(
                  "relative mt-4 size-2 rounded-full ring-4 ring-background",
                  style.rail,
                )}
              />
            </div>

            <div className="min-w-0 flex-1 py-1.5">
              <div
                className={cn(
                  "rounded-lg border px-4 py-3",
                  isLesson
                    ? "border-border bg-card shadow-card"
                    : "border-border/70 bg-surface-sunken/60",
                )}
              >
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <div className="min-w-0">
                    <p
                      className={cn(
                        "truncate font-medium",
                        isLesson ? "text-[15px] text-ink" : "text-sm text-ink-muted",
                      )}
                    >
                      {entry.label}
                    </p>
                    {entry.detail ? (
                      <p className="mt-0.5 truncate text-[13px] text-ink-subtle">
                        {entry.detail}
                      </p>
                    ) : null}
                  </div>
                  <div className="flex shrink-0 items-center gap-2">
                    <ActivityChip kind={entry.activityType} />
                    <span className="text-xs text-ink-subtle" data-numeric>
                      {formatDuration(entry.durationMinutes)}
                    </span>
                  </div>
                </div>
              </div>
            </div>
          </li>
        );
      })}
    </ol>
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
    <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-5">
      {days.map((day) => {
        const dayEntries = entries
          .filter((e) => e.dayOfWeek === day)
          .sort((a, b) => a.startMinutes - b.startMinutes);
        const isToday = day === today;

        return (
          <section
            key={day}
            className={cn(
              "rounded-lg border bg-card p-4",
              isToday ? "border-sage/40 shadow-card" : "border-border",
            )}
          >
            <div className="mb-3 flex items-baseline justify-between">
              <h3
                className={cn(
                  "text-sm font-semibold",
                  isToday ? "text-sage-strong" : "text-ink",
                )}
              >
                <span className="xl:hidden">{DAY_NAMES[day]}</span>
                <span className="hidden xl:inline">{DAY_SHORT[day]}</span>
              </h3>
              {isToday ? (
                <span className="text-[11px] font-medium text-sage-strong">Today</span>
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
                    <li
                      key={entry.id}
                      className={cn(
                        "flex items-start gap-2 rounded-md px-2 py-1.5",
                        isLesson ? "bg-card" : "bg-surface-sunken/70",
                      )}
                    >
                      <span
                        aria-hidden="true"
                        className={cn("mt-1.5 h-6 w-0.5 shrink-0 rounded-full", style.rail)}
                      />
                      <span className="min-w-0 flex-1">
                        <span
                          className={cn(
                            "block truncate text-[13px]",
                            isLesson ? "font-medium text-ink" : "text-ink-muted",
                          )}
                        >
                          {entry.label}
                        </span>
                        <span className="block text-[11px] text-ink-subtle" data-numeric>
                          {entry.startLabel}–{entry.endLabel}
                        </span>
                      </span>
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
