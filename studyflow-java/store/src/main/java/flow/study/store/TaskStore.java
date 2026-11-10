package flow.study.store;

import flow.study.domain.model.Assignment;
import flow.study.domain.model.RevisionTask;
import flow.study.domain.model.TaskPriority;
import flow.study.domain.model.TaskStatus;
import flow.study.domain.tasks.AssignmentView;
import flow.study.domain.tasks.RevisionView;
import flow.study.domain.tasks.SubjectRef;

import java.sql.Connection;
import java.sql.PreparedStatement;
import java.sql.ResultSet;
import java.sql.SQLException;
import java.time.Instant;
import java.time.LocalDate;
import java.time.LocalTime;
import java.time.ZoneId;
import java.util.ArrayList;
import java.util.HashMap;
import java.util.List;
import java.util.Map;

/**
 * Homework, revision, and what was actually worked on.
 *
 * Every write here does two things in one transaction: change the local row,
 * and record the intent that will reproduce the change in the cloud. They
 * cannot come apart -- a local tick with no intent is a change that silently
 * never syncs, and an intent with no local change is a screen that lies until
 * the next pull.
 */
public final class TaskStore {

    private static final String ASSIGNMENTS = "assignments";
    private static final String REVISION = "revision_tasks";
    private static final String SESSIONS = "study_sessions";

    private final Connection connection;
    private final Outbox outbox;

    public TaskStore(LocalDatabase database, Outbox outbox) {
        this.connection = database.connection();
        this.outbox = outbox;
    }

    // -----------------------------------------------------------------------
    // Reading
    // -----------------------------------------------------------------------

    /**
     * Homework, with the subject joined and overdue derived.
     *
     * The clock is a parameter rather than read here, for the same reason the
     * domain takes one: overdue is computed, and a function that reaches for
     * the current instant is a function that cannot be tested at a chosen
     * moment.
     */
    public List<AssignmentView> assignments(ZoneId zone, Instant now) {
        String sql = """
                select a.id, a.user_id, a.subject_id, a.title, a.description, a.due_date,
                       a.due_time, a.priority, a.estimated_minutes, a.status, a.completed_at,
                       a.created_at, a.updated_at,
                       s.name as subject_name, s.color_token as subject_color
                  from assignments a
                  left join subjects s on s.id = a.subject_id
                 order by a.due_date, a.due_time
                """;

        List<AssignmentView> out = new ArrayList<>();
        try (PreparedStatement statement = connection.prepareStatement(sql);
             ResultSet rows = statement.executeQuery()) {
            while (rows.next()) {
                Assignment row = new Assignment(
                        rows.getString("id"),
                        rows.getString("user_id"),
                        rows.getString("subject_id"),
                        rows.getString("title"),
                        rows.getString("description"),
                        Rows.date(rows, "due_date"),
                        Rows.time(rows, "due_time"),
                        TaskPriority.parse(rows.getString("priority")),
                        rows.getInt("estimated_minutes"),
                        TaskStatus.parse(rows.getString("status")),
                        Rows.instant(rows, "completed_at"),
                        Rows.instant(rows, "created_at"),
                        Rows.instant(rows, "updated_at"));

                String subjectName = rows.getString("subject_name");
                SubjectRef subject = subjectName == null ? null
                        : new SubjectRef(row.subjectId(), subjectName,
                                rows.getString("subject_color"));

                out.add(AssignmentView.of(row, subject, zone, now));
            }
        } catch (SQLException e) {
            throw new StoreException("Cannot read your homework: " + e.getMessage(), e);
        }
        return out;
    }

    public List<RevisionView> revision() {
        String sql = """
                select r.id, r.user_id, r.subject_id, r.title, r.description, r.scheduled_date,
                       r.estimated_minutes, r.priority, r.status, r.completed_at,
                       r.created_at, r.updated_at,
                       s.name as subject_name, s.color_token as subject_color
                  from revision_tasks r
                  left join subjects s on s.id = r.subject_id
                 order by r.created_at
                """;

        List<RevisionView> out = new ArrayList<>();
        try (PreparedStatement statement = connection.prepareStatement(sql);
             ResultSet rows = statement.executeQuery()) {
            while (rows.next()) {
                RevisionTask row = new RevisionTask(
                        rows.getString("id"),
                        rows.getString("user_id"),
                        rows.getString("subject_id"),
                        rows.getString("title"),
                        rows.getString("description"),
                        Rows.date(rows, "scheduled_date"),
                        rows.getInt("estimated_minutes"),
                        TaskPriority.parse(rows.getString("priority")),
                        TaskStatus.parse(rows.getString("status")),
                        Rows.instant(rows, "completed_at"),
                        Rows.instant(rows, "created_at"),
                        Rows.instant(rows, "updated_at"));

                String subjectName = rows.getString("subject_name");
                SubjectRef subject = subjectName == null ? null
                        : new SubjectRef(row.subjectId(), subjectName,
                                rows.getString("subject_color"));

                out.add(new RevisionView(row, subject));
            }
        } catch (SQLException e) {
            throw new StoreException("Cannot read your revision list: " + e.getMessage(), e);
        }
        return out;
    }

    /**
     * Whole days since the last recorded session, by subject.
     *
     * Feeds the study suggester, which uses it to raise a subject nothing else
     * in the product would ever mention.
     */
    public Map<String, Integer> studiedDaysAgo(ZoneId zone, Instant now) {
        String sql = "select subject_id, max(started_at) as last_at from study_sessions "
                + "where subject_id is not null group by subject_id";
        Map<String, Integer> out = new HashMap<>();
        LocalDate today = now.atZone(zone).toLocalDate();

        try (PreparedStatement statement = connection.prepareStatement(sql);
             ResultSet rows = statement.executeQuery()) {
            while (rows.next()) {
                Instant last = Rows.instant(rows, "last_at");
                if (last == null) continue;
                long days = java.time.temporal.ChronoUnit.DAYS.between(
                        last.atZone(zone).toLocalDate(), today);
                out.put(rows.getString("subject_id"), (int) Math.max(0, days));
            }
        } catch (SQLException e) {
            throw new StoreException("Cannot read your study history: " + e.getMessage(), e);
        }
        return out;
    }

    // -----------------------------------------------------------------------
    // Writing
    // -----------------------------------------------------------------------

    /**
     * Write down a piece of homework.
     *
     * The id is generated locally and prefixed, so the sync engine can tell a
     * row the cloud has never seen from one it has. On push the cloud assigns
     * the real id and the pull replaces this one.
     */
    public String createAssignment(String userId, String title, String subjectId,
                                   String description, LocalDate dueDate, LocalTime dueTime,
                                   TaskPriority priority, int estimatedMinutes) {
        String id = Rows.localId();
        Instant now = Instant.now();

        String sql = "insert into assignments (id, user_id, subject_id, title, description, "
                + "due_date, due_time, priority, estimated_minutes, status, created_at, "
                + "updated_at) values (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)";

        inTransaction(() -> {
            try (PreparedStatement statement = connection.prepareStatement(sql)) {
                statement.setString(1, id);
                statement.setString(2, userId);
                statement.setString(3, subjectId);
                statement.setString(4, title);
                statement.setString(5, description);
                Rows.setDate(statement, 6, dueDate);
                Rows.setTime(statement, 7, dueTime);
                statement.setString(8, priority.wire());
                statement.setInt(9, estimatedMinutes);
                statement.setString(10, TaskStatus.NOT_STARTED.wire());
                Rows.setInstant(statement, 11, now);
                Rows.setInstant(statement, 12, now);
                statement.executeUpdate();
            }

            Map<String, Object> payload = new HashMap<>();
            payload.put("user_id", userId);
            payload.put("title", title);
            payload.put("subject_id", subjectId);
            payload.put("description", description);
            payload.put("due_date", dueDate.toString());
            payload.put("due_time", dueTime == null ? null : dueTime.toString());
            payload.put("priority", priority.wire());
            payload.put("estimated_minutes", estimatedMinutes);
            outbox.record(ASSIGNMENTS, id, Intent.Kind.CREATE, payload);
            return null;
        }, "Cannot save that homework");

        return id;
    }

    /**
     * Tick it off, or un-tick it.
     *
     * completed_at moves with status because the CHECK constraint refuses any
     * other combination -- in the cloud a trigger fills it, but the intent
     * carries status alone and lets that trigger do its job.
     */
    public void setAssignmentStatus(String id, TaskStatus status) {
        Instant completedAt = status == TaskStatus.COMPLETED ? Instant.now() : null;

        String sql = "update assignments set status = ?, completed_at = ?, updated_at = ? "
                + "where id = ?";
        inTransaction(() -> {
            try (PreparedStatement statement = connection.prepareStatement(sql)) {
                statement.setString(1, status.wire());
                Rows.setInstant(statement, 2, completedAt);
                Rows.setInstant(statement, 3, Instant.now());
                statement.setString(4, id);
                statement.executeUpdate();
            }
            // status only. completed_at is maintained by a trigger in the
            // cloud, and setting it by hand could contradict status -- which
            // the CHECK would then reject, surfacing as a failed push rather
            // than as the obvious thing happening.
            outbox.record(ASSIGNMENTS, id, Intent.Kind.UPDATE,
                    Map.of("status", status.wire()));
            return null;
        }, "Cannot update that homework");
    }

    public void setRevisionStatus(String id, TaskStatus status) {
        Instant completedAt = status == TaskStatus.COMPLETED ? Instant.now() : null;

        String sql = "update revision_tasks set status = ?, completed_at = ?, updated_at = ? "
                + "where id = ?";
        inTransaction(() -> {
            try (PreparedStatement statement = connection.prepareStatement(sql)) {
                statement.setString(1, status.wire());
                Rows.setInstant(statement, 2, completedAt);
                Rows.setInstant(statement, 3, Instant.now());
                statement.setString(4, id);
                statement.executeUpdate();
            }
            outbox.record(REVISION, id, Intent.Kind.UPDATE, Map.of("status", status.wire()));
            return null;
        }, "Cannot update that revision task");
    }

    /** Queue a suggestion as real revision. Only ever at her request. */
    public String createRevision(String userId, String title, String subjectId,
                                 int estimatedMinutes) {
        String id = Rows.localId();
        Instant now = Instant.now();

        String sql = "insert into revision_tasks (id, user_id, subject_id, title, "
                + "estimated_minutes, priority, status, created_at, updated_at) "
                + "values (?, ?, ?, ?, ?, ?, ?, ?, ?)";

        inTransaction(() -> {
            try (PreparedStatement statement = connection.prepareStatement(sql)) {
                statement.setString(1, id);
                statement.setString(2, userId);
                statement.setString(3, subjectId);
                statement.setString(4, title);
                statement.setInt(5, estimatedMinutes);
                statement.setString(6, TaskPriority.MEDIUM.wire());
                statement.setString(7, TaskStatus.NOT_STARTED.wire());
                Rows.setInstant(statement, 8, now);
                Rows.setInstant(statement, 9, now);
                statement.executeUpdate();
            }

            Map<String, Object> payload = new HashMap<>();
            payload.put("user_id", userId);
            payload.put("title", title);
            payload.put("subject_id", subjectId);
            payload.put("estimated_minutes", estimatedMinutes);
            outbox.record(REVISION, id, Intent.Kind.CREATE, payload);
            return null;
        }, "Cannot queue that revision");

        return id;
    }

    public void deleteAssignment(String id) {
        inTransaction(() -> {
            try (PreparedStatement statement =
                         connection.prepareStatement("delete from assignments where id = ?")) {
                statement.setString(1, id);
                statement.executeUpdate();
            }
            outbox.record(ASSIGNMENTS, id, Intent.Kind.DELETE, Map.of());
            return null;
        }, "Cannot delete that homework");
    }

    // -----------------------------------------------------------------------
    // Sessions
    // -----------------------------------------------------------------------

    /** Start the clock on a piece of work. */
    public String startSession(String userId, String subjectId, String assignmentId,
                               String revisionTaskId) {
        String id = Rows.localId();
        Instant now = Instant.now();

        String sql = "insert into study_sessions (id, user_id, subject_id, assignment_id, "
                + "revision_task_id, started_at, created_at, updated_at) "
                + "values (?, ?, ?, ?, ?, ?, ?, ?)";

        inTransaction(() -> {
            try (PreparedStatement statement = connection.prepareStatement(sql)) {
                statement.setString(1, id);
                statement.setString(2, userId);
                statement.setString(3, subjectId);
                statement.setString(4, assignmentId);
                statement.setString(5, revisionTaskId);
                Rows.setInstant(statement, 6, now);
                Rows.setInstant(statement, 7, now);
                Rows.setInstant(statement, 8, now);
                statement.executeUpdate();
            }

            Map<String, Object> payload = new HashMap<>();
            payload.put("user_id", userId);
            payload.put("subject_id", subjectId);
            payload.put("assignment_id", assignmentId);
            payload.put("revision_task_id", revisionTaskId);
            payload.put("started_at", now.toString());
            outbox.record(SESSIONS, id, Intent.Kind.CREATE, payload);
            return null;
        }, "Cannot start that session");

        return id;
    }

    /**
     * Stop the clock.
     *
     * The duration is computed and sent explicitly rather than left to the
     * cloud trigger. The trigger fills it from ended_at minus started_at,
     * which is correct -- but an offline session that is pushed hours later
     * must record the minutes she actually worked, not anything derived at
     * push time.
     */
    public void endSession(String id) {
        Instant endedAt = Instant.now();

        inTransaction(() -> {
            Instant startedAt = null;
            try (PreparedStatement statement = connection.prepareStatement(
                    "select started_at from study_sessions where id = ?")) {
                statement.setString(1, id);
                try (ResultSet rows = statement.executeQuery()) {
                    if (rows.next()) startedAt = Rows.instant(rows, "started_at");
                }
            }
            if (startedAt == null) return null;

            int minutes = (int) java.time.Duration.between(startedAt, endedAt).toMinutes();

            String sql = "update study_sessions set ended_at = ?, duration_minutes = ?, "
                    + "updated_at = ? where id = ?";
            try (PreparedStatement statement = connection.prepareStatement(sql)) {
                Rows.setInstant(statement, 1, endedAt);
                statement.setInt(2, minutes);
                Rows.setInstant(statement, 3, endedAt);
                statement.setString(4, id);
                statement.executeUpdate();
            }

            outbox.record(SESSIONS, id, Intent.Kind.UPDATE, Map.of(
                    "ended_at", endedAt.toString(),
                    "duration_minutes", minutes));
            return null;
        }, "Cannot end that session");
    }

    /** The session still running, if there is one. */
    public String runningSessionId() {
        try (PreparedStatement statement = connection.prepareStatement(
                "select id from study_sessions where ended_at is null order by started_at desc");
             ResultSet rows = statement.executeQuery()) {
            return rows.next() ? rows.getString("id") : null;
        } catch (SQLException e) {
            throw new StoreException("Cannot read your sessions: " + e.getMessage(), e);
        }
    }

    // -----------------------------------------------------------------------
    // Pull support
    // -----------------------------------------------------------------------

    public void upsertFromCloud(Assignment row) {
        String sql = "merge into assignments (id, user_id, subject_id, title, description, "
                + "due_date, due_time, priority, estimated_minutes, status, completed_at, "
                + "created_at, updated_at) key (id) values (?,?,?,?,?,?,?,?,?,?,?,?,?)";
        try (PreparedStatement statement = connection.prepareStatement(sql)) {
            statement.setString(1, row.id());
            statement.setString(2, row.userId());
            statement.setString(3, row.subjectId());
            statement.setString(4, row.title());
            statement.setString(5, row.description());
            Rows.setDate(statement, 6, row.dueDate());
            Rows.setTime(statement, 7, row.dueTime());
            statement.setString(8, row.priority().wire());
            statement.setInt(9, row.estimatedMinutes());
            statement.setString(10, row.status().wire());
            Rows.setInstant(statement, 11, row.completedAt());
            Rows.setInstant(statement, 12, row.createdAt());
            Rows.setInstant(statement, 13, row.updatedAt());
            statement.executeUpdate();
        } catch (SQLException e) {
            throw new StoreException("Cannot save homework: " + e.getMessage(), e);
        }
    }

    public void upsertFromCloud(RevisionTask row) {
        String sql = "merge into revision_tasks (id, user_id, subject_id, title, description, "
                + "scheduled_date, estimated_minutes, priority, status, completed_at, "
                + "created_at, updated_at) key (id) values (?,?,?,?,?,?,?,?,?,?,?,?)";
        try (PreparedStatement statement = connection.prepareStatement(sql)) {
            statement.setString(1, row.id());
            statement.setString(2, row.userId());
            statement.setString(3, row.subjectId());
            statement.setString(4, row.title());
            statement.setString(5, row.description());
            Rows.setDate(statement, 6, row.scheduledDate());
            statement.setInt(7, row.estimatedMinutes());
            statement.setString(8, row.priority().wire());
            statement.setString(9, row.status().wire());
            Rows.setInstant(statement, 10, row.completedAt());
            Rows.setInstant(statement, 11, row.createdAt());
            Rows.setInstant(statement, 12, row.updatedAt());
            statement.executeUpdate();
        } catch (SQLException e) {
            throw new StoreException("Cannot save revision: " + e.getMessage(), e);
        }
    }

    /**
     * Clear local rows the cloud has already seen, before a snapshot pull.
     *
     * Rows with a local id are kept: those are hers, made offline, and still
     * waiting in the outbox. Deleting them here would erase work she can see
     * on screen because the cloud has not been told about it yet.
     */
    public void clearSyncedTasks() {
        String local = flow.study.domain.model.Ids.LOCAL_PREFIX + "%";
        try (PreparedStatement a = connection.prepareStatement(
                "delete from assignments where id not like ?");
             PreparedStatement r = connection.prepareStatement(
                     "delete from revision_tasks where id not like ?")) {
            a.setString(1, local);
            a.executeUpdate();
            r.setString(1, local);
            r.executeUpdate();
        } catch (SQLException e) {
            throw new StoreException("Cannot clear local tasks: " + e.getMessage(), e);
        }
    }

    private interface Work {
        Object run() throws SQLException;
    }

    private void inTransaction(Work work, String failureMessage) {
        try {
            connection.setAutoCommit(false);
            work.run();
            connection.commit();
        } catch (SQLException e) {
            try {
                connection.rollback();
            } catch (SQLException failed) {
                e.addSuppressed(failed);
            }
            throw new StoreException(failureMessage + ": " + e.getMessage(), e);
        } finally {
            try {
                connection.setAutoCommit(true);
            } catch (SQLException ignored) {
                // The connection is unusable anyway if this fails.
            }
        }
    }
}
