import Link from "next/link";
import { ArrowRight, Coffee, NotebookPen } from "lucide-react";

import { Eyebrow } from "@/components/layout/page-header";
import {
  ActivityChip,
  OverdueBadge,
  PriorityBadge,
  SubjectDot,
} from "@/components/shared/badges";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import type { AssignmentView } from "@/lib/data/tasks";
import { formatDueLabel, formatOverdueLabel } from "@/lib/format";
import type { PlanPreviewBlock } from "@/lib/temporary/home-plan-preview";
import { formatDuration, type ResolvedEntry } from "@/lib/timetable/types";
import { cn } from "@/lib/utils";

function Panel({
  eyebrow,
  action,
  children,
  className,
}: {
  eyebrow: string;
  action?: React.ReactNode;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <section
      className={cn("rounded-lg border border-border bg-card p-5 shadow-card", className)}
    >
      <div className="mb-4 flex items-center justify-between gap-3">
        <Eyebrow>{eyebrow}</Eyebrow>
        {action}
      </div>
      {children}
    </section>
  );
}

// --- Up next ----------------------------------------------------------------

export function UpNextCard({ next }: { next: ResolvedEntry | null }) {
  return (
    <Panel eyebrow="Up next">
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
  break: { dot: "bg-cream-strong/40", label: "text-ink-muted" },
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
      eyebrow="When you get home"
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
      eyebrow="Due soon"
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

// --- Today's progress -------------------------------------------------------

export function TodayProgress({
  done,
  total,
}: {
  done: number;
  total: number;
}) {
  const pct = total === 0 ? 0 : Math.round((done / total) * 100);

  return (
    <Panel eyebrow="Today's progress">
      <div className="flex items-baseline justify-between">
        <p className="text-2xl font-semibold text-ink" data-numeric>
          {done} <span className="text-ink-subtle">/ {total}</span>
        </p>
        <p className="text-sm text-ink-muted">
          {total === 0 ? "nothing tracked" : "tasks completed"}
        </p>
      </div>
      <div className="mt-3 h-1.5 w-full overflow-hidden rounded-full bg-surface-sunken">
        <div className="h-full rounded-full bg-sage" style={{ width: `${pct}%` }} />
      </div>
      {total > 0 && done === total ? (
        <p className="mt-3 flex items-center gap-1.5 text-xs text-sage-strong">
          <Coffee aria-hidden="true" className="size-3.5" />
          Everything done. Go and rest.
        </p>
      ) : null}
    </Panel>
  );
}
