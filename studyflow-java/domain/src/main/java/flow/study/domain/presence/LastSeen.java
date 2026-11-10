package flow.study.domain.presence;

import java.time.Duration;
import java.time.Instant;

/**
 * The OBSERVED half of the pair.
 *
 * Deliberately a separate class from PresenceDescriber rather than a method on
 * it. Presence is what the timetable expects; this is the only thing the app
 * actually witnessed. Keeping them in different files is a small cost that
 * makes the distinction hard to lose during a later edit -- merging them is
 * exactly the mistake the design exists to prevent.
 */
public final class LastSeen {
    private LastSeen() {}

    /**
     * Returns null rather than "never", because a student who has not opened
     * the app today is not a student who has done nothing, and a bold "never"
     * next to her name reads as an accusation.
     */
    public static String describe(Instant lastActive, Instant now) {
        if (lastActive == null) return null;

        long minutes = Duration.between(lastActive, now).toMinutes();
        if (minutes < 0) return "Active just now";
        if (minutes < 1) return "Active just now";
        if (minutes < 60) return "Active " + minutes + " min ago";

        long hours = minutes / 60;
        if (hours < 24) return "Active " + hours + (hours == 1 ? " hr ago" : " hrs ago");

        long days = hours / 24;
        if (days == 1) return "Active yesterday";
        if (days < 7) return "Active " + days + " days ago";
        return "Not active this week";
    }
}
