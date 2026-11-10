package flow.study.domain.timetable;

import java.time.Instant;
import java.time.LocalDate;
import java.time.ZoneId;
import java.time.ZonedDateTime;

/**
 * What time it is for HER.
 *
 * The browser version reached for Intl because it is the only thing in
 * JavaScript that gets DST transitions right. Java has had the correct answer
 * since 1.8, so this is a thin wrapper rather than a workaround -- but the
 * reason it exists is unchanged: asking the host clock what day it is gives
 * the wrong answer for a student in another timezone, and a server an hour
 * ahead would date a Monday-evening plan as Tuesday.
 *
 * The date is here because a weekday is not enough to make a commitment with.
 * The timetable recurs weekly, so "the Tuesday study period" is ambiguous the
 * moment you want to store it and ask about it later.
 */
public record SchoolClock(
        /** Minutes since midnight, in her timezone. */
        int minutes,
        /** 1 = Monday through 7 = Sunday, in her timezone. */
        int dayOfWeek,
        /** Her calendar date. */
        LocalDate date,
        ZoneId zone,
        /** The instant this reading was taken, for anything needing an exact time. */
        Instant at) {

    public static SchoolClock in(ZoneId zone, Instant at) {
        ZonedDateTime local = at.atZone(zone);
        return new SchoolClock(
                local.getHour() * 60 + local.getMinute(),
                local.getDayOfWeek().getValue(),
                local.toLocalDate(),
                zone,
                at);
    }

    /**
     * Same, from a stored timezone string.
     *
     * An unrecognised zone degrades to the host clock rather than taking the
     * screen down -- a profile with a typo in it should show a slightly wrong
     * time, not nothing at all.
     */
    public static SchoolClock in(String timezone, Instant at) {
        try {
            return in(ZoneId.of(timezone), at);
        } catch (RuntimeException e) {
            return in(ZoneId.systemDefault(), at);
        }
    }

    public static SchoolClock now(ZoneId zone) {
        return in(zone, Instant.now());
    }

    public String label() {
        return Times.label(minutes);
    }

    /** Her calendar date, n days on. Calendar arithmetic, so DST cannot shift it. */
    public LocalDate datePlus(int days) {
        return date.plusDays(days);
    }
}
