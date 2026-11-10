package flow.study.domain.model;

import java.time.Instant;
import java.time.LocalTime;

/** An individual slot in the school day. */
public record TimetableEntry(
        String id,
        String userId,
        String timetableVersionId,
        String subjectId,
        ActivityKind activityType,
        /** Used when there is no subject, for example Break or Assembly. */
        String title,
        /** 1 = Monday through 7 = Sunday. */
        int dayOfWeek,
        LocalTime startTime,
        LocalTime endTime,
        String room,
        String teacher,
        ExtractionConfidence confidence,
        Instant createdAt,
        Instant updatedAt) {
}
