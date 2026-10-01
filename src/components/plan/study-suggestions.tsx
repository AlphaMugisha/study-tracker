import { CalendarClock, GraduationCap, Plus } from "lucide-react";

import { SubjectDot } from "@/components/shared/badges";
import { Surface } from "@/components/shared/surface";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { queueSuggestionAction } from "@/lib/actions/revision";
import type { StudyGuidance, StudySlot, StudySuggestion } from "@/lib/planner/suggest-study";

/**
 * What the timetable says to study.
 *
 * The one rule this screen follows: never show a ranking without its reasons.
 * A list that says "Chemistry, Physics, French" in that order is asking to be
 * trusted; the same list with "you have a Chemistry double at 09:20 tomorrow
 * and have not opened it since Tuesday" is arguing for itself, and can be
 * argued back. The student is the one who knows whether she understood today's
 * lesson — this only knows what the timetable knows, so it says exactly that
 * and no more.
 *
 * Every card offers one action: turn it into a real revision task. Suggestions
 * are not stored, so nothing here is a queue that fills up with stale guesses
 * — it is recomputed from the timetable each time the page loads, and only the
 * ones she accepts become rows.
 */

/**
 * The ranked list, reasons and all.
 *
 * There is deliberately no separate hero card for the top suggestion. The
 * "Start with" card above already names it when the planner scheduled it, and
 * a second card restating the same sentence in larger type is the mistake
 * "Up next" was making on the dashboard.
 */
export function SuggestionList({ guidance }: { guidance: StudyGuidance }) {
  if (guidance.suggestions.length === 0) {
    return (
      <EmptyState
        icon={GraduationCap}
        headline="Nothing to suggest from the timetable."
        body="Either there is no active timetable, or every subject on it already has homework or revision waiting."
      />
    );
  }

  return (
    <div className="@container">
      <ul className="grid grid-cols-1 gap-3 @xl:grid-cols-2">
        {guidance.suggestions.map((suggestion, i) => (
          <SuggestionCard key={suggestion.subjectId} suggestion={suggestion} index={i} />
        ))}
      </ul>
    </div>
  );
}

function SuggestionCard({
  suggestion,
  index,
}: {
  suggestion: StudySuggestion;
  index: number;
}) {
  return (
    <li
      className="sf-rise flex h-full flex-col rounded-xl border border-border bg-surface-sunken p-5 shadow-card"
      style={{ animationDelay: `${Math.min(index, 8) * 45}ms` }}
    >
      <div className="mb-4 flex items-baseline justify-between gap-3">
        <span className="inline-flex min-w-0 items-center gap-2 text-[0.9rem] text-ink-subtle">
          <SubjectDot colorToken={suggestion.colorToken} />
          <span className="truncate">{suggestion.subjectName}</span>
        </span>
        <span className="shrink-0 text-[0.85rem] text-ink-subtle" data-numeric>
          {suggestion.minutes} min
        </span>
      </div>

      <p className="text-body font-medium text-ink">{suggestion.headline}</p>

      {/*
        Every reason, not the top one. Three short sentences is what makes the
        order defensible, and it is the difference between a recommendation and
        an assertion.
      */}
      <ul className="mt-3 flex-1 space-y-1.5">
        {suggestion.reasons.map((reason) => (
          <li key={reason} className="flex gap-2 text-[0.9rem] leading-relaxed text-ink-muted">
            <span aria-hidden="true" className="mt-[0.55rem] size-1 shrink-0 rounded-full bg-ink-subtle" />
            <span>{reason}</span>
          </li>
        ))}
      </ul>

      <div className="mt-5 border-t border-border pt-4">
        <QueueSuggestionButton
          title={suggestion.headline}
          subjectId={suggestion.subjectId}
          minutes={suggestion.minutes}
        />
      </div>
    </li>
  );
}

/**
 * Free and study periods, with something to do in each.
 *
 * These rows have been on the timetable screen since the importer learned to
 * read them, described only as "Free". The school has already set aside the
 * time; the only missing part was what to spend it on, and that is the one
 * question the rest of the timetable can answer.
 */
export function StudySlots({ slots }: { slots: StudySlot[] }) {
  if (slots.length === 0) return null;

  return (
    <Surface>
      <div className="@container">
        <ul className="grid grid-cols-1 gap-3 @xl:grid-cols-2 @4xl:grid-cols-3">
          {slots.map((slot, i) => (
            <li
              key={slot.id}
              className="sf-rise flex h-full flex-col rounded-xl border border-dashed border-border p-5"
              style={{ animationDelay: `${Math.min(i, 8) * 45}ms` }}
            >
              <div className="flex items-baseline justify-between gap-3">
                <span className="text-[1.05rem] font-semibold tracking-[-0.02em] text-ink" data-numeric>
                  {slot.startLabel}
                </span>
                <span className="shrink-0 text-[0.85rem] text-ink-subtle" data-numeric>
                  {slot.minutes} min
                </span>
              </div>

              <p className="mt-1 text-[0.9rem] text-ink-subtle">
                {slot.label} · {slot.when}
              </p>

              {slot.suggestion ? (
                <div className="mt-4 flex flex-1 flex-col justify-between gap-4">
                  <p className="text-body text-ink">
                    <span className="inline-flex items-center gap-2">
                      <SubjectDot colorToken={slot.suggestion.colorToken} />
                      {slot.suggestion.subjectName}
                    </span>
                  </p>
                  <QueueSuggestionButton
                    title={slot.suggestion.headline}
                    subjectId={slot.suggestion.subjectId}
                    minutes={Math.min(slot.suggestion.minutes, slot.minutes)}
                  />
                </div>
              ) : (
                <p className="mt-4 flex-1 text-[0.9rem] text-ink-muted">
                  Nothing pressing. Yours to spend.
                </p>
              )}
            </li>
          ))}
        </ul>
      </div>

      {/*
        "Ahead on your timetable", not "left this week": the timetable repeats,
        so a free period six days out belongs to the next cycle rather than to
        this calendar week, and saying "this week" would make that one a lie.
      */}
      <p className="mt-7 border-t border-border pt-6 text-[0.95rem] text-ink-subtle">
        {slots.length === 1
          ? "One free period ahead on your timetable."
          : `${slots.length} free periods ahead on your timetable.`}{" "}
        Each is paired with the subject you next have after it.
      </p>
    </Surface>
  );
}

/**
 * Accept a suggestion.
 *
 * A plain form, like every other mutation in the product: it posts the three
 * facts the suggester already worked out, and works without JavaScript. The
 * fields are passed individually rather than as a `StudySuggestion` so the
 * same button serves the hero, where all that is to hand is a `PlanBlock`.
 *
 * `hero` exists because the hero panel is a dark gradient — the default filled
 * button disappears into it, and `outline` against `currentColor` is what the
 * session button beside it already does.
 */
export function QueueSuggestionButton({
  title,
  subjectId,
  minutes,
  tone = "inline",
}: {
  title: string;
  subjectId: string | null;
  minutes: number;
  tone?: "inline" | "hero";
}) {
  // No subject means no revision row worth writing: `revision_tasks` allows a
  // null subject, but a suggestion that cannot name one has nothing to study.
  if (!subjectId) return null;

  return (
    <form action={queueSuggestionAction}>
      <input type="hidden" name="title" value={title} />
      <input type="hidden" name="subjectId" value={subjectId} />
      <input type="hidden" name="estimatedMinutes" value={minutes} />
      <Button
        type="submit"
        variant="outline"
        size={tone === "hero" ? "xl" : "sm"}
        className={
          tone === "hero"
            ? "w-full border-white/35 bg-transparent text-current hover:border-white/70 hover:bg-white/12 dark:border-white/35 dark:bg-transparent dark:hover:bg-white/12 sm:w-auto"
            : undefined
        }
      >
        <Plus aria-hidden="true" />
        Add to revision
      </Button>
    </form>
  );
}

/**
 * The compact form for the dashboard, where this competes with the rest of the
 * day for space and only the headline fits.
 */
export function SuggestionStrip({ suggestions }: { suggestions: StudySuggestion[] }) {
  if (suggestions.length === 0) return null;

  return (
    <ul className="space-y-2.5">
      {suggestions.slice(0, 3).map((suggestion) => (
        <li key={suggestion.subjectId} className="flex items-start gap-3">
          <CalendarClock aria-hidden="true" className="mt-0.5 size-4 shrink-0 text-revise" />
          <div className="min-w-0 flex-1">
            <p className="truncate text-body text-ink">{suggestion.headline}</p>
            <p className="mt-0.5 text-[0.85rem] text-ink-subtle">
              {suggestion.reasons[0]}
            </p>
          </div>
          <span className="shrink-0 text-[0.85rem] text-ink-subtle" data-numeric>
            {suggestion.minutes}m
          </span>
        </li>
      ))}
    </ul>
  );
}
