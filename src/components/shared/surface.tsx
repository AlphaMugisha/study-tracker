import { cn } from "@/lib/utils";

/**
 * The card primitive. Before this there were three separate panel
 * implementations -- one on Today, one on Plan, one inline on Homework -- that
 * had already drifted apart on padding and heading size.
 *
 * Separation is a hairline plus a surface step, never a shadow. On a dark
 * ground a drop shadow reads as smudge; the rule is what actually draws the
 * edge, so `interactive` brightens the rule rather than lifting the card.
 */
export function Surface({
  as: Tag = "section",
  interactive = false,
  inset = "normal",
  className,
  children,
  ...rest
}: {
  as?: "section" | "div" | "article" | "li";
  /** Adds the group hover treatment. Only for surfaces that are a link. */
  interactive?: boolean;
  inset?: "normal" | "tight" | "flush";
  className?: string;
  children: React.ReactNode;
} & React.HTMLAttributes<HTMLElement>) {
  return (
    <Tag
      className={cn(
        "rounded-xl border border-border bg-card",
        inset === "normal" && "p-5 sm:p-6",
        inset === "tight" && "p-4 sm:p-5",
        interactive &&
          "group/surface transition-colors duration-150 ease-out-flat hover:border-border-strong hover:bg-surface-raised",
        className,
      )}
      {...rest}
    >
      {children}
    </Tag>
  );
}

/**
 * The micro-label. 11px uppercase at 0.22em tracking -- the wide tracking is
 * what lets it read as a label instead of as shouting, and it is the only
 * uppercase in the product.
 */
export function Eyebrow({
  children,
  tone = "subtle",
  className,
}: {
  children: React.ReactNode;
  tone?: "subtle" | "accent";
  className?: string;
}) {
  return (
    <p
      className={cn(
        "text-eyebrow uppercase",
        tone === "accent" ? "text-indigo-ink" : "text-ink-subtle",
        className,
      )}
    >
      {children}
    </p>
  );
}

/**
 * A page block. `rhythm` is a token rather than a number each page picks, so
 * the vertical beat is identical everywhere -- which is what makes the space
 * itself read as structure rather than as a gap someone forgot to close.
 */
export function Block({
  className,
  children,
  ...rest
}: { className?: string; children: React.ReactNode } & React.HTMLAttributes<HTMLElement>) {
  return (
    <section className={cn("scroll-mt-20", className)} {...rest}>
      {children}
    </section>
  );
}

/**
 * Eyebrow + display heading + optional description and action. The heading is
 * set in the display scale, which is tight on both axes.
 */
export function BlockHeading({
  eyebrow,
  title,
  description,
  action,
  count,
  className,
}: {
  eyebrow?: React.ReactNode;
  title: React.ReactNode;
  description?: React.ReactNode;
  action?: React.ReactNode;
  count?: number;
  className?: string;
}) {
  return (
    <div
      className={cn(
        "mb-5 flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between sm:gap-6",
        className,
      )}
    >
      <div className="min-w-0">
        {eyebrow ? <Eyebrow tone="accent" className="mb-2.5">{eyebrow}</Eyebrow> : null}
        <h2 className="flex items-baseline gap-3 text-display font-semibold text-ink">
          {title}
          {typeof count === "number" ? (
            <span className="text-[0.9rem] font-medium text-ink-subtle" data-numeric>
              {count}
            </span>
          ) : null}
        </h2>
        {description ? (
          <p className="mt-2.5 max-w-[46ch] text-[15px] leading-relaxed text-ink-muted">
            {description}
          </p>
        ) : null}
      </div>
      {action ? <div className="flex shrink-0 gap-2">{action}</div> : null}
    </div>
  );
}

/** A hairline. Explicit, because rules now do the work shadows used to. */
export function Rule({ className }: { className?: string }) {
  return <hr className={cn("border-0 border-t border-border", className)} />;
}
