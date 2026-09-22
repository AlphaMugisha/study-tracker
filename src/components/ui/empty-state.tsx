import type { LucideIcon } from "lucide-react";

import { cn } from "@/lib/utils";

type EmptyStateProps = {
  icon?: LucideIcon;
  headline: string;
  body?: string;
  action?: React.ReactNode;
  className?: string;
};

/**
 * Every major page gets one of these. Copy should sound like a person, not a
 * product: "Nothing due yet." beats "No items found."
 */
export function EmptyState({
  icon: Icon,
  headline,
  body,
  action,
  className,
}: EmptyStateProps) {
  return (
    <div
      className={cn(
        "flex flex-col items-center justify-center rounded-lg border border-dashed border-border bg-card/60 px-6 py-12 text-center",
        className,
      )}
    >
      {Icon ? (
        <span className="mb-4 flex size-10 items-center justify-center rounded-lg bg-surface-sunken">
          <Icon aria-hidden="true" className="size-5 text-ink-subtle" />
        </span>
      ) : null}
      <p className="text-[15px] font-medium text-ink">{headline}</p>
      {body ? (
        <p className="mt-1.5 max-w-sm text-sm leading-6 text-ink-muted">{body}</p>
      ) : null}
      {action ? <div className="mt-5">{action}</div> : null}
    </div>
  );
}
