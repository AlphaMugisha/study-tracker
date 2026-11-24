package flow.study.sync;

import java.time.Duration;
import java.util.concurrent.Executors;
import java.util.concurrent.ScheduledExecutorService;
import java.util.concurrent.TimeUnit;
import java.util.concurrent.atomic.AtomicReference;
import java.util.function.IntSupplier;

/**
 * Whether there is a connection, and what to do the moment there is.
 *
 * ---------------------------------------------------------------------------
 * The app has always been able to sync. What it could not do was notice. Sync
 * ran at launch and when the button was pressed, so an evening's work sat in
 * the outbox while the wifi came back and nothing happened.
 *
 * Three things are worth knowing about how this decides.
 *
 *   It probes with a real request.  {@link CloudApi#reachable()} asks for one
 *                                   row. A reachable host with a paused
 *                                   project is not a connection, and a ping
 *                                   cannot tell the difference.
 *
 *   The outbox sets the cadence.    Having something to say is what makes it
 *                                   urgent. Intents waiting -> every 20
 *                                   seconds. Nothing waiting -> every five
 *                                   minutes, which still catches a timetable
 *                                   the parent edited on the website.
 *
 *   The edge fires, not the state.  Going from not-online to online is the
 *                                   event. Being online is not, or every
 *                                   probe would start a sync.
 *
 * Deliberately NOT here: syncing. This decides when; {@link SyncEngine}
 * decides what, and neither needs to know the other's rules.
 * ---------------------------------------------------------------------------
 */
public final class Connectivity {

    /** Can the cloud be reached right now? */
    public interface Probe {
        boolean reachable();
    }

    /**
     * Where the next probe comes from.
     *
     * An interface rather than a {@code ScheduledExecutorService} so the test
     * can be the clock. Asserting the delay the watcher *asked for* is a
     * stronger check than waiting to see what happens, and it finishes in
     * microseconds instead of minutes.
     */
    public interface Scheduler {
        void schedule(Runnable task, Duration delay);

        void stop();
    }

    public enum State {
        /** Nothing has been tried yet. Not the same as offline. */
        UNKNOWN,
        ONLINE,
        OFFLINE
    }

    /** Intents are waiting. Check often enough that a reconnection is felt. */
    public static final Duration WHILE_WAITING = Duration.ofSeconds(20);

    /** Nothing to send. Slow enough to be free, often enough to pull. */
    public static final Duration WHILE_IDLE = Duration.ofMinutes(5);

    private final Probe probe;
    private final IntSupplier pendingCount;
    private final Scheduler scheduler;

    /** Written on the scheduler thread, read on the FX thread. */
    private final AtomicReference<State> state = new AtomicReference<>(State.UNKNOWN);

    private volatile Runnable onBecameOnline = () -> { };
    private volatile boolean running;

    public Connectivity(Probe probe, IntSupplier pendingCount, Scheduler scheduler) {
        this.probe = probe;
        this.pendingCount = pendingCount;
        this.scheduler = scheduler;
    }

    /**
     * Begin watching.
     *
     * The first probe is scheduled rather than run now: the app syncs at
     * launch anyway, and that sync reports what a probe would have found.
     */
    public void start(Runnable onBecameOnline) {
        this.onBecameOnline = onBecameOnline;
        this.running = true;
        scheduleNext();
    }

    /** A sync just succeeded. Saves the next probe a round trip. */
    public void markOnline() {
        state.set(State.ONLINE);
    }

    /**
     * A sync just failed, or reported itself offline.
     *
     * Without this the watcher would still believe it is online, the next
     * successful probe would not be an edge, and nothing would ever retry.
     */
    public void markOffline() {
        state.set(State.OFFLINE);
    }

    public State state() {
        return state.get();
    }

    public void stop() {
        running = false;
        scheduler.stop();
    }

    private void scheduleNext() {
        if (!running) return;
        scheduler.schedule(this::probeOnce,
                pendingCount.getAsInt() > 0 ? WHILE_WAITING : WHILE_IDLE);
    }

    private void probeOnce() {
        if (!running) return;

        boolean up;
        try {
            up = probe.reachable();
        } catch (RuntimeException e) {
            // A probe that throws is a probe that failed. Offline is the
            // normal case and is never worth surfacing.
            up = false;
        }

        State previous = state.getAndSet(up ? State.ONLINE : State.OFFLINE);
        if (up && previous != State.ONLINE) {
            try {
                onBecameOnline.run();
            } catch (RuntimeException e) {
                // The callback starting a sync is not this class's problem to
                // report, and a throw here would kill the watcher for good.
                markOffline();
            }
        }

        scheduleNext();
    }

    /** The production scheduler: one daemon thread that never holds the app open. */
    public static Scheduler daemonScheduler() {
        ScheduledExecutorService executor = Executors.newSingleThreadScheduledExecutor(
                runnable -> {
                    Thread thread = new Thread(runnable, "studyflow-connectivity");
                    thread.setDaemon(true);
                    return thread;
                });

        return new Scheduler() {
            @Override
            public void schedule(Runnable task, Duration delay) {
                if (executor.isShutdown()) return;
                executor.schedule(task, delay.toMillis(), TimeUnit.MILLISECONDS);
            }

            @Override
            public void stop() {
                executor.shutdownNow();
            }
        };
    }
}
