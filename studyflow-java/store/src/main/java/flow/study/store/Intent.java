package flow.study.store;

import java.time.Instant;
import java.util.Map;

/**
 * One offline mutation, recorded as what she MEANT rather than as a row image.
 *
 * This is the whole reason sync is tractable here. "Complete assignment X" is
 * idempotent and names one column, so replaying it cannot overwrite a field
 * she never touched. Shipping the row instead would mean sending her stale
 * copy of every other column with it -- including a timetable edit made by a
 * linked adult while she was offline, which is the one cross-account write the
 * product allows and therefore the one that must survive.
 */
public record Intent(
        long seq,
        String entityType,
        String entityId,
        Kind kind,
        /** The fields this intent sets. Never a whole row. */
        Map<String, Object> payload,
        Status status,
        int attempts,
        String lastError,
        Instant createdAt,
        Instant sentAt) {

    /**
     * What an intent can be.
     *
     * Narrow on purpose. Every member maps to one PostgREST call against one
     * table, so there is no member that means "work out what changed".
     */
    public enum Kind {
        CREATE, UPDATE, DELETE;

        public String wire() { return name().toLowerCase(java.util.Locale.ROOT); }
    }

    public enum Status {
        /** Waiting for a connection. */
        PENDING,
        /** The cloud accepted it. */
        SENT,
        /**
         * The cloud refused it: RLS said no, the row is gone, or a constraint
         * failed. Kept rather than discarded, so it can be shown and retried
         * -- a silently dropped intent is a change she believes she made.
         */
        REJECTED;

        public String wire() { return name().toLowerCase(java.util.Locale.ROOT); }

        public static Status parse(String wire) {
            return valueOf(wire.toUpperCase(java.util.Locale.ROOT));
        }
    }

    /** True once this has landed and need not be shown as waiting. */
    public boolean settled() {
        return status == Status.SENT;
    }

    /** The grouping key. Order has to hold within an entity, not across all of them. */
    public String entityKey() {
        return entityType + ":" + entityId;
    }
}
