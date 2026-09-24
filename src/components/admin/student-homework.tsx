import { OverdueBadge, PriorityBadge, StatusBadge, SubjectDot } from "@/components/shared/badges";
import { ItemCard, ItemGrid } from "@/components/shared/item-card";
import { formatDueLabel, formatOverdueLabel } from "@/lib/format";
import type { AssignmentView } from "@/lib/tasks/ordering";
import { formatDuration } from "@/lib/timetable/types";

/**
 * Her homework, as a support account sees it.
 *
 * Extracted so the parent's dashboard and the full student record render the
 * same rows. They had begun to grow two copies of this markup, and the second
 * copy is always the one that quietly falls behind.
 *
 * No actions anywhere on it. RLS grants a support account no write path to
 * another user's assignments, so a tick box here could only ever fail.
 */
export function StudentHomework({ assignments }: { assignments: AssignmentView[] }) {
  return (
    <ItemGrid>
      {assignments.map((a, i) => (
        <ItemCard
          key={a.id}
          index={i}
          accent={
            a.status === "completed" ? "brand" : a.overdue ? "danger" : "lesson"
          }
          muted={a.status === "completed"}
          title={a.title}
          trailing={
            a.status === "completed" ? null : a.overdue ? (
              <OverdueBadge>Overdue</OverdueBadge>
            ) : (
              <PriorityBadge priority={a.priority} />
            )
          }
          meta={
            <>
              <span className="inline-flex items-center gap-1.5">
                <SubjectDot colorToken={a.subject?.color_token ?? null} />
                {a.subject?.name ?? "No subject"}
              </span>
              <span className={a.overdue ? "font-medium text-danger" : undefined}>
                {a.overdue
                  ? formatOverdueLabel(a.due_date, a.due_time)
                  : formatDueLabel(a.due_date, a.due_time)}
              </span>
              <span data-numeric>{formatDuration(a.estimated_minutes)}</span>
            </>
          }
          footer={<StatusBadge status={a.status} />}
        />
      ))}
    </ItemGrid>
  );
}
