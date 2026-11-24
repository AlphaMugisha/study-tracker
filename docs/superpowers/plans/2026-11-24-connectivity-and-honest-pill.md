# Connectivity Watcher and Honest Pill — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** The StudyFlow desktop app drains its outbox to Supabase the moment a connection returns, without anybody pressing a button, and its header pill always states the truth about where the work is.

**Architecture:** One new class, `flow.study.sync.Connectivity`, polls an authenticated probe on a cadence the outbox decides — 20 seconds while intents are waiting, 5 minutes when none are — and fires a callback on the offline→online edge. `AppContext` owns it and turns that callback into the sync it already knows how to run. `MainWindow` reads its state each second on the ticker that already exists, so the pill is never stale. `SyncEngine` is not touched: this is a trigger, not new sync logic.

**Tech Stack:** Java 23, Gradle (Kotlin DSL), JUnit 5, JavaFX, `java.net.http`, H2.

## Global Constraints

- **Phase 1 of `docs/superpowers/specs/2026-11-24-desktop-parity-and-auto-sync-design.md`.** Read that spec before starting. Phases 2–6 (the design system, the restyle, timetable editing) are separate plans and are **not** in this one.
- **`domain` depends on nothing. `sync` must never import JavaFX.** The module boundaries in the 2026-11-10 port design still hold.
- **Probe cadence: 20 seconds while the outbox has pending intents, 5 minutes when it does not.** Exact values, from the spec.
- **The pill never reads `Synced` while offline.** This is the product rule the whole feature exists to serve.
- **Offline is a state, not an error.** A failed probe never surfaces anywhere — no dialog, no log line the student can see, no red.
- **Commit after every task.** Messages in the house style: a short title line, then prose saying what changed and why. No `feat:`/`fix:`/`chore:` prefixes — run `git log --oneline -8` and match what you see.
- **Working directory for all Gradle commands is `studyflow-java/`.** Use `./gradlew.bat` (this is Windows).

## Deviation from the spec, decided during planning

The spec proposed a three-state `Reachability` enum (`REACHABLE` / `UNREACHABLE` / `UNAUTHORISED`). **Do not build that.** `CloudApi.reachable()` already exists, already makes the authenticated `profiles?select=id&limit=1` request the spec describes, and already returns `true` for a 401 — because a refusal still proves the cloud answered. The stale-session case the third state was for is handled downstream: `AppContext.syncInBackground` already returns `SyncResult.signInNeeded()` when the token cannot be refreshed, and the pill already renders it. A second three-state enum would duplicate a decision the codebase has made once, correctly.

So `Connectivity` takes a boolean `Probe`, and production passes `rest::reachable`.

## File Structure

| File | Responsibility |
|---|---|
| `sync/src/main/java/flow/study/sync/Connectivity.java` | **New.** Decides when to sync. Holds the online/offline state, the cadence rule, and the edge callback. No HTTP of its own, no JavaFX, no knowledge of the outbox beyond a count. |
| `sync/src/test/java/flow/study/sync/ConnectivityTest.java` | **New.** Fake probe, fake scheduler, no sleeping. |
| `domain/src/main/java/flow/study/domain/text/Display.java` | **Modify.** Gains `agoLabel(Duration)`, beside the other human-readable time strings. |
| `domain/src/test/java/flow/study/domain/text/DisplayTest.java` | **New.** |
| `store/src/main/java/flow/study/store/Outbox.java` | **Modify.** Gains `onRecord(Runnable)` so a queued intent can wake the sync without every call site remembering to. |
| `ui/src/main/java/flow/study/ui/AppContext.java` | **Modify.** Owns the watcher, owns the post-write debounce, shuts both down. |
| `ui/src/main/java/flow/study/ui/MainWindow.java` | **Modify.** Starts the watcher, records when the last sync landed, renders the pill from connectivity state on the existing one-second ticker. |

---

### Task 1: `Connectivity` — the watcher

**Files:**
- Create: `studyflow-java/sync/src/main/java/flow/study/sync/Connectivity.java`
- Test: `studyflow-java/sync/src/test/java/flow/study/sync/ConnectivityTest.java`

**Interfaces:**
- Consumes: `flow.study.sync.CloudApi#reachable()` (existing, returns `boolean`).
- Produces:
  - `Connectivity(Probe probe, IntSupplier pendingCount, Scheduler scheduler)`
  - `interface Probe { boolean reachable(); }`
  - `interface Scheduler { void schedule(Runnable task, Duration delay); void stop(); }`
  - `enum State { UNKNOWN, ONLINE, OFFLINE }`
  - `void start(Runnable onBecameOnline)`, `void markOnline()`, `void markOffline()`, `State state()`, `void stop()`
  - `static Scheduler daemonScheduler()`
  - `static final Duration WHILE_WAITING` (20s), `static final Duration WHILE_IDLE` (5min)

- [ ] **Step 1: Write the failing test**

Create `studyflow-java/sync/src/test/java/flow/study/sync/ConnectivityTest.java`:

```java
package flow.study.sync;

import org.junit.jupiter.api.Test;

import java.time.Duration;
import java.util.concurrent.atomic.AtomicInteger;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertNotNull;

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
                () -> { probes.incrementAndGet(); return true; },
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
    void stopping_stops_the_scheduler() {
        FakeScheduler scheduler = new FakeScheduler();
        Connectivity watcher = new Connectivity(() -> true, () -> 0, scheduler);
        watcher.start(() -> { });

        watcher.stop();
        assertEquals(true, scheduler.stopped);
    }
}
```

- [ ] **Step 2: Run it and watch it fail**

```bash
cd studyflow-java && ./gradlew.bat :sync:test --tests "flow.study.sync.ConnectivityTest"
```

Expected: compilation failure — `cannot find symbol: class Connectivity`.

- [ ] **Step 3: Write `Connectivity`**

Create `studyflow-java/sync/src/main/java/flow/study/sync/Connectivity.java`:

```java
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
```

- [ ] **Step 4: Run it and watch it pass**

```bash
cd studyflow-java && ./gradlew.bat :sync:test --tests "flow.study.sync.ConnectivityTest"
```

Expected: 6 tests, all passing.

- [ ] **Step 5: Commit**

```bash
git add studyflow-java/sync/src/main/java/flow/study/sync/Connectivity.java studyflow-java/sync/src/test/java/flow/study/sync/ConnectivityTest.java
git commit -m "A watcher that notices the wifi came back

Sync could always run. What it could not do was notice -- it ran at
launch and on the button, so an evening's work sat in the outbox while
the connection returned and nothing happened.

The outbox sets the cadence, which is the part worth keeping: having
something to say is what makes it urgent. Twenty seconds while intents
are waiting, five minutes when none are, which still catches a timetable
the parent edited on the website.

The scheduler is an interface so the test can be the clock. Asserting
the delay the watcher asked for is stronger than waiting to see what
happens, and finishes in microseconds rather than minutes."
```

---

### Task 2: `Display.agoLabel` — how long since it landed

**Files:**
- Modify: `studyflow-java/domain/src/main/java/flow/study/domain/text/Display.java`
- Test: `studyflow-java/domain/src/test/java/flow/study/domain/text/DisplayTest.java`

**Interfaces:**
- Produces: `static String Display.agoLabel(Duration since)` — `"just now"`, `"1 min ago"`, `"4 min ago"`, `"1 hr ago"`, `"3 hr ago"`, `"a while ago"`.

Why it lives in `domain`: it is a pure string function with edge cases worth pinning, and `Display` is already where every other human-readable time string in this codebase lives.

- [ ] **Step 1: Write the failing test**

Create `studyflow-java/domain/src/test/java/flow/study/domain/text/DisplayTest.java`:

```java
package flow.study.domain.text;

import org.junit.jupiter.api.Test;

import java.time.Duration;

import static org.junit.jupiter.api.Assertions.assertEquals;

class DisplayTest {

    @Test
    void a_sync_that_just_landed_does_not_claim_a_minute() {
        assertEquals("just now", Display.agoLabel(Duration.ZERO));
        assertEquals("just now", Display.agoLabel(Duration.ofSeconds(44)));
    }

    @Test
    void the_first_minute_is_singular() {
        assertEquals("1 min ago", Display.agoLabel(Duration.ofSeconds(45)));
        assertEquals("1 min ago", Display.agoLabel(Duration.ofSeconds(89)));
    }

    @Test
    void minutes_round_to_the_nearest_rather_than_down() {
        assertEquals("2 min ago", Display.agoLabel(Duration.ofSeconds(90)));
        assertEquals("4 min ago", Display.agoLabel(Duration.ofMinutes(4)));
        assertEquals("59 min ago", Display.agoLabel(Duration.ofMinutes(59)));
    }

    @Test
    void an_hour_reads_as_an_hour() {
        assertEquals("1 hr ago", Display.agoLabel(Duration.ofMinutes(60)));
        assertEquals("1 hr ago", Display.agoLabel(Duration.ofMinutes(89)));
        assertEquals("2 hr ago", Display.agoLabel(Duration.ofMinutes(90)));
        assertEquals("23 hr ago", Display.agoLabel(Duration.ofHours(23)));
    }

    @Test
    void past_a_day_the_number_stops_being_the_point() {
        assertEquals("a while ago", Display.agoLabel(Duration.ofHours(24)));
        assertEquals("a while ago", Display.agoLabel(Duration.ofDays(9)));
    }

    @Test
    void a_clock_that_went_backwards_does_not_produce_a_negative() {
        // The laptop's clock is not authoritative and can be corrected by NTP
        // mid-session. "-3 min ago" would be the app looking broken over
        // something that is not its fault.
        assertEquals("just now", Display.agoLabel(Duration.ofSeconds(-30)));
    }
}
```

- [ ] **Step 2: Run it and watch it fail**

```bash
cd studyflow-java && ./gradlew.bat :domain:test --tests "flow.study.domain.text.DisplayTest"
```

Expected: compilation failure — `cannot find symbol: method agoLabel`.

- [ ] **Step 3: Add the method**

Add to `studyflow-java/domain/src/main/java/flow/study/domain/text/Display.java`, after `greeting(ZoneId, Instant)` and before `firstNameOf`. Add `import java.time.Duration;` to the imports if it is not already there.

```java
    /**
     * How long ago something happened, for a status line.
     *
     * Rounds to the nearest rather than down, because a pill that says "1 min
     * ago" for fifty-nine seconds and then "1 min ago" for another minute is
     * telling two different lies with the same words.
     *
     * Past a day it stops counting. The exact number of hours since the last
     * sync is not a thing anybody needs; that it has been a long time is.
     */
    public static String agoLabel(Duration since) {
        long seconds = since.getSeconds();

        // A negative gap means the host clock moved backwards under us, which
        // NTP does. Treat it as now rather than rendering "-3 min ago".
        if (seconds < 45) return "just now";

        long minutes = Math.round(seconds / 60.0);
        if (minutes < 60) return minutes + " min ago";

        long hours = Math.round(minutes / 60.0);
        if (hours < 24) return hours + " hr ago";

        return "a while ago";
    }
```

- [ ] **Step 4: Run it and watch it pass**

```bash
cd studyflow-java && ./gradlew.bat :domain:test --tests "flow.study.domain.text.DisplayTest"
```

Expected: 6 tests, all passing.

Note on the boundary cases: 44s → `"just now"`; 45s → `Math.round(0.75) = 1` → `"1 min ago"`; 89s → `Math.round(1.483) = 1`; 90s → `Math.round(1.5) = 2`; 60 min → `Math.round(1.0) = 1` hr; 89 min → `Math.round(1.483) = 1` hr; 90 min → `2` hr. These are the values the test asserts.

- [ ] **Step 5: Commit**

```bash
git add studyflow-java/domain/src/main/java/flow/study/domain/text/Display.java studyflow-java/domain/src/test/java/flow/study/domain/text/DisplayTest.java
git commit -m "How long ago, for a pill that keeps counting

Rounds to the nearest minute rather than down: saying '1 min ago' for
fifty-nine seconds and then again for a further minute is two different
lies told in the same words.

Past a day it stops counting, and a clock corrected backwards by NTP
reads as 'just now' rather than a negative."
```

---

### Task 3: `Outbox.onRecord` — a queued intent wakes the sync

**Files:**
- Modify: `studyflow-java/store/src/main/java/flow/study/store/Outbox.java:48` (the `record` method) and its field block

**Interfaces:**
- Produces: `void Outbox.onRecord(Runnable listener)`

Why a hook rather than calling `AppContext` from each view: there are write paths in `TaskStore`, `ProfileStore`, `SupportStore` and soon `TimetableStore`, and a call site that forgets is a change that silently waits for the next five-minute probe. One hook at the single place every intent passes through cannot be forgotten.

- [ ] **Step 1: Add the hook**

In `studyflow-java/store/src/main/java/flow/study/store/Outbox.java`, add the field beside the existing ones:

```java
    /**
     * Told whenever an intent is queued.
     *
     * One listener, not a list: there is exactly one thing that cares, and it
     * is the app deciding whether to sync now. A hook here rather than a call
     * at each write site because a site that forgets is a change that waits
     * five minutes for no reason, and that bug is invisible.
     */
    private volatile Runnable listener = () -> { };

    public void onRecord(Runnable listener) {
        this.listener = listener;
    }
```

Then, in `record(...)`, replace the `try (ResultSet keys = ...)` block's return so the listener fires after the row is in. The method's tail becomes:

```java
            long seq;
            try (ResultSet keys = statement.getGeneratedKeys()) {
                seq = keys.next() ? keys.getLong(1) : -1;
            }

            // After the row exists, so a listener that immediately counts
            // pending intents counts this one.
            listener.run();
            return seq;
```

- [ ] **Step 2: Check nothing regressed**

```bash
cd studyflow-java && ./gradlew.bat :store:test
```

Expected: the existing `OutboxTest` and `LocalDatabaseTest` pass unchanged — the default listener does nothing.

- [ ] **Step 3: Commit**

```bash
git add studyflow-java/store/src/main/java/flow/study/store/Outbox.java
git commit -m "One hook where every intent passes, so none is missed

A call at each write site is a call some future write site forgets, and
the symptom -- a change that waits five minutes for no reason -- is
invisible. The outbox is the one place they all go through."
```

---

### Task 4: `AppContext` — own the watcher and the post-write nudge

**Files:**
- Modify: `studyflow-java/ui/src/main/java/flow/study/ui/AppContext.java`

**Interfaces:**
- Consumes: `Connectivity` (Task 1), `Outbox.onRecord` (Task 3).
- Produces:
  - `Connectivity connectivity()`
  - `void startWatching(Runnable onShouldSync)`
  - `void notifyLocalWrite()`

`onShouldSync` is called on a background thread. The caller is responsible for getting itself onto the FX thread — `MainWindow` does that in Task 5. `AppContext` deliberately does not, so the rule stays "views own the scene graph".

- [ ] **Step 1: Add the imports and fields**

Add to the imports in `studyflow-java/ui/src/main/java/flow/study/ui/AppContext.java`:

```java
import flow.study.sync.Connectivity;

import java.util.concurrent.Executors;
import java.util.concurrent.ScheduledExecutorService;
import java.util.concurrent.ScheduledFuture;
import java.util.concurrent.TimeUnit;
```

Add the fields beside `engine`:

```java
    private final Connectivity connectivity;

    /**
     * Where a write-triggered sync waits out its debounce.
     *
     * Separate from the sync worker on purpose: a delayed task sitting on the
     * single sync thread would block the sync it is waiting to start.
     */
    private final ScheduledExecutorService nudges =
            Executors.newSingleThreadScheduledExecutor(runnable -> {
                Thread thread = new Thread(runnable, "studyflow-nudge");
                thread.setDaemon(true);
                return thread;
            });

    private ScheduledFuture<?> queuedNudge;
    private volatile Runnable syncTrigger = () -> { };
```

- [ ] **Step 2: Construct the watcher**

In the `AppContext` constructor, after `this.engine = new SyncEngine(...)`, add:

```java
        this.connectivity = new Connectivity(
                rest::reachable, outbox::pendingCount, Connectivity.daemonScheduler());

        // Every queued intent is a reason to try, if there is a connection.
        outbox.onRecord(this::notifyLocalWrite);
```

- [ ] **Step 3: Add the accessor and the lifecycle**

Add beside `syncInBackground`:

```java
    public Connectivity connectivity() { return connectivity; }

    /**
     * Start watching for a connection.
     *
     * {@code onShouldSync} is called on a background thread, not the FX
     * thread. The caller hops threads itself -- doing it here would put
     * scene-graph knowledge in the one class that has stayed free of it.
     */
    public void startWatching(Runnable onShouldSync) {
        this.syncTrigger = onShouldSync;
        connectivity.start(onShouldSync);
    }

    /**
     * Something was just written locally. Sync shortly, if we can.
     *
     * Debounced, because editing three pieces of homework in a row is one
     * reason to sync and not three. Skipped entirely when offline: the
     * watcher is already checking, and a second timer racing it would only
     * make the pill flicker.
     */
    public synchronized void notifyLocalWrite() {
        if (connectivity.state() == Connectivity.State.OFFLINE) return;
        if (queuedNudge != null) queuedNudge.cancel(false);
        if (nudges.isShutdown()) return;
        queuedNudge = nudges.schedule(() -> syncTrigger.run(), 2, TimeUnit.SECONDS);
    }
```

- [ ] **Step 4: Shut both down**

Replace the body of `close()`:

```java
    @Override
    public void close() {
        connectivity.stop();
        nudges.shutdownNow();
        worker.shutdownNow();
        database.close();
    }
```

- [ ] **Step 5: Compile**

```bash
cd studyflow-java && ./gradlew.bat :ui:compileJava
```

Expected: BUILD SUCCESSFUL.

- [ ] **Step 6: Commit**

```bash
git add studyflow-java/ui/src/main/java/flow/study/ui/AppContext.java
git commit -m "The app holds the watcher, and nudges after a write

Two triggers, not one. The watcher covers 'the connection came back';
the debounced nudge covers 'she changed something with the connection
already up', which is the common case and used to wait for a button.

Debounced because editing three pieces of homework in a row is one
reason to sync, and skipped while offline because the watcher is
already doing that job."
```

---

### Task 5: `MainWindow` — start it, and tell the truth on the pill

**Files:**
- Modify: `studyflow-java/ui/src/main/java/flow/study/ui/MainWindow.java` — the `start`, `tick`, `sync` and `refreshSyncPill` methods, plus two new fields

**Interfaces:**
- Consumes: `AppContext.startWatching`, `AppContext.connectivity()`, `Connectivity.State`, `Display.agoLabel`, `SyncResult.Outcome`.

- [ ] **Step 1: Add the imports and fields**

Add to the imports:

```java
import flow.study.domain.text.Display;
import flow.study.sync.Connectivity;

import java.time.Duration;
import java.time.Instant;
```

Add beside `private boolean syncing;`:

```java
    /** The last result, kept so the pill can be re-rendered every tick. */
    private SyncResult lastResult;

    /** When a sync last actually landed. Null until one does. */
    private Instant lastSynced;
```

- [ ] **Step 2: Start the watcher**

In `start()`, after the existing `sync();` call, add:

```java
        // The watcher calls back on its own thread; the pill and every view it
        // refreshes are the FX thread's business.
        context.startWatching(() -> javafx.application.Platform.runLater(this::sync));
```

- [ ] **Step 3: Record the outcome and tell the watcher**

Replace the body of `sync()`:

```java
    private void sync() {
        if (syncing) return; // the worker is single-threaded; queueing helps nobody

        setSyncing(true);
        refreshSyncPill(lastResult);

        context.syncInBackground(result -> {
            setSyncing(false);
            lastResult = result;

            switch (result.outcome()) {
                case SYNCED, UP_TO_DATE, PARTIAL -> {
                    lastSynced = Instant.now();
                    context.connectivity().markOnline();
                }
                // PARTIAL still reached the cloud, which is what "online"
                // means here. The refusal shows on the pill separately.
                case OFFLINE, FAILED -> context.connectivity().markOffline();
                case SIGN_IN_NEEDED -> { /* the network is fine; the token is not */ }
            }

            refreshSyncPill(result);
            // The pull may have replaced everything underneath, so the clock
            // and every built screen are re-read from the local copy.
            tick();
            for (DataView view : dataViews.values()) view.refresh();
        });
    }
```

- [ ] **Step 4: Re-render the pill every second**

At the end of `tick()`, add:

```java
        // Cheap: setPill returns without touching the scene graph unless the
        // words actually changed, which is once a minute at most.
        refreshSyncPill(lastResult);
```

- [ ] **Step 5: Make the pill read from connectivity, not from a stale result**

Replace `refreshSyncPill` entirely:

```java
    /**
     * What the pill says, and in what tone.
     *
     * Ordered by what matters most to her, not by what happened most
     * recently. A refusal outranks everything: it is the only state that
     * needs a decision. Offline outranks a successful sync from ten minutes
     * ago, because "Synced" while the wifi is off is the one thing this pill
     * must never say -- working without a connection is the whole promise,
     * and a status line that lies about it undoes that.
     *
     * Offline is styled quiet rather than as an error. It is the expected
     * condition most evenings; a red badge would contradict the design.
     */
    private void refreshSyncPill(SyncResult result) {
        if (syncing) {
            setPill("Syncing…", "pill");
            return;
        }

        int waiting = context.outbox().pendingCount();
        int refused = context.outbox().rejectedCount();

        if (refused > 0) {
            setPill(refused + (refused == 1 ? " change rejected" : " changes rejected"),
                    "pill-problem");
            return;
        }

        if (result != null && result.outcome() == SyncResult.Outcome.SIGN_IN_NEEDED) {
            setPill("Sign in needed", "pill-problem");
            return;
        }

        if (context.connectivity().state() == Connectivity.State.OFFLINE) {
            setPill(waiting > 0 ? "Offline · " + waiting + " waiting" : "Offline",
                    "pill-offline");
            return;
        }

        if (waiting > 0) {
            setPill(waiting + " waiting", "pill-waiting");
            return;
        }

        if (lastSynced != null) {
            setPill("Synced · " + Display.agoLabel(Duration.between(lastSynced, Instant.now())),
                    "pill-synced");
            return;
        }

        setPill("Not synced yet", "pill-offline");
    }
```

- [ ] **Step 6: Make `setPill` idempotent**

It now runs once a second, and restyling a node needlessly is work the FX thread does not need. Replace it:

```java
    private void setPill(String text, String modifier) {
        if (text.equals(syncPill.getText())
                && syncPill.getStyleClass().size() == 2
                && syncPill.getStyleClass().get(1).equals(modifier)) {
            return;
        }
        syncPill.setText(text);
        syncPill.getStyleClass().setAll("pill", modifier);
    }
```

- [ ] **Step 7: Build and run the whole suite**

```bash
cd studyflow-java && ./gradlew.bat build
```

Expected: BUILD SUCCESSFUL, all modules' tests passing.

- [ ] **Step 8: Commit**

```bash
git add studyflow-java/ui/src/main/java/flow/study/ui/MainWindow.java
git commit -m "A pill that cannot say Synced while the wifi is off

It used to render whatever the last sync returned and then sit there,
so a result from ten minutes ago still read as the present tense. Now
it is rebuilt on the ticker that was already running, from connectivity
state rather than from a frozen result, and setPill returns without
touching the scene graph unless the words changed.

Ordered by what needs a decision rather than by what happened last: a
refusal outranks everything, offline outranks a successful sync from
earlier. Working without a connection is the whole promise of the app,
and a status line that lies about it undoes that."
```

---

### Task 6: Prove it offline, and repackage

**Files:**
- None modified. This task is verification and the build that puts it on the Desktop.

- [ ] **Step 1: Rebuild the double-clickable app**

```bash
cd studyflow-java && bash packaging/build-app.sh
```

Expected: `dist/StudyFlow/StudyFlow.exe` rebuilt, Desktop shortcut refreshed.

- [ ] **Step 2: Launch it and confirm it syncs on its own**

Run `dist/StudyFlow/StudyFlow.exe`. Within a few seconds the pill should read `Synced · just now`, then tick to `Synced · 1 min ago`.

- [ ] **Step 3: Go offline and make a change**

Turn off wifi (or enable Airplane mode). Then:

1. Watch the pill. Within 20 seconds of the next probe it should read `Offline`.
2. Add a piece of homework on the Homework screen.
3. The pill should read `Offline · 1 waiting` — immediately, because the outbox hook fires on the write.

- [ ] **Step 4: Come back online without touching anything**

Turn wifi back on. **Do not press Sync.** Within 20 seconds the pill should go `Syncing…` and then `Synced · just now`.

This is the whole point of the plan. If it does not happen, check in order: is `startWatching` being called in `MainWindow.start`; does `Connectivity.state()` say `OFFLINE` beforehand (if it still says `ONLINE`, `markOffline` is not being called from the sync result); is `pendingCount()` greater than zero (if not, the cadence is five minutes, not twenty seconds — wait longer or add a change).

- [ ] **Step 5: Confirm it landed in the cloud**

Open the website, sign in as the same student, and check the Homework page shows the piece added offline.

- [ ] **Step 6: Commit the rebuilt artefact if the repo tracks it**

```bash
git status --short studyflow-java/dist
```

If `dist/` is gitignored, there is nothing to commit and this step is done. If it is tracked, commit it:

```bash
git add studyflow-java/dist
git commit -m "Rebuild the app with the watcher in it"
```

- [ ] **Step 7: Push**

```bash
git push origin java-offline-port
```

---

## What this plan does not do

Phases 2–6 of the spec are separate plans, to be written after this one is working:

- **Phase 2** — design tokens from `globals.css`, Geist TTFs, `Icons.java` generated from lucide, the `Ui` split into `Type` / `Cards` / `Controls` / `Motion`.
- **Phase 3** — shell and Today restyled, then a look at it before five more screens are built.
- **Phase 4** — Homework, Home plan, Stuck on, Settings.
- **Phase 5** — Timetable: restyle, entry dialog, typed-week paste, the `Overlaps` save gate.
- **Phase 6** — repackage and the final pass.
