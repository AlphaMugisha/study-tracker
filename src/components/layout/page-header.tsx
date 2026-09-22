import { cn } from "@/lib/utils";

type PageHeaderProps = {
  /** Small line above the title, e.g. the date. Sentence case, not uppercase. */
  eyebrow?: React.ReactNode;
  title: React.ReactNode;
  description?: React.ReactNode;
  /** Right-aligned action slot; wraps beneath the title on mobile. */
  action?: React.ReactNode;
  className?: string;
};

export function PageHeader({
  eyebrow,
  title,
  description,
  action,
  className,
}: PageHeaderProps) {
  return (
    <header
      className={cn(
        "mb-8 flex flex-col gap-4 sm:mb-10 sm:flex-row sm:items-end sm:justify-between",
        className,
      )}
    >
      <div className="min-w-0">
        {eyebrow ? (
          <p className="mb-1.5 text-sm text-ink-muted">{eyebrow}</p>
        ) : null}
        <h1 className="text-display font-semibold text-ink">{title}</h1>
        {description ? (
          <p className="mt-2 max-w-prose text-[15px] leading-6 text-ink-muted">
            {description}
          </p>
        ) : null}
      </div>
      {action ? <div className="flex shrink-0 gap-2">{action}</div> : null}
    </header>
  );
}

/** Section heading inside a page. One level down from PageHeader. */
export function SectionHeader({
  title,
  action,
  className,
}: {
  title: React.ReactNode;
  action?: React.ReactNode;
  className?: string;
}) {
  return (
    <div className={cn("mb-4 flex items-baseline justify-between gap-4", className)}>
      <h2 className="text-lg font-semibold text-ink">{title}</h2>
      {action}
    </div>
  );
}

/** The small uppercase label above a card's content. The only uppercase we use. */
export function Eyebrow({
  children,
  className,
}: {
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <p className={cn("text-eyebrow uppercase text-ink-subtle", className)}>
      {children}
    </p>
  );
}
