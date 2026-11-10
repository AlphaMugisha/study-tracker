package flow.study.domain.tasks;

import flow.study.domain.model.TaskStatus;

import java.time.Instant;
import java.time.LocalDate;
import java.time.ZoneId;
import java.util.ArrayList;
import java.util.Comparator;
import java.util.List;

/**
 * The pure ordering rules for homework.
 *
 * These live apart from anything that reads the database so that the planner
 * can import the sort, and the sort can be tested, with no store and no
 * network anywhere near it. The planner does not invent its own ordering: the
 * top of the plan is the top of the homework list, because they are the same
 * comparator.
 */
public final class TaskOrdering {
    private TaskOrdering() {}

    /** Today plus the next two days counts as due soon. */
    private static final int DUE_SOON_DAYS = 3;

    /**
     * Most urgent first: overdue, then due date, then priority, then the
     * longest job of an equal pair -- a big thing left till last is the one
     * that actually runs out of evening.
     */
    public static final Comparator<AssignmentView> BY_URGENCY = (a, b) -> {
        if (a.overdue() != b.overdue()) return a.overdue() ? -1 : 1;
        int due = a.dueAt().compareTo(b.dueAt());
        if (due != 0) return due;
        int priority = a.priority().rank() - b.priority().rank();
        if (priority != 0) return priority;
        return b.estimatedMinutes() - a.estimatedMinutes();
    };

    /** The four buckets the homework page renders. */
    public record Groups(
            List<AssignmentView> overdue,
            List<AssignmentView> dueSoon,
            List<AssignmentView> upcoming,
            List<AssignmentView> completed) {
    }

    public static Groups group(List<AssignmentView> assignments, ZoneId zone, Instant now) {
        LocalDate horizon = now.atZone(zone).toLocalDate().plusDays(DUE_SOON_DAYS);

        List<AssignmentView> overdue = new ArrayList<>();
        List<AssignmentView> dueSoon = new ArrayList<>();
        List<AssignmentView> upcoming = new ArrayList<>();
        List<AssignmentView> completed = new ArrayList<>();

        for (AssignmentView a : assignments) {
            if (a.status() == TaskStatus.COMPLETED) completed.add(a);
            else if (a.overdue()) overdue.add(a);
            else if (a.dueAt().toLocalDate().isBefore(horizon)) dueSoon.add(a);
            else upcoming.add(a);
        }

        overdue.sort(BY_URGENCY);
        dueSoon.sort(BY_URGENCY);
        upcoming.sort(BY_URGENCY);
        // Most recently finished first, so the top of the list is the thing
        // she just did rather than something from last term.
        completed.sort(Comparator.comparing(
                (AssignmentView a) -> a.row().completedAt(),
                Comparator.nullsLast(Comparator.reverseOrder())));

        return new Groups(overdue, dueSoon, upcoming, completed);
    }

    /** Outstanding homework, most urgent first. What the planner consumes. */
    public static List<AssignmentView> outstanding(List<AssignmentView> assignments) {
        List<AssignmentView> open = new ArrayList<>();
        for (AssignmentView a : assignments) {
            if (a.status() != TaskStatus.COMPLETED) open.add(a);
        }
        open.sort(BY_URGENCY);
        return open;
    }

    public static List<RevisionView> outstandingRevision(List<RevisionView> revision) {
        List<RevisionView> open = new ArrayList<>();
        for (RevisionView r : revision) {
            if (r.status() != TaskStatus.COMPLETED) open.add(r);
        }
        return open;
    }
}
