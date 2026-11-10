package flow.study.store;

import flow.study.domain.model.Profile;
import flow.study.domain.model.UserRole;

import java.sql.Connection;
import java.sql.PreparedStatement;
import java.sql.ResultSet;
import java.sql.SQLException;
import java.time.Instant;
import java.time.LocalTime;
import java.util.Map;

/**
 * Her profile, her session, and how far each table has been pulled.
 *
 * Grouped together because all three answer the same question at startup: who
 * is this copy for, may it sync, and how stale is it.
 */
public final class ProfileStore {

    private static final String ENTITY = "profiles";

    private final Connection connection;
    private final Outbox outbox;

    public ProfileStore(LocalDatabase database, Outbox outbox) {
        this.connection = database.connection();
        this.outbox = outbox;
    }

    // -----------------------------------------------------------------------
    // Profile
    // -----------------------------------------------------------------------

    public Profile find(String userId) {
        String sql = "select id, full_name, role, timezone, study_until, settle_minutes, "
                + "created_at, updated_at from profiles where id = ?";
        try (PreparedStatement statement = connection.prepareStatement(sql)) {
            statement.setString(1, userId);
            try (ResultSet rows = statement.executeQuery()) {
                return rows.next() ? read(rows) : null;
            }
        } catch (SQLException e) {
            throw new StoreException("Cannot read the profile: " + e.getMessage(), e);
        }
    }

    private static Profile read(ResultSet rows) throws SQLException {
        return new Profile(
                rows.getString("id"),
                rows.getString("full_name"),
                UserRole.parse(rows.getString("role")),
                rows.getString("timezone"),
                Rows.time(rows, "study_until"),
                rows.getInt("settle_minutes"),
                Rows.instant(rows, "created_at"),
                Rows.instant(rows, "updated_at"));
    }

    /**
     * Replace the local copy of the profile.
     *
     * No intent recorded: this is what a PULL writes. A profile edit she makes
     * goes through {@link #updateSettings}, which does record one.
     */
    public void upsertFromCloud(Profile profile) {
        String sql = "merge into profiles (id, full_name, role, timezone, study_until, "
                + "settle_minutes, created_at, updated_at) key (id) values (?, ?, ?, ?, ?, ?, ?, ?)";
        try (PreparedStatement statement = connection.prepareStatement(sql)) {
            statement.setString(1, profile.id());
            statement.setString(2, profile.fullName());
            statement.setString(3, profile.role().wire());
            statement.setString(4, profile.timezone());
            Rows.setTime(statement, 5, profile.studyUntil());
            statement.setInt(6, profile.settleMinutes());
            Rows.setInstant(statement, 7, profile.createdAt());
            Rows.setInstant(statement, 8, profile.updatedAt());
            statement.executeUpdate();
        } catch (SQLException e) {
            throw new StoreException("Cannot save the profile: " + e.getMessage(), e);
        }
    }

    /**
     * The four fields she is allowed to change.
     *
     * Exactly the columns the cloud grants UPDATE on. Note what is absent:
     * role. The cloud refuses that write through a column grant regardless of
     * what is sent, so including it here would queue an intent that is
     * guaranteed to be rejected -- and the honest place to say "you cannot
     * change this" is before it is written down, not after a failed push.
     */
    public void updateSettings(String userId, String fullName, String timezone,
                               LocalTime studyUntil, int settleMinutes) {
        String sql = "update profiles set full_name = ?, timezone = ?, study_until = ?, "
                + "settle_minutes = ?, updated_at = ? where id = ?";
        try {
            connection.setAutoCommit(false);
            try (PreparedStatement statement = connection.prepareStatement(sql)) {
                statement.setString(1, fullName);
                statement.setString(2, timezone);
                Rows.setTime(statement, 3, studyUntil);
                statement.setInt(4, settleMinutes);
                Rows.setInstant(statement, 5, Instant.now());
                statement.setString(6, userId);
                statement.executeUpdate();
            }

            outbox.record(ENTITY, userId, Intent.Kind.UPDATE, Map.of(
                    "full_name", fullName,
                    "timezone", timezone,
                    "study_until", studyUntil.toString(),
                    "settle_minutes", settleMinutes));

            connection.commit();
        } catch (SQLException e) {
            rollback(e);
            throw new StoreException("Cannot save your settings: " + e.getMessage(), e);
        } finally {
            restoreAutoCommit();
        }
    }

    // -----------------------------------------------------------------------
    // Session
    // -----------------------------------------------------------------------

    /** @param refreshToken what lets the app sync later without asking again */
    public record Session(String userId, String email, String refreshToken,
                          Instant lastOnlineAuthAt) {}

    public Session session() {
        String sql = "select user_id, email, refresh_token, last_online_auth_at "
                + "from auth_state where id = 1";
        try (PreparedStatement statement = connection.prepareStatement(sql);
             ResultSet rows = statement.executeQuery()) {
            if (!rows.next()) return null;
            return new Session(
                    rows.getString("user_id"),
                    rows.getString("email"),
                    rows.getString("refresh_token"),
                    Rows.instant(rows, "last_online_auth_at"));
        } catch (SQLException e) {
            throw new StoreException("Cannot read the saved session: " + e.getMessage(), e);
        }
    }

    public void saveSession(Session session) {
        String sql = "merge into auth_state (id, user_id, email, refresh_token, "
                + "last_online_auth_at) key (id) values (1, ?, ?, ?, ?)";
        try (PreparedStatement statement = connection.prepareStatement(sql)) {
            statement.setString(1, session.userId());
            statement.setString(2, session.email());
            statement.setString(3, session.refreshToken());
            Rows.setInstant(statement, 4, session.lastOnlineAuthAt());
            statement.executeUpdate();
        } catch (SQLException e) {
            throw new StoreException("Cannot save the session: " + e.getMessage(), e);
        }
    }

    // -----------------------------------------------------------------------
    // Pull watermarks
    // -----------------------------------------------------------------------

    /**
     * How far a table has been pulled.
     *
     * Only activity_logs uses the watermark. Everything else pulls as a full
     * snapshot, because the dataset is a few hundred rows and a snapshot makes
     * cloud deletes resolve for free rather than needing tombstones.
     */
    public String watermark(String tableName) {
        try (PreparedStatement statement = connection.prepareStatement(
                "select watermark from sync_state where table_name = ?")) {
            statement.setString(1, tableName);
            try (ResultSet rows = statement.executeQuery()) {
                return rows.next() ? rows.getString("watermark") : null;
            }
        } catch (SQLException e) {
            throw new StoreException("Cannot read the sync watermark: " + e.getMessage(), e);
        }
    }

    public void setWatermark(String tableName, String watermark) {
        String sql = "merge into sync_state (table_name, last_pulled_at, watermark) "
                + "key (table_name) values (?, ?, ?)";
        try (PreparedStatement statement = connection.prepareStatement(sql)) {
            statement.setString(1, tableName);
            Rows.setInstant(statement, 2, Instant.now());
            statement.setString(3, watermark);
            statement.executeUpdate();
        } catch (SQLException e) {
            throw new StoreException("Cannot save the sync watermark: " + e.getMessage(), e);
        }
    }

    /** When anything was last pulled. What "last synced" in the header reads. */
    public Instant lastPulledAt() {
        try (PreparedStatement statement = connection.prepareStatement(
                "select max(last_pulled_at) from sync_state");
             ResultSet rows = statement.executeQuery()) {
            return rows.next() ? Rows.instant(rows, 1) : null;
        } catch (SQLException e) {
            throw new StoreException("Cannot read the sync time: " + e.getMessage(), e);
        }
    }

    private void rollback(SQLException cause) {
        try {
            connection.rollback();
        } catch (SQLException failed) {
            cause.addSuppressed(failed);
        }
    }

    private void restoreAutoCommit() {
        try {
            connection.setAutoCommit(true);
        } catch (SQLException ignored) {
            // The connection is unusable anyway if this fails.
        }
    }
}
