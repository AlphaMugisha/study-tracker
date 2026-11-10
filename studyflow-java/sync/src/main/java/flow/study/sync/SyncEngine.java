package flow.study.sync;

import com.fasterxml.jackson.databind.JsonNode;
import flow.study.domain.model.Ids;
import flow.study.store.Intent;
import flow.study.store.Outbox;
import flow.study.store.ProfileStore;
import flow.study.store.TaskStore;
import flow.study.store.TimetableStore;

import java.time.Instant;
import java.util.ArrayList;
import java.util.HashMap;
import java.util.List;
import java.util.Map;

/**
 * Push, then pull. In that order, always.
 *
 * Pulling first would overwrite local rows whose intents have not been sent --
 * her evening of work replaced by the cloud copy that predates it. Pushing
 * first means that by the time the pull runs, what she did IS cloud truth, so
 * the pull can replace local state wholesale without losing anything.
 *
 * Push replays intents grouped by row, in sequence order within each group. A
 * refusal stalls its own row and nothing else, and is kept and reported rather
 * than retried into submission: 403 is RLS doing its job, and no number of
 * attempts will change its mind.
 *
 * Pull is a full snapshot of everything except the activity log. The dataset
 * is a few hundred rows, so a snapshot is cheaper than tracking tombstones and
 * makes a cloud delete resolve for free. The activity log is append-only and
 * unbounded, so it pulls incrementally by created_at.
 */
public final class SyncEngine {

    /** Tables pulled as a full snapshot, in dependency order. */
    private static final String PROFILES = "profiles";
    private static final String SUBJECTS = "subjects";
    private static final String VERSIONS = "timetable_versions";
    private static final String ENTRIES = "timetable_entries";
    private static final String ASSIGNMENTS = "assignments";
    private static final String REVISION = "revision_tasks";

    private final CloudApi rest;
    private final Outbox outbox;
    private final ProfileStore profiles;
    private final TimetableStore timetable;
    private final TaskStore tasks;

    public SyncEngine(CloudApi rest, Outbox outbox, ProfileStore profiles,
                      TimetableStore timetable, TaskStore tasks) {
        this.rest = rest;
        this.outbox = outbox;
        this.profiles = profiles;
        this.timetable = timetable;
        this.tasks = tasks;
    }

    /**
     * One full cycle.
     *
     * Never throws for an expected condition. Offline is the state most
     * evenings are in, and an exception for the normal case would make every
     * caller wrap it in a try block that means "this is fine".
     */
    public SyncResult sync(String userId) {
        if (!rest.reachable()) return SyncResult.offline();

        Push push;
        try {
            push = push();
        } catch (PostgrestClient.RestException e) {
            if (e.status() == 401) return SyncResult.signInNeeded();
            return SyncResult.failed(e.getMessage());
        }

        int pulled;
        try {
            pulled = pull(userId);
        } catch (PostgrestClient.RestException e) {
            // The push already landed, so this is a partial success rather
            // than a failure: her work is safe, the local copy is just stale.
            return new SyncResult(SyncResult.Outcome.PARTIAL, push.sent, push.refusals.size(),
                    outbox.pendingCount(), 0, Instant.now(), push.refusals,
                    "Sent your changes, but could not refresh: " + e.getMessage());
        }

        outbox.purgeSent();

        SyncResult.Outcome outcome = !push.refusals.isEmpty()
                ? SyncResult.Outcome.PARTIAL
                : push.sent == 0 && pulled == 0
                        ? SyncResult.Outcome.UP_TO_DATE
                        : SyncResult.Outcome.SYNCED;

        return new SyncResult(outcome, push.sent, push.refusals.size(),
                outbox.pendingCount(), pulled, Instant.now(), push.refusals, null);
    }

    // -----------------------------------------------------------------------
    // Push
    // -----------------------------------------------------------------------

    private record Push(int sent, List<SyncResult.Refusal> refusals) {}

    private Push push() {
        int sent = 0;
        List<SyncResult.Refusal> refusals = new ArrayList<>();

        for (Map.Entry<String, List<Intent>> group : outbox.pendingByEntity().entrySet()) {
            /*
             * One row, in order. A locally-created row gets a real id from the
             * cloud on its CREATE, and every later intent in this group has to
             * be addressed to that new id rather than to the local one -- which
             * is why the group is replayed together and the mapping is carried
             * across it.
             */
            String cloudId = null;
            boolean stalled = false;

            for (Intent intent : group.getValue()) {
                if (stalled) break;

                try {
                    String id = cloudId != null ? cloudId : intent.entityId();
                    String assigned = apply(intent, id);
                    if (assigned != null) cloudId = assigned;
                    outbox.markSent(intent.seq());
                    sent++;
                } catch (PostgrestClient.RestException e) {
                    if (e.status() == 401) throw e; // the whole push needs a new token
                    if (e.permanentRefusal()) {
                        outbox.markRejected(intent.seq(), e.getMessage());
                        refusals.add(new SyncResult.Refusal(intent.seq(), intent.entityType(),
                                intent.entityId(), intent.kind().wire(), e.getMessage()));
                    } else {
                        outbox.markAttempted(intent.seq(), e.getMessage());
                    }
                    // Either way, later intents for this row would be applying
                    // to a state that never happened.
                    stalled = true;
                }
            }
        }

        return new Push(sent, refusals);
    }

    /**
     * Apply one intent. Returns the cloud id when this created the row.
     *
     * A CREATE whose local id was never seen by the cloud is sent WITHOUT an
     * id, so Postgres assigns one. Sending the local id would store a value
     * that is not a uuid and would be rejected by the column type.
     */
    private String apply(Intent intent, String id) {
        return switch (intent.kind()) {
            case CREATE -> {
                Map<String, Object> row = new HashMap<>(intent.payload());
                if (!Ids.isLocal(id)) row.put("id", id);
                JsonNode created = rest.insert(intent.entityType(), row);
                JsonNode first = created.isArray() && !created.isEmpty() ? created.get(0) : created;
                yield first.path("id").asText(null);
            }
            case UPDATE -> {
                rest.update(intent.entityType(), id, intent.payload());
                yield null;
            }
            case DELETE -> {
                // A row the cloud never saw needs no deleting; the local
                // delete already happened and there is nothing to mirror.
                if (!Ids.isLocal(id)) rest.delete(intent.entityType(), id);
                yield null;
            }
        };
    }

    // -----------------------------------------------------------------------
    // Pull
    // -----------------------------------------------------------------------

    /**
     * Replace the local copy with cloud truth.
     *
     * Safe to do wholesale because push ran first. The one exception is rows
     * still carrying a local id: those are hers, made offline, and either
     * waiting in the outbox or refused -- deleting them would erase work she
     * can see on screen.
     */
    private int pull(String userId) {
        int count = 0;

        JsonNode profileRows = rest.selectAll(PROFILES);
        for (JsonNode node : profileRows) {
            profiles.upsertFromCloud(CloudRows.profile(node));
            count++;
        }

        timetable.clearSubjects();
        for (JsonNode node : rest.selectAll(SUBJECTS)) {
            timetable.upsertFromCloud(CloudRows.subject(node));
            count++;
        }

        timetable.clearWeek();
        for (JsonNode node : rest.selectAll(VERSIONS)) {
            timetable.upsertVersionFromCloud(CloudRows.timetableVersion(node));
            count++;
        }
        for (JsonNode node : rest.selectAll(ENTRIES)) {
            timetable.upsertFromCloud(CloudRows.timetableEntry(node));
            count++;
        }

        tasks.clearSyncedTasks();
        for (JsonNode node : rest.selectAll(ASSIGNMENTS)) {
            tasks.upsertFromCloud(CloudRows.assignment(node));
            count++;
        }
        for (JsonNode node : rest.selectAll(REVISION)) {
            tasks.upsertFromCloud(CloudRows.revisionTask(node));
            count++;
        }

        profiles.setWatermark(PROFILES, userId);
        return count;
    }
}
