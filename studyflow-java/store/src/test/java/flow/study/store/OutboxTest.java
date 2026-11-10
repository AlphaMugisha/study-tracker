package flow.study.store;

import flow.study.domain.model.Ids;
import flow.study.domain.model.TaskPriority;
import flow.study.domain.model.TaskStatus;
import flow.study.domain.tasks.AssignmentView;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.io.TempDir;

import java.nio.file.Path;
import java.time.Instant;
import java.time.LocalDate;
import java.time.ZoneId;
import java.util.List;
import java.util.Map;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertNull;
import static org.junit.jupiter.api.Assertions.assertTrue;

/**
 * An offline evening, and what it leaves waiting to be sent.
 *
 * The contract these pin down is the one the sync engine depends on: a local
 * write and its intent are committed together, an intent names only the fields
 * it changes, and order holds within a row.
 */
class OutboxTest {

    private static final char[] PASSPHRASE = "an evening of homework".toCharArray();
    private static final ZoneId KIGALI = ZoneId.of("Africa/Kigali");
    private static final Instant NOW = Instant.parse("2026-09-23T17:00:00Z");
    private static final LocalDate IN_TWO_DAYS = LocalDate.parse("2026-09-25");

    private record Kit(LocalDatabase db, Outbox outbox, TaskStore tasks) {}

    private static Kit open(Path dir) {
        LocalDatabase db = LocalDatabase.open(
                new StoreLocation(dir), PASSPHRASE, Passphrase.newSalt());
        Outbox outbox = new Outbox(db);
        return new Kit(db, outbox, new TaskStore(db, outbox));
    }

    @Test
    void writingHomeworkOfflineQueuesExactlyOneIntent(@TempDir Path dir) {
        Kit kit = open(dir);
        try (LocalDatabase db = kit.db()) {
            String id = kit.tasks().createAssignment("u1", "Maths p.44", null, null,
                    IN_TWO_DAYS, null, TaskPriority.HIGH, 30);

            assertTrue(Ids.isLocal(id), "a row the cloud has never seen carries a local id");
            assertEquals(1, kit.outbox().pendingCount());

            Intent intent = kit.outbox().pending().get(0);
            assertEquals("assignments", intent.entityType());
            assertEquals(id, intent.entityId());
            assertEquals(Intent.Kind.CREATE, intent.kind());
            assertEquals("Maths p.44", intent.payload().get("title"));

            // And the row is readable straight away, with no network involved.
            List<AssignmentView> homework = kit.tasks().assignments(KIGALI, NOW);
            assertEquals(1, homework.size());
            assertEquals("Maths p.44", homework.get(0).title());
            assertFalse(homework.get(0).overdue(), "due in two days is not overdue");
        }
    }

    @Test
    void tickingItOffSendsTheStatusAndNothingElse(@TempDir Path dir) {
        Kit kit = open(dir);
        try (LocalDatabase db = kit.db()) {
            String id = kit.tasks().createAssignment("u1", "Essay", null, null,
                    IN_TWO_DAYS, null, TaskPriority.MEDIUM, 60);
            int before = kit.outbox().pendingCount();

            kit.tasks().setAssignmentStatus(id, TaskStatus.COMPLETED);

            assertEquals(before + 1, kit.outbox().pendingCount());
            Intent tick = kit.outbox().pending().get(before);
            assertEquals(Map.of("status", "completed"), tick.payload(),
                    "an intent carries the fields it changes, never a whole row");

            /*
             * completed_at moved locally, because the CHECK constraint refuses
             * any other combination -- but it is deliberately absent from the
             * payload: the cloud trigger owns that column, and sending a value
             * that disagreed with status would be rejected by the CHECK.
             */
            assertTrue(kit.tasks().assignments(KIGALI, NOW).get(0).done());
        }
    }

    @Test
    void intentsForOneRowKeepTheirOrder(@TempDir Path dir) {
        Kit kit = open(dir);
        try (LocalDatabase db = kit.db()) {
            String id = kit.tasks().createAssignment("u1", "Essay", null, null,
                    IN_TWO_DAYS, null, TaskPriority.MEDIUM, 60);
            kit.tasks().setAssignmentStatus(id, TaskStatus.IN_PROGRESS);
            kit.tasks().setAssignmentStatus(id, TaskStatus.COMPLETED);

            Map<String, List<Intent>> grouped = kit.outbox().pendingByEntity();
            assertEquals(1, grouped.size(), "all three touch one row");

            List<Intent> forRow = grouped.get("assignments:" + id);
            assertEquals(List.of(Intent.Kind.CREATE, Intent.Kind.UPDATE, Intent.Kind.UPDATE),
                    forRow.stream().map(Intent::kind).toList());
            assertEquals("in_progress", forRow.get(1).payload().get("status"));
            assertEquals("completed", forRow.get(2).payload().get("status"));
            assertTrue(forRow.get(0).seq() < forRow.get(1).seq());
        }
    }

    @Test
    void workOnDifferentRowsIsGroupedSoOneRejectionCannotBlockTheRest(@TempDir Path dir) {
        Kit kit = open(dir);
        try (LocalDatabase db = kit.db()) {
            kit.tasks().createAssignment("u1", "A", null, null,
                    IN_TWO_DAYS, null, TaskPriority.LOW, 20);
            kit.tasks().createAssignment("u1", "B", null, null,
                    IN_TWO_DAYS, null, TaskPriority.LOW, 20);

            assertEquals(2, kit.outbox().pendingByEntity().size(),
                    "two rows are two independent replay groups");
        }
    }

    @Test
    void aRejectedIntentIsKeptAndCanBeRetried(@TempDir Path dir) {
        Kit kit = open(dir);
        try (LocalDatabase db = kit.db()) {
            String id = kit.tasks().createAssignment("u1", "Essay", null, null,
                    IN_TWO_DAYS, null, TaskPriority.MEDIUM, 60);
            long seq = kit.outbox().pending().get(0).seq();

            kit.outbox().markRejected(seq, "new row violates row-level security policy");

            assertEquals(0, kit.outbox().pendingCount());
            assertEquals(1, kit.outbox().rejectedCount());

            Intent rejected = kit.outbox().rejected().get(0);
            assertEquals(1, rejected.attempts());
            assertTrue(rejected.lastError().contains("row-level security"),
                    "the reason has to survive, or it cannot be shown to her");

            kit.outbox().retry(seq);
            assertEquals(1, kit.outbox().pendingCount());
            assertEquals(0, kit.outbox().rejectedCount());

            // The local row is untouched by any of this: the next pull is what
            // corrects it, rather than this guessing at cloud state.
            assertEquals(id, kit.tasks().assignments(KIGALI, NOW).get(0).id());
        }
    }

    @Test
    void sessionsRecordTheMinutesSheActuallyWorked(@TempDir Path dir) {
        Kit kit = open(dir);
        try (LocalDatabase db = kit.db()) {
            String id = kit.tasks().startSession("u1", "sub1", null, null);
            assertEquals(id, kit.tasks().runningSessionId());

            kit.tasks().endSession(id);
            assertNull(kit.tasks().runningSessionId());

            List<Intent> forSession = kit.outbox().pendingByEntity().get("study_sessions:" + id);
            assertEquals(2, forSession.size());
            assertTrue(forSession.get(1).payload().containsKey("duration_minutes"),
                    "the duration is sent explicitly, not left to a push-time trigger");
        }
    }

    @Test
    void aSnapshotPullKeepsRowsStillWaitingToBeSent(@TempDir Path dir) {
        Kit kit = open(dir);
        try (LocalDatabase db = kit.db()) {
            kit.tasks().createAssignment("u1", "Made offline", null, null,
                    IN_TWO_DAYS, null, TaskPriority.LOW, 20);

            kit.tasks().clearSyncedTasks();

            assertEquals(1, kit.tasks().assignments(KIGALI, NOW).size(),
                    "work the cloud has never seen must survive a snapshot pull");
        }
    }

    @Test
    void sentIntentsArePurgedBecauseTheyAreHistoryNotState(@TempDir Path dir) {
        Kit kit = open(dir);
        try (LocalDatabase db = kit.db()) {
            kit.tasks().createAssignment("u1", "Essay", null, null,
                    IN_TWO_DAYS, null, TaskPriority.LOW, 20);
            long seq = kit.outbox().pending().get(0).seq();

            kit.outbox().markSent(seq);
            assertEquals(0, kit.outbox().pendingCount());

            assertEquals(1, kit.outbox().purgeSent());
            assertEquals(0, kit.outbox().purgeSent(), "purging twice is harmless");
        }
    }
}
