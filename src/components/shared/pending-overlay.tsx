"use client";

import { useEffect, useState, useSyncExternalStore } from "react";
import { createPortal, useFormStatus } from "react-dom";

import { stageFor, type PendingStage } from "@/lib/pending-stage";
import { cn } from "@/lib/utils";

/**
 * The page goes soft and a spinner takes over until the work is done.
 *
 * ---------------------------------------------------------------------------
 * Written for the one operation here that is genuinely slow: reading a
 * timetable takes twenty to sixty seconds, and on a busy free tier it can take
 * two minutes. A disabled button with a changed label is honest for an
 * operation that takes a moment. It is not honest for one that takes a minute
 * — at that length the page looks broken, people click again, and the second
 * click is the one that makes it actually break.
 *
 * Three decisions worth keeping.
 *
 * It counts. An elapsed seconds readout is the only part of this that is
 * guaranteed to move: it is driven by a timer rather than by CSS, so it still
 * works under `prefers-reduced-motion`, where the global rule in globals.css
 * reduces every animation on the page to a single 0.01ms iteration — which
 * would leave a purely animated spinner frozen mid-turn, the exact picture of
 * a hung page that this component exists to avoid.
 *
 * It talks. A spinner that says the same thing at five seconds and at ninety
 * is withholding what the person actually wants to know, which is whether to
 * keep waiting. The stages are for saying that the slowness is expected, and
 * later that it is the free tier rather than them.
 *
 * It blocks. The backdrop covers the page, so the form underneath cannot be
 * resubmitted by an impatient second click.
 * ---------------------------------------------------------------------------
 */

export function PendingOverlay({
  active,
  title,
  stages = [],
  delayMs = 350,
}: {
  active: boolean;
  /** What is happening, in the present tense: "Reading the timetable". */
  title: string;
  /** Reassurance that arrives as the wait gets long. Ordered by `after`. */
  stages?: PendingStage[];
  /**
   * How long the work has to run before the overlay appears at all.
   *
   * An operation that finishes in two hundred milliseconds does not need
   * announcing, and covering the page for one frame to say so is worse than
   * saying nothing: it reads as a flicker, or as a bug. The wait this was
   * built for takes half a minute, so the delay costs it nothing — it is here
   * so the component is safe to put on the quick forms too.
   */
  delayMs?: number;
}) {
  /*
    Has this hydrated yet?

    `document` does not exist during the server render, so the portal cannot
    be created there. The usual `useState(false)` plus an effect that flips it
    is a setState inside an effect; `useSyncExternalStore` is what replaces
    that — subscribing to nothing, it returns the server snapshot (false)
    through hydration and the client one (true) afterwards.
  */
  const mounted = useSyncExternalStore(subscribeToNothing, () => true, () => false);

  useEffect(() => {
    if (!active) return;

    // The page behind is inert while this is up; letting it scroll under a
    // fixed overlay reads as the blur sliding off the content.
    const previous = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = previous;
    };
  }, [active]);

  if (!active || !mounted) return null;

  return createPortal(<Curtain title={title} stages={stages} delayMs={delayMs} />, document.body);
}

/**
 * Everything visible, in a child that only exists while the work is running.
 *
 * Same reasoning as the clock below: the parent renders nothing at all when
 * idle, so this unmounts between runs and every piece of state in here starts
 * from its initial value on the next one. Nothing has to be reset by hand,
 * which is what keeps the delay honest — it is a fresh delay each time rather
 * than one that has already elapsed.
 */
function Curtain({
  title,
  stages,
  delayMs,
}: {
  title: string;
  stages: PendingStage[];
  delayMs: number;
}) {
  const [shown, setShown] = useState(false);

  useEffect(() => {
    const timer = setTimeout(() => setShown(true), delayMs);
    return () => clearTimeout(timer);
  }, [delayMs]);

  if (!shown) return null;

  return (
    <div
      // `status` rather than `alertdialog`: this announces itself once and
      // then updates politely, which is what a progress report is. An alert
      // would interrupt whatever the screen reader was saying.
      role="status"
      aria-live="polite"
      aria-busy="true"
      className={cn(
        "fixed inset-0 z-50 grid place-items-center p-6",
        /*
          Darken as well as blur. On this ground a blur alone lifts the page
          rather than pushing it back, and the card stops reading as nearer.
          The blur is behind a support query, matching the dialog primitive:
          where backdrop-filter is unavailable the scrim still does the work,
          rather than leaving a transparent sheet over a legible page.
        */
        "bg-background/75 supports-backdrop-filter:backdrop-blur-md",
        "animate-in fade-in duration-200",
      )}
    >
      <div className="flex max-w-[22rem] flex-col items-center rounded-xl border border-border bg-card px-8 py-9 text-center shadow-hero">
        <Spinner />

        <p className="mt-6 text-body font-medium text-ink">{title}</p>

        {/*
          The clock lives in its own component so that it starts at zero by
          construction. This overlay renders nothing at all while idle, so the
          child unmounts between runs and its `useState(0)` is the reset —
          no stale count to clear, and nothing to reset on the way in.
        */}
        <Progress stages={stages} />
      </div>
    </div>
  );
}

/**
 * Seconds elapsed, and the reassurance that belongs to this point in the wait.
 *
 * The seconds are the honest part. Every animation on the page is reduced to
 * a single 0.01ms iteration under `prefers-reduced-motion` — the rule at the
 * foot of globals.css — so for those users the ring above is frozen and this
 * counter is the only thing on screen still saying the page is alive.
 */
function Progress({ stages }: { stages: PendingStage[] }) {
  const [elapsed, setElapsed] = useState(0);

  useEffect(() => {
    const started = Date.now();
    const tick = setInterval(
      () => setElapsed(Math.floor((Date.now() - started) / 1000)),
      1000,
    );
    return () => clearInterval(tick);
  }, []);

  const stage = stageFor(stages, elapsed);

  return (
    <>
      <p className="mt-2 text-[0.85rem] tabular-nums text-ink-subtle" data-numeric>
        {elapsed}s
      </p>

      {stage ? (
        <p className="mt-4 text-[0.85rem] leading-relaxed text-ink-muted">{stage.text}</p>
      ) : null}
    </>
  );
}

/** There is nothing to subscribe to; the two snapshots carry all the meaning. */
function subscribeToNothing() {
  return () => {};
}

/** Reads the enclosing form's state. Must be rendered inside that `<form>`. */
export function FormPendingOverlay(props: Omit<React.ComponentProps<typeof PendingOverlay>, "active">) {
  const { pending } = useFormStatus();
  return <PendingOverlay active={pending} {...props} />;
}

/**
 * Two rings: a faint track and a bright arc turning over it.
 *
 * Drawn in `border` rather than as an SVG so the arc inherits the same border
 * tokens as everything else. Under reduced motion it stops turning, which is
 * why it is never the only thing moving on screen — the seconds below it are.
 */
function Spinner() {
  return (
    <span
      aria-hidden="true"
      className="size-9 animate-spin rounded-full border-2 border-border border-t-brand-ink"
      style={{ animationDuration: "900ms" }}
    />
  );
}
