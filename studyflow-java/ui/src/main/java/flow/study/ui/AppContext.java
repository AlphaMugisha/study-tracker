package flow.study.ui;

import flow.study.domain.model.Profile;
import flow.study.domain.timetable.SchoolClock;
import flow.study.store.LocalDatabase;
import flow.study.store.Outbox;
import flow.study.store.ProfileStore;
import flow.study.store.StoreLocation;
import flow.study.store.TaskStore;
import flow.study.store.TimetableStore;
import flow.study.sync.CloudSession;
import flow.study.sync.GoTrueClient;
import flow.study.sync.PostgrestClient;
import flow.study.sync.SupabaseConfig;
import flow.study.sync.SyncEngine;
import flow.study.sync.SyncResult;

import java.time.Instant;
import java.time.ZoneId;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;

/**
 * Everything the screens need, wired once.
 *
 * Held open for the life of the window rather than rebuilt per screen: the
 * local database is a file with a lock on it, and opening it twice is a way to
 * make the app unstartable after a crash.
 *
 * Nothing here touches JavaFX. Views ask it for data and call
 * {@link #syncInBackground} to start a sync; it never reaches back into the
 * scene graph, which is what keeps the one rule of JavaFX threading easy to
 * honour -- all UI work on the FX thread, all network work off it.
 */
public final class AppContext implements AutoCloseable {

    private final StoreLocation location;
    private final LocalDatabase database;
    private final Outbox outbox;
    private final ProfileStore profiles;
    private final TimetableStore timetable;
    private final TaskStore tasks;
    private final flow.study.store.SupportStore support;
    private final SupabaseConfig config;
    private final CloudSession session;
    private final SyncEngine engine;

    /**
     * One thread, not a pool.
     *
     * Two syncs at once would race on the same outbox rows and could push the
     * same intent twice. A single worker makes that impossible without any
     * locking, and nothing here needs to be fast enough to want more.
     */
    private final ExecutorService worker =
            Executors.newSingleThreadExecutor(runnable -> {
                Thread thread = new Thread(runnable, "studyflow-sync");
                // Daemon, so a sync in flight never keeps the app from closing.
                thread.setDaemon(true);
                return thread;
            });

    private AppContext(StoreLocation location, LocalDatabase database) {
        this.location = location;
        this.database = database;
        this.outbox = new Outbox(database);
        this.profiles = new ProfileStore(database, outbox);
        this.timetable = new TimetableStore(database);
        this.tasks = new TaskStore(database, outbox);
        this.support = new flow.study.store.SupportStore(database, outbox);

        this.config = SupabaseConfig.resolve(location.directory());
        var http = CloudSession.httpClient();
        var auth = new GoTrueClient(config, http);
        this.session = new CloudSession(auth, profiles);
        var rest = new PostgrestClient(config, http, session);
        this.engine = new SyncEngine(rest, outbox, profiles, timetable, tasks);
    }

    public static AppContext open(StoreLocation location) {
        return new AppContext(location, LocalDatabase.open(location));
    }

    /**
     * Has this computer been set up yet?
     *
     * Read from the database rather than from a marker file, so there is no
     * second thing that can disagree with it. A copy whose sign-in failed
     * half way has tables but no session row, and correctly asks again.
     */
    public boolean signedIn() {
        return profiles.session() != null;
    }

    // -----------------------------------------------------------------------
    // What the screens read
    // -----------------------------------------------------------------------

    public StoreLocation location() { return location; }
    public Outbox outbox() { return outbox; }
    public ProfileStore profiles() { return profiles; }
    public TimetableStore timetable() { return timetable; }
    public TaskStore tasks() { return tasks; }
    public flow.study.store.SupportStore support() { return support; }
    public CloudSession session() { return session; }
    public SupabaseConfig config() { return config; }

    public String userId() {
        return session.userId();
    }

    /**
     * Her profile, or a sensible stand-in.
     *
     * A copy that has never synced has no profile row yet, and every screen
     * needs a timezone and a study window to render at all. The defaults match
     * the column defaults in the cloud schema, so the first pull changes
     * nothing she can see rather than rearranging the whole evening.
     */
    public Profile profile() {
        String id = userId();
        Profile stored = id == null ? null : profiles.find(id);
        if (stored != null) return stored;

        return new Profile(
                id == null ? "unknown" : id,
                "",
                flow.study.domain.model.UserRole.STUDENT,
                ZoneId.systemDefault().getId(),
                java.time.LocalTime.of(21, 0),
                30,
                null,
                null);
    }

    public ZoneId zone() {
        return profile().zone();
    }

    /** What time it is for her, which is not necessarily what the host says. */
    public SchoolClock clock() {
        return SchoolClock.in(zone(), Instant.now());
    }

    // -----------------------------------------------------------------------
    // Sync
    // -----------------------------------------------------------------------

    /**
     * Run something slow off the FX thread, and hand the answer back on it.
     *
     * Anything that touches the network has to come through here. The FX
     * thread is the one that repaints, so blocking it does not merely feel
     * slow -- the window stops drawing entirely, spinner included, and a
     * frozen app is indistinguishable from a crashed one.
     *
     * Failures arrive as an exception passed to onFailed rather than thrown
     * into a dead background thread, where nothing could report them and the
     * screen would wait forever.
     */
    public <T> void runInBackground(java.util.concurrent.Callable<T> work,
                                    java.util.function.Consumer<T> onFinished,
                                    java.util.function.Consumer<Exception> onFailed) {
        worker.submit(() -> {
            try {
                T result = work.call();
                javafx.application.Platform.runLater(() -> onFinished.accept(result));
            } catch (Exception e) {
                javafx.application.Platform.runLater(() -> onFailed.accept(e));
            }
        });
    }

    /**
     * Try to sync, off the FX thread, and hand the result back on it.
     *
     * Every failure arrives as a SyncResult rather than an exception, because
     * offline is the normal case and a callback that has to distinguish "no
     * network" from "threw" would get it wrong.
     */
    public void syncInBackground(java.util.function.Consumer<SyncResult> onFinished) {
        if (!config.configured()) {
            onFinished.accept(SyncResult.failed(
                    "This copy is not connected to a Supabase project yet."));
            return;
        }

        worker.submit(() -> {
            SyncResult result;
            try {
                if (!session.live() && !session.restore()) {
                    result = SyncResult.signInNeeded();
                } else {
                    result = engine.sync(userId());
                }
            } catch (RuntimeException e) {
                // Anything unhandled becomes a reportable result. A background
                // thread that dies silently would leave the pill saying
                // "syncing" until the app is restarted.
                result = SyncResult.failed(e.getMessage() == null
                        ? e.getClass().getSimpleName() : e.getMessage());
            }

            SyncResult finished = result;
            javafx.application.Platform.runLater(() -> onFinished.accept(finished));
        });
    }

    @Override
    public void close() {
        worker.shutdownNow();
        database.close();
    }
}
