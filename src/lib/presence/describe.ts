import { formatDuration, type TimetableState } from "@/lib/timetable/types";

/**
 * What she should be doing right now.
 *
 * ---------------------------------------------------------------------------
 * READ THIS BEFORE CHANGING THE COPY.
 *
 * Every string this module produces is an EXPECTATION derived from her
 * timetable and her own settings. It is not an observation. StudyFlow cannot
 * see whether she is in the room, awake, or holding a pen, and the wording
 * must never suggest otherwise — "should be in class" is true and useful;
 * "is in class" is a claim the app has no basis for and would be believed.
 *
 * The distinction is the whole design. A parent looking at this gets two
 * things side by side: what the timetable EXPECTS (this module, derived) and
 * when she was LAST ACTIVE in the app (the activity log, observed). Those are
 * different kinds of fact and the interface keeps them apart, because the
 * failure mode of merging them is a parent confidently believing something
 * the software never knew.
 * ---------------------------------------------------------------------------
 */

export type PresenceKind =
  | "asleep"
  | "getting_ready"
  | "heading_in"
  | "in_lesson"
  | "at_break"
  | "heading_home"
  | "settling"
  | "study_time"
  | "free_evening"
  | "free_day"
  | "unknown";

export type Presence = {
  kind: PresenceKind;
  /** Short state, always phrased as expectation. "Should be in class". */
  headline: string;
  /** The specifics: subject, what is next, how long left. */
  detail: string | null;
  /** Minutes until this state changes, when the timetable says. */
  endsInMinutes: number | null;
  /** True while the school-day lock applies to her. */
  atSchool: boolean;
  tone: "lesson" | "brand" | "revise" | "pause" | "muted";
  icon: "moon" | "sunrise" | "walk" | "book" | "coffee" | "home" | "pencil" | "star";
};

export type PresenceInput = {
  state: TimetableState;
  /** Minutes since midnight in HER timezone. */
  nowMinutes: number;
  /** 1 = Monday … 7 = Sunday, in HER timezone. */
  dayOfWeek: number;
  /** End of her planning window, minutes since midnight. From her profile. */
  studyUntilMinutes: number;
  /** Decompression time after the last bell, from her profile. */
  settleMinutes: number;
};

/** Before this, she should be asleep rather than "free". */
const WAKE_MINUTES = 6 * 60;
/** Wind-down between the end of the planning window and lights out. */
const WIND_DOWN_MINUTES = 60;
/** How long before the first bell counts as "on her way" rather than "home". */
const TRAVEL_MINUTES = 45;

export function describePresence({
  state,
  nowMinutes,
  dayOfWeek,
  studyUntilMinutes,
  settleMinutes,
}: PresenceInput): Presence {
  // School first. If the timetable says a lesson is running, that outranks
  // every clock-based guess below — including the sleep window, because a
  // timetable that runs past bedtime is unusual data, not a reason to claim
  // she is asleep in a lesson.
  if (state.kind === "in_activity") {
    const { current, remainingMinutes, next } = state;
    const teaching = current.activityType === "class" || current.activityType === "study";

    if (!teaching) {
      return {
        kind: "at_break",
        headline: `Should be on ${current.label.toLowerCase()}`,
        detail: next ? `${next.label} next, at ${next.startLabel}` : `Until ${current.endLabel}`,
        endsInMinutes: remainingMinutes,
        atSchool: true,
        tone: "pause",
        icon: "coffee",
      };
    }

    return {
      kind: "in_lesson",
      headline: "Should be in class",
      detail: current.detail ? `${current.label} · ${current.detail}` : current.label,
      endsInMinutes: remainingMinutes,
      atSchool: true,
      tone: "lesson",
      icon: "book",
    };
  }

  if (state.kind === "gap") {
    return {
      kind: "at_break",
      headline: "Should be between lessons",
      detail: `${state.next.label} next, at ${state.next.startLabel}`,
      endsInMinutes: state.remainingMinutes,
      atSchool: true,
      tone: "pause",
      icon: "coffee",
    };
  }

  const earlyHours = nowMinutes < WAKE_MINUTES;

  if (state.kind === "before_school") {
    if (earlyHours) {
      return {
        kind: "asleep",
        headline: "Should be asleep",
        detail: `${state.next.label} at ${state.next.startLabel}`,
        endsInMinutes: null,
        atSchool: false,
        tone: "muted",
        icon: "moon",
      };
    }

    if (state.startsInMinutes <= TRAVEL_MINUTES) {
      return {
        kind: "heading_in",
        headline: "Should be heading in",
        detail: `${state.next.label} at ${state.next.startLabel}`,
        endsInMinutes: state.startsInMinutes,
        atSchool: false,
        tone: "brand",
        icon: "walk",
      };
    }

    return {
      kind: "getting_ready",
      headline: "Should be getting ready",
      detail: `School starts at ${state.next.startLabel}`,
      endsInMinutes: state.startsInMinutes,
      atSchool: false,
      tone: "brand",
      icon: "sunrise",
    };
  }

  // --- The rest of the day is clock-driven ---------------------------------
  // `lightsOut` is derived rather than stored. She sets when her study window
  // ends; bedtime is that plus an hour of not-homework. Storing a separate
  // bedtime would be one more setting to get wrong, and the app has no use
  // for the exact minute — only for "this is night now".
  const lightsOut = Math.min(studyUntilMinutes + WIND_DOWN_MINUTES, 24 * 60 - 1);

  if (earlyHours || nowMinutes >= lightsOut) {
    return {
      kind: "asleep",
      headline: "Should be asleep",
      detail: null,
      endsInMinutes: null,
      atSchool: false,
      tone: "muted",
      icon: "moon",
    };
  }

  if (state.kind === "after_school") {
    const homeAt = state.lastEntry.endMinutes + settleMinutes;
    const travelUntil = state.lastEntry.endMinutes + Math.min(settleMinutes, TRAVEL_MINUTES);

    if (nowMinutes < travelUntil) {
      return {
        kind: "heading_home",
        headline: "Should be heading home",
        detail: `School finished at ${state.lastEntry.endLabel}`,
        endsInMinutes: Math.max(0, homeAt - nowMinutes),
        atSchool: false,
        tone: "brand",
        icon: "walk",
      };
    }

    if (nowMinutes < homeAt) {
      return {
        kind: "settling",
        headline: "Settling in at home",
        detail: `Homework time from ${label(homeAt)}`,
        endsInMinutes: homeAt - nowMinutes,
        atSchool: false,
        tone: "pause",
        icon: "home",
      };
    }

    if (nowMinutes < studyUntilMinutes) {
      return {
        kind: "study_time",
        headline: "Homework time",
        detail: `Plan runs to ${label(studyUntilMinutes)} · ${formatDuration(
          studyUntilMinutes - nowMinutes,
        )} left`,
        endsInMinutes: studyUntilMinutes - nowMinutes,
        atSchool: false,
        tone: "revise",
        icon: "pencil",
      };
    }

    return {
      kind: "free_evening",
      headline: "Done for the day",
      detail: `Study window ended at ${label(studyUntilMinutes)}`,
      endsInMinutes: null,
      atSchool: false,
      tone: "muted",
      icon: "star",
    };
  }

  // No school today: weekend, a day off, or no timetable saved at all.
  if (state.kind === "no_timetable") {
    return {
      kind: "unknown",
      headline: "No timetable saved",
      detail: "Without a timetable the app cannot say where she should be.",
      endsInMinutes: null,
      atSchool: false,
      tone: "muted",
      icon: "star",
    };
  }

  if (state.kind === "no_school") {
    return {
      kind: "free_day",
      headline: dayOfWeek >= 6 ? "Weekend" : "No school today",
      detail:
        nowMinutes < studyUntilMinutes
          ? `A free day — her plan can still run to ${label(studyUntilMinutes)}`
          : null,
      endsInMinutes: null,
      atSchool: false,
      tone: "pause",
      icon: "home",
    };
  }

  return {
    kind: "unknown",
    headline: "Not sure",
    detail: null,
    endsInMinutes: null,
    atSchool: false,
    tone: "muted",
    icon: "star",
  };
}

function label(minutes: number): string {
  const h = Math.floor(minutes / 60) % 24;
  const m = minutes % 60;
  return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`;
}

/**
 * "Active 12 min ago" — the OBSERVED half of the pair.
 *
 * Returns null rather than "never", because a student who has not opened the
 * app today is not a student who has done nothing, and a bold "never" next to
 * her name reads as an accusation.
 */
export function describeLastSeen(iso: string | null, now: Date = new Date()): string | null {
  if (!iso) return null;
  const then = new Date(iso).getTime();
  if (Number.isNaN(then)) return null;

  const minutes = Math.floor((now.getTime() - then) / 60_000);
  if (minutes < 1) return "Active just now";
  if (minutes < 60) return `Active ${minutes} min ago`;

  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `Active ${hours} hr${hours === 1 ? "" : "s"} ago`;

  const days = Math.floor(hours / 24);
  if (days === 1) return "Active yesterday";
  if (days < 7) return `Active ${days} days ago`;
  return "Not active this week";
}
