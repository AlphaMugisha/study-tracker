package flow.study.domain.model;

import java.time.Instant;
import java.time.LocalDate;

/**
 * A lightweight study item. Carries no deadline, which is the whole
 * difference from homework.
 */
public record RevisionTask(
        String id,
        String userId,
        String subjectId,
        String title,
        String description,
        LocalDate scheduledDate,
        int estimatedMinutes,
        TaskPriority priority,
        TaskStatus status,
        Instant completedAt,
        Instant createdAt,
        Instant updatedAt) {
}
