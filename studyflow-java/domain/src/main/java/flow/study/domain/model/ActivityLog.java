package flow.study.domain.model;

import java.time.Instant;
import java.util.Map;

/** An academic record, not surveillance. Append-only, everywhere. */
public record ActivityLog(
        String id,
        /** Whose academic record this belongs to. */
        String userId,
        /** Who performed the action. */
        String actorId,
        ActivityType activityType,
        String entityType,
        String entityId,
        Map<String, Object> metadata,
        Instant createdAt) {

    /**
     * Metadata is an event log, not a place to dump captured data. The cloud
     * caps it and rejects anything larger, so the cap is restated here to
     * fail before a push rather than during one.
     */
    public static final int MAX_METADATA_BYTES = 4096;
}
