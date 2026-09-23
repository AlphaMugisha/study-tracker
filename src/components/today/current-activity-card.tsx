import Link from "next/link";
import {
  ArrowRight,
  CalendarPlus,
  Clock,
  Coffee,
  MoonStar,
  Sunrise,
} from "lucide-react";

import { Eyebrow } from "@/components/layout/page-header";
import { activityStyle } from "@/components/shared/badges";
import { Button } from "@/components/ui/button";
import { formatDuration, type ResolvedEntry, type TimetableState } from "@/lib/timetable/types";
import { cn } from "@/lib/utils";

/**
 * The signature card, and the only element on Today rendered as a solid panel
 * of colour. Everything else is a raised card on the dark ground; this one is
 * the page's subject rather than one of its parts.
 *
 * It renders a `TimetableState` and nothing else, so when Phase 3B swaps the
 * temporary resolver for `resolveNow()` this component does not change — the
 * countdown simply starts ticking and starts being right about timezones.
 */
export function CurrentActivityCard({ state }: { state: TimetableState }) {
  if (state.kind === "in_activity") return <LivePanel state={state} />;

  switch (state.kind) {
    case "gap":
      return (
        <QuietPanel eyebrow="Currently" icon={Coffee} title="You're free right now">
          <p className="mt-3 max-w-[46ch] text-[15px] leading-relaxed text-ink-muted">
            Nothing is timetabled until {state.next.label} at{" "}
            <span data-numeric>{state.next.startLabel}</span>.
          </p>
          <QuietFooter next={state.next} />
        </QuietPanel>
      );
    case "before_school":
      return (
        <QuietPanel
          eyebrow="Before school"
          icon={Sunrise}
          title="School hasn't started yet"
        >
          <p className="mt-3 max-w-[46ch] text-[15px] leading-relaxed text-ink-muted">
            First up is {state.next.label} at{" "}
            <span data-numeric>{state.next.startLabel}</span>, in{" "}
            {formatDuration(state.startsInMinutes)}.
          </p>
          <QuietFooter next={state.next} />
        </QuietPanel>
      );
    case "after_school":
      return (
        <QuietPanel
          eyebrow="School day complete"
          icon={MoonStar}
          title="School is done for today"
        >
          <p className="mt-3 max-w-[46ch] text-[15px] leading-relaxed text-ink-muted">
            You finished at <span data-numeric>{state.lastEntry.endLabel}</span>. Your
            plan for home is below.
          </p>
        </QuietPanel>
      );
    case "no_school":
      return (
        <QuietPanel
          eyebrow="Currently"
          icon={Coffee}
          title={
            state.reason === "weekend" ? "No school today" : "Nothing timetabled today"
          }
        >
          <p className="mt-3 max-w-[46ch] text-[15px] leading-relaxed text-ink-muted">
            {state.reason === "weekend"
              ? "Enjoy the weekend. Homework due next week is below."
              : "There are no lessons on your timetable for today."}
          </p>
        </QuietPanel>
      );
    case "no_timetable":
      return (
        <section className="rounded-xl border border-dashed border-border p-7 sm:p-10">
          <div className="flex items-center gap-2.5">
            <CalendarPlus aria-hidden="true" className="size-3.5 text-indigo-ink" />
            <Eyebrow tone="accent">Currently</Eyebrow>
          </div>
          <h2 className="mt-6 text-hero text-balance text-ink">No timetable yet.</h2>
          <p className="mt-3 max-w-[46ch] text-[15px] leading-relaxed text-ink-muted">
            Add your school timetable and this card will tell you what you&apos;re
            doing, what&apos;s next, and how long is left.
          </p>
          <div className="mt-6">
            <Button asChild size="lg">
              <Link href="/timetable">Add your timetable</Link>
            </Button>
          </div>
        </section>
      );
  }
}

// ---------------------------------------------------------------------------
// The live panel
// ---------------------------------------------------------------------------

function LivePanel({
  state,
}: {
  state: Extract<TimetableState, { kind: "in_activity" }>;
}) {
  const { current, next, elapsedMinutes, remainingMinutes, progress } = state;
  const resting = current.activityType === "break" || current.activityType === "free";
  const Icon = activityStyle(current.activityType).icon;
  const percent = Math.round(progress * 100);

  return (
    <section
      aria-labelledby="current-activity-heading"
      className={cn(
        "relative overflow-hidden rounded-xl",
        resting ? "bg-hero-rest text-hero-rest-foreground" : "bg-hero text-hero-foreground",
      )}
    >
      <div className="p-7 sm:p-10">
        <div className="flex flex-col gap-8 sm:flex-row sm:items-start sm:justify-between sm:gap-12">
          {/* what */}
          <div className="min-w-0 flex-1">
            {/* A tracked label rather than a filled pill: on a panel that is
                already solid colour, a chip is a second box inside a box. */}
            <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
              <span className="inline-flex items-center gap-2 text-eyebrow uppercase opacity-80">
                <Icon aria-hidden="true" className="size-3" />
                {resting ? "Currently · Break" : "Currently"}
              </span>
              <span
                className="inline-flex items-center gap-1.5 text-[13px] opacity-70"
                data-numeric
              >
                <Clock aria-hidden="true" className="size-3.5" />
                {current.startLabel} — {current.endLabel}
              </span>
            </div>

            <h2 id="current-activity-heading" className="mt-6 text-hero text-balance">
              {current.label}
            </h2>
            {current.detail ? (
              <p className="mt-2.5 text-[15px] opacity-75">{current.detail}</p>
            ) : null}

            {next ? (
              <p
                className={cn(
                  "mt-7 border-t pt-4 text-[13px] opacity-75",
                  resting ? "border-white/15" : "border-hero-line",
                )}
              >
                Then {next.label} at{" "}
                <span data-numeric className="font-medium opacity-100">
                  {next.startLabel}
                </span>
              </p>
            ) : null}
          </div>

          {/* how long */}
          <div className="shrink-0 sm:text-right">
            <p className="text-eyebrow uppercase opacity-65">Ends in</p>
            <p className="mt-3 flex items-baseline gap-2 sm:justify-end" data-numeric>
              <span className="text-count">{remainingMinutes}</span>
              <span className="text-lg font-medium opacity-60">min</span>
            </p>
            <div className="mt-7">
              {/* Outlined, not filled: a solid white button on a solid colour
                  panel fights the headline for the eye. */}
              <Button
                asChild
                size="lg"
                variant="outline"
                // The dark: variants must be overridden at their own level:
                // the outline variant sets dark:bg-input/30, which would
                // otherwise win over a plain bg-transparent and drop a grey
                // button onto the indigo panel.
                className="w-full border-white/30 bg-transparent text-current hover:border-white/60 hover:bg-white/10 dark:border-white/30 dark:bg-transparent dark:hover:bg-white/10 sm:w-auto"
              >
                <Link href="/timetable">
                  View timetable <ArrowRight aria-hidden="true" />
                </Link>
              </Button>
            </div>
          </div>
        </div>
      </div>

      {/* progress strip along the foot of the panel */}
      <div
        className={cn(
          "flex flex-wrap items-center gap-x-4 gap-y-2 border-t px-7 py-4 sm:px-10",
          resting ? "border-white/10" : "border-hero-line",
        )}
      >
        <div
          className={cn(
            "h-1.5 min-w-[8rem] flex-1 overflow-hidden rounded-full",
            resting ? "bg-white/10" : "bg-hero-fill",
          )}
          role="progressbar"
          aria-valuenow={percent}
          aria-valuemin={0}
          aria-valuemax={100}
          aria-label={`${current.label} progress`}
        >
          <div
            className={cn(
              "h-full rounded-full transition-[width] duration-700 ease-linear",
              resting ? "bg-hero-rest-foreground/70" : "bg-white",
            )}
            style={{ width: `${percent}%` }}
          />
        </div>
        <p className="text-[12px] opacity-70" data-numeric>
          {elapsedMinutes} of {formatDuration(current.durationMinutes)} · {percent}%
        </p>
      </div>
    </section>
  );
}

// ---------------------------------------------------------------------------
// Everything that is not a lesson in progress
// ---------------------------------------------------------------------------

function QuietPanel({
  eyebrow,
  icon: Icon,
  title,
  children,
}: {
  eyebrow: string;
  icon: typeof Coffee;
  title: string;
  children: React.ReactNode;
}) {
  return (
    <section className="rounded-xl border border-border bg-card p-7 sm:p-10">
      <div className="flex items-center gap-2.5">
        <Icon aria-hidden="true" className="size-3.5 text-indigo-ink" />
        <Eyebrow tone="accent">{eyebrow}</Eyebrow>
      </div>
      <h2 className="mt-6 text-hero text-balance text-ink">{title}</h2>
      {children}
    </section>
  );
}

function QuietFooter({ next }: { next: ResolvedEntry | null }) {
  return (
    <div className="mt-7 flex flex-wrap items-center justify-between gap-3 border-t border-border pt-5">
      {next ? (
        <p className="text-sm text-ink-muted">
          Next: <span className="font-medium text-ink">{next.label}</span>
          <span className="text-ink-subtle" data-numeric>
            {" "}
            · {next.startLabel}
          </span>
        </p>
      ) : (
        <p className="text-sm text-ink-muted">Nothing else timetabled today.</p>
      )}
      <Button asChild variant="outline" size="sm">
        <Link href="/timetable">
          View timetable <ArrowRight aria-hidden="true" />
        </Link>
      </Button>
    </div>
  );
}
