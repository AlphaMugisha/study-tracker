package flow.study.store;

import java.io.IOException;
import java.io.UncheckedIOException;
import java.nio.file.Files;
import java.nio.file.Path;

/**
 * Where the local copy lives.
 *
 * On Windows that is under LOCALAPPDATA rather than beside the installed app:
 * an app-image directory can be replaced wholesale by a reinstall, and an
 * evening of work should not go with it.
 *
 * The file is NOT encrypted. That was a deliberate choice by the operator,
 * made with the trade-off in front of them: encrypting it would have meant a
 * passphrase prompt on every launch, and they would rather the app just open.
 * The consequence is stated plainly rather than buried -- anyone who can use
 * this Windows account can read the whole academic record straight off disk.
 * It is said again in the About card in Settings, so it is a known property of
 * the app and not a surprise.
 */
public final class StoreLocation {

    private static final String DIRECTORY = "StudyFlow";
    private static final String DATABASE = "studyflow";

    private final Path directory;

    public StoreLocation(Path directory) {
        this.directory = directory;
    }

    /** The per-user data directory. */
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

    public void ensureDirectory() {
        try {
            Files.createDirectories(directory);
        } catch (IOException e) {
            throw new UncheckedIOException("Cannot create " + directory, e);
        }
    }
}
