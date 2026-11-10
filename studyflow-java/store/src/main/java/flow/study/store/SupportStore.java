package flow.study.store;

import flow.study.domain.model.HelpRequest;
import flow.study.domain.model.HelpStatus;

import java.sql.Connection;
import java.sql.PreparedStatement;
import java.sql.ResultSet;
import java.sql.SQLException;
import java.time.Instant;
import java.util.ArrayList;
import java.util.HashMap;
import java.util.List;
import java.util.Map;

/**
 * The stuck-on list.
 *
 * The whole value of this list is that writing something down is easier than
 * saying it, so the write path is one field and no required choices: a topic,
 * and optionally which subject. Anything more to fill in and it stops getting
 * used, which is the only way this feature fails.
 */
public final class SupportStore {

    private static final String ENTITY = "help_requests";

    private final Connection connection;
    private final Outbox outbox;

    public SupportStore(LocalDatabase database, Outbox outbox) {
        this.connection = database.connection();
        this.outbox = outbox;
    }

    /** With the subject name joined, since every row is shown with one. */
    public record Entry(HelpRequest row, String subjectName) {
        public boolean open() {
            return row.status() == HelpStatus.OPEN;
        }
    }

    public List<Entry> entries() {
        String sql = """
                select h.id, h.user_id, h.subject_id, h.assignment_id, h.topic, h.detail,
                       h.status, h.resolved_at, h.created_at, h.updated_at,
                       s.name as subject_name
                  from help_requests h
                  left join subjects s on s.id = h.subject_id
                 order by h.status, h.created_at desc
                """;

        List<Entry> out = new ArrayList<>();
        try (PreparedStatement statement = connection.prepareStatement(sql);
             ResultSet rows = statement.executeQuery()) {
            while (rows.next()) {
                HelpRequest row = new HelpRequest(
                        rows.getString("id"),
                        rows.getString("user_id"),
                        rows.getString("subject_id"),
                        rows.getString("assignment_id"),
                        rows.getString("topic"),
                        rows.getString("detail"),
                        HelpStatus.parse(rows.getString("status")),
                        Rows.instant(rows, "resolved_at"),
                        Rows.instant(rows, "created_at"),
                        Rows.instant(rows, "updated_at"));
                out.add(new Entry(row, rows.getString("subject_name")));
            }
        } catch (SQLException e) {
            throw new StoreException("Cannot read your stuck-on list: " + e.getMessage(), e);
        }
        return out;
    }

    public String log(String userId, String topic, String subjectId, String detail) {
        String id = Rows.localId();
        Instant now = Instant.now();

        String sql = "insert into help_requests (id, user_id, subject_id, topic, detail, "
                + "status, created_at, updated_at) values (?, ?, ?, ?, ?, ?, ?, ?)";

        inTransaction(() -> {
            try (PreparedStatement statement = connection.prepareStatement(sql)) {
                statement.setString(1, id);
                statement.setString(2, userId);
                statement.setString(3, subjectId);
                statement.setString(4, topic);
                statement.setString(5, detail);
                statement.setString(6, HelpStatus.OPEN.wire());
                Rows.setInstant(statement, 7, now);
                Rows.setInstant(statement, 8, now);
                statement.executeUpdate();
            }

            Map<String, Object> payload = new HashMap<>();
            payload.put("user_id", userId);
            payload.put("topic", topic);
            payload.put("subject_id", subjectId);
            payload.put("detail", detail);
            outbox.record(ENTITY, id, Intent.Kind.CREATE, payload);
            return null;
        }, "Cannot save that");

        return id;
    }

    /**
     * Mark it sorted, or put it back.
     *
     * resolved_at moves locally because the CHECK constraint refuses any other
     * combination, but the intent carries status alone: in the cloud a trigger
     * owns the timestamp, and sending one that disagreed would be rejected.
     */
    public void setStatus(String id, HelpStatus status) {
        Instant resolvedAt = status == HelpStatus.RESOLVED ? Instant.now() : null;

        String sql = "update help_requests set status = ?, resolved_at = ?, updated_at = ? "
                + "where id = ?";
        inTransaction(() -> {
            try (PreparedStatement statement = connection.prepareStatement(sql)) {
                statement.setString(1, status.wire());
                Rows.setInstant(statement, 2, resolvedAt);
                Rows.setInstant(statement, 3, Instant.now());
                statement.setString(4, id);
                statement.executeUpdate();
            }
            outbox.record(ENTITY, id, Intent.Kind.UPDATE, Map.of("status", status.wire()));
            return null;
        }, "Cannot update that");
    }

    public void upsertFromCloud(HelpRequest row) {
        String sql = "merge into help_requests (id, user_id, subject_id, assignment_id, topic, "
                + "detail, status, resolved_at, created_at, updated_at) key (id) "
                + "values (?,?,?,?,?,?,?,?,?,?)";
        try (PreparedStatement statement = connection.prepareStatement(sql)) {
            statement.setString(1, row.id());
            statement.setString(2, row.userId());
            statement.setString(3, row.subjectId());
            statement.setString(4, row.assignmentId());
            statement.setString(5, row.topic());
            statement.setString(6, row.detail());
            statement.setString(7, row.status().wire());
            Rows.setInstant(statement, 8, row.resolvedAt());
            Rows.setInstant(statement, 9, row.createdAt());
            Rows.setInstant(statement, 10, row.updatedAt());
            statement.executeUpdate();
        } catch (SQLException e) {
            throw new StoreException("Cannot save a stuck-on entry: " + e.getMessage(), e);
        }
    }

    /** Keeps rows the cloud has never seen, as the task store does. */
    public void clearSynced() {
        try (PreparedStatement statement = connection.prepareStatement(
                "delete from help_requests where id not like ?")) {
            statement.setString(1, flow.study.domain.model.Ids.LOCAL_PREFIX + "%");
            statement.executeUpdate();
        } catch (SQLException e) {
            throw new StoreException("Cannot clear the local list: " + e.getMessage(), e);
        }
    }

    private interface Work {
        Object run() throws SQLException;
    }

    private void inTransaction(Work work, String failureMessage) {
        try {
            connection.setAutoCommit(false);
            work.run();
            connection.commit();
        } catch (SQLException e) {
            try {
                connection.rollback();
            } catch (SQLException failed) {
                e.addSuppressed(failed);
            }
            throw new StoreException(failureMessage + ": " + e.getMessage(), e);
        } finally {
            try {
                connection.setAutoCommit(true);
            } catch (SQLException ignored) {
                // The connection is unusable anyway if this fails.
            }
        }
    }
}
