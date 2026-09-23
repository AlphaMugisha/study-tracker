import { Check, Pencil, RotateCcw } from "lucide-react";

import { AssignmentDialog } from "@/components/homework/assignment-dialog";
import { DeleteAssignment } from "@/components/homework/delete-assignment";
import {
  OverdueBadge,
  PriorityBadge,
  StatusBadge,
  SubjectDot,
} from "@/components/shared/badges";
import { Button } from "@/components/ui/button";
import { RowSessionButton } from "@/components/plan/session-controls";
import { setAssignmentStatusAction } from "@/lib/actions/assignments";
import type { AssignmentView } from "@/lib/data/tasks";
import { formatDueLabel, formatOverdueLabel } from "@/lib/format";
import { formatDuration } from "@/lib/timetable/types";
import { cn } from "@/lib/utils";
import type { Subject, TaskStatus } from "@/types/database";

/** A single-button form. Status changes are one click, not a menu. */
function StatusButton({
  id,
  status,
  children,
  variant = "outline",
}: {
  id: string;
  status: TaskStatus;
  children: React.ReactNode;
  variant?: "outline" | "default" | "ghost";
}) {
  return (
    <form action={setAssignmentStatusAction}>
      <input type="hidden" name="id" value={id} />
      <input type="hidden" name="status" value={status} />
      <Button type="submit" size="sm" variant={variant}>
        {children}
      </Button>
    </form>
  );
}

export function AssignmentCard({
  assignment,
  subjects,
  openSessionId = null,
  isActive = false,
}: {
  assignment: AssignmentView;
  subjects: Subject[];
  /** The one session currently running, if any. */
  openSessionId?: string | null;
  /** True when that running session belongs to this assignment. */
  isActive?: boolean;
}) {
  const done = assignment.status === "completed";

  return (
    <article
      id={assignment.id}
      className={cn(
        // The card is a `group`: hovering anywhere on it brightens the rule
        // and shifts the title, the way the reference's project cards behave.
        "group/task scroll-mt-24 rounded-xl border bg-card p-4 transition-colors duration-150 ease-out-flat sm:p-5",
        assignment.overdue
          ? "border-danger/30 hover:border-danger/50"
          : "border-border hover:border-border-strong",
        done ? "opacity-60 hover:opacity-100" : "hover:bg-surface-raised",
      )}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          <h3
            className={cn(
              "text-section text-ink transition-colors duration-150 ease-out-flat",
              !done && "group-hover/task:text-brand-ink",
              done && "line-through decoration-ink-subtle",
            )}
          >
            {assignment.title}
          </h3>

          <div className="mt-1.5 flex flex-wrap items-center gap-x-2.5 gap-y-1 text-[13px] text-ink-muted">
            {assignment.subject ? (
              <span className="inline-flex items-center gap-1.5">
                <SubjectDot colorToken={assignment.subject.color_token} />
                {assignment.subject.name}
              </span>
            ) : (
              <span className="text-ink-subtle">No subject</span>
            )}
            <span aria-hidden="true" className="text-ink-subtle">
              ·
            </span>
            <span
              className={cn(assignment.overdue && "font-medium text-danger")}
              data-numeric
            >
              {assignment.overdue
                ? formatOverdueLabel(assignment.due_date, assignment.due_time)
                : `Due ${formatDueLabel(assignment.due_date, assignment.due_time)}`}
            </span>
            <span aria-hidden="true" className="text-ink-subtle">
              ·
            </span>
            <span data-numeric>{formatDuration(assignment.estimated_minutes)}</span>
          </div>

          {assignment.description ? (
            <p className="mt-2.5 max-w-prose text-[13px] leading-5 text-ink-muted">
              {assignment.description}
            </p>
          ) : null}
        </div>

        <div className="flex shrink-0 flex-col items-end gap-2">
          {assignment.overdue ? <OverdueBadge>Overdue</OverdueBadge> : null}
          {!assignment.overdue ? <PriorityBadge priority={assignment.priority} /> : null}
          <StatusBadge status={assignment.status} />
        </div>
      </div>

      <div className="mt-4 flex flex-wrap items-center gap-2 border-t border-border/70 pt-3">
        {done ? (
          <StatusButton id={assignment.id} status="not_started" variant="outline">
            <RotateCcw aria-hidden="true" />
            Reopen
          </StatusButton>
        ) : (
          <>
            <StatusButton id={assignment.id} status="completed" variant="default">
              <Check aria-hidden="true" />
              Mark complete
            </StatusButton>
            <RowSessionButton
              taskId={assignment.id}
              openSessionId={openSessionId}
              isActive={isActive}
            />
          </>
        )}

        <span className="ml-auto flex items-center gap-1">
          <AssignmentDialog
            subjects={subjects}
            assignment={assignment}
            trigger={
              <Button
                type="button"
                variant="ghost"
                size="icon-sm"
                aria-label={`Edit ${assignment.title}`}
                className="text-ink-subtle hover:text-ink"
              >
                <Pencil aria-hidden="true" />
              </Button>
            }
          />
          <DeleteAssignment id={assignment.id} title={assignment.title} />
        </span>
      </div>
    </article>
  );
}
