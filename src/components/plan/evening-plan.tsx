import { AlertTriangle, Clock } from "lucide-react";

import { PlanBlockCard } from "@/components/plan/plan-block-card";
import { ItemCard, ItemGrid } from "@/components/shared/item-card";
import { StartSessionButton } from "@/components/plan/session-controls";
import { QueueSuggestionButton } from "@/components/plan/study-suggestions";
import { Eyebrow, Surface } from "@/components/shared/surface";
import { EmptyState } from "@/components/ui/empty-state";
import type { EveningPlan } from "@/lib/planner/build-plan";
import { formatDuration } from "@/lib/timetable/types";

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

      {/*
        Set work needs no justification — a teacher set it and it has a date.
        A suggestion does, and the hero is where it has to appear: told "start
        with Chemistry" and nothing else, the only honest response is "why?".
      */}
      {plan.startWith.reason ? (
        <p className="mt-4 max-w-[48ch] text-body-lg opacity-80">{plan.startWith.reason}</p>
      ) : null}

      <div className="mt-5 flex flex-wrap items-center gap-x-6 gap-y-2 text-body opacity-80">
        {plan.startWith.detail ? <span>{plan.startWith.detail}</span> : null}
        <span className="inline-flex items-center gap-2" data-numeric>
          <Clock aria-hidden="true" className="size-4" />
          {first.startLabel} — {first.endLabel}
        </span>
        <span data-numeric>{formatDuration(plan.startWith.minutes)}</span>
      </div>

      {/*
        A suggestion has no row yet, so there is nothing to clock time against
        — `StartSessionButton` needs an assignment id and renders nothing
        without one, which would leave the hero with no action at all. The
        useful move on a suggestion is to accept it; once it is a real revision
        task the plan rebuilds and the ordinary buttons take over.
      */}
      <div className="mt-9">
        {first.kind === "suggested" ? (
          <QueueSuggestionButton
            title={first.label}
            subjectId={first.subjectId}
            minutes={first.minutes}
            tone="hero"
          />
        ) : (
          <StartSessionButton
            taskId={first.taskId}
            openSessionId={openSessionId}
            isActive={activeTaskId !== null && activeTaskId === first.taskId}
          />
        )}
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
      {/* Container query rather than viewport: this sits full width on /plan
          but the same component is not guaranteed to, and the cards care about
          their own space rather than the window's. */}
      <div className="@container">
        <ol className="grid grid-cols-1 gap-3 @md:grid-cols-2 @3xl:grid-cols-3 @6xl:grid-cols-4">
          {plan.blocks.map((block, i) => (
            <PlanBlockCard
              key={block.id}
              block={block}
              index={i}
              active={block.taskId !== null && block.taskId === activeTaskId}
            />
          ))}
        </ol>
      </div>

      <p className="mt-7 border-t border-border pt-6 text-[0.95rem] text-ink-subtle">
        <span data-numeric>{plan.startsAt}</span> to{" "}
        <span data-numeric>{plan.endsBy}</span> ·{" "}
        <span data-numeric>{formatDuration(plan.workMinutes)}</span> of work
        {/* Said plainly, because the difference matters: this much of the
            evening is work somebody set, and this much is the timetable's
            idea. She is entitled to skip the second and not the first. */}
        {plan.suggestedMinutes > 0 ? (
          <>
            , <span data-numeric>{formatDuration(plan.suggestedMinutes)}</span> of it
            suggested
          </>
        ) : null}
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

          <div className="mt-6">
            <ItemGrid>
              {plan.deferred.map((task, i) => (
                <ItemCard
                  key={task.taskId}
                  index={i}
                  href={`/homework#${task.taskId}`}
                  accent={task.overdue ? "danger" : "pause"}
                  title={task.label}
                  meta={
                    <>
                      {task.detail ? <span>{task.detail}</span> : null}
                      {task.overdue ? (
                        <span className="font-medium text-danger">Overdue</span>
                      ) : null}
                      <span data-numeric>
                        {task.scheduledMinutes > 0
                          ? `${formatDuration(task.scheduledMinutes)} of ${formatDuration(task.minutes)} scheduled`
                          : `${formatDuration(task.minutes)} needed`}
                      </span>
                    </>
                  }
                />
              ))}
            </ItemGrid>
          </div>
        </div>
      </div>
    </Surface>
  );
}

