package flow.study.domain.report;

import flow.study.domain.model.ActivityLog;
import flow.study.domain.model.ActivityType;
import flow.study.domain.model.Assignment;
import flow.study.domain.model.StudySession;
import flow.study.domain.model.TaskStatus;
import flow.study.domain.text.Display;

import java.time.Instant;
import java.time.LocalDate;
import java.time.ZoneId;
import java.util.ArrayList;
import java.util.Collections;
import java.util.LinkedHashMap;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Map;
import java.util.Set;

/**
 * One report per day, cut at midnight.
 *
 * ---------------------------------------------------------------------------
 * WHOSE MIDNIGHT. Days are bucketed in the STUDENT timezone, not the host one
 * and not the reader one. This is the whole difficulty of the file: the parent
 * may be anywhere, and homework she finished at 00:30 on Tuesday belongs to
 * Tuesday for her and to Monday for a UTC clock. Every timestamp here goes
 * through dayKeyIn for that reason.
 * ---------------------------------------------------------------------------
 *
 * Computed on read rather than written by a nightly job. The numbers come from
 * the activity log, which is append-only and cannot be edited or deleted by
 * anyone -- so a finished day report is already final, and stays final,
 * without anything having to run at 00:00 to freeze it. It also means the
 * record survives the homework itself: deleting an assignment does not erase
 * the fact that it was completed, because the title was copied into the log
 * entry at the time.
 *
 * The one thing this cannot reconstruct is a count of rows that no longer
 * exist -- see missed, which reads live assignments and is therefore the only
 * field a later deletion can change.
 */
public final class DailyReportBuilder {
    private DailyReportBuilder() {}

    /** A card listing forty titles is a wall. */
    private static final int MAX_TITLES = 6;

    public record Request(
            ZoneId zone,
            /** How many days back to report on, including today. */
            int days,
            Instant now,
            List<ActivityLog> activity,
            List<StudySession> sessions,
            List<Assignment> assignments) {
    }

    /** Her calendar date for an instant. */
    public static LocalDate dayKeyIn(ZoneId zone, Instant at) {
        return at.atZone(zone).toLocalDate();
    }

    private static final class Bucket {
        int added;
        int completed;
        final List<String> completedTitles = new ArrayList<>();
        int studiedMinutes;
        int helpLogged;
        int helpResolved;
        int events;
        final List<String> missed = new ArrayList<>();
    }

    public static List<DailyReport> build(Request request) {
        List<LocalDate> keys = dayKeys(request.zone(), request.now(), request.days());
        LocalDate todayKey = keys.get(0);
        Set<LocalDate> wanted = new LinkedHashSet<>(keys);

        Map<LocalDate, Bucket> buckets = new LinkedHashMap<>();
        for (LocalDate key : keys) buckets.put(key, new Bucket());

        for (ActivityLog entry : request.activity()) {
            Bucket bucket = buckets.get(dayKeyIn(request.zone(), entry.createdAt()));
            if (bucket == null) continue;

            bucket.events++;

            ActivityType type = entry.activityType();
            if (type == ActivityType.ASSIGNMENT_CREATED) {
                bucket.added++;
            } else if (type == ActivityType.ASSIGNMENT_COMPLETED) {
                bucket.completed++;
                Object title = entry.metadata() == null ? null : entry.metadata().get("title");
                if (title instanceof String s) bucket.completedTitles.add(s);
            } else if (type == ActivityType.HELP_LOGGED) {
                bucket.helpLogged++;
            } else if (type == ActivityType.HELP_RESOLVED) {
                bucket.helpResolved++;
            }
        }

        for (StudySession session : request.sessions()) {
            Bucket bucket = buckets.get(dayKeyIn(request.zone(), session.startedAt()));
            if (bucket != null && session.durationMinutes() != null) {
                bucket.studiedMinutes += session.durationMinutes();
            }
        }

        /*
         * Missed is the one field read from live assignments rather than from
         * the immutable log, because the log records what she DID and this is
         * about what she did not do -- an absence leaves no entry. It is
         * therefore also the one field that can change retroactively if old
         * homework is later deleted.
         *
         * A due date is already a plain calendar date in her own terms, so it
         * is compared as one. Putting it through an instant would re-introduce
         * exactly the timezone shift the rest of this file exists to avoid.
         */
        for (Assignment a : request.assignments()) {
            if (!wanted.contains(a.dueDate())) continue;
            // The day in progress has not finished yet, so nothing is missed.
            if (a.dueDate().equals(todayKey)) continue;

            boolean finishedOnTime = a.status() == TaskStatus.COMPLETED
                    && a.completedAt() != null
                    && !dayKeyIn(request.zone(), a.completedAt()).isAfter(a.dueDate());

            if (!finishedOnTime) {
                Bucket bucket = buckets.get(a.dueDate());
                if (bucket != null) bucket.missed.add(a.title());
            }
        }

        List<DailyReport> reports = new ArrayList<>();
        for (LocalDate key : keys) {
            Bucket b = buckets.get(key);
            // Newest first, and capped.
            List<String> titles = new ArrayList<>(b.completedTitles);
            Collections.reverse(titles);
            if (titles.size() > MAX_TITLES) titles = titles.subList(0, MAX_TITLES);

            reports.add(new DailyReport(
                    key,
                    Display.shortDate(key),
                    Display.weekday(key),
                    key.equals(todayKey),
                    b.added,
                    b.completed,
                    List.copyOf(titles),
                    b.studiedMinutes,
                    b.helpLogged,
                    b.helpResolved,
                    b.events,
                    List.copyOf(b.missed)));
        }
        return reports;
    }

    /**
     * Walks back from her today, n calendar days.
     *
     * Calendar arithmetic on a LocalDate rather than subtracting 86400000 from
     * an instant: the browser version had to dedupe because a DST shift could
     * make two steps land on the same calendar day. Stepping dates cannot do
     * that, so there is nothing to dedupe.
     */
    private static List<LocalDate> dayKeys(ZoneId zone, Instant now, int days) {
        LocalDate today = dayKeyIn(zone, now);
        List<LocalDate> keys = new ArrayList<>();
        for (int i = 0; i < days; i++) keys.add(today.minusDays(i));
        return keys;
    }
}
