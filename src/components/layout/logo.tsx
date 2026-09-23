import { cn } from "@/lib/utils";

/**
 * A quiet mark: a rounded tile with a rising step line. Reads as "a day with
 * structure" rather than a book or a graduation cap, both of which push the
 * design juvenile.
 */
export function LogoMark({ className }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 28 28"
      aria-hidden="true"
      className={cn("size-7 shrink-0", className)}
    >
      <rect width="28" height="28" rx="8" fill="var(--lesson)" />
      <path
        d="M7 18.5h4.5V13H16V7.5h5"
        fill="none"
        stroke="var(--primary-foreground)"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <circle cx="21" cy="7.5" r="2.5" fill="var(--revise-soft)" />
    </svg>
  );
}

export function Logo({ className }: { className?: string }) {
  return (
    <span className={cn("inline-flex items-center gap-2.5", className)}>
      <LogoMark />
      <span className="text-[15px] font-semibold tracking-[-0.01em] text-ink">
        StudyFlow
      </span>
    </span>
  );
}
