package flow.study.domain.model;

import java.time.Instant;

/**
 * What was actually worked on, and for how long.
 *
 * At most one of assignmentId and revisionTaskId is set: a session is work on
 * one thing.
 */
public record StudySession(
        String id,
        String userId,
        String subjectId,
        String assignmentId,
        String revisionTaskId,
        Instant startedAt,
        Instant endedAt,
        Integer durationMinutes,
        Instant createdAt,
        Instant updatedAt) {

    public boolean running() { return endedAt == null; }
}
