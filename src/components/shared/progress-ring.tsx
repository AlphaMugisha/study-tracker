import { cn } from "@/lib/utils";

/**
 * A ring rather than a bar, for the one place the number *is* the content.
 * Bars are for progress through something; a ring reads as a score.
 *
 * Pure SVG, no library, no client JS.
 */
export function ProgressRing({
  value,
  total,
  size = 148,
  stroke = 12,
  className,
}: {
  value: number;
  total: number;
  size?: number;
  stroke?: number;
  className?: string;
}) {
  const percent = total === 0 ? 0 : Math.round((value / total) * 100);
  const radius = (size - stroke) / 2;
  const circumference = 2 * Math.PI * radius;
  const dash = (percent / 100) * circumference;

  return (
    <div className={cn("relative inline-flex", className)}>
      <svg
        width={size}
        height={size}
        viewBox={`0 0 ${size} ${size}`}
        role="img"
        aria-label={`${value} of ${total} tasks completed`}
        className="-rotate-90"
      >
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          fill="none"
          stroke="var(--surface-sunken)"
          strokeWidth={stroke}
        />
        {percent > 0 ? (
          <circle
            cx={size / 2}
            cy={size / 2}
            r={radius}
            fill="none"
            stroke="var(--sage)"
            strokeWidth={stroke}
            strokeLinecap="round"
            strokeDasharray={`${dash} ${circumference - dash}`}
            className="transition-[stroke-dasharray] duration-700 ease-out"
          />
        ) : null}
      </svg>

      <span className="absolute inset-0 flex flex-col items-center justify-center">
        <span
          className="text-[2.6rem] font-semibold leading-none tracking-[-0.035em] text-ink"
          data-numeric
        >
          {percent}%
        </span>
        <span className="mt-2 text-[0.85rem] text-ink-subtle" data-numeric>
          {value} of {total}
        </span>
      </span>
    </div>
  );
}
