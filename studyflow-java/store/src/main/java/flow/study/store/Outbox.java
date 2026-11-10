package flow.study.store;

import com.fasterxml.jackson.core.JsonProcessingException;
import com.fasterxml.jackson.core.type.TypeReference;
import com.fasterxml.jackson.databind.ObjectMapper;

import java.sql.Connection;
import java.sql.PreparedStatement;
import java.sql.ResultSet;
import java.sql.SQLException;
import java.sql.Statement;
import java.time.Instant;
import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Locale;
import java.util.Map;

/**
 * Everything waiting to go up, in the order she did it.
 *
 * seq is the replay order, but order only has to hold WITHIN an entity:
 * completing assignment A and then renaming it must replay in that order,
 * while neither has anything to do with a help request logged in between. So
 * {@link #pendingByEntity()} groups before the engine replays, which means one
 * rejected intent stalls its own row and nothing else.
 */
public final class Outbox {

    private static final ObjectMapper JSON = new ObjectMapper();
    private static final TypeReference<Map<String, Object>> PAYLOAD = new TypeReference<>() {};

    /** Error text is for showing her, not for storing a stack trace. */
    private static final int MAX_ERROR_CHARS = 2000;

    private final Connection connection;

    public Outbox(LocalDatabase database) {
        this.connection = database.connection();
    }

    /**
     * Record an intent. Returns its sequence number.
     *
     * Called inside the same transaction as the local write it describes, so
     * the local copy and the outbox can never disagree about what happened.
     */
    public long record(String entityType, String entityId, Intent.Kind kind,
                       Map<String, Object> payload) {
        String sql = "insert into outbox (entity_type, entity_id, kind, payload, created_at) "
                + "values (?, ?, ?, ?, ?)";
        try (PreparedStatement statement =
                     connection.prepareStatement(sql, Statement.RETURN_GENERATED_KEYS)) {
            statement.setString(1, entityType);
            statement.setString(2, entityId);
            statement.setString(3, kind.wire());
            statement.setString(4, JSON.writeValueAsString(payload));
            Rows.setInstant(statement, 5, Instant.now());
            statement.executeUpdate();

            try (ResultSet keys = statement.getGeneratedKeys()) {
                return keys.next() ? keys.getLong(1) : -1;
            }
        } catch (SQLException e) {
            throw new StoreException("Cannot record the change for sending: " + e.getMessage(), e);
        } catch (JsonProcessingException e) {
            throw new StoreException("Cannot serialise the change: " + e.getMessage(), e);
        }
    }

    /** How many changes are waiting. What the sync pill in the header shows. */
    public int pendingCount() {
        return countByStatus(Intent.Status.PENDING);
    }

    /** How many the cloud refused. Shown separately: these need a decision. */
    public int rejectedCount() {
        return countByStatus(Intent.Status.REJECTED);
    }

    private int countByStatus(Intent.Status status) {
        try (PreparedStatement statement = connection.prepareStatement(
                "select count(*) from outbox where status = ?")) {
            statement.setString(1, status.wire());
            try (ResultSet rows = statement.executeQuery()) {
                return rows.next() ? rows.getInt(1) : 0;
            }
        } catch (SQLException e) {
            throw new StoreException("Cannot count pending changes: " + e.getMessage(), e);
        }
    }

    public List<Intent> pending() {
        return byStatus(Intent.Status.PENDING);
    }

    public List<Intent> rejected() {
        return byStatus(Intent.Status.REJECTED);
    }

    /**
     * Pending intents grouped by the row they touch, each group in seq order.
     *
     * A LinkedHashMap, so the groups come out in the order their first intent
     * was made. Replaying the oldest change first is not required for
     * correctness once grouped, but it means the first thing she did offline
     * is the first thing to land -- and if the connection drops halfway, what
     * got through is the older half rather than an arbitrary one.
     */
    public Map<String, List<Intent>> pendingByEntity() {
        Map<String, List<Intent>> grouped = new LinkedHashMap<>();
        for (Intent intent : pending()) {
            grouped.computeIfAbsent(intent.entityKey(), key -> new ArrayList<>()).add(intent);
        }
        return grouped;
    }

    private List<Intent> byStatus(Intent.Status status) {
        String sql = "select seq, entity_type, entity_id, kind, payload, status, attempts, "
                + "last_error, created_at, sent_at from outbox where status = ? order by seq asc";
        List<Intent> out = new ArrayList<>();
        try (PreparedStatement statement = connection.prepareStatement(sql)) {
            statement.setString(1, status.wire());
            try (ResultSet rows = statement.executeQuery()) {
                while (rows.next()) out.add(read(rows));
            }
        } catch (SQLException e) {
            throw new StoreException("Cannot read pending changes: " + e.getMessage(), e);
        }
        return out;
    }

    private Intent read(ResultSet rows) throws SQLException {
        Map<String, Object> payload;
        try {
            payload = JSON.readValue(rows.getString("payload"), PAYLOAD);
        } catch (JsonProcessingException e) {
            /*
             * A payload that will not parse cannot be sent, and throwing here
             * would make the whole outbox unreadable -- so one bad row would
             * hide every good one behind it. An empty payload makes this
             * intent fail on push instead, where it is reported and retryable.
             */
            payload = Map.of();
        }

        return new Intent(
                rows.getLong("seq"),
                rows.getString("entity_type"),
                rows.getString("entity_id"),
                Intent.Kind.valueOf(rows.getString("kind").toUpperCase(Locale.ROOT)),
                payload,
                Intent.Status.parse(rows.getString("status")),
                rows.getInt("attempts"),
                rows.getString("last_error"),
                Rows.instant(rows, "created_at"),
                Rows.instant(rows, "sent_at"));
    }

    public void markSent(long seq) {
        String sql = "update outbox set status = ?, sent_at = ?, last_error = null where seq = ?";
        update(sql, statement -> {
            statement.setString(1, Intent.Status.SENT.wire());
            Rows.setInstant(statement, 2, Instant.now());
            statement.setLong(3, seq);
        });
    }

    public void markRejected(long seq, String error) {
        String sql = "update outbox set status = ?, attempts = attempts + 1, last_error = ? "
                + "where seq = ?";
        update(sql, statement -> {
            statement.setString(1, Intent.Status.REJECTED.wire());
            statement.setString(2, truncate(error));
            statement.setLong(3, seq);
        });
    }

    /** A transient failure: still pending, but the attempt is counted. */
    public void markAttempted(long seq, String error) {
        String sql = "update outbox set attempts = attempts + 1, last_error = ? where seq = ?";
        update(sql, statement -> {
            statement.setString(1, truncate(error));
            statement.setLong(2, seq);
        });
    }

    /** Send a rejected intent back to the queue, after she asks for a retry. */
    public void retry(long seq) {
        String sql = "update outbox set status = ?, last_error = null where seq = ?";
        update(sql, statement -> {
            statement.setString(1, Intent.Status.PENDING.wire());
            statement.setLong(2, seq);
        });
    }

    /**
     * Give up on one.
     *
     * The local row is left as she made it; the next pull replaces it with
     * cloud truth. Correcting it here would be guessing at what the cloud
     * holds, when the pull is about to say.
     */
    public void discard(long seq) {
        update("delete from outbox where seq = ?", statement -> statement.setLong(1, seq));
    }

    /** Housekeeping: a sent intent is history, not state. */
    public int purgeSent() {
        try (PreparedStatement statement = connection.prepareStatement(
                "delete from outbox where status = ?")) {
            statement.setString(1, Intent.Status.SENT.wire());
            return statement.executeUpdate();
        } catch (SQLException e) {
            throw new StoreException("Cannot purge sent changes: " + e.getMessage(), e);
        }
    }

    private static String truncate(String error) {
        if (error == null) return null;
        return error.length() <= MAX_ERROR_CHARS ? error : error.substring(0, MAX_ERROR_CHARS);
    }

    private void update(String sql, Binder binder) {
        try (PreparedStatement statement = connection.prepareStatement(sql)) {
            binder.bind(statement);
            statement.executeUpdate();
        } catch (SQLException e) {
            throw new StoreException("Cannot update the outbox: " + e.getMessage(), e);
        }
    }

    private interface Binder {
        void bind(PreparedStatement statement) throws SQLException;
    }
}
