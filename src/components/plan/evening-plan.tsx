import { AlertTriangle, Clock } from "lucide-react";

import { StartSessionButton } from "@/components/plan/session-controls";
import { Eyebrow, Surface } from "@/components/shared/surface";
import { EmptyState } from "@/components/ui/empty-state";
import type { EveningPlan } from "@/lib/planner/build-plan";
import { formatDuration } from "@/lib/timetable/types";
import { cn } from "@/lib/utils";

const KIND_TONE = {
  homework: { dot: "bg-lesson", label: "text-ink" },
  revision: { dot: "bg-revise", label: "text-ink" },
  break: { dot: "bg-pause", label: "text-ink-muted" },
} as const;

/**
 * The answer to "what do I start with", given the most prominent position on
 * the page, because it is the one thing the student actually opens this for.
 */
export function StartWithCard({
  plan,
  openSessionId,
  activeTaskId,
}: {
  plan: EveningPlan;
  openSessionId: string | null;
  activeTaskId: string | null;
}) {
  const first = plan.blocks.find((b) => b.kind !== "break");

  if (!plan.startWith || !first) {
    return (
      <Surface elevation="hero" inset="roomy" className="bg-linear-to-br from-hero-from via-hero to-hero-to text-hero-foreground">
        <Eyebrow className="text-hero-foreground/70">Tonight</Eyebrow>
        <p className="mt-6 text-headline text-balance">Nothing to do tonight.</p>
        <p className="mt-4 max-w-[46ch] text-body-lg opacity-80">
          No homework outstanding. The evening is yours.
        </p>
      </Surface>
    );
  }

  return (
    <Surface
      elevation="hero"
      inset="roomy"
      className="bg-linear-to-br from-hero-from via-hero to-hero-to text-hero-foreground"
    >
      <Eyebrow className="text-hero-foreground/70">Start with</Eyebrow>
      <p className="mt-6 text-headline text-balance">{plan.startWith.label}</p>

      <div className="mt-5 flex flex-wrap items-center gap-x-6 gap-y-2 text-body opacity-80">
        {plan.startWith.detail ? <span>{plan.startWith.detail}</span> : null}
        <span className="inline-flex items-center gap-2" data-numeric>
          <Clock aria-hidden="true" className="size-4" />
          {first.startLabel} — {first.endLabel}
        </span>
        <span data-numeric>{formatDuration(plan.startWith.minutes)}</span>
      </div>

      <div className="mt-9">
        <StartSessionButton
          taskId={first.taskId}
          openSessionId={openSessionId}
          isActive={activeTaskId !== null && activeTaskId === first.taskId}
        />
      </div>
    </Surface>
  );
}

/** The evening laid out block by block. */
export function PlanTimeline({
  plan,
  activeTaskId,
}: {
  plan: EveningPlan;
  activeTaskId: string | null;
}) {
  if (plan.blocks.length === 0) {
    return (
      <EmptyState
        icon={Clock}
        headline="No plan for tonight."
        body="Either there is nothing outstanding, or the evening is already over."
      />
    );
  }

  return (
    <Surface>
      <ol className="-my-2 divide-y divide-border">
        {plan.blocks.map((block) => {
          const tone = KIND_TONE[block.kind];
          const active = block.taskId !== null && block.taskId === activeTaskId;

          return (
            <li
              key={block.id}
              className={cn(
                "flex items-baseline gap-4 py-4",
                active && "-mx-4 rounded-lg bg-brand-soft px-4",
              )}
            >
              <span
                className="w-14 shrink-0 text-[0.95rem] font-medium text-ink-muted"
                data-numeric
              >
                {block.startLabel}
              </span>
              <span
                aria-hidden="true"
                className={cn("size-2 shrink-0 rounded-full", tone.dot)}
              />
              <span className="min-w-0 flex-1">
                <span className={cn("block truncate text-body font-medium", tone.label)}>
                  {block.label}
                  {block.part ? (
                    <span className="ml-2 text-[0.85rem] font-normal text-ink-subtle">
                      part {block.part.index} of {block.part.total}
                    </span>
                  ) : null}
                </span>
                {block.detail ? (
                  <span className="block truncate text-[0.9rem] text-ink-subtle">
                    {block.detail}
                  </span>
                ) : null}
              </span>
              <span className="shrink-0 text-[0.9rem] text-ink-subtle" data-numeric>
                {block.minutes} min
              </span>
            </li>
          );
        })}
      </ol>

      <p className="mt-6 border-t border-border pt-5 text-[0.9rem] text-ink-subtle">
        <span data-numeric>{plan.startsAt}</span> to{" "}
        <span data-numeric>{plan.endsBy}</span> ·{" "}
        <span data-numeric>{formatDuration(plan.workMinutes)}</span> of work
        {plan.spareMinutes > 0 ? (
          <>
            {" "}
            · <span data-numeric>{formatDuration(plan.spareMinutes)}</span> spare
          </>
        ) : null}
      </p>
    </Surface>
  );
}

/**
 * What will not fit tonight.
 *
 * This is the part the old preview could not express at all: it truncated to
 * four tasks and said nothing. Being told "these three won't fit before 21:00"
 * is the difference between a plan and a wish.
 */
export function DeferredList({ plan }: { plan: EveningPlan }) {
  if (plan.deferred.length === 0) return null;

  return (
    <Surface className="border-pause/30">
      <div className="flex items-start gap-4">
        <AlertTriangle aria-hidden="true" className="mt-1 size-5 shrink-0 text-pause" />
        <div className="min-w-0 flex-1">
          <h3 className="text-section text-ink">
            {plan.deferred.length === 1
              ? "One task will not fit tonight"
              : `${plan.deferred.length} tasks will not fit tonight`}
          </h3>
          <p className="mt-2 max-w-[54ch] text-[0.95rem] leading-relaxed text-ink-muted">
            Your evening ends at <span data-numeric>{plan.endsBy}</span>. Move a
            deadline, shorten an estimate, or plan to finish these another day.
          </p>

          <ul className="mt-5 divide-y divide-border">
            {plan.deferred.map((task) => (
              <li key={task.taskId} className="flex items-baseline gap-4 py-3">
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-body font-medium text-ink">
                    {task.label}
                  </span>
                  <span className="mt-1 flex flex-wrap items-center gap-x-3 text-[0.9rem] text-ink-subtle">
                    {task.detail ? <span>{task.detail}</span> : null}
                    {task.overdue ? (
                      <span className="font-medium text-danger">Overdue</span>
                    ) : null}
                    {task.scheduledMinutes > 0 ? (
                      <span data-numeric>
                        {formatDuration(task.scheduledMinutes)} of{" "}
                        {formatDuration(task.minutes)} scheduled
                      </span>
                    ) : (
                      <span data-numeric>{formatDuration(task.minutes)} needed</span>
                    )}
                  </span>
                </span>
              </li>
            ))}
          </ul>
        </div>
      </div>
    </Surface>
  );
}
