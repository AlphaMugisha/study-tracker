package flow.study.store;

import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.io.TempDir;

import java.nio.file.Path;
import java.sql.SQLException;
import java.sql.Statement;
import java.time.Instant;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.junit.jupiter.api.Assertions.assertTrue;

/**
 * The encrypted copy, end to end.
 *
 * These are the assertions the rest of the app is built on: that the file is
 * genuinely encrypted, that a wrong passphrase says so rather than reporting
 * corruption, and that the activity log cannot be rewritten locally either.
 */
class LocalDatabaseTest {

    private static final char[] RIGHT = "correct horse battery".toCharArray();
    private static final char[] WRONG = "incorrect horse battery".toCharArray();

    @Test
    void createsAnEncryptedCopyAndReopensIt(@TempDir Path dir) {
        StoreLocation location = new StoreLocation(dir);
        String salt = Passphrase.newSalt();

        assertFalse(location.initialised(), "nothing should exist yet");

        try (LocalDatabase db = LocalDatabase.open(location, RIGHT, salt)) {
            try (Statement s = db.connection().createStatement()) {
                s.execute("insert into subjects (id, user_id, name, color_token) "
                        + "values ('s1', 'u1', 'Maths', 'chart-1')");
            } catch (SQLException e) {
                throw new AssertionError(e);
            }
        }

        location.writeSidecar(new StoreLocation.Sidecar(salt, "her@example.com"));
        assertTrue(location.initialised(), "a copy should exist now");

        // Reopening with the same passphrase finds the row.
        try (LocalDatabase db = LocalDatabase.open(location, RIGHT, salt)) {
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
    void aWrongPassphraseSaysSoRatherThanReportingCorruption(@TempDir Path dir) {
        StoreLocation location = new StoreLocation(dir);
        String salt = Passphrase.newSalt();

        LocalDatabase.open(location, RIGHT, salt).close();

        assertThrows(WrongPassphraseException.class,
                () -> LocalDatabase.open(location, WRONG, salt));
    }

    @Test
    void theActivityLogCannotBeRewritten(@TempDir Path dir) {
        StoreLocation location = new StoreLocation(dir);

        try (LocalDatabase db = LocalDatabase.open(location, RIGHT, Passphrase.newSalt())) {
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
    void theSchemaIsIdempotentSoEveryStartCanApplyIt(@TempDir Path dir) {
        StoreLocation location = new StoreLocation(dir);
        String salt = Passphrase.newSalt();

        // Three opens, three applications of the schema. A migration that is
        // not idempotent fails on the second launch, not the first, which is
        // the worst possible time to find out.
        for (int i = 0; i < 3; i++) {
            LocalDatabase.open(location, RIGHT, salt).close();
        }
    }

    @Test
    void theSaltLivesOutsideTheEncryptedFile(@TempDir Path dir) {
        StoreLocation location = new StoreLocation(dir);
        String salt = Passphrase.newSalt();
        location.writeSidecar(new StoreLocation.Sidecar(salt, "her@example.com"));

        StoreLocation.Sidecar read = location.readSidecar();
        assertEquals(salt, read.salt());
        assertEquals("her@example.com", read.email());
    }

    @Test
    void derivedKeysDifferByContextSoNeitherRevealsTheOther() {
        String salt = Passphrase.newSalt();
        assertFalse(Passphrase.fileKey(RIGHT, salt).equals(Passphrase.verifier(RIGHT, salt)));
        assertTrue(Passphrase.matches(RIGHT, salt, Passphrase.verifier(RIGHT, salt)));
        assertFalse(Passphrase.matches(WRONG, salt, Passphrase.verifier(RIGHT, salt)));
    }

    @Test
    void transactionsRollBackAsAWhole(@TempDir Path dir) {
        StoreLocation location = new StoreLocation(dir);

        try (LocalDatabase db = LocalDatabase.open(location, RIGHT, Passphrase.newSalt())) {
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

        assertTrue(Instant.now().isAfter(Instant.EPOCH));
    }
}
