package flow.study.domain.text;

import java.time.LocalDate;
import java.time.LocalDateTime;
import java.time.LocalTime;
import java.time.ZoneId;
import java.time.temporal.ChronoUnit;
import java.util.Locale;

/**
 * Display formatting.
 *
 * Everything takes an explicit clock so that callers and tests control it
 * rather than this reaching for the current instant halfway through building a
 * screen.
 *
 * Month and weekday names are spelled out rather than asked of a locale
 * formatter. Not pedantry: en-GB renders September as "Sept" while every other
 * month is three letters, so a column of dates comes out ragged -- and the
 * exact abbreviations vary with the ICU build. A fixed table cannot drift.
 */
public final class Display {
    private Display() {}

    static final String[] MONTHS = {
        "Jan", "Feb", "Mar", "Apr", "May", "Jun",
        "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"
    };

    private static final String[] WEEKDAYS = {
        "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"
    };

    public static String weekday(LocalDate date) {
        return WEEKDAYS[date.getDayOfWeek().getValue() - 1];
    }

    /** "Tuesday, 22 September" -- the date line under a page title. */
    public static String fullDate(LocalDate date) {
        return weekday(date) + ", " + date.getDayOfMonth() + " " + fullMonth(date);
    }

    private static String fullMonth(LocalDate date) {
        return date.getMonth().getDisplayName(
                java.time.format.TextStyle.FULL, Locale.UK);
    }

    /** "Wed 23 Sep". */
    public static String shortDate(LocalDate date) {
        return weekday(date).substring(0, 3) + " " + date.getDayOfMonth()
                + " " + MONTHS[date.getMonthValue() - 1];
    }

    /**
     * A due date the way a person would say it, with the time appended when
     * one is set: "Today, 16:30", "Tomorrow", "Friday", "22 Sep".
     */
    public static String dueLabel(LocalDate dueDate, LocalTime dueTime, LocalDate today) {
        long days = ChronoUnit.DAYS.between(today, dueDate);
        String time = dueTime == null ? ""
                : ", " + String.format("%02d:%02d", dueTime.getHour(), dueTime.getMinute());

        if (days == 0) return "Today" + time;
        if (days == 1) return "Tomorrow" + time;
        if (days == -1) return "Yesterday" + time;
        if (days < -1) return Math.abs(days) + " days ago";
        if (days > 1 && days <= 6) return weekday(dueDate) + time;
        return dueDate.getDayOfMonth() + " " + MONTHS[dueDate.getMonthValue() - 1];
    }

    /** "Overdue by 2 days" -- only ever shown on something genuinely late. */
    public static String overdueLabel(LocalDate dueDate, LocalDate today) {
        long days = Math.abs(ChronoUnit.DAYS.between(today, dueDate));
        if (days == 0) return "Overdue";
        return "Overdue by " + days + (days == 1 ? " day" : " days");
    }

    /** Greeting keyed to the hour. Kept quiet -- it is not the point of the page. */
    public static String greeting(LocalDateTime localNow) {
        int h = localNow.getHour();
        if (h < 12) return "Good morning";
        if (h < 17) return "Good afternoon";
        return "Good evening";
    }

    public static String greeting(ZoneId zone, java.time.Instant at) {
        return greeting(LocalDateTime.ofInstant(at, zone));
    }

    /** "alpha mugisha" becomes "Alpha". Seeded names are not always capitalised. */
    public static String firstNameOf(String fullName) {
        if (fullName == null) return "there";
        String trimmed = fullName.trim();
        if (trimmed.isEmpty()) return "there";
        String first = trimmed.split("\s+")[0];
        return first.substring(0, 1).toUpperCase(Locale.ROOT) + first.substring(1);
    }
}
