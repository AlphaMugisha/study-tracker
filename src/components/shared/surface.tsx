import { cn } from "@/lib/utils";

/**
 * The card primitive, and the whole card design system in one place: radius,
 * border, elevation, padding, hover and float all resolve here so no card can
 * drift from the others.
 *
 * Elevation is layered rather than a single blur — see `--shadow-card`. On a
 * dark ground one black blur reads as smudge; the inset top highlight is what
 * actually makes a card look lit from above.
 *
 * `float` and `interactive` deliberately do not both animate transform. The
 * float keyframe owns `transform`, so a hover that also translates would fight
 * it and twitch; floating cards express hover through elevation and border
 * only. That constraint is why `lift` is a separate opt-in.
 */
export function Surface({
  as: Tag = "section",
  interactive = false,
  lift = false,
  float,
  elevation = "card",
  size = "auto",
  inset = "normal",
  className,
  children,
  ...rest
}: {
  as?: "section" | "div" | "article" | "li";
  /** Hover treatment: brighter rule, deeper shadow, raised fill. */
  interactive?: boolean;
  /** Adds an upward translate on hover. Never combine with `float`. */
  lift?: boolean;
  /** Slow vertical drift. Three variants so cards don't move in lockstep. */
  float?: "a" | "b" | "c";
  elevation?: "none" | "card" | "hero";
  /** Minimum heights, so a sparse card still holds its share of the grid. */
  size?: "auto" | "md" | "lg" | "xl";
  inset?: "normal" | "tight" | "roomy" | "flush";
  className?: string;
  children: React.ReactNode;
} & React.HTMLAttributes<HTMLElement>) {
  return (
    <Tag
      className={cn(
        "rounded-xl border border-border bg-card",
        "transition-[box-shadow,border-color,background-color,transform] duration-300 ease-out-flat",

        elevation === "card" && "shadow-card",
        elevation === "hero" && "shadow-hero",

        inset === "flush" && "p-0",
        inset === "tight" && "p-5 sm:p-6",
        inset === "normal" && "p-7 sm:p-9",
        inset === "roomy" && "p-8 sm:p-11 lg:p-12",

        size === "md" && "min-h-[15rem]",
        size === "lg" && "min-h-[19rem]",
        size === "xl" && "min-h-[24rem]",

        interactive && [
          "group/surface hover:border-border-strong hover:bg-surface-raised",
          elevation !== "none" && "hover:shadow-card-hover",
          lift && !float && "hover:-translate-y-1",
        ],

        float === "a" && "float-a",
        float === "b" && "float-b",
        float === "c" && "float-c",

        className,
      )}
      {...rest}
    >
      {children}
    </Tag>
  );
}

/**
 * The micro-label. Uppercase at 0.22em tracking — the wide tracking is what
 * lets it read as a label instead of as shouting, and it is the only uppercase
 * in the product.
 */
export type Accent = "brand" | "lesson" | "revise" | "pause" | "danger" | "subtle";

const ACCENT_TEXT: Record<Accent, string> = {
  brand: "text-brand-ink",
  lesson: "text-lesson-ink",
  revise: "text-revise-ink",
  pause: "text-pause-ink",
  danger: "text-danger",
  subtle: "text-ink-subtle",
};

export function Eyebrow({
  children,
  tone = "subtle",
  className,
}: {
  children: React.ReactNode;
  /** `accent` is an alias for brand, kept so existing callers still read well. */
  tone?: Accent | "accent";
  className?: string;
}) {
  const key: Accent = tone === "accent" ? "brand" : tone;
  return (
    <p className={cn("text-eyebrow uppercase", ACCENT_TEXT[key], className)}>
      {children}
    </p>
  );
}

/**
 * A page block. `rhythm` is a token rather than a number each page picks, so
 * the vertical beat is identical everywhere — which is what makes the space
 * itself read as structure rather than as a gap someone forgot to close.
 */
export function Block({
  className,
  children,
  ...rest
}: { className?: string; children: React.ReactNode } & React.HTMLAttributes<HTMLElement>) {
  return (
    <section className={cn("scroll-mt-24", className)} {...rest}>
      {children}
    </section>
  );
}

/** Eyebrow + display heading + optional description and action. */
export function BlockHeading({
  eyebrow,
  tone = "brand",
  title,
  description,
  action,
  count,
  className,
}: {
  eyebrow?: React.ReactNode;
  /** Colour of the eyebrow. Varying it per section gives the page colour
   *  down its length rather than one accent repeated. */
  tone?: Accent;
  title: React.ReactNode;
  description?: React.ReactNode;
  action?: React.ReactNode;
  count?: number;
  className?: string;
}) {
  return (
    <div
      className={cn(
        "mb-8 flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between sm:gap-8",
        className,
      )}
    >
      <div className="min-w-0">
        {eyebrow ? <Eyebrow tone={tone} className="mb-4">{eyebrow}</Eyebrow> : null}
        <h2 className="flex items-baseline gap-4 text-display font-semibold text-balance text-ink">
          {title}
          {typeof count === "number" ? (
            <span className="text-[1.05rem] font-medium text-ink-subtle" data-numeric>
              {count}
            </span>
          ) : null}
        </h2>
        {description ? (
          <p className="mt-4 max-w-[48ch] text-body text-ink-muted">{description}</p>
        ) : null}
      </div>
      {action ? <div className="flex shrink-0 gap-3">{action}</div> : null}
    </div>
  );
}

/** A hairline. */
export function Rule({ className }: { className?: string }) {
  return <hr className={cn("border-0 border-t border-border", className)} />;
}
