package flow.study.domain.timetable;

import java.time.LocalTime;

/**
 * Minutes since midnight, and the labels that go on screen.
 *
 * The engine works in minutes rather than in LocalTime because every question
 * it answers is arithmetic -- how long is left, does this fit before the
 * cutoff, do these two periods touch. Formatting happens once, here, so that
 * no view ever parses a time.
 */
public final class Times {
    private Times() {}

    public static final int MINUTES_PER_DAY = 24 * 60;

    /** 08:30 becomes 510. */
    public static int toMinutes(LocalTime time) {
        return time.getHour() * 60 + time.getMinute();
    }

    /** The string form Postgres sends, 08:30:00, becomes 510. */
    public static int toMinutes(String time) {
        String[] parts = time.split(":");
        return Integer.parseInt(parts[0]) * 60 + Integer.parseInt(parts[1]);
    }

    /** 510 becomes 08:30. */
    public static String label(int minutes) {
        int wrapped = ((minutes % MINUTES_PER_DAY) + MINUTES_PER_DAY) % MINUTES_PER_DAY;
        return String.format("%02d:%02d", wrapped / 60, wrapped % 60);
    }

    public static LocalTime at(int minutes) {
        return LocalTime.of((minutes / 60) % 24, minutes % 60);
    }

    /** 95 becomes "1 hr 35 min". For durations, not countdowns. */
    public static String duration(int minutes) {
        if (minutes < 60) return minutes + " min";
        int h = minutes / 60;
        int m = minutes % 60;
        return m == 0 ? h + " hr" : h + " hr " + m + " min";
    }

    /**
     * 105 becomes "1h 45m".
     *
     * For stat slots, where the number is set very large and the long form is
     * three times wider than the cell.
     */
    public static String durationCompact(int minutes) {
        if (minutes < 60) return minutes + "m";
        int h = minutes / 60;
        int m = minutes % 60;
        return m == 0 ? h + "h" : h + "h " + m + "m";
    }
}
