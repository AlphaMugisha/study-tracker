package flow.study.domain.timetable;

import java.util.ArrayList;
import java.util.Comparator;
import java.util.List;

/**
 * Where the student is in her school day, right now.
 *
 * Three properties matter and all three are load-bearing:
 *
 *   Timezone.  The caller passes minutes-since-midnight and a day index
 *              already resolved in HER zone, never the host one. On a server
 *              in another region the machine clock is simply the wrong clock.
 *              See SchoolClock.
 *
 *   Honesty.   There is no demo fallback. Outside school hours this says
 *              BeforeSchool or AfterSchool rather than pretending a lesson is
 *              running so that the card looks populated.
 *
 *   Tickable.  Pure and cheap, so the UI can call it every second against a
 *              live clock and the countdown actually counts down.
 */
public final class TimetableResolver {
    private TimetableResolver() {}

    /**
     * @param entries   the whole active timetable, every day
     * @param nowMinutes minutes since midnight, in her timezone
     * @param dayOfWeek  1 = Monday through 7 = Sunday, in her timezone
     */
    public static TimetableState resolveNow(List<ResolvedEntry> entries, int nowMinutes, int dayOfWeek) {
        if (entries.isEmpty()) return new TimetableState.NoTimetable();

        List<ResolvedEntry> todays = new ArrayList<>();
        for (ResolvedEntry e : entries) {
            if (e.dayOfWeek() == dayOfWeek) todays.add(e);
        }
        todays.sort(Comparator.comparingInt(ResolvedEntry::startMinutes));

        if (todays.isEmpty()) {
            return new TimetableState.NoSchool(Days.isWeekend(dayOfWeek)
                    ? TimetableState.NoSchool.Reason.WEEKEND
                    : TimetableState.NoSchool.Reason.EMPTY_DAY);
        }

        ResolvedEntry first = todays.get(0);
        ResolvedEntry last = todays.get(todays.size() - 1);

        if (nowMinutes < first.startMinutes()) {
            return new TimetableState.BeforeSchool(first, first.startMinutes() - nowMinutes);
        }

        if (nowMinutes >= last.endMinutes()) {
            return new TimetableState.AfterSchool(last);
        }

        int currentIndex = -1;
        for (int i = 0; i < todays.size(); i++) {
            ResolvedEntry e = todays.get(i);
            if (nowMinutes >= e.startMinutes() && nowMinutes < e.endMinutes()) {
                currentIndex = i;
                break;
            }
        }

        if (currentIndex != -1) {
            ResolvedEntry current = todays.get(currentIndex);
            int elapsed = nowMinutes - current.startMinutes();
            int total = current.endMinutes() - current.startMinutes();

            return new TimetableState.InActivity(
                    current,
                    currentIndex > 0 ? todays.get(currentIndex - 1) : null,
                    currentIndex + 1 < todays.size() ? todays.get(currentIndex + 1) : null,
                    elapsed,
                    current.endMinutes() - nowMinutes,
                    // Guarded: a zero-length entry is impossible per the CHECK
                    // constraint, but dividing by zero here would put NaN into
                    // the progress bar.
                    total > 0 ? Math.min(1.0, Math.max(0.0, (double) elapsed / total)) : 0.0);
        }

        // Between two timetabled things -- a gap the timetable does not name.
        ResolvedEntry next = null;
        for (ResolvedEntry e : todays) {
            if (e.startMinutes() > nowMinutes) { next = e; break; }
        }
        ResolvedEntry previous = null;
        for (int i = todays.size() - 1; i >= 0; i--) {
            if (todays.get(i).endMinutes() <= nowMinutes) { previous = todays.get(i); break; }
        }

        if (next != null && previous != null) {
            return new TimetableState.Gap(previous, next, next.startMinutes() - nowMinutes);
        }

        return new TimetableState.AfterSchool(last);
    }

    /** When the last bell goes today, or empty when there is no school. */
    public static java.util.OptionalInt schoolEndsMinutes(List<ResolvedEntry> entries, int dayOfWeek) {
        int end = -1;
        for (ResolvedEntry e : entries) {
            if (e.dayOfWeek() == dayOfWeek) end = Math.max(end, e.endMinutes());
        }
        return end < 0 ? java.util.OptionalInt.empty() : java.util.OptionalInt.of(end);
    }
}
