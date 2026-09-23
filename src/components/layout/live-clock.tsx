"use client";

import { useSyncExternalStore } from "react";
import { Globe } from "lucide-react";

/**
 * The student's local date and time, in their own timezone.
 *
 * Small on its own, but it is the visible proof that StudyFlow knows which
 * clock it is working from — the same `profiles.timezone` the timetable engine
 * will resolve "now" against in Phase 3B.
 *
 * The wall clock is an external mutable source, so it is read with
 * `useSyncExternalStore` rather than a state-plus-effect. The server snapshot
 * is `null`, which renders a placeholder and sidesteps the guaranteed
 * hydration mismatch of rendering a time on both sides.
 */

/** Bucketed so the snapshot is referentially stable between ticks. */
const BUCKET_MS = 15_000;

function subscribe(onChange: () => void) {
  const id = setInterval(onChange, BUCKET_MS);
  return () => clearInterval(id);
}

const getSnapshot = () => Math.floor(Date.now() / BUCKET_MS);
const getServerSnapshot = () => null;

export function LiveClock({
  timezone,
  /**
   * A second clock, labelled. A parent's own time is rarely the question —
   * "what time is it where she is" is — so when the two differ, both are
   * shown. When they are the same zone, a second identical clock would be
   * noise, so it is not rendered.
   */
  alongside,
}: {
  timezone: string;
  alongside?: { label: string; timezone: string } | null;
}) {
  const tick = useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);

  const parts =
    tick === null
      ? null
      : (() => {
          const opts = { hourCycle: "h23" as const };
          const build = (tz?: string) => ({
            time: new Intl.DateTimeFormat("en-GB", {
              ...opts,
              hour: "2-digit",
              minute: "2-digit",
              timeZone: tz,
            }).format(new Date()),
            date: new Intl.DateTimeFormat("en-GB", {
              weekday: "short",
              day: "numeric",
              month: "short",
              timeZone: tz,
            }).format(new Date()),
          });
          try {
            return build(timezone);
          } catch {
            // An unrecognised timezone should not take the header down.
            return build(undefined);
          }
        })();

  // Just the city, not the whole IANA path.
  const place = timezone.split("/").pop()?.replace(/_/g, " ") ?? timezone;

  const other =
    alongside && alongside.timezone !== timezone && tick !== null
      ? (() => {
          try {
            return new Intl.DateTimeFormat("en-GB", {
              hour: "2-digit",
              minute: "2-digit",
              hourCycle: "h23",
              timeZone: alongside.timezone,
            }).format(new Date());
          } catch {
            return null;
          }
        })()
      : null;

  return (
    <span className="inline-flex items-center gap-2.5 text-[0.85rem] text-ink-muted">
      <Globe aria-hidden="true" className="size-4 shrink-0 text-ink-subtle" />
      {/* The date only appears where there is room. On the dashboard it is
          already the page's eyebrow; everywhere else this is the only place
          that answers "what day is it". */}
      <span className="hidden xl:inline" title={place}>
        {parts?.date ?? "---"}
      </span>
      <span className="font-medium text-ink" data-numeric title={place}>
        {parts?.time ?? "--:--"}
      </span>

      {other && alongside ? (
        <>
          <span aria-hidden="true" className="text-ink-subtle">
            ·
          </span>
          <span className="inline-flex items-center gap-1.5" title={alongside.timezone}>
            <span className="hidden text-ink-subtle sm:inline">{alongside.label}</span>
            <span className="font-medium text-lesson-ink" data-numeric>
              {other}
            </span>
          </span>
        </>
      ) : null}
    </span>
  );
}
