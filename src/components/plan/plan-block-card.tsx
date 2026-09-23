import Link from "next/link";

import type { PlanBlock } from "@/lib/planner/build-plan";
import { cn } from "@/lib/utils";

const KIND = {
  homework: {
    dot: "bg-lesson",
    ring: "group-hover/block:border-lesson/50",
    title: "group-hover/block:text-lesson-ink",
  },
  revision: {
    dot: "bg-revise",
    ring: "group-hover/block:border-revise/50",
    title: "group-hover/block:text-revise-ink",
  },
  break: {
    dot: "bg-pause",
    ring: "group-hover/block:border-pause/40",
    title: "",
  },
} as const;

/**
 * One block of the evening, as a card.
 *
 * It was a table row: a time in a gutter, a dot, a label, a duration. Legible,
 * but nine of them read as a wall of rows and there was nothing to tell you
 * which ones you could act on.
 *
 * A break is deliberately quieter than work — dimmer, no hover, not a link.
 * Fifteen minutes off is part of the plan but it is not a thing you open, and
 * giving it the same weight as an essay makes the essay harder to find.
 */
export function PlanBlockCard({
  block,
  active = false,
  index = 0,
}: {
  block: PlanBlock;
  /** The task a study session is currently running against. */
  active?: boolean;
  /** Drives the entrance stagger. */
  index?: number;
}) {
  const kind = KIND[block.kind];
  const isBreak = block.kind === "break";
  const href = block.taskId ? `/homework#${block.taskId}` : null;

  const body = (
    <>
      <div className="flex items-baseline justify-between gap-3">
        <span
          className={cn(
            "text-[1.05rem] font-semibold tracking-[-0.02em] tabular-nums",
            isBreak ? "text-ink-subtle" : "text-ink",
          )}
          data-numeric
        >
          {block.startLabel}
        </span>
        <span className="shrink-0 text-[0.85rem] text-ink-subtle" data-numeric>
          {block.minutes} min
        </span>
      </div>

      <div className="mt-4 flex items-start gap-2.5">
        <span
          aria-hidden="true"
          className={cn("mt-[0.45rem] size-2 shrink-0 rounded-full", kind.dot)}
        />
        <div className="min-w-0 flex-1">
          <p
            className={cn(
              "text-body font-medium transition-colors duration-150 ease-out-flat",
              isBreak ? "text-ink-muted" : "text-ink",
              kind.title,
            )}
          >
            {block.label}
            {block.part ? (
              <span className="ml-2 text-[0.8rem] font-normal text-ink-subtle">
                part {block.part.index} of {block.part.total}
              </span>
            ) : null}
          </p>
          {block.detail ? (
            <p className="mt-1 truncate text-[0.9rem] text-ink-subtle">{block.detail}</p>
          ) : null}
        </div>
      </div>
    </>
  );

  const shell = cn(
    "group/block flex h-full flex-col rounded-xl border p-5",
    "transition-[transform,box-shadow,border-color,background-color] duration-200 ease-out-flat",
    isBreak
      ? "border-dashed border-border bg-transparent"
      : "border-border bg-surface-sunken shadow-card",
    // A break is not something you open, so it does not pretend to be.
    !isBreak && "hover:-translate-y-1 hover:bg-surface-raised hover:shadow-card-hover",
    !isBreak && kind.ring,
    active && "border-brand/60 bg-brand-soft",
  );

  // The stagger is per-card and capped, so a long evening does not end with
  // the last card arriving a second and a half late.
  const style = { animationDelay: `${Math.min(index, 8) * 45}ms` } as const;

  if (!href) {
    return (
      <li className={cn(shell, "sf-rise")} style={style}>
        {body}
      </li>
    );
  }

  return (
    <li className="sf-rise" style={style}>
      <Link href={href} className={shell}>
        {body}
      </Link>
    </li>
  );
}
