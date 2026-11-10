package flow.study.sync;

import com.fasterxml.jackson.databind.JsonNode;

import java.util.Map;

/**
 * The cloud, as the sync engine needs it.
 *
 * Extracted so the engine can be tested against a stub. The rules worth
 * proving -- push before pull, a refusal stalling one row and not the rest, a
 * locally-created row picking up its cloud id mid-group -- are all engine
 * behaviour, and testing them through a real HTTP client would be testing
 * Supabase instead.
 *
 * {@link PostgrestClient} is the only production implementation.
 */
public interface CloudApi {

    /** Every row of a table she can see. */
    JsonNode selectAll(String table);

    /** Rows newer than a watermark, for the one table that is unbounded. */
    JsonNode selectSince(String table, String column, String watermark);

    JsonNode insert(String table, Map<String, Object> row);

    JsonNode update(String table, String id, Map<String, Object> fields);

    void delete(String table, String id);

    /**
     * Whether the cloud answers at all.
     *
     * A real authenticated request rather than a host ping: a reachable host
     * with a paused project or an expired token is still "cannot sync", and
     * only a request distinguishes that from a working connection.
     */
    boolean reachable();
}
