import Link from "next/link";

import { cn } from "@/lib/utils";

export type ItemAccent = "brand" | "lesson" | "revise" | "pause" | "danger" | "none";

const ACCENT = {
  brand: { dot: "bg-brand", hover: "group-hover/item:text-brand-ink", edge: "group-hover/item:border-brand/40" },
  lesson: { dot: "bg-lesson", hover: "group-hover/item:text-lesson-ink", edge: "group-hover/item:border-lesson/40" },
  revise: { dot: "bg-revise", hover: "group-hover/item:text-revise-ink", edge: "group-hover/item:border-revise/40" },
  pause: { dot: "bg-pause", hover: "group-hover/item:text-pause-ink", edge: "group-hover/item:border-pause/40" },
  danger: { dot: "bg-danger", hover: "group-hover/item:text-danger", edge: "group-hover/item:border-danger/40" },
  none: { dot: "bg-ink-subtle", hover: "", edge: "" },
} as const;

/**
 * One item in a list, as a card.
 *
 * Every list in StudyFlow was a row: a fixed-width gutter, a dot, a label, a
 * trailing value. That reads as a spreadsheet, and worse, it gave no visual
 * difference between a row you can open and a row that is just information.
 *
 * This is one component so the lists cannot drift apart — homework, the
 * timetable, revision, due-soon and the activity feed all had their own
 * near-identical row markup, each with slightly different padding and text
 * sizes. Changing the look meant changing six files and missing one.
 *
 * A card with no `href` renders as a plain block with no hover affordance:
 * pretending everything is clickable is the failure mode this replaces.
 */
export function ItemCard({
  href,
  accent = "none",
  lead,
  title,
  meta,
  trailing,
  footer,
  active = false,
  muted = false,
  dense = false,
  index = 0,
  className,
}: {
  href?: string | null;
  accent?: ItemAccent;
  /** Small leading value — a time, usually. Set in tabular numerals. */
  lead?: React.ReactNode;
  title: React.ReactNode;
  /** Secondary line under the title. */
  meta?: React.ReactNode;
  /** Top-right slot: a duration, a badge. */
  trailing?: React.ReactNode;
  /** Bottom slot, below a rule — actions, extra badges. */
  footer?: React.ReactNode;
  active?: boolean;
  muted?: boolean;
  /**
   * One line instead of two: time, dot, label and trailing value side by side.
   *
   * The stacked card is right for a grid of two or three across, where each
   * one has room to breathe. In a narrow column it is mostly air — a card tall
   * enough for a paragraph holding "Short break", five of which fill a screen
   * that could have shown fifteen. A chronological list is read by scanning
   * down the times, and that is easier the closer together they are.
   */
  dense?: boolean;
  /** Drives the entrance stagger. */
  index?: number;
  className?: string;
}) {
  const a = ACCENT[accent];
  const interactive = Boolean(href);

  const shell = cn(
    "group/item flex rounded-xl border border-border",
    "transition-[transform,box-shadow,border-color,background-color] duration-200 ease-out-flat",
    dense ? "items-center gap-3 px-4 py-3" : "h-full flex-col p-5",
    muted ? "bg-transparent" : "bg-surface-sunken shadow-card",
    // The lift is a card gesture. On a row it drags the whole list upward one
    // line at a time, which reads as the list twitching rather than as hover.
    interactive &&
      (dense
        ? "hover:bg-surface-raised"
        : "hover:-translate-y-1 hover:bg-surface-raised hover:shadow-card-hover"),
    interactive && a.edge,
    active && "border-brand/60 bg-brand-soft",
    className,
  );

  const denseBody = (
    <>
      {lead ? (
        <span
          className={cn(
            "shrink-0 text-[0.95rem] font-semibold tracking-[-0.02em]",
            muted ? "text-ink-subtle" : "text-ink",
          )}
          data-numeric
        >
          {lead}
        </span>
      ) : null}

      {accent !== "none" ? (
        <span aria-hidden="true" className={cn("size-2 shrink-0 rounded-full", a.dot)} />
      ) : null}

      <div className="min-w-0 flex-1">
        <p
          className={cn(
            "truncate text-body font-medium transition-colors duration-150 ease-out-flat",
            muted ? "text-ink-muted" : "text-ink",
            interactive && a.hover,
          )}
        >
          {title}
        </p>
        {meta ? (
          <div className="mt-0.5 flex min-w-0 flex-wrap items-center gap-x-3 text-[0.8rem] text-ink-subtle">
            {meta}
          </div>
        ) : null}
      </div>

      {trailing ? (
        <span className="shrink-0 text-right tabular-nums">{trailing}</span>
      ) : null}
    </>
  );

  const stackedBody = (
    <>
      {lead || trailing ? (
        <div className="mb-4 flex items-baseline justify-between gap-3">
          {lead ? (
            <span
              className={cn(
                "text-[1.05rem] font-semibold tracking-[-0.02em]",
                muted ? "text-ink-subtle" : "text-ink",
              )}
              data-numeric
            >
              {lead}
            </span>
          ) : (
            <span />
          )}
          {trailing ? <span className="shrink-0">{trailing}</span> : null}
        </div>
      ) : null}

      <div className="flex min-w-0 flex-1 items-start gap-2.5">
        {accent !== "none" ? (
          <span
            aria-hidden="true"
            className={cn("mt-[0.45rem] size-2 shrink-0 rounded-full", a.dot)}
          />
        ) : null}
        <div className="min-w-0 flex-1">
          <p
            className={cn(
              "text-body font-medium transition-colors duration-150 ease-out-flat",
              muted ? "text-ink-muted" : "text-ink",
              interactive && a.hover,
            )}
          >
            {title}
          </p>
          {meta ? (
            <div className="mt-1.5 flex flex-wrap items-center gap-x-3 gap-y-1 text-[0.9rem] text-ink-subtle">
              {meta}
            </div>
          ) : null}
        </div>
      </div>

      {footer ? (
        <div className="mt-4 flex flex-wrap items-center gap-2 border-t border-border pt-4">
          {footer}
        </div>
      ) : null}
    </>
  );

  const body = dense ? denseBody : stackedBody;
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

/**
 * The grid every list sits in.
 *
 * Container queries, not viewport ones: these lists appear in dashboard grid
 * columns (~435–590px), in full-width blocks, and inside dialogs. What matters
 * is the width of the list's own box, which `@container` asks and `md:` cannot.
 */
export function ItemGrid({
  children,
  dense = false,
  className,
}: {
  children: React.ReactNode;
  /**
   * A single tight column, for `dense` cards.
   *
   * Deliberately not two across even when there is room: these lists are in
   * time order, and columns turn reading down a day into reading down half a
   * day and then jumping back up. The density comes from the rows being one
   * line tall, not from folding the order in half.
   */
  dense?: boolean;
  className?: string;
}) {
  return (
    <div className="@container">
      <ul
        className={cn(
          "grid grid-cols-1",
          dense ? "gap-1.5" : "gap-3 @md:grid-cols-2 @3xl:grid-cols-3",
          className,
        )}
      >
        {children}
      </ul>
    </div>
  );
}
