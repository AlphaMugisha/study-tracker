import { ItemCard, ItemGrid } from "@/components/shared/item-card";
import { Surface } from "@/components/shared/surface";
import { activityTone, describeActivity } from "@/lib/data/support";
import type { ActivityLog } from "@/types/database";

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
          <ItemGrid>
            {items.map((entry, i) => {
              const { label, detail } = describeActivity(entry);
              return (
                <ItemCard
                  key={entry.id}
                  index={i}
                  accent={activityTone(entry.activity_type)}
                  lead={new Date(entry.created_at).toLocaleTimeString(undefined, {
                    hour: "2-digit",
                    minute: "2-digit",
                  })}
                  title={label}
                  meta={detail ? <span className="truncate">{detail}</span> : null}
                />
              );
            })}
          </ItemGrid>
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
