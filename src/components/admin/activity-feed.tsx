import { Surface } from "@/components/shared/surface";
import { activityTone, describeActivity } from "@/lib/data/support";
import type { ActivityLog } from "@/types/database";
import { cn } from "@/lib/utils";

const TONE_DOT: Record<ReturnType<typeof activityTone>, string> = {
  brand: "bg-brand",
  lesson: "bg-lesson",
  revise: "bg-revise",
  pause: "bg-pause",
  danger: "bg-danger",
};

/**
 * The academic activity log, newest first.
 *
 * Grouped by day, because "what did they do yesterday" is the question this
 * gets asked, and a flat list of 60 timestamps answers it badly.
 *
 * Times are rendered from the raw timestamp in the viewer's locale. That is a
 * known wrinkle: a support account in a different timezone sees their own
 * clock, not the student's. Correct once the timezone work in Phase 3B lands
 * and `profiles.timezone` is used for formatting.
 */
export function ActivityFeed({ entries }: { entries: ActivityLog[] }) {
  const days = groupByDay(entries);

  return (
    <div className="space-y-6">
      {days.map(([day, items]) => (
        <Surface key={day}>
          <h3 className="mb-5 text-section text-ink">{day}</h3>
          <ol className="-my-2 divide-y divide-border">
            {items.map((entry) => {
              const { label, detail } = describeActivity(entry);
              const tone = activityTone(entry.activity_type);

              return (
                <li key={entry.id} className="flex items-baseline gap-4 py-3.5">
                  <span
                    className="w-14 shrink-0 text-[0.9rem] font-medium text-ink-muted"
                    data-numeric
                  >
                    {new Date(entry.created_at).toLocaleTimeString(undefined, {
                      hour: "2-digit",
                      minute: "2-digit",
                    })}
                  </span>
                  <span
                    aria-hidden="true"
                    className={cn("size-2 shrink-0 rounded-full", TONE_DOT[tone])}
                  />
                  <span className="min-w-0 flex-1">
                    <span className="block text-body text-ink">{label}</span>
                    {detail ? (
                      <span className="mt-0.5 block truncate text-[0.9rem] text-ink-subtle">
                        {detail}
                      </span>
                    ) : null}
                  </span>
                </li>
              );
            })}
          </ol>
        </Surface>
      ))}
    </div>
  );
}

/** Preserves the incoming order (newest first) within and across days. */
function groupByDay(entries: ActivityLog[]): Array<[string, ActivityLog[]]> {
  const map = new Map<string, ActivityLog[]>();

  for (const entry of entries) {
    const day = new Date(entry.created_at).toLocaleDateString(undefined, {
      weekday: "long",
      day: "numeric",
      month: "long",
    });
    const bucket = map.get(day);
    if (bucket) bucket.push(entry);
    else map.set(day, [entry]);
  }

  return [...map.entries()];
}
