import { BookOpen, Coffee, Flag, GraduationCap, Trophy } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import type { ActivityKind, TaskPriority, TaskStatus } from "@/types/database";

/**
 * One place where a database enum becomes a colour and a word. Components ask
 * for a badge; they never decide what "high priority" looks like themselves.
 */

// --- timetable activity types ----------------------------------------------

const ACTIVITY_STYLE: Record<
  ActivityKind,
  { label: string; chip: string; rail: string; icon: typeof BookOpen }
> = {
  class: {
    label: "Lesson",
    chip: "bg-lesson-soft text-lesson-ink",
    rail: "bg-lesson",
    icon: BookOpen,
  },
  break: {
    label: "Break",
    chip: "bg-pause-soft text-pause-ink",
    rail: "bg-pause",
    icon: Coffee,
  },
  free: {
    label: "Free",
    chip: "bg-pause-soft text-pause-ink",
    rail: "bg-pause/70",
    icon: Coffee,
  },
  study: {
    label: "Study",
    chip: "bg-revise-soft text-revise-ink",
    rail: "bg-revise",
    icon: GraduationCap,
  },
  other: {
    label: "Activity",
    chip: "bg-brand-soft text-brand-ink",
    rail: "bg-brand",
    icon: Trophy,
  },
};

export function activityStyle(kind: ActivityKind) {
  return ACTIVITY_STYLE[kind] ?? ACTIVITY_STYLE.other;
}

export function ActivityChip({
  kind,
  className,
}: {
  kind: ActivityKind;
  className?: string;
}) {
  const style = activityStyle(kind);
  // A lesson is the default case; chipping every row would be noise.
  if (kind === "class") return null;

  return (
    <Badge className={cn(style.chip, "font-medium", className)}>{style.label}</Badge>
  );
}

// --- subjects ---------------------------------------------------------------

const COLOR_DOT: Record<string, string> = {
  "chart-1": "bg-chart-1",
  "chart-2": "bg-chart-2",
  "chart-3": "bg-chart-3",
  "chart-4": "bg-chart-4",
  "chart-5": "bg-chart-5",
};

export function SubjectDot({
  colorToken,
  className,
}: {
  colorToken: string | null;
  className?: string;
}) {
  return (
    <span
      aria-hidden="true"
      className={cn(
        "inline-block size-2 shrink-0 rounded-full",
        COLOR_DOT[colorToken ?? ""] ?? "bg-ink-subtle",
        className,
      )}
    />
  );
}

// --- tasks ------------------------------------------------------------------

const PRIORITY_STYLE: Record<TaskPriority, { label: string; className: string }> = {
  high: { label: "High", className: "bg-danger-soft text-danger" },
  medium: { label: "Medium", className: "bg-pause-soft text-pause-ink" },
  low: { label: "Low", className: "bg-surface-sunken text-ink-muted" },
};

export function PriorityBadge({ priority }: { priority: TaskPriority }) {
  // Low priority is the default; saying so on every card is clutter.
  if (priority === "low") return null;
  const style = PRIORITY_STYLE[priority];
  return (
    <Badge className={cn(style.className, "gap-1 font-medium")}>
      <Flag aria-hidden="true" />
      {style.label}
    </Badge>
  );
}

const STATUS_STYLE: Record<TaskStatus, { label: string; className: string }> = {
  not_started: { label: "Not started", className: "bg-surface-sunken text-ink-muted" },
  in_progress: { label: "In progress", className: "bg-lesson-soft text-lesson-ink" },
  completed: { label: "Completed", className: "bg-brand-soft text-brand-ink" },
};

export function StatusBadge({ status }: { status: TaskStatus }) {
  const style = STATUS_STYLE[status];
  return <Badge className={cn(style.className, "font-medium")}>{style.label}</Badge>;
}

export function OverdueBadge({ children }: { children: React.ReactNode }) {
  return <Badge className="bg-danger-soft font-medium text-danger">{children}</Badge>;
}
