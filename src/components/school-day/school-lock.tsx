"use client";

import Link from "next/link";
import { GraduationCap, Lock } from "lucide-react";

import { useSchoolDay } from "@/components/school-day/school-day-provider";
import { Button } from "@/components/ui/button";
import { formatDuration } from "@/lib/timetable/types";
import { cn } from "@/lib/utils";

/**
 * School mode.
 *
 * While she is at school the app collapses to one thing: writing down the
 * homework she has just been given. Everything else — planning the evening,
 * editing the timetable, ticking things off — is for later, and having it all
 * available during a lesson is an invitation to spend the lesson in here.
 *
 * "At school" is first bell to last, breaks included. Lifting the lock every
 * break would lift it most of the day.
 *
 * It never applies to a support account. The provider decides that; this
 * component only renders what it is told.
 */

/** The strip that explains why the rest of the app is unavailable. */
export function SchoolLockBanner() {
  const day = useSchoolDay();
  if (!day?.locked) return null;

  const { state } = day;
  const current =
    state.kind === "in_activity"
      ? state.current.label
      : state.kind === "gap"
        ? "a free moment"
        : null;
  const remaining = state.kind === "in_activity" ? state.remainingMinutes : null;

  return (
    <div className="mb-rhythm rounded-xl border border-lesson/40 bg-lesson-soft p-6 sm:p-7">
      <div className="flex flex-col gap-5 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-start gap-4">
          <GraduationCap aria-hidden="true" className="mt-0.5 size-6 shrink-0 text-lesson" />
          <div className="min-w-0">
            <p className="text-section text-ink">You&apos;re at school.</p>
            <p className="mt-2 max-w-[56ch] text-[0.95rem] leading-relaxed text-ink-muted">
              {current ? (
                <>
                  Currently <span className="font-medium text-lesson-ink">{current}</span>
                  {remaining !== null ? (
                    <>
                      , <span data-numeric>{formatDuration(remaining)}</span> left
                    </>
                  ) : null}
                  . Only writing down homework is available until the last bell —
                  everything else unlocks when you get home.
                </>
              ) : (
                <>
                  Only writing down homework is available until the last bell.
                  Everything else unlocks when you get home.
                </>
              )}
            </p>
          </div>
        </div>

        <Button asChild size="lg" className="shrink-0">
          <Link href="/homework?new=1">Write down homework</Link>
        </Button>
      </div>
    </div>
  );
}

/**
 * Wraps anything that should be unavailable during school.
 *
 * It dims and disables rather than hiding: removing the evening plan entirely
 * would read as "it's gone", where a locked panel reads as "not now". The
 * `inert` attribute is what actually stops interaction — pointer-events alone
 * still leaves every control reachable by keyboard.
 */
export function SchoolLocked({
  children,
  label = "Available after school",
  className,
}: {
  children: React.ReactNode;
  label?: string;
  className?: string;
}) {
  const locked = useSchoolDay()?.locked ?? false;

  if (!locked) return <>{children}</>;

  return (
    <div className={cn("relative", className)}>
      <div
        // @ts-expect-error -- `inert` is valid HTML; React's types lag on it.
        inert=""
        aria-hidden="true"
        className="pointer-events-none select-none opacity-25 blur-[1px]"
      >
        {children}
      </div>

      <div className="absolute inset-0 flex items-center justify-center">
        <p className="inline-flex items-center gap-2.5 rounded-full border border-border bg-card px-5 py-2.5 text-[0.9rem] font-medium text-ink-muted shadow-card">
          <Lock aria-hidden="true" className="size-4 text-lesson" />
          {label}
        </p>
      </div>
    </div>
  );
}
