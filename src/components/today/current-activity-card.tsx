import Link from "next/link";
import { ArrowRight, CalendarPlus, Coffee, MoonStar, Sunrise } from "lucide-react";

import { Eyebrow } from "@/components/layout/page-header";
import { activityStyle } from "@/components/shared/badges";
import { Button } from "@/components/ui/button";
import { formatDuration, type ResolvedEntry, type TimetableState } from "@/lib/timetable/types";
import { cn } from "@/lib/utils";

/**
 * The signature card. Everything else on Today is secondary to it.
 *
 * It renders a `TimetableState` and nothing else, so when Phase 3B swaps the
 * temporary resolver for `resolveNow()` this component does not change — it
 * simply starts being correct about timezones and starts counting down.
 */
export function CurrentActivityCard({ state }: { state: TimetableState }) {
  switch (state.kind) {
    case "in_activity":
      return <InActivity state={state} />;
    case "gap":
      return (
        <Shell tone="neutral" eyebrow="Currently">
          <Headline>You&apos;re free right now</Headline>
          <p className="mt-2 text-[15px] text-ink-muted">
            Nothing is timetabled until {state.next.label} at{" "}
            <span data-numeric>{state.next.startLabel}</span>.
          </p>
          <Footer next={state.next} />
        </Shell>
      );
    case "before_school":
      return (
        <Shell tone="neutral" eyebrow="Before school" icon={Sunrise}>
          <Headline>School hasn&apos;t started yet</Headline>
          <p className="mt-2 text-[15px] text-ink-muted">
            First up is {state.next.label} at{" "}
            <span data-numeric>{state.next.startLabel}</span>, in{" "}
            {formatDuration(state.startsInMinutes)}.
          </p>
          <Footer next={state.next} />
        </Shell>
      );
    case "after_school":
      return (
        <Shell tone="neutral" eyebrow="School day complete" icon={MoonStar}>
          <Headline>School is done for today</Headline>
          <p className="mt-2 text-[15px] text-ink-muted">
            You finished at <span data-numeric>{state.lastEntry.endLabel}</span>. Your plan
            for home is below.
          </p>
        </Shell>
      );
    case "no_school":
      return (
        <Shell tone="neutral" eyebrow="Currently" icon={Coffee}>
          <Headline>
            {state.reason === "weekend" ? "No school today" : "Nothing timetabled today"}
          </Headline>
          <p className="mt-2 text-[15px] text-ink-muted">
            {state.reason === "weekend"
              ? "Enjoy the weekend. Homework due next week is below."
              : "There are no lessons on your timetable for today."}
          </p>
        </Shell>
      );
    case "no_timetable":
      return (
        <Shell tone="empty" eyebrow="Currently" icon={CalendarPlus}>
          <Headline>No timetable yet</Headline>
          <p className="mt-2 max-w-md text-[15px] text-ink-muted">
            Add your school timetable and this card will tell you what you&apos;re doing,
            what&apos;s next, and how long is left.
          </p>
          <div className="mt-6">
            <Button asChild>
              <Link href="/timetable">Add your timetable</Link>
            </Button>
          </div>
        </Shell>
      );
  }
}

// ---------------------------------------------------------------------------

function InActivity({
  state,
}: {
  state: Extract<TimetableState, { kind: "in_activity" }>;
}) {
  const { current, next, elapsedMinutes, remainingMinutes, progress } = state;
  const isBreak = current.activityType === "break";
  const style = activityStyle(current.activityType);
  const Icon = style.icon;

  return (
    <section
      aria-labelledby="current-activity-heading"
      className={cn(
        "rounded-lg border p-6 shadow-card sm:p-8",
        isBreak ? "border-border bg-cream" : "border-border bg-card",
      )}
    >
      <div className="flex items-center gap-2">
        <Icon
          aria-hidden="true"
          className={cn("size-3.5", isBreak ? "text-cream-strong" : "text-sage")}
        />
        <Eyebrow className={isBreak ? "text-cream-strong" : "text-sage-strong"}>
          Currently
        </Eyebrow>
      </div>

      <h2 id="current-activity-heading" className="mt-4 text-hero font-semibold text-ink">
        {current.label}
      </h2>
      {current.detail ? (
        <p className="mt-1 text-[15px] text-ink-muted">{current.detail}</p>
      ) : null}

      <div
        className="mt-6 flex flex-wrap items-baseline gap-x-5 gap-y-1"
        data-numeric
      >
        <span className="text-xl font-medium text-ink">
          {current.startLabel} — {current.endLabel}
        </span>
        <span
          className={cn(
            "text-xl font-semibold",
            isBreak ? "text-cream-strong" : "text-sage-strong",
          )}
        >
          {remainingMinutes} {remainingMinutes === 1 ? "minute" : "minutes"} remaining
        </span>
      </div>

      <div className="mt-5">
        <div
          className="h-2 w-full overflow-hidden rounded-full bg-surface-sunken"
          role="progressbar"
          aria-valuenow={Math.round(progress * 100)}
          aria-valuemin={0}
          aria-valuemax={100}
          aria-label={`${current.label} progress`}
        >
          <div
            className={cn(
              "h-full rounded-full transition-[width] duration-700 ease-linear",
              isBreak ? "bg-cream-strong/60" : "bg-sage",
            )}
            style={{ width: `${Math.round(progress * 100)}%` }}
          />
        </div>
        <div className="mt-2 flex justify-between text-xs text-ink-subtle" data-numeric>
          <span>{elapsedMinutes} min elapsed</span>
          <span>{formatDuration(current.durationMinutes)} total</span>
        </div>
      </div>

      <Footer next={next} />
    </section>
  );
}

function Shell({
  children,
  eyebrow,
  icon: Icon,
  tone,
}: {
  children: React.ReactNode;
  eyebrow: string;
  icon?: typeof Coffee;
  tone: "neutral" | "empty";
}) {
  return (
    <section
      className={cn(
        "rounded-lg border p-6 sm:p-8",
        tone === "empty"
          ? "border-dashed border-border bg-card/60"
          : "border-border bg-card shadow-card",
      )}
    >
      <div className="flex items-center gap-2">
        {Icon ? <Icon aria-hidden="true" className="size-3.5 text-ink-subtle" /> : null}
        <Eyebrow>{eyebrow}</Eyebrow>
      </div>
      {children}
    </section>
  );
}

function Headline({ children }: { children: React.ReactNode }) {
  return (
    <h2 className="mt-4 text-[1.75rem] font-semibold leading-tight tracking-[-0.02em] text-ink sm:text-[2rem]">
      {children}
    </h2>
  );
}

function Footer({ next }: { next: ResolvedEntry | null }) {
  return (
    <div className="mt-6 flex flex-wrap items-center justify-between gap-3 border-t border-border/70 pt-5">
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
