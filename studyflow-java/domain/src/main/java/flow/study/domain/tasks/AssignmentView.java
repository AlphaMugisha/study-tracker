package flow.study.domain.tasks;

import flow.study.domain.model.Assignment;
import flow.study.domain.model.TaskPriority;
import flow.study.domain.model.TaskStatus;

import java.time.Instant;
import java.time.LocalDate;
import java.time.LocalDateTime;
import java.time.ZoneId;

/** An assignment with its subject joined and its derived state computed. */
public record AssignmentView(
        Assignment row,
        SubjectRef subject,
        boolean overdue,
        /** The moment it is due, in her timezone, for sorting. */
        LocalDateTime dueAt) {

    /**
     * Overdue is computed here, never read from a column.
     *
     * A stored flag would need something running on a schedule to stay true
     * and would be wrong in between. The clock is passed in so that callers
     * and tests control it rather than this reaching for the current instant
     * halfway through building a screen.
     */
    public static AssignmentView of(Assignment row, SubjectRef subject, ZoneId zone, Instant now) {
        LocalDateTime due = LocalDateTime.of(row.dueDate(), row.dueTimeOrEndOfDay());
        boolean overdue = row.status() != TaskStatus.COMPLETED
                && due.isBefore(LocalDateTime.ofInstant(now, zone));
        return new AssignmentView(row, subject, overdue, due);
    }

    public String id() { return row.id(); }
    public String title() { return row.title(); }
    public TaskStatus status() { return row.status(); }
    public TaskPriority priority() { return row.priority(); }
    public int estimatedMinutes() { return row.estimatedMinutes(); }
    public LocalDate dueDate() { return row.dueDate(); }
    public String subjectId() { return row.subjectId(); }
    public String subjectName() { return subject == null ? null : subject.name(); }
    public boolean done() { return row.status() == TaskStatus.COMPLETED; }
}
