package flow.study.store;

import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.io.TempDir;

import java.nio.file.Path;
import java.sql.SQLException;
import java.sql.Statement;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.junit.jupiter.api.Assertions.assertTrue;

/**
 * The local copy, end to end.
 *
 * These are the assertions the rest of the app is built on: that the copy is
 * created and reopened without anything being asked of her, that the schema
 * can be applied on every launch, and that the activity log cannot be
 * rewritten locally either.
 */
class LocalDatabaseTest {

    @Test
    void createsACopyAndReopensItWithNothingAsked(@TempDir Path dir) {
        StoreLocation location = new StoreLocation(dir);

        try (LocalDatabase db = LocalDatabase.open(location)) {
            try (Statement s = db.connection().createStatement()) {
                s.execute("insert into subjects (id, user_id, name, color_token) "
                        + "values ('s1', 'u1', 'Maths', 'chart-1')");
            } catch (SQLException e) {
                throw new AssertionError(e);
            }
        }

        try (LocalDatabase db = LocalDatabase.open(location)) {
            try (Statement s = db.connection().createStatement();
                 var rows = s.executeQuery("select name from subjects where id = 's1'")) {
                assertTrue(rows.next());
                assertEquals("Maths", rows.getString(1));
            } catch (SQLException e) {
                throw new AssertionError(e);
            }
        }
    }

    @Test
    void theActivityLogCannotBeRewritten(@TempDir Path dir) {
        try (LocalDatabase db = LocalDatabase.open(new StoreLocation(dir))) {
            try (Statement s = db.connection().createStatement()) {
                s.execute("insert into activity_logs "
                        + "(id, user_id, actor_id, activity_type, created_at) values "
                        + "('a1', 'u1', 'u1', 'assignment_completed', current_timestamp)");

                SQLException refused = assertThrows(SQLException.class, () ->
                        s.execute("update activity_logs set activity_type = 'help_logged' "
                                + "where id = 'a1'"));
                assertTrue(refused.getMessage().contains("append-only"),
                        "the refusal should explain itself: " + refused.getMessage());

                // DELETE is deliberately still allowed, so clearing the local
                // cache and re-pulling works.
                s.execute("delete from activity_logs where id = 'a1'");
            } catch (SQLException e) {
                throw new AssertionError(e);
            }
        }
    }

    @Test
    void theSchemaIsIdempotentSoEveryLaunchCanApplyIt(@TempDir Path dir) {
        StoreLocation location = new StoreLocation(dir);

        // Three opens, three applications of the schema. A migration that is
        // not idempotent fails on the second launch, not the first, which is
        // the worst possible time to find out.
        for (int i = 0; i < 3; i++) {
            LocalDatabase.open(location).close();
        }
    }

    @Test
    void transactionsRollBackAsAWhole(@TempDir Path dir) {
        try (LocalDatabase db = LocalDatabase.open(new StoreLocation(dir))) {
            assertThrows(StoreException.class, () -> db.inTransaction(conn -> {
                try (Statement s = conn.createStatement()) {
                    s.execute("insert into subjects (id, user_id, name) values ('s1','u1','Ok')");
                    // Violates the estimated_minutes CHECK, so the whole unit
                    // of work must go.
                    s.execute("insert into assignments "
                            + "(id, user_id, title, due_date, estimated_minutes) "
                            + "values ('a1','u1','Bad','2026-10-01', 9999)");
                }
                return null;
            }));

            try (Statement s = db.connection().createStatement();
                 var rows = s.executeQuery("select count(*) from subjects")) {
                assertTrue(rows.next());
                assertEquals(0, rows.getInt(1), "the good insert should have rolled back too");
            } catch (SQLException e) {
                throw new AssertionError(e);
            }
        }
    }

    @Test
    void aFreshCopyHasNoSessionSoTheAppKnowsToAskOnce(@TempDir Path dir) {
        try (LocalDatabase db = LocalDatabase.open(new StoreLocation(dir))) {
            ProfileStore profiles = new ProfileStore(db, new Outbox(db));

            // Whether this row exists is what decides setup versus
            // straight-to-the-app, so there is no marker file to disagree.
            assertEquals(null, profiles.session());

            profiles.saveSession(new ProfileStore.Session(
                    "u1", "her@example.com", "refresh-token", java.time.Instant.now()));

            ProfileStore.Session saved = profiles.session();
            assertEquals("u1", saved.userId());
            assertEquals("her@example.com", saved.email());
            assertEquals("refresh-token", saved.refreshToken());
        }
    }
}
