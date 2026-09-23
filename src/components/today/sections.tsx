import Link from "next/link";
import { ArrowRight, ArrowUpRight, NotebookPen } from "lucide-react";

import { ProgressRing } from "@/components/shared/progress-ring";
import {
  ActivityChip,
  OverdueBadge,
  PriorityBadge,
  SubjectDot,
  activityStyle,
} from "@/components/shared/badges";
import { PlanBlockCard } from "@/components/plan/plan-block-card";
import { Surface } from "@/components/shared/surface";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import type { AssignmentView } from "@/lib/data/tasks";
import { formatDueLabel, formatOverdueLabel } from "@/lib/format";
import type { EveningPlan } from "@/lib/planner/build-plan";
import { formatDuration, type ResolvedEntry } from "@/lib/timetable/types";
import { cn } from "@/lib/utils";

/**
 * A titled card. The title is card-level now -- the section heading above it
 * is the page's, so this one names the card rather than repeating the section.
 */
function Panel({
  title,
  count,
  action,
  children,
  className,
  size,
  float,
}: {
  title?: string;
  count?: number;
  action?: React.ReactNode;
  children: React.ReactNode;
  className?: string;
  size?: "auto" | "md" | "lg" | "xl";
  float?: "a" | "b" | "c";
}) {
  return (
    <Surface
      interactive
      lift={!float}
      float={float}
      size={size}
      className={cn("flex h-full flex-col", className)}
    >
      {title || action ? (
        <div className="mb-6 flex items-center justify-between gap-4">
          <div className="flex items-baseline gap-3">
            {title ? <h3 className="text-section text-ink">{title}</h3> : null}
            {typeof count === "number" ? (
              <span className="text-[0.95rem] font-medium text-ink-subtle" data-numeric>
                {count}
              </span>
            ) : null}
          </div>
          {action}
        </div>
      ) : null}
      {children}
    </Surface>
  );
}

// --- Up next ----------------------------------------------------------------

export function UpNextCard({ next }: { next: ResolvedEntry | null }) {
  return (
    <Panel
      title="Up next"
      size="md"
      float="b"
      action={
        <Button asChild variant="ghost" size="sm">
          <Link href="/timetable">
            Timetable <ArrowRight aria-hidden="true" />
          </Link>
        </Button>
      }
    >
      {next ? (
        <div className="flex flex-1 flex-col justify-center py-2">
          <p className="text-[1.9rem] font-semibold leading-[1.1] tracking-[-0.025em] text-balance text-ink">
            {next.label}
          </p>
          <p className="mt-3 text-body-lg text-ink-muted" data-numeric>
            {next.startLabel} — {next.endLabel}
          </p>
          <div className="mt-6 flex flex-wrap items-center gap-3">
            <ActivityChip kind={next.activityType} />
            {next.room ? (
              <span className="text-[0.95rem] text-ink-subtle">{next.room}</span>
            ) : null}
          </div>
        </div>
      ) : (
        <p className="flex flex-1 items-center text-body text-ink-muted">
          Nothing else is timetabled today.
        </p>
      )}
    </Panel>
  );
}

// --- When you get home ------------------------------------------------------

export function HomePlanPreview({ plan }: { plan: EveningPlan }) {
  const work = plan.blocks.filter((b) => b.kind !== "break");

  return (
    <Panel
      size="md"
      count={work.length}
      action={
        <Button asChild variant="ghost" size="sm">
          <Link href="/plan">
            Open plan <ArrowRight aria-hidden="true" />
          </Link>
        </Button>
      }
    >
      {work.length === 0 ? (
        <p className="flex flex-1 items-center text-body text-ink-muted">
          Nothing outstanding. Your evening is your own.
        </p>
      ) : (
        <>
          {/*
            A container query, not a viewport one. This card lives in a grid
            column whose width depends on the breakpoint AND on the sidebar,
            so it is anywhere from ~400px to ~600px wide. `md:` would tell us
            about the window, which is not the space these cards have to fit
            into. `@container` asks the card itself.
          */}
          <div className="@container">
            <ol className="grid grid-cols-1 gap-3 @md:grid-cols-2 @3xl:grid-cols-3">
              {plan.blocks.map((block, i) => (
                <PlanBlockCard key={block.id} block={block} index={i} />
              ))}
            </ol>
          </div>

          <p className="mt-6 border-t border-border pt-5 text-[0.9rem] text-ink-subtle">
            <span data-numeric>{plan.startsAt}</span> to{" "}
            <span data-numeric>{plan.endsBy}</span>
            {plan.deferred.length > 0 ? (
              <>
                {" · "}
                <span className="font-medium text-pause-ink">
                  {plan.deferred.length} will not fit
                </span>
              </>
            ) : null}
          </p>
        </>
      )}
    </Panel>
  );
}

// --- Due soon ---------------------------------------------------------------

export function DueSoonList({ assignments }: { assignments: AssignmentView[] }) {
  return (
    <Panel
      title="Due soon"
      count={assignments.length}
      size="md"
      action={
        <Button asChild variant="ghost" size="sm">
          <Link href="/homework">
            All homework <ArrowRight aria-hidden="true" />
          </Link>
        </Button>
      }
    >
      {assignments.length === 0 ? (
        <EmptyState
          icon={NotebookPen}
          headline="You're all caught up."
          body="Nothing due in the next few days."
          className="border-0 bg-transparent py-6"
        />
      ) : (
        <ul className="divide-y divide-border">
          {assignments.map((a) => (
            <li key={a.id} className="group/row">
              <Link
                href={`/homework#${a.id}`}
                className="-mx-4 flex items-start gap-4 rounded-lg px-4 py-5 transition-colors duration-150 ease-out-flat hover:bg-surface-raised"
              >
                <SubjectDot colorToken={a.subject?.color_token ?? null} className="mt-2 size-2.5" />
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-body font-medium text-ink transition-colors duration-150 ease-out-flat group-hover/row:text-brand-ink">
                    {a.title}
                  </span>
                  <span className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-[0.9rem] text-ink-subtle">
                    {a.subject ? <span>{a.subject.name}</span> : null}
                    <span aria-hidden="true">·</span>
                    <span className={a.overdue ? "font-medium text-danger" : undefined}>
                      {a.overdue
                        ? formatOverdueLabel(a.due_date, a.due_time)
                        : formatDueLabel(a.due_date, a.due_time)}
                    </span>
                    <span aria-hidden="true">·</span>
                    <span>{formatDuration(a.estimated_minutes)}</span>
                  </span>
                </span>
                <span className="shrink-0">
                  {a.overdue ? (
                    <OverdueBadge>Overdue</OverdueBadge>
                  ) : (
                    <PriorityBadge priority={a.priority} />
                  )}
                </span>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </Panel>
  );
}

// --- Rest of today ----------------------------------------------------------

/**
 * Everything still to come on the timetable today. "Up next" answers the very
 * next thing; this answers "and then what?", which is the question that made
 * the right-hand rail feel half-empty without it.
 */
export function RestOfDay({ entries }: { entries: ResolvedEntry[] }) {
  return (
    <Panel
      title="Rest of today"
      count={entries.length}
      size="md"
      float="c"
      action={
        <Button asChild variant="ghost" size="sm">
          <Link href="/timetable">
            Timetable <ArrowRight aria-hidden="true" />
          </Link>
        </Button>
      }
    >
      {entries.length === 0 ? (
        <p className="flex flex-1 items-center text-body text-ink-muted">
          Nothing else timetabled. The rest of the day is yours.
        </p>
      ) : (
        <ol className="-my-1 divide-y divide-border">
          {entries.map((entry) => {
            const style = activityStyle(entry.activityType);
            const isLesson = entry.activityType === "class";

            return (
              <li key={entry.id} className="flex items-baseline gap-4 py-4">
                <span
                  className="w-14 shrink-0 text-[0.95rem] font-medium text-ink-muted"
                  data-numeric
                >
                  {entry.startLabel}
                </span>
                <span
                  aria-hidden="true"
                  className={cn("size-2 shrink-0 rounded-full", style.rail)}
                />
                <span className="min-w-0 flex-1">
                  <span
                    className={cn(
                      "block truncate text-body",
                      isLesson ? "font-medium text-ink" : "text-ink-muted",
                    )}
                  >
                    {entry.label}
                  </span>
                  {entry.room ? (
                    <span className="block truncate text-[0.9rem] text-ink-subtle">
                      {entry.room}
                    </span>
                  ) : null}
                </span>
                <span className="shrink-0 text-[0.9rem] text-ink-subtle" data-numeric>
                  {formatDuration(entry.durationMinutes)}
                </span>
              </li>
            );
          })}
        </ol>
      )}
    </Panel>
  );
}

// --- Day stats --------------------------------------------------------------

type StatTone = "brand" | "lesson" | "revise" | "pause" | "danger" | "default";
type Stat = { label: string; value: string; tone?: StatTone; href: string };

/** Each statistic carries its own colour, so the row reads as three facts
 *  rather than one block of text. */
const STAT_TONE: Record<StatTone, string> = {
  brand: "text-brand-ink",
  lesson: "text-lesson-ink",
  revise: "text-revise-ink",
  pause: "text-pause-ink",
  danger: "text-danger",
  default: "text-ink",
};

/**
 * A few real numbers under the greeting. The reference puts a status strip
 * here; ours only shows things the database actually knows -- no streaks, no
 * levels, nothing invented.
 */
export function DayStats({ stats }: { stats: Stat[] }) {
  return (
    <Surface inset="flush" float="a" className="overflow-hidden">
      {/* One ruled row rather than three separate boxes: the numbers belong to
          the same reading, and hairlines between them say so more quietly
          than three borders would. */}
      <dl className="grid grid-cols-1 divide-y divide-border sm:grid-cols-3 sm:divide-x sm:divide-y-0">
        {stats.map((stat) => (
          // The whole tile is the target, not just the label: a number you can
          // read but not follow is a dead end.
          <Link
            key={stat.label}
            href={stat.href}
            className="group/stat min-w-0 px-8 py-9 transition-colors duration-300 ease-out-flat hover:bg-surface-raised focus-visible:bg-surface-raised sm:px-9 sm:py-11"
          >
            <dt className="flex items-center gap-2 text-eyebrow uppercase text-ink-subtle">
              {stat.label}
              <ArrowUpRight
                aria-hidden="true"
                className="size-3.5 opacity-0 transition-opacity duration-150 group-hover/stat:opacity-100"
              />
            </dt>
            <dd
              className={cn(
                // The clamp is sized to the narrowest cell this sits in, not
                // to the widest: at ~560px of content the three columns are
                // 188px each, and a duration set any larger overflows.
                "mt-5 text-[clamp(2.25rem,4vw,4rem)] font-semibold leading-[0.95] tracking-[-0.04em]",
                STAT_TONE[stat.tone ?? "default"],
              )}
              data-numeric
            >
              {stat.value}
            </dd>
          </Link>
        ))}
      </dl>
    </Surface>
  );
}

// --- Today's progress -------------------------------------------------------

export function TodayProgress({ done, total }: { done: number; total: number }) {
  const complete = total > 0 && done === total;

  return (
    <Panel
      title="Today's progress"
      size="md"
      action={
        <Button asChild variant="ghost" size="sm">
          <Link href="/homework">
            Homework <ArrowRight aria-hidden="true" />
          </Link>
        </Button>
      }
    >
      <div className="flex flex-1 flex-col items-center justify-center py-4">
        <ProgressRing value={done} total={total} size={148} stroke={12} />
        <p className="mt-7 text-center text-body text-ink-muted">
          {total === 0
            ? "Nothing tracked for today."
            : complete
              ? "Everything done. Go and rest."
              : `${total - done} still to do`}
        </p>
      </div>
    </Panel>
  );
}
