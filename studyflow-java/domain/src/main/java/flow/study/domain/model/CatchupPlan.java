package flow.study.domain.model;

import java.time.Instant;
import java.time.LocalDate;

/**
 * A commitment to do a piece of work in a named school period, and whether it
 * happened.
 *
 * The slot is copied onto the row rather than only referenced, because
 * confirming an imported timetable replaces the week of entries and would
 * otherwise null timetableEntryId on every outstanding plan.
 *
 * plannedDate is a real date rather than a weekday: the timetable recurs, a
 * commitment does not.
 */
public record CatchupPlan(
        String id,
        String userId,
        String assignmentId,
        String revisionTaskId,
        String timetableEntryId,
        LocalDate plannedDate,
        int startMinutes,
        int endMinutes,
        String slotLabel,
        int plannedMinutes,
        CatchupStatus status,
        Instant answeredAt,
        Instant createdAt,
        Instant updatedAt) {
}
