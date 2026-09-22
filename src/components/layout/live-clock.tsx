"use client";

import { useSyncExternalStore } from "react";
import { Globe } from "lucide-react";

/**
 * The student's local time, in their own timezone.
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

export function LiveClock({ timezone }: { timezone: string }) {
  const tick = useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);

  const time =
    tick === null
      ? null
      : (() => {
          try {
            return new Intl.DateTimeFormat("en-GB", {
              hour: "2-digit",
              minute: "2-digit",
              hourCycle: "h23",
              timeZone: timezone,
            }).format(new Date());
          } catch {
            // An unrecognised timezone should not take the header down.
            return new Intl.DateTimeFormat("en-GB", {
              hour: "2-digit",
              minute: "2-digit",
              hourCycle: "h23",
            }).format(new Date());
          }
        })();

  // Just the city, not the whole IANA path.
  const place = timezone.split("/").pop()?.replace(/_/g, " ") ?? timezone;

  return (
    <span className="inline-flex items-center gap-2 text-[13px] text-ink-muted">
      <Globe aria-hidden="true" className="size-3.5 text-ink-subtle" />
      <span className="hidden sm:inline">{place}</span>
      <span className="font-medium text-ink" data-numeric>
        {time ?? "--:--"}
      </span>
    </span>
  );
}
