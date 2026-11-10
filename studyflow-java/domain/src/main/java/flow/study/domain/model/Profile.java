package flow.study.domain.model;

import java.time.Instant;
import java.time.LocalTime;
import java.time.ZoneId;

/**
 * One row per account.
 *
 * studyUntil and settleMinutes are the planning window: the planner treats
 * the cutoff as hard and defers anything that will not fit before it, which
 * is the single most useful thing it can say.
 */
public record Profile(
        String id,
        String fullName,
        UserRole role,
        String timezone,
        LocalTime studyUntil,
        int settleMinutes,
        Instant createdAt,
        Instant updatedAt) {

    /** Her clock, falling back to the host one if the stored zone is unknown. */
    public ZoneId zone() {
        try {
            return ZoneId.of(timezone);
        } catch (RuntimeException e) {
            return ZoneId.systemDefault();
        }
    }

    public int studyUntilMinutes() {
        return studyUntil.getHour() * 60 + studyUntil.getMinute();
    }
}
