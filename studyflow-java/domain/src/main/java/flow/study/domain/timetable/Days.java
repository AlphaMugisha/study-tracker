package flow.study.domain.timetable;

import java.time.DayOfWeek;
import java.time.LocalDate;

/** 1 = Monday through 7 = Sunday, which is what the schema stores. */
public final class Days {
    private Days() {}

    private static final String[] NAMES = {
        "", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"
    };
    private static final String[] SHORT = {
        "", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"
    };

    public static String name(int day) {
        return day >= 1 && day <= 7 ? NAMES[day] : "";
    }

    public static String shortName(int day) {
        return day >= 1 && day <= 7 ? SHORT[day] : "";
    }

    /**
     * java.time already numbers Monday as 1, so this is a getValue call
     * rather than the Sunday-is-zero correction the browser version needed.
     */
    public static int of(LocalDate date) {
        return date.getDayOfWeek().getValue();
    }

    public static int of(DayOfWeek day) {
        return day.getValue();
    }

    public static boolean isWeekend(int day) {
        return day >= 6;
    }
}
