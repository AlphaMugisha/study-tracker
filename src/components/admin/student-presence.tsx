"use client";

import {
  BookOpen,
  Coffee,
  Footprints,
  Home,
  Moon,
  PencilLine,
  Sparkles,
  Sunrise,
} from "lucide-react";

import { Eyebrow, Surface } from "@/components/shared/surface";
import { useTick } from "@/lib/hooks/use-tick";
import { describePresence, type Presence } from "@/lib/presence/describe";
import { clockIn, resolveNow } from "@/lib/timetable/resolve";
import type { ResolvedEntry } from "@/lib/timetable/types";
import { cn } from "@/lib/utils";

/**
 * Where she should be right now.
 *
 * Two facts, kept visually apart because they are different KINDS of fact:
 *
 *   The headline is DERIVED from her timetable. The app is confident about
 *   the timetable and knows nothing about the room, so it says "should be".
 *
 *   The footer is OBSERVED — when she last did something in StudyFlow. That
 *   is the only thing here the app actually witnessed.
 *
 * Merging the two would produce a sentence like "she is in Maths" that reads
 * as surveillance the app cannot perform and would be believed anyway. The
 * separation is the feature, not decoration.
 *
 * It ticks in HER timezone. A parent in another country looking at a card
 * resolved against their own clock is the exact bug this app already had once.
 */

const ICON = {
  moon: Moon,
  sunrise: Sunrise,
  walk: Footprints,
  book: BookOpen,
  coffee: Coffee,
  home: Home,
  pencil: PencilLine,
  star: Sparkles,
} as const;

const TONE = {
  lesson: { text: "text-lesson-ink", bar: "bg-lesson", soft: "bg-lesson/12" },
  brand: { text: "text-brand-ink", bar: "bg-brand", soft: "bg-brand/12" },
  revise: { text: "text-revise-ink", bar: "bg-revise", soft: "bg-revise/12" },
  pause: { text: "text-pause-ink", bar: "bg-pause", soft: "bg-pause/12" },
  muted: { text: "text-ink-subtle", bar: "bg-ink-subtle", soft: "bg-surface-raised" },
} as const;

export function StudentPresence({
  name,
  entries,
  timezone,
  studyUntilMinutes,
  settleMinutes,
  initial,
  lastSeen,
}: {
  name: string;
  entries: ResolvedEntry[];
  timezone: string;
  studyUntilMinutes: number;
  settleMinutes: number;
  /** Resolved on the server so the first paint is never empty. */
  initial: Presence;
  /** Already formatted server-side — see describeLastSeen. */
  lastSeen: string | null;
}) {
  const tick = useTick();

  // Before hydration, trust the server's answer rather than rendering a
  // different one a fraction of a second later.
  const presence =
    tick === null
      ? initial
      : (() => {
          const { minutes, dayOfWeek } = clockIn(timezone);
          return describePresence({
            state: resolveNow(entries, minutes, dayOfWeek),
            nowMinutes: minutes,
            dayOfWeek,
            studyUntilMinutes,
            settleMinutes,
          });
        })();

  const Icon = ICON[presence.icon];
  const tone = TONE[presence.tone];

  return (
    <Surface inset="roomy" size="md" className="flex h-full flex-col">
      <div className="flex items-start justify-between gap-5">
        <div>
          <Eyebrow tone="subtle">Right now · {name}</Eyebrow>
          <h3 className={cn("mt-4 text-headline font-semibold text-balance", tone.text)}>
            {presence.headline}
          </h3>
          {presence.detail ? (
            <p className="mt-3 max-w-[40ch] text-body text-ink-muted">{presence.detail}</p>
          ) : null}
        </div>

        <span
          className={cn(
            "grid size-14 shrink-0 place-items-center rounded-xl border border-border",
            tone.soft,
          )}
        >
          <Icon aria-hidden="true" className={cn("size-6", tone.text)} />
        </span>
      </div>

      {presence.endsInMinutes !== null && presence.endsInMinutes > 0 ? (
        <p className="mt-7 text-[0.95rem] text-ink-muted">
          <span className={cn("text-[1.6rem] font-semibold leading-none", tone.text)} data-numeric>
            {presence.endsInMinutes}
          </span>{" "}
          min until this changes
        </p>
      ) : null}

      <div className="mt-auto pt-8">
        <div className="h-px w-full bg-border" />
        <div className="mt-5 flex flex-wrap items-center justify-between gap-x-6 gap-y-2">
          <p className="text-[0.9rem] text-ink-subtle">
            {lastSeen ?? "No activity recorded yet"}
          </p>
          {presence.atSchool ? (
            <span className="text-[0.85rem] text-pause-ink">
              School mode — only adding homework is available to her
            </span>
          ) : null}
        </div>
        {/*
          The caveat, stated once and plainly. Without it this card looks like
          a location tracker, and a parent could reasonably act on it as one.
        */}
        <p className="mt-4 max-w-[58ch] text-[0.85rem] leading-relaxed text-ink-subtle">
          Worked out from her timetable and the time in {timezone.replace(/_/g, " ")} — StudyFlow
          cannot see where she actually is.
        </p>
      </div>
    </Surface>
  );
}
