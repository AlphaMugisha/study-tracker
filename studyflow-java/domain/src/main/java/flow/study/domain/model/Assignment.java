package flow.study.domain.model;

import java.time.Instant;
import java.time.LocalDate;
import java.time.LocalTime;

/** Homework. */
public record Assignment(
        String id,
        String userId,
        String subjectId,
        String title,
        String description,
        LocalDate dueDate,
        /** Null means end of the due day. */
        LocalTime dueTime,
        TaskPriority priority,
        int estimatedMinutes,
        TaskStatus status,
        Instant completedAt,
        Instant createdAt,
        Instant updatedAt) {

    /** End of the due day when no time is set, matching the SQL coalesce. */
    public LocalTime dueTimeOrEndOfDay() {
        return dueTime == null ? LocalTime.of(23, 59, 59) : dueTime;
    }
}
