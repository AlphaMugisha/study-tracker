package flow.study.domain.presence;

import flow.study.domain.presence.Presence.Icon;
import flow.study.domain.presence.Presence.Kind;
import flow.study.domain.presence.Presence.Tone;
import flow.study.domain.timetable.Days;
import flow.study.domain.timetable.ResolvedEntry;
import flow.study.domain.timetable.Times;
import flow.study.domain.timetable.TimetableState;

import java.util.Locale;

/** Turns a TimetableState into words. See Presence for the rule about those words. */
public final class PresenceDescriber {
    private PresenceDescriber() {}

    /** Before this, she should be asleep rather than free. */
    private static final int WAKE_MINUTES = 6 * 60;
    /** Wind-down between the end of the planning window and lights out. */
    private static final int WIND_DOWN_MINUTES = 60;
    /** How long before the first bell counts as on her way rather than home. */
    private static final int TRAVEL_MINUTES = 45;

    public record Input(
            TimetableState state,
            /** Minutes since midnight in HER timezone. */
            int nowMinutes,
            /** 1 = Monday through 7 = Sunday, in HER timezone. */
            int dayOfWeek,
            /** End of her planning window, minutes since midnight. */
            int studyUntilMinutes,
            /** Decompression time after the last bell, from her profile. */
            int settleMinutes) {
    }

    public static Presence describe(Input in) {
        TimetableState state = in.state();

        /*
         * School first. If the timetable says a lesson is running, that
         * outranks every clock-based guess below -- including the sleep
         * window, because a timetable that runs past bedtime is unusual data,
         * not a reason to claim she is asleep in a lesson.
         */
        if (state instanceof TimetableState.InActivity a) {
            ResolvedEntry current = a.current();

            if (!current.activityType().isTaught()) {
                String next = a.next() != null
                        ? a.next().label() + " next, at " + a.next().startLabel()
                        : "Until " + current.endLabel();
                return new Presence(Kind.AT_BREAK,
                        "Should be on " + current.label().toLowerCase(Locale.ROOT),
                        next, a.remainingMinutes(), a.progress(),
                        true, true, Tone.PAUSE, Icon.COFFEE);
            }

            String detail = current.detail() != null
                    ? current.label() + " · " + current.detail()
                    : current.label();
            return new Presence(Kind.IN_LESSON, "Should be in class", detail,
                    a.remainingMinutes(), a.progress(), true, true, Tone.LESSON, Icon.BOOK);
        }

        if (state instanceof TimetableState.Gap g) {
            return new Presence(Kind.AT_BREAK, "Should be between lessons",
                    g.next().label() + " next, at " + g.next().startLabel(),
                    g.remainingMinutes(), null, true, true, Tone.PAUSE, Icon.COFFEE);
        }

        boolean earlyHours = in.nowMinutes() < WAKE_MINUTES;

        if (state instanceof TimetableState.BeforeSchool b) {
            if (earlyHours) {
                return new Presence(Kind.ASLEEP, "Should be asleep",
                        b.next().label() + " at " + b.next().startLabel(),
                        null, null, true, false, Tone.MUTED, Icon.MOON);
            }
            if (b.startsInMinutes() <= TRAVEL_MINUTES) {
                return new Presence(Kind.HEADING_IN, "Should be heading in",
                        b.next().label() + " at " + b.next().startLabel(),
                        b.startsInMinutes(), null, true, false, Tone.BRAND, Icon.WALK);
            }
            return new Presence(Kind.GETTING_READY, "Should be getting ready",
                    "School starts at " + b.next().startLabel(),
                    b.startsInMinutes(), null, true, false, Tone.BRAND, Icon.SUNRISE);
        }

        /*
         * The rest of the day is clock-driven.
         *
         * lightsOut is derived rather than stored. She sets when her study
         * window ends; bedtime is that plus an hour of not-homework. Storing
         * a separate bedtime would be one more setting to get wrong, and the
         * app has no use for the exact minute -- only for "this is night now".
         */
        int lightsOut = Math.min(in.studyUntilMinutes() + WIND_DOWN_MINUTES, Times.MINUTES_PER_DAY - 1);

        if (earlyHours || in.nowMinutes() >= lightsOut) {
            return new Presence(Kind.ASLEEP, "Should be asleep", null,
                    null, null, true, false, Tone.MUTED, Icon.MOON);
        }

        if (state instanceof TimetableState.AfterSchool s) {
            int lastBell = s.lastEntry().endMinutes();
            int homeAt = lastBell + in.settleMinutes();
            int travelUntil = lastBell + Math.min(in.settleMinutes(), TRAVEL_MINUTES);

            if (in.nowMinutes() < travelUntil) {
                return new Presence(Kind.HEADING_HOME, "Should be heading home",
                        "School finished at " + s.lastEntry().endLabel(),
                        Math.max(0, homeAt - in.nowMinutes()), null,
                        true, false, Tone.BRAND, Icon.WALK);
            }
            if (in.nowMinutes() < homeAt) {
                return new Presence(Kind.SETTLING, "Settling in at home",
                        "Homework time from " + Times.label(homeAt),
                        homeAt - in.nowMinutes(), null, true, false, Tone.PAUSE, Icon.HOME);
            }
            if (in.nowMinutes() < in.studyUntilMinutes()) {
                int left = in.studyUntilMinutes() - in.nowMinutes();
                return new Presence(Kind.STUDY_TIME, "Homework time",
                        "Plan runs to " + Times.label(in.studyUntilMinutes())
                                + " · " + Times.duration(left) + " left",
                        left, null, true, false, Tone.REVISE, Icon.PENCIL);
            }
            return new Presence(Kind.FREE_EVENING, "Done for the day",
                    "Study window ended at " + Times.label(in.studyUntilMinutes()),
                    null, null, true, false, Tone.MUTED, Icon.STAR);
        }

        if (state instanceof TimetableState.NoTimetable) {
            return new Presence(Kind.UNKNOWN, "No timetable saved",
                    "Add her school timetable and this card fills in on its own.",
                    null, null, false, false, Tone.MUTED, Icon.STAR);
        }

        if (state instanceof TimetableState.NoSchool) {
            String detail = in.nowMinutes() < in.studyUntilMinutes()
                    ? "A free day — her plan can still run to "
                            + Times.label(in.studyUntilMinutes())
                    : null;
            return new Presence(Kind.FREE_DAY,
                    Days.isWeekend(in.dayOfWeek()) ? "Weekend" : "No school today",
                    detail, null, null, true, false, Tone.PAUSE, Icon.HOME);
        }

        return new Presence(Kind.UNKNOWN, "Not sure", null,
                null, null, false, false, Tone.MUTED, Icon.STAR);
    }
}
