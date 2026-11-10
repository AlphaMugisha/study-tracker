package flow.study.sync;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.fasterxml.jackson.databind.node.ArrayNode;
import com.fasterxml.jackson.databind.node.ObjectNode;
import flow.study.domain.model.TaskPriority;
import flow.study.domain.model.TaskStatus;
import flow.study.store.Intent;
import flow.study.store.LocalDatabase;
import flow.study.store.Outbox;
import flow.study.store.Passphrase;
import flow.study.store.ProfileStore;
import flow.study.store.StoreLocation;
import flow.study.store.TaskStore;
import flow.study.store.TimetableStore;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.io.TempDir;

import java.nio.file.Path;
import java.time.LocalDate;
import java.util.ArrayList;
import java.util.List;
import java.util.Map;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertTrue;

/**
 * An offline evening reaching the cloud.
 *
 * Stubbed at the CloudApi boundary, because what needs proving is engine
 * behaviour -- push before pull, a refusal stalling one row and not the rest,
 * a locally-created row picking up its real id mid-group. Driving this through
 * real HTTP would be testing Supabase.
 */
class SyncEngineTest {

    private static final ObjectMapper JSON = new ObjectMapper();
    private static final char[] PASSPHRASE = "an evening of homework".toCharArray();
    private static final String USER = "user-1";
    private static final LocalDate DUE = LocalDate.parse("2026-09-25");

    /** Records every call, so ordering can be asserted rather than assumed. */
    private static final class FakeCloud implements CloudApi {
        final List<String> calls = new ArrayList<>();
        boolean online = true;
        /** table:kind to the status that should be refused. */
        final Map<String, Integer> refuse = new java.util.HashMap<>();
        String assignedId = "11111111-1111-1111-1111-111111111111";

        @Override public boolean reachable() {
            return online;
        }

        @Override public JsonNode selectAll(String table) {
            calls.add("pull:" + table);
            return JSON.createArrayNode();
        }

        @Override public JsonNode selectSince(String table, String column, String watermark) {
            calls.add("pullSince:" + table);
            return JSON.createArrayNode();
        }

        @Override public JsonNode insert(String table, Map<String, Object> row) {
            calls.add("insert:" + table + ":" + row.get("title"));
            fail(table, "insert");
            ObjectNode created = JSON.createObjectNode();
            created.put("id", assignedId);
            ArrayNode array = JSON.createArrayNode();
            array.add(created);
            return array;
        }

        @Override public JsonNode update(String table, String id, Map<String, Object> fields) {
            calls.add("update:" + table + ":" + id + ":" + fields.get("status"));
            fail(table, "update");
            return JSON.createArrayNode();
        }

        @Override public void delete(String table, String id) {
            calls.add("delete:" + table + ":" + id);
            fail(table, "delete");
        }

        private void fail(String table, String kind) {
            Integer status = refuse.get(table + ":" + kind);
            if (status != null) {
                throw new PostgrestClient.RestException(status, "refused by the stub");
            }
        }
    }

    private record Kit(LocalDatabase db, Outbox outbox, TaskStore tasks,
                       SyncEngine engine, FakeCloud cloud) {}

    private static Kit open(Path dir) {
        LocalDatabase db = LocalDatabase.open(
                new StoreLocation(dir), PASSPHRASE, Passphrase.newSalt());
        Outbox outbox = new Outbox(db);
        ProfileStore profiles = new ProfileStore(db, outbox);
        TimetableStore timetable = new TimetableStore(db);
        TaskStore tasks = new TaskStore(db, outbox);
        FakeCloud cloud = new FakeCloud();
        return new Kit(db, outbox, tasks,
                new SyncEngine(cloud, outbox, profiles, timetable, tasks), cloud);
    }

    @Test
    void offlineIsAnExpectedStateNotAFailure(@TempDir Path dir) {
        Kit kit = open(dir);
        try (LocalDatabase db = kit.db()) {
            kit.cloud().online = false;
            kit.tasks().createAssignment(USER, "Maths p.44", null, null,
                    DUE, null, TaskPriority.HIGH, 30);

            SyncResult result = kit.engine().sync(USER);

            assertEquals(SyncResult.Outcome.OFFLINE, result.outcome());
            assertEquals("Offline", result.summary());
            assertEquals(0, kit.cloud().calls.size(), "nothing should be attempted");
            assertEquals(1, kit.outbox().pendingCount(), "and nothing should be lost");
        }
    }

    @Test
    void pushHappensBeforePull(@TempDir Path dir) {
        Kit kit = open(dir);
        try (LocalDatabase db = kit.db()) {
            kit.tasks().createAssignment(USER, "Maths p.44", null, null,
                    DUE, null, TaskPriority.HIGH, 30);

            kit.engine().sync(USER);

            List<String> calls = kit.cloud().calls;
            int firstInsert = indexOfPrefix(calls, "insert:");
            int firstPull = indexOfPrefix(calls, "pull:");
            assertTrue(firstInsert >= 0, "the change should have been sent");
            assertTrue(firstPull >= 0, "the copy should have been refreshed");
            assertTrue(firstInsert < firstPull,
                    "pulling first would overwrite work that had not been sent yet");
        }
    }

    @Test
    void aLocallyCreatedRowPicksUpItsCloudIdForLaterIntents(@TempDir Path dir) {
        Kit kit = open(dir);
        try (LocalDatabase db = kit.db()) {
            String localId = kit.tasks().createAssignment(USER, "Essay", null, null,
                    DUE, null, TaskPriority.MEDIUM, 60);
            kit.tasks().setAssignmentStatus(localId, TaskStatus.COMPLETED);

            kit.engine().sync(USER);

            // The CREATE goes without an id so Postgres assigns one, and the
            // UPDATE that follows must address the id that came back -- not
            // the local placeholder, which is not even a uuid.
            assertTrue(kit.cloud().calls.contains(
                            "update:assignments:" + kit.cloud().assignedId + ":completed"),
                    "the tick should be addressed to the cloud id, got "
                            + kit.cloud().calls);
            assertFalse(kit.cloud().calls.contains(
                            "update:assignments:" + localId + ":completed"),
                    "the local id must never be sent as a uuid");
        }
    }

    @Test
    void aRefusalStallsItsOwnRowAndNothingElse(@TempDir Path dir) {
        Kit kit = open(dir);
        try (LocalDatabase db = kit.db()) {
            // Row A will be refused on insert; row B must still go up.
            kit.cloud().refuse.put("assignments:insert", 403);

            kit.tasks().createAssignment(USER, "A", null, null,
                    DUE, null, TaskPriority.LOW, 20);
            kit.tasks().createAssignment(USER, "B", null, null,
                    DUE, null, TaskPriority.LOW, 20);

            SyncResult result = kit.engine().sync(USER);

            assertEquals(SyncResult.Outcome.PARTIAL, result.outcome());
            assertEquals(2, result.rejected(), "both inserts hit the same refusal");
            assertEquals(2, result.refusals().size());
            assertTrue(result.refusals().get(0).reason().contains("refused"),
                    "the cloud reason has to survive so it can be shown");

            // Both were attempted: one bad row does not abandon the queue.
            assertEquals(2, countPrefix(kit.cloud().calls, "insert:"));
            assertEquals(2, kit.outbox().rejectedCount());
            assertEquals(0, kit.outbox().pendingCount());
        }
    }

    @Test
    void aTransientFailureStaysPendingRatherThanBeingRefused(@TempDir Path dir) {
        Kit kit = open(dir);
        try (LocalDatabase db = kit.db()) {
            // 503 is Supabase being busy, not Supabase saying no.
            kit.cloud().refuse.put("assignments:insert", 503);
            kit.tasks().createAssignment(USER, "Essay", null, null,
                    DUE, null, TaskPriority.LOW, 20);

            kit.engine().sync(USER);

            assertEquals(1, kit.outbox().pendingCount(),
                    "a busy server must not turn into a refused change");
            assertEquals(0, kit.outbox().rejectedCount());

            Intent still = kit.outbox().pending().get(0);
            assertEquals(1, still.attempts(), "but the attempt should be counted");
        }
    }

    @Test
    void anExpiredTokenAsksHerToSignInRatherThanRejectingHerWork(@TempDir Path dir) {
        Kit kit = open(dir);
        try (LocalDatabase db = kit.db()) {
            kit.cloud().refuse.put("assignments:insert", 401);
            kit.tasks().createAssignment(USER, "Essay", null, null,
                    DUE, null, TaskPriority.LOW, 20);

            SyncResult result = kit.engine().sync(USER);

            assertEquals(SyncResult.Outcome.SIGN_IN_NEEDED, result.outcome());
            assertEquals(1, kit.outbox().pendingCount(),
                    "her work waits for a new session; it is not thrown away");
            assertEquals(0, kit.outbox().rejectedCount());
        }
    }

    @Test
    void anEmptyOutboxAndAnEmptyCloudIsUpToDate(@TempDir Path dir) {
        Kit kit = open(dir);
        try (LocalDatabase db = kit.db()) {
            SyncResult result = kit.engine().sync(USER);
            assertEquals(SyncResult.Outcome.UP_TO_DATE, result.outcome());
            assertEquals("Up to date", result.summary());
        }
    }

    @Test
    void sentIntentsAreClearedSoThePillStopsSayingWaiting(@TempDir Path dir) {
        Kit kit = open(dir);
        try (LocalDatabase db = kit.db()) {
            kit.tasks().createAssignment(USER, "Essay", null, null,
                    DUE, null, TaskPriority.LOW, 20);

            SyncResult result = kit.engine().sync(USER);

            assertEquals(SyncResult.Outcome.SYNCED, result.outcome());
            assertEquals(1, result.sent());
            assertEquals(0, result.stillPending());
            assertEquals("1 change sent", result.summary());
        }
    }

    private static int indexOfPrefix(List<String> calls, String prefix) {
        for (int i = 0; i < calls.size(); i++) {
            if (calls.get(i).startsWith(prefix)) return i;
        }
        return -1;
    }

    private static int countPrefix(List<String> calls, String prefix) {
        int n = 0;
        for (String call : calls) {
            if (call.startsWith(prefix)) n++;
        }
        return n;
    }
}
