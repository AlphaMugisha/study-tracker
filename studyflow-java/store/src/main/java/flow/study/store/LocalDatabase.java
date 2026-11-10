package flow.study.store;

import java.io.IOException;
import java.io.InputStream;
import java.io.UncheckedIOException;
import java.nio.charset.StandardCharsets;
import java.sql.Connection;
import java.sql.DriverManager;
import java.sql.SQLException;
import java.sql.Statement;

/**
 * The encrypted local copy, open.
 *
 * H2 in file mode with CIPHER=AES. The file password is two words separated by
 * a space: the file key and then the user password. H2 requires both, so the
 * user half is a constant -- the real secret is the Argon2-derived file key,
 * and inventing a second passphrase to protect the same file would be
 * theatre.
 *
 * Opening with the wrong key does not report a wrong password; it reports a
 * corrupt or unsupported file. That is mapped to WrongPassphraseException
 * here, because the unlock screen has to be able to say "try again" rather
 * than implying her evening of work is gone.
 */
public final class LocalDatabase implements AutoCloseable {

    /**
     * The user half of the H2 file password.
     *
     * Not a secret and not pretending to be. See the class comment.
     */
    private static final String USER_PASSWORD = "studyflow";

    private final Connection connection;

    private LocalDatabase(Connection connection) {
        this.connection = connection;
    }

    /**
     * Open an existing copy, or create one.
     *
     * @param passphrase cleared by the caller; this does not keep a reference
     */
    public static LocalDatabase open(StoreLocation location, char[] passphrase, String salt) {
        location.ensureDirectory();

        String url = "jdbc:h2:file:" + location.databaseBase().toAbsolutePath()
                + ";CIPHER=AES"
                // The default is to close on the last connection going away,
                // which for a desktop app means a full reopen per screen.
                + ";DB_CLOSE_DELAY=-1"
                // A desktop app is the only writer. Without this, a stale lock
                // file from a crash makes the app unstartable until someone
                // deletes a file they will never find.
                + ";AUTO_SERVER=FALSE";

        String filePassword = Passphrase.fileKey(passphrase, salt) + " " + USER_PASSWORD;

        try {
            Connection connection = DriverManager.getConnection(url, "studyflow", filePassword);
            LocalDatabase database = new LocalDatabase(connection);
            database.applySchema();
            return database;
        } catch (SQLException e) {
            // 90049 is "encryption error"; 90048 is an unsupported file
            // version, which a wrong key also produces because the header
            // decrypts to nonsense.
            if (e.getErrorCode() == 90049 || e.getErrorCode() == 90048) {
                throw new WrongPassphraseException();
            }
            throw new StoreException("Cannot open the local copy: " + e.getMessage(), e);
        }
    }

    /**
     * Idempotent, like the cloud migrations -- every statement is CREATE IF
     * NOT EXISTS, so this runs on every start and upgrades a copy made by an
     * older build without a migration runner.
     */
    private void applySchema() {
        String sql = readResource("schema.sql");
        try (Statement statement = connection.createStatement()) {
            statement.execute(sql);
            installActivityLogGuard(statement);
        } catch (SQLException e) {
            throw new StoreException("Cannot apply the local schema: " + e.getMessage(), e);
        }
    }

    /**
     * Declared here rather than in schema.sql because it names a Java class,
     * and a .sql file that only works when a particular classpath is present
     * is a trap for anyone who opens it expecting SQL.
     */
    private void installActivityLogGuard(Statement statement) throws SQLException {
        statement.execute("""
                create trigger if not exists activity_logs_no_update
                before update on activity_logs
                for each row
                call "flow.study.store.ActivityLogGuard"
                """);
    }

    private static String readResource(String name) {
        try (InputStream in = LocalDatabase.class.getResourceAsStream(name)) {
            if (in == null) throw new StoreException("Missing resource: " + name);
            return new String(in.readAllBytes(), StandardCharsets.UTF_8);
        } catch (IOException e) {
            throw new UncheckedIOException("Cannot read " + name, e);
        }
    }

    public Connection connection() {
        return connection;
    }

    /** Run a unit of work in one transaction, or none of it. */
    public <T> T inTransaction(Work<T> work) {
        try {
            connection.setAutoCommit(false);
            T result = work.run(connection);
            connection.commit();
            return result;
        } catch (SQLException e) {
            try {
                connection.rollback();
            } catch (SQLException rollbackFailed) {
                e.addSuppressed(rollbackFailed);
            }
            throw new StoreException("Local write failed: " + e.getMessage(), e);
        } finally {
            try {
                connection.setAutoCommit(true);
            } catch (SQLException ignored) {
                // Nothing useful to do: the connection is going away anyway.
            }
        }
    }

    public interface Work<T> {
        T run(Connection connection) throws SQLException;
    }

    @Override
    public void close() {
        try {
            // DB_CLOSE_DELAY=-1 keeps the database alive past the last
            // connection, so it has to be told explicitly to shut down or the
            // file stays open until the JVM exits.
            try (Statement statement = connection.createStatement()) {
                statement.execute("shutdown");
            }
        } catch (SQLException ignored) {
            // Already shut down, or the file is gone. Either way there is
            // nothing to report at exit.
        } finally {
            try {
                connection.close();
            } catch (SQLException ignored) {
                // As above.
            }
        }
    }
}
