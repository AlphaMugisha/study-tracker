package flow.study.sync;

import org.junit.jupiter.api.Test;

import java.time.Duration;
import java.util.concurrent.atomic.AtomicInteger;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertNotNull;
import static org.junit.jupiter.api.Assertions.assertTrue;

/**
 * When the watcher decides there is a connection, and what it does about it.
 *
 * No sleeping anywhere. The scheduler is a fake that records what it was
 * asked to run and when, and the test runs it by hand -- which is also how
 * the cadence rule gets asserted directly rather than inferred from timing.
 */
class ConnectivityTest {

    /** A scheduler that does not schedule. The test is the clock. */
    static final class FakeScheduler implements Connectivity.Scheduler {
        Runnable task;
        Duration delay;
        boolean stopped;

        @Override
        public void schedule(Runnable runnable, Duration after) {
            this.task = runnable;
            this.delay = after;
        }

        @Override
        public void stop() {
            stopped = true;
        }

        /** Run whatever is queued, as if its delay had elapsed. */
        void fire() {
            Runnable queued = task;
            task = null;
            assertNotNull(queued, "nothing was scheduled");
            queued.run();
        }
    }

    @Test
    void the_first_probe_is_scheduled_rather_than_run_on_the_spot() {
        FakeScheduler scheduler = new FakeScheduler();
        AtomicInteger probes = new AtomicInteger();

        Connectivity watcher = new Connectivity(
                () -> {
                    probes.incrementAndGet();
                    return true;
                },
                () -> 0,
                scheduler);
        watcher.start(() -> { });

        // The app already syncs at launch. Probing immediately would be a
        // second round trip saying what that sync is about to find out.
        assertEquals(0, probes.get());
        assertEquals(Connectivity.WHILE_IDLE, scheduler.delay);
        assertEquals(Connectivity.State.UNKNOWN, watcher.state());
    }

    @Test
    void coming_back_fires_once_and_only_once() {
        FakeScheduler scheduler = new FakeScheduler();
        AtomicInteger reachable = new AtomicInteger(0);
        AtomicInteger woken = new AtomicInteger();

        Connectivity watcher = new Connectivity(
                () -> reachable.get() == 1, () -> 1, scheduler);
        watcher.start(woken::incrementAndGet);

        scheduler.fire();                       // still offline
        assertEquals(Connectivity.State.OFFLINE, watcher.state());
        assertEquals(0, woken.get());

        reachable.set(1);
        scheduler.fire();                       // the edge
        assertEquals(Connectivity.State.ONLINE, watcher.state());
        assertEquals(1, woken.get());

        scheduler.fire();                       // still online: not an edge
        scheduler.fire();
        assertEquals(1, woken.get());
    }

    @Test
    void waiting_work_is_what_makes_it_urgent() {
        FakeScheduler scheduler = new FakeScheduler();
        AtomicInteger pending = new AtomicInteger(3);

        Connectivity watcher = new Connectivity(() -> false, pending::get, scheduler);
        watcher.start(() -> { });

        assertEquals(Connectivity.WHILE_WAITING, scheduler.delay);

        scheduler.fire();
        assertEquals(Connectivity.WHILE_WAITING, scheduler.delay);

        pending.set(0);
        scheduler.fire();
        assertEquals(Connectivity.WHILE_IDLE, scheduler.delay);
    }

    @Test
    void a_failed_sync_re_arms_the_edge() {
        FakeScheduler scheduler = new FakeScheduler();
        AtomicInteger woken = new AtomicInteger();

        Connectivity watcher = new Connectivity(() -> true, () -> 1, scheduler);
        watcher.start(woken::incrementAndGet);

        scheduler.fire();
        assertEquals(1, woken.get());

        // The sync that followed threw. Without this the watcher would still
        // believe it is online, and the next successful probe would not be an
        // edge -- so nothing would ever retry.
        watcher.markOffline();
        assertEquals(Connectivity.State.OFFLINE, watcher.state());

        scheduler.fire();
        assertEquals(2, woken.get());
    }

    @Test
    void a_sync_that_worked_saves_the_next_probe_a_trip() {
        FakeScheduler scheduler = new FakeScheduler();
        AtomicInteger woken = new AtomicInteger();

        Connectivity watcher = new Connectivity(() -> true, () -> 0, scheduler);
        watcher.start(woken::incrementAndGet);

        watcher.markOnline();
        assertEquals(Connectivity.State.ONLINE, watcher.state());

        scheduler.fire();
        // Already online when the probe ran, so no edge and no second sync.
        assertEquals(0, woken.get());
    }

    @Test
    void a_probe_that_throws_is_a_probe_that_failed() {
        FakeScheduler scheduler = new FakeScheduler();

        Connectivity watcher = new Connectivity(
                () -> { throw new IllegalStateException("DNS is having a day"); },
                () -> 1,
                scheduler);
        watcher.start(() -> { });

        scheduler.fire();

        // Offline is the normal case and is never worth surfacing. A throw
        // that escaped here would kill the watcher thread for good.
        assertEquals(Connectivity.State.OFFLINE, watcher.state());
        assertNotNull(scheduler.task, "the watcher stopped watching");
    }

    @Test
    void stopping_stops_the_scheduler() {
        FakeScheduler scheduler = new FakeScheduler();
        Connectivity watcher = new Connectivity(() -> true, () -> 0, scheduler);
        watcher.start(() -> { });

        watcher.stop();
        assertTrue(scheduler.stopped);
    }
}
