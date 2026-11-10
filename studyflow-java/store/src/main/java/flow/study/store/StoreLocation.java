package flow.study.store;

import java.io.IOException;
import java.io.UncheckedIOException;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.Properties;

/**
 * Where the local copy lives, and the one thing that has to sit outside it.
 *
 * On Windows that is under LOCALAPPDATA rather than beside the installed app:
 * an app-image directory can be replaced wholesale by a reinstall, and her
 * evening of work should not go with it.
 *
 * The sidecar holds the Argon2 salt, and nothing else that matters. It cannot
 * be inside the encrypted database because the salt is what derives the key
 * that opens it. A salt has to be unique, not secret, so a plaintext file is
 * the correct place for one -- it reveals nothing without the passphrase.
 */
public final class StoreLocation {

    private static final String DIRECTORY = "StudyFlow";
    private static final String DATABASE = "studyflow";
    private static final String SIDECAR = "studyflow.properties";

    private final Path directory;

    public StoreLocation(Path directory) {
        this.directory = directory;
    }

    /** The per-user data directory, created if it is not there yet. */
    public static StoreLocation standard() {
        String local = System.getenv("LOCALAPPDATA");
        Path base = local != null && !local.isBlank()
                ? Path.of(local)
                : Path.of(System.getProperty("user.home"), ".local", "share");
        return new StoreLocation(base.resolve(DIRECTORY));
    }

    public Path directory() {
        return directory;
    }

    /** The base path H2 appends its own suffix to. */
    public Path databaseBase() {
        return directory.resolve(DATABASE);
    }

    public Path sidecar() {
        return directory.resolve(SIDECAR);
    }

    /** True once a copy exists here, which is what decides unlock versus sign-in. */
    public boolean initialised() {
        return Files.exists(directory.resolve(DATABASE + ".mv.db")) && Files.exists(sidecar());
    }

    public void ensureDirectory() {
        try {
            Files.createDirectories(directory);
        } catch (IOException e) {
            throw new UncheckedIOException("Cannot create " + directory, e);
        }
    }

    public Sidecar readSidecar() {
        Properties properties = new Properties();
        try (var in = Files.newBufferedReader(sidecar(), StandardCharsets.UTF_8)) {
            properties.load(in);
        } catch (IOException e) {
            throw new UncheckedIOException("Cannot read " + sidecar(), e);
        }
        return new Sidecar(properties.getProperty("salt"), properties.getProperty("email", ""));
    }

    public void writeSidecar(Sidecar sidecar) {
        ensureDirectory();
        Properties properties = new Properties();
        properties.setProperty("salt", sidecar.salt());
        properties.setProperty("email", sidecar.email() == null ? "" : sidecar.email());
        try (var out = Files.newBufferedWriter(sidecar(), StandardCharsets.UTF_8)) {
            properties.store(out, "StudyFlow local copy. The salt is not a secret; the "
                    + "passphrase it is combined with is, and is not stored anywhere.");
        } catch (IOException e) {
            throw new UncheckedIOException("Cannot write " + sidecar(), e);
        }
    }

    /**
     * @param salt  Argon2 salt, base64
     * @param email last account signed in here, so the unlock screen can say
     *              whose copy this is rather than asking for it again
     */
    public record Sidecar(String salt, String email) {}
}
