import Link from "next/link";
import { ArrowUpRight } from "lucide-react";

import { Surface } from "@/components/shared/surface";
import { cn } from "@/lib/utils";

export type RailStat = {
  label: string;
  value: string;
  hint?: string;
  tone?: "default" | "brand" | "lesson" | "revise" | "pause" | "danger";
  href: string;
};

const TONE = {
  default: "text-ink",
  brand: "text-brand-ink",
  lesson: "text-lesson-ink",
  revise: "text-revise-ink",
  pause: "text-pause-ink",
  danger: "text-danger",
} as const;

/**
 * The same numbers as `DayStats`, stood on end.
 *
 * `DayStats` is a three-across strip built for the full page width. Dropped
 * into a narrow column beside a tall card it fails twice: the labels run out
 * of horizontal room and wrap ("STUCK / ON"), which drops that number onto a
 * different baseline from its neighbours; and the strip stays short while the
 * card next to it is tall, stranding a large empty rectangle underneath.
 *
 * Stacking fixes both. Each row gets the full column width for its label, so
 * nothing wraps, and `flex-1` divides the height so the rail ends exactly
 * where the card does.
 */
export function StatRail({ stats }: { stats: RailStat[] }) {
  return (
    <Surface inset="flush" float="b" className="flex h-full flex-col overflow-hidden">
      <dl className="flex flex-1 flex-col divide-y divide-border">
        {stats.map((stat) => (
          <Link
            key={stat.label}
            href={stat.href}
            className="group/stat flex flex-1 items-center justify-between gap-5 px-7 py-6 transition-colors duration-300 ease-out-flat hover:bg-surface-raised focus-visible:bg-surface-raised sm:px-8"
          >
            <div className="min-w-0">
              <dt className="flex items-center gap-2 text-eyebrow uppercase text-ink-subtle">
                {/* Never wrap: a label on two lines pushes its own number out
                    of line with the others, which is what made the strip look
                    broken in the first place. */}
                <span className="truncate whitespace-nowrap">{stat.label}</span>
                <ArrowUpRight
                  aria-hidden="true"
                  className="size-3.5 shrink-0 opacity-0 transition-opacity duration-150 group-hover/stat:opacity-100"
                />
              </dt>
              {stat.hint ? (
                <p className="mt-2 text-[0.85rem] text-ink-subtle">{stat.hint}</p>
              ) : null}
            </div>

            <dd
              className={cn(
                "shrink-0 text-[2.5rem] font-semibold leading-none tracking-[-0.04em]",
                TONE[stat.tone ?? "default"],
              )}
              data-numeric
            >
              {stat.value}
            </dd>
          </Link>
        ))}
      </dl>
    </Surface>
  );
}
