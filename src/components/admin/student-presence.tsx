"use client";

import {
  BookOpen,
  CalendarOff,
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
import { minutesToLabel, type ResolvedEntry } from "@/lib/timetable/types";
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
 * Everything ticks in HER timezone, including the clock in the corner. A
 * parent in another country reading a card resolved against their own clock
 * is the exact bug this app already shipped once.
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
  muted: { text: "text-ink-muted", bar: "bg-ink-subtle", soft: "bg-surface-raised" },
} as const;

export function StudentPresence({
  name,
  entries,
  timezone,
  studyUntilMinutes,
  settleMinutes,
  initial,
  initialNowMinutes,
  lastSeen,
}: {
  name: string;
  entries: ResolvedEntry[];
  timezone: string;
  studyUntilMinutes: number;
  settleMinutes: number;
  /** Resolved on the server so the first paint is never empty. */
  initial: Presence;
  initialNowMinutes: number;
  /** Already formatted server-side — see describeLastSeen. */
  lastSeen: string | null;
}) {
  const tick = useTick();

  // Before hydration, trust the server's answer rather than rendering a
  // different one a fraction of a second later.
  const live =
    tick === null
      ? { presence: initial, nowMinutes: initialNowMinutes }
      : (() => {
          const { minutes, dayOfWeek } = clockIn(timezone);
          return {
            nowMinutes: minutes,
            presence: describePresence({
              state: resolveNow(entries, minutes, dayOfWeek),
              nowMinutes: minutes,
              dayOfWeek,
              studyUntilMinutes,
              settleMinutes,
            }),
          };
        })();

  const { presence } = live;
  const Icon = presence.known ? ICON[presence.icon] : CalendarOff;
  const tone = TONE[presence.tone];

  return (
    <Surface inset="roomy" className="flex h-full flex-col">
      <div className="flex items-start justify-between gap-6">
        <Eyebrow tone="subtle">Right now · {name}</Eyebrow>

        {/*
          Her clock, in the corner of the card that describes her day. A time
          is the one thing on here that needs no caveat, and it keeps the card
          alive even in the states where the app has nothing to say.
        */}
        <div className="flex shrink-0 items-center gap-3.5">
          <div className="text-right">
            <p
              className="text-[1.5rem] font-semibold leading-none tracking-[-0.03em] text-ink"
              data-numeric
            >
              {minutesToLabel(live.nowMinutes)}
            </p>
            <p className="mt-1.5 text-[0.8rem] text-ink-subtle">her time</p>
          </div>
          <span
            className={cn(
              "grid size-12 place-items-center rounded-xl border border-border",
              tone.soft,
            )}
          >
            <Icon aria-hidden="true" className={cn("size-5", tone.text)} />
          </span>
        </div>
      </div>

      {/*
        The headline scales to what it IS. A real status is the loudest thing
        on the page; "No timetable saved" is an absence, and setting an absence
        in display type makes the app look like it is shouting about nothing.
      */}
      <h3
        className={cn(
          "mt-6 font-semibold text-balance",
          presence.known
            ? cn("text-display", tone.text)
            : "text-[1.4rem] leading-snug tracking-[-0.02em] text-ink-muted",
        )}
      >
        {presence.headline}
      </h3>

      {presence.detail ? (
        <p className="mt-3 max-w-[44ch] text-body text-ink-muted">{presence.detail}</p>
      ) : null}

      {/* A countdown alone does not say whether 24 minutes is most of the
          lesson or the tail of it. The bar does. */}
      {presence.endsInMinutes !== null && presence.endsInMinutes > 0 ? (
        <div className="mt-7">
          {presence.progress !== null ? (
            <div
              className="h-1.5 w-full overflow-hidden rounded-full bg-surface-sunken"
              role="presentation"
            >
              <div
                className={cn("h-full rounded-full transition-[width] duration-700 ease-out-flat", tone.bar)}
                style={{ width: `${Math.round(presence.progress * 100)}%` }}
              />
            </div>
          ) : null}
          <p className={cn("text-[0.95rem] text-ink-muted", presence.progress !== null && "mt-3.5")}>
            <span
              className={cn("text-[1.4rem] font-semibold leading-none", tone.text)}
              data-numeric
            >
              {presence.endsInMinutes}
            </span>{" "}
            min until this changes
          </p>
        </div>
      ) : null}

      <div className="mt-auto pt-9">
        <div className="h-px w-full bg-border" />
        <div className="mt-5 flex flex-wrap items-center justify-between gap-x-6 gap-y-2.5">
          <p className="text-[0.9rem] text-ink-subtle">
            {lastSeen ?? "No activity recorded yet"}
          </p>
          {presence.atSchool ? (
            <span className="rounded-full border border-pause/40 bg-pause/10 px-3 py-1 text-[0.8rem] text-pause-ink">
              School mode — she can only add homework
            </span>
          ) : null}
        </div>
        {/*
          The caveat, stated once and plainly. Without it this card looks like
          a location tracker, and a parent could reasonably act on it as one.
          Dropped when there is no timetable, because then nothing was worked
          out and the sentence would be describing a calculation that did not
          happen.
        */}
        {presence.known ? (
          <p className="mt-3.5 max-w-[60ch] text-[0.85rem] leading-relaxed text-ink-subtle">
            Worked out from her timetable — StudyFlow cannot see where she actually is.
          </p>
        ) : null}
      </div>
    </Surface>
  );
}
