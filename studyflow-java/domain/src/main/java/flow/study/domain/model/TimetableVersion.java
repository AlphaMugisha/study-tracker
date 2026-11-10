package flow.study.domain.model;

import java.time.Instant;
import java.time.LocalDate;

/**
 * A timetable as confirmed at a point in time. Versioned so that a re-upload
 * never destroys a working one.
 */
public record TimetableVersion(
        String id,
        String userId,
        String name,
        TimetableStatus status,
        TimetableSource sourceType,
        String sourcePath,
        LocalDate effectiveFrom,
        LocalDate effectiveUntil,
        Instant confirmedAt,
        Instant createdAt,
        Instant updatedAt) {

    /** Does this version cover the given day? An open end never expires. */
    public boolean covers(LocalDate day) {
        if (day.isBefore(effectiveFrom)) return false;
        return effectiveUntil == null || !day.isAfter(effectiveUntil);
    }
}
