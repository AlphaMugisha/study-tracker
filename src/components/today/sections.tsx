import Link from "next/link";
import { ArrowRight, NotebookPen } from "lucide-react";

import { ProgressRing } from "@/components/shared/progress-ring";
import {
  ActivityChip,
  OverdueBadge,
  PriorityBadge,
  SubjectDot,
  activityStyle,
} from "@/components/shared/badges";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import type { AssignmentView } from "@/lib/data/tasks";
import { formatDueLabel, formatOverdueLabel } from "@/lib/format";
import type { PlanPreviewBlock } from "@/lib/temporary/home-plan-preview";
import { formatDuration, type ResolvedEntry } from "@/lib/timetable/types";
import { cn } from "@/lib/utils";

/**
 * Section heading in the register the reference uses: a real title with a
 * count pill beside it and any action inline on the right, rather than a
 * lone uppercase label. The count is the useful part — it answers "how many"
 * before you read a single row.
 */
function Panel({
  title,
  count,
  action,
  children,
  className,
}: {
  title: string;
  count?: number;
  action?: React.ReactNode;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <section
      className={cn(
        "flex h-full flex-col rounded-xl border border-border bg-card p-6 shadow-card",
        className,
      )}
    >
      <div className="mb-4 flex items-center justify-between gap-3">
        <div className="flex items-baseline gap-2">
          <h2 className="text-base font-semibold text-ink">{title}</h2>
          {typeof count === "number" ? (
            <span
              className="rounded-full bg-surface-sunken px-2 py-0.5 text-[11px] font-medium text-ink-muted"
              data-numeric
            >
              {count}
            </span>
          ) : null}
        </div>
        {action}
      </div>
      {children}
    </section>
  );
}

// --- Up next ----------------------------------------------------------------

export function UpNextCard({ next }: { next: ResolvedEntry | null }) {
  return (
    <Panel title="Up next">
      {next ? (
        <>
          <p className="text-lg font-semibold text-ink">{next.label}</p>
          <p className="mt-0.5 text-sm text-ink-muted" data-numeric>
            {next.startLabel} — {next.endLabel}
          </p>
          <div className="mt-3 flex flex-wrap items-center gap-2">
            <ActivityChip kind={next.activityType} />
            {next.room ? (
              <span className="text-xs text-ink-subtle">{next.room}</span>
            ) : null}
          </div>
        </>
      ) : (
        <p className="text-sm text-ink-muted">
          Nothing else is timetabled today.
        </p>
      )}
    </Panel>
  );
}

// --- When you get home ------------------------------------------------------

const PLAN_TONE = {
  homework: { dot: "bg-sage", label: "text-ink" },
  revision: { dot: "bg-lavender", label: "text-ink" },
  break: { dot: "bg-cream-ink/40", label: "text-ink-muted" },
} as const;

export function HomePlanPreview({
  blocks,
  startsAt,
}: {
  blocks: PlanPreviewBlock[];
  startsAt: string | null;
}) {
  return (
    <Panel
      title="When you get home"
      count={blocks.filter((b) => b.kind !== "break").length}
      action={
        <Button asChild variant="ghost" size="xs">
          <Link href="/plan">
            Open plan <ArrowRight aria-hidden="true" />
          </Link>
        </Button>
      }
    >
      {blocks.length === 0 ? (
        <p className="text-sm text-ink-muted">
          Nothing outstanding. Your evening is your own.
        </p>
      ) : (
        <>
          <ol className="space-y-0.5">
            {blocks.map((block) => {
              const tone = PLAN_TONE[block.kind];
              return (
                <li key={block.id} className="flex items-baseline gap-3 py-1.5">
                  <span
                    className="w-11 shrink-0 text-[13px] font-medium text-ink-muted"
                    data-numeric
                  >
                    {block.startLabel}
                  </span>
                  <span
                    aria-hidden="true"
                    className={cn("mt-1.5 size-1.5 shrink-0 rounded-full", tone.dot)}
                  />
                  <span className="min-w-0 flex-1">
                    <span className={cn("block truncate text-sm font-medium", tone.label)}>
                      {block.label}
                    </span>
                    {block.detail ? (
                      <span className="block truncate text-xs text-ink-subtle">
                        {block.detail}
                      </span>
                    ) : null}
                  </span>
                  <span className="shrink-0 text-xs text-ink-subtle" data-numeric>
                    {block.minutes} min
                  </span>
                </li>
              );
            })}
          </ol>
          {startsAt ? (
            <p className="mt-4 border-t border-border/70 pt-3 text-xs text-ink-subtle">
              A rough order, starting <span data-numeric>{startsAt}</span>. You can move
              things around.
            </p>
          ) : null}
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
      action={
        <Button asChild variant="ghost" size="xs">
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
        <ul className="divide-y divide-border/70">
          {assignments.map((a) => (
            <li key={a.id}>
              <Link
                href={`/homework#${a.id}`}
                className="flex items-start gap-3 py-3 transition-colors hover:bg-surface-sunken/50"
              >
                <SubjectDot colorToken={a.subject?.color_token ?? null} className="mt-1.5" />
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-sm font-medium text-ink">
                    {a.title}
                  </span>
                  <span className="mt-0.5 flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-ink-subtle">
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
    <Panel title="Rest of today" count={entries.length}>
      {entries.length === 0 ? (
        <p className="text-sm text-ink-muted">
          Nothing else timetabled. The rest of the day is yours.
        </p>
      ) : (
        <ol className="-my-1 divide-y divide-border/60">
          {entries.map((entry) => {
            const style = activityStyle(entry.activityType);
            const isLesson = entry.activityType === "class";

            return (
              <li key={entry.id} className="flex items-baseline gap-3 py-2.5">
                <span
                  className="w-11 shrink-0 text-[13px] font-medium text-ink-muted"
                  data-numeric
                >
                  {entry.startLabel}
                </span>
                <span
                  aria-hidden="true"
                  className={cn("size-1.5 shrink-0 rounded-full", style.rail)}
                />
                <span className="min-w-0 flex-1">
                  <span
                    className={cn(
                      "block truncate text-sm",
                      isLesson ? "font-medium text-ink" : "text-ink-muted",
                    )}
                  >
                    {entry.label}
                  </span>
                  {entry.room ? (
                    <span className="block truncate text-xs text-ink-subtle">
                      {entry.room}
                    </span>
                  ) : null}
                </span>
                <span className="shrink-0 text-xs text-ink-subtle" data-numeric>
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

type Stat = { label: string; value: string; tone?: "danger" | "default" };

/**
 * A few real numbers under the greeting. The reference puts a status strip
 * here; ours only shows things the database actually knows -- no streaks, no
 * levels, nothing invented.
 */
export function DayStats({ stats }: { stats: Stat[] }) {
  return (
    <dl className="flex flex-wrap items-stretch gap-2">
      {stats.map((stat) => (
        <div
          key={stat.label}
          className="min-w-[9rem] flex-1 rounded-xl border border-border bg-card px-5 py-4"
        >
          <dt className="text-eyebrow text-ink-subtle">{stat.label}</dt>
          <dd
            className={cn(
              "mt-1.5 text-[28px] font-semibold tracking-[-0.025em]",
              stat.tone === "danger" ? "text-danger" : "text-ink",
            )}
            data-numeric
          >
            {stat.value}
          </dd>
        </div>
      ))}
    </dl>
  );
}

// --- Today's progress -------------------------------------------------------

export function TodayProgress({
  done,
  total,
}: {
  done: number;
  total: number;
}) {
  const complete = total > 0 && done === total;

  return (
    <Panel title="Today's progress">
      <div className="flex flex-1 flex-col items-center justify-center py-2">
        <ProgressRing value={done} total={total} />
        <p className="mt-4 text-center text-[13px] text-ink-muted">
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
