import type { ResolvedEntry, TimetableState } from "@/lib/timetable/types";

/**
 * Fabricated states for the styleguide, so it can render the *real*
 * CurrentActivityCard instead of a copy that drifts away from it.
 *
 * Nothing in the app imports this — only `/styleguide`, which is internal.
 */

function entry(partial: Partial<ResolvedEntry> & { label: string }): ResolvedEntry {
  const startMinutes = partial.startMinutes ?? 8 * 60;
  const endMinutes = partial.endMinutes ?? 9 * 60;

  return {
    id: partial.id ?? partial.label,
    activityType: partial.activityType ?? "class",
    label: partial.label,
    detail: partial.detail ?? null,
    subjectName: partial.subjectName ?? null,
    subjectId: partial.subjectId ?? null,
    colorToken: partial.colorToken ?? "chart-1",
    room: partial.room ?? null,
    dayOfWeek: partial.dayOfWeek ?? 1,
    startMinutes,
    endMinutes,
    startLabel: partial.startLabel ?? "08:00",
    endLabel: partial.endLabel ?? "09:00",
    durationMinutes: endMinutes - startMinutes,
  };
}

const maths = entry({
  label: "Mathematics",
  detail: "Quadratic equations",
  room: "B12",
});

const english = entry({
  label: "English",
  startMinutes: 9 * 60,
  endMinutes: 10 * 60,
  startLabel: "09:00",
  endLabel: "10:00",
});

const lunch = entry({
  label: "Lunch",
  activityType: "break",
  startMinutes: 12 * 60,
  endMinutes: 13 * 60,
  startLabel: "12:00",
  endLabel: "13:00",
});

const biology = entry({
  label: "Biology",
  startMinutes: 13 * 60,
  endMinutes: 14 * 60,
  startLabel: "13:00",
  endLabel: "14:00",
  room: "Lab 1",
});

export const DEMO_IN_CLASS: TimetableState = {
  kind: "in_activity",
  current: maths,
  previous: null,
  next: english,
  elapsedMinutes: 28,
  remainingMinutes: 32,
  progress: 28 / 60,
};

export const DEMO_ON_BREAK: TimetableState = {
  kind: "in_activity",
  current: lunch,
  previous: english,
  next: biology,
  elapsedMinutes: 40,
  remainingMinutes: 20,
  progress: 40 / 60,
};

export const DEMO_AFTER_SCHOOL: TimetableState = {
  kind: "after_school",
  lastEntry: entry({
    label: "Mathematics",
    startMinutes: 14 * 60,
    endMinutes: 15 * 60,
    startLabel: "14:00",
    endLabel: "15:00",
  }),
};
