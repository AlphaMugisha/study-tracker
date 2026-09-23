import { Eyebrow } from "@/components/shared/surface";
import { RevealWords } from "@/components/shared/reveal";
import { cn } from "@/lib/utils";

type PageHeaderProps = {
  /** Wide-tracked micro-label above the statement. */
  eyebrow?: React.ReactNode;
  /**
   * The page's opening statement. Pass a string to get the word-by-word
   * entrance; pass a node when the headline needs its own markup.
   */
  title: React.ReactNode;
  description?: React.ReactNode;
  /** Right-aligned action slot; wraps beneath the statement on mobile. */
  action?: React.ReactNode;
  className?: string;
};

/**
 * Every page opens the same way: a wide-tracked label, then a statement set in
 * the largest type the product has, then one line of prose.
 *
 * The statement is deliberately a sentence with a full stop rather than a noun
 * ("Homework") -- a title that only names the page tells the reader something
 * the nav already told them.
 */
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
        "mb-rhythm flex flex-col gap-8 md:flex-row md:items-end md:justify-between md:gap-14",
        className,
      )}
    >
      <div className="min-w-0 max-w-[22ch] sm:max-w-[18ch] md:max-w-none">
        {eyebrow ? <Eyebrow tone="accent" className="mb-6">{eyebrow}</Eyebrow> : null}
        <h1 className="text-statement text-balance text-ink">
          {typeof title === "string" ? <RevealWords text={title} /> : title}
        </h1>
        {description ? (
          <p className="mt-7 max-w-[48ch] text-body-lg text-ink-muted">
            {description}
          </p>
        ) : null}
      </div>
      {action ? <div className="flex shrink-0 gap-2">{action}</div> : null}
    </header>
  );
}

export { Eyebrow } from "@/components/shared/surface";
