package flow.study.store;

import flow.study.domain.model.ActivityKind;
import flow.study.domain.model.ExtractionConfidence;
import flow.study.domain.model.Subject;
import flow.study.domain.model.TimetableEntry;
import flow.study.domain.model.TimetableStatus;
import flow.study.domain.timetable.ResolvedEntry;

import java.sql.Connection;
import java.sql.PreparedStatement;
import java.sql.ResultSet;
import java.sql.SQLException;
import java.time.Instant;
import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;

/**
 * Subjects and the school week.
 *
 * {@link #activeWeek()} is the hot path: the Today screen calls it once and
 * then ticks the resolver against the result every second, so it joins the
 * subject in SQL rather than leaving the view to do it per row.
 */
public final class TimetableStore {

    private final Connection connection;

    public TimetableStore(LocalDatabase database) {
        this.connection = database.connection();
    }

    // -----------------------------------------------------------------------
    // Subjects
    // -----------------------------------------------------------------------

    public List<Subject> subjects() {
        String sql = "select id, user_id, name, short_name, color_token, created_at, updated_at "
                + "from subjects order by name";
        List<Subject> out = new ArrayList<>();
        try (PreparedStatement statement = connection.prepareStatement(sql);
             ResultSet rows = statement.executeQuery()) {
            while (rows.next()) {
                out.add(new Subject(
                        rows.getString("id"),
                        rows.getString("user_id"),
                        rows.getString("name"),
                        rows.getString("short_name"),
                        rows.getString("color_token"),
                        Rows.instant(rows, "created_at"),
                        Rows.instant(rows, "updated_at")));
            }
        } catch (SQLException e) {
            throw new StoreException("Cannot read your subjects: " + e.getMessage(), e);
        }
        return out;
    }

    public Map<String, Subject> subjectsById() {
        Map<String, Subject> byId = new LinkedHashMap<>();
        for (Subject subject : subjects()) byId.put(subject.id(), subject);
        return byId;
    }

    public void upsertFromCloud(Subject subject) {
        String sql = "merge into subjects (id, user_id, name, short_name, color_token, "
                + "created_at, updated_at) key (id) values (?, ?, ?, ?, ?, ?, ?)";
        try (PreparedStatement statement = connection.prepareStatement(sql)) {
            statement.setString(1, subject.id());
            statement.setString(2, subject.userId());
            statement.setString(3, subject.name());
            statement.setString(4, subject.shortName());
            statement.setString(5, subject.colorToken());
            Rows.setInstant(statement, 6, subject.createdAt());
            Rows.setInstant(statement, 7, subject.updatedAt());
            statement.executeUpdate();
        } catch (SQLException e) {
            throw new StoreException("Cannot save a subject: " + e.getMessage(), e);
        }
    }

    // -----------------------------------------------------------------------
    // The week
    // -----------------------------------------------------------------------

    /**
     * The active timetable, flattened and subject-joined, every day of it.
     *
     * Returns an empty list when there is no active version, which the
     * resolver turns into NoTimetable -- the app admitting it does not know,
     * rather than an empty school day.
     */
    public List<ResolvedEntry> activeWeek() {
        String sql = """
                select e.id, e.activity_type, e.title, e.room, e.teacher, e.day_of_week,
                       e.start_time, e.end_time, e.subject_id,
                       s.name as subject_name, s.color_token as subject_color
                  from timetable_entries e
                  join timetable_versions v on v.id = e.timetable_version_id
                  left join subjects s on s.id = e.subject_id
                 where v.status = ?
                 order by e.day_of_week, e.start_time
                """;

        List<ResolvedEntry> out = new ArrayList<>();
        try (PreparedStatement statement = connection.prepareStatement(sql)) {
            statement.setString(1, TimetableStatus.ACTIVE.wire());
            try (ResultSet rows = statement.executeQuery()) {
                while (rows.next()) out.add(resolve(rows));
            }
        } catch (SQLException e) {
            throw new StoreException("Cannot read your timetable: " + e.getMessage(), e);
        }
        return out;
    }

    /**
     * Flatten one joined row.
     *
     * The naming rule is the same one the web app uses: a lesson is named by
     * its subject, anything else by its own title; a lesson that also carries
     * a title shows the title as its detail line, otherwise the room, failing
     * that the teacher.
     */
    private static ResolvedEntry resolve(ResultSet rows) throws SQLException {
        ActivityKind kind = ActivityKind.parse(rows.getString("activity_type"));
        String title = rows.getString("title");
        String room = rows.getString("room");
        String teacher = rows.getString("teacher");
        String subjectName = rows.getString("subject_name");

        var start = Rows.time(rows, "start_time");
        var end = Rows.time(rows, "end_time");
        int startMinutes = flow.study.domain.timetable.Times.toMinutes(start);
        int endMinutes = flow.study.domain.timetable.Times.toMinutes(end);

        String label = subjectName != null ? subjectName : title != null ? title : "Untitled";
        String detail = subjectName != null && title != null ? title
                : room != null ? room : teacher;

        return new ResolvedEntry(
                rows.getString("id"),
                kind,
                label,
                detail,
                teacher,
                subjectName,
                rows.getString("subject_id"),
                rows.getString("subject_color"),
                room,
                rows.getInt("day_of_week"),
                startMinutes,
                endMinutes,
                flow.study.domain.timetable.Times.label(startMinutes),
                flow.study.domain.timetable.Times.label(endMinutes),
                endMinutes - startMinutes);
    }

    public void upsertFromCloud(TimetableEntry entry) {
        String sql = "merge into timetable_entries (id, user_id, timetable_version_id, "
                + "subject_id, activity_type, title, day_of_week, start_time, end_time, room, "
                + "teacher, confidence, created_at, updated_at) key (id) "
                + "values (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)";
        try (PreparedStatement statement = connection.prepareStatement(sql)) {
            statement.setString(1, entry.id());
            statement.setString(2, entry.userId());
            statement.setString(3, entry.timetableVersionId());
            statement.setString(4, entry.subjectId());
            statement.setString(5, entry.activityType().wire());
            statement.setString(6, entry.title());
            statement.setInt(7, entry.dayOfWeek());
            Rows.setTime(statement, 8, entry.startTime());
            Rows.setTime(statement, 9, entry.endTime());
            statement.setString(10, entry.room());
            statement.setString(11, entry.teacher());
            statement.setString(12, entry.confidence() == null
                    ? ExtractionConfidence.HIGH.wire() : entry.confidence().wire());
            Rows.setInstant(statement, 13, entry.createdAt());
            Rows.setInstant(statement, 14, entry.updatedAt());
            statement.executeUpdate();
        } catch (SQLException e) {
            throw new StoreException("Cannot save a timetable entry: " + e.getMessage(), e);
        }
    }

    public void upsertVersionFromCloud(flow.study.domain.model.TimetableVersion version) {
        String sql = "merge into timetable_versions (id, user_id, name, status, source_type, "
                + "source_path, effective_from, effective_until, confirmed_at, created_at, "
                + "updated_at) key (id) values (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)";
        try (PreparedStatement statement = connection.prepareStatement(sql)) {
            statement.setString(1, version.id());
            statement.setString(2, version.userId());
            statement.setString(3, version.name());
            statement.setString(4, version.status().wire());
            statement.setString(5, version.sourceType().wire());
            statement.setString(6, version.sourcePath());
            Rows.setDate(statement, 7, version.effectiveFrom());
            Rows.setDate(statement, 8, version.effectiveUntil());
            Rows.setInstant(statement, 9, version.confirmedAt());
            Rows.setInstant(statement, 10, version.createdAt());
            Rows.setInstant(statement, 11, version.updatedAt());
            statement.executeUpdate();
        } catch (SQLException e) {
            throw new StoreException("Cannot save a timetable version: " + e.getMessage(), e);
        }
    }

    /**
     * Clear the local timetable before a snapshot pull writes the new one.
     *
     * Needed because the pull is a snapshot rather than a diff: without this,
     * an entry deleted in the cloud would linger locally forever and show up
     * as a lesson that no longer exists. Called inside the pull transaction,
     * so a failed pull leaves the old week intact.
     */
    public void clearWeek() {
        try (var statement = connection.createStatement()) {
            statement.executeUpdate("delete from timetable_entries");
            statement.executeUpdate("delete from timetable_versions");
        } catch (SQLException e) {
            throw new StoreException("Cannot clear the local timetable: " + e.getMessage(), e);
        }
    }

    public void clearSubjects() {
        try (var statement = connection.createStatement()) {
            statement.executeUpdate("delete from subjects");
        } catch (SQLException e) {
            throw new StoreException("Cannot clear local subjects: " + e.getMessage(), e);
        }
    }

    /** Last time anything in the timetable changed, for a staleness note. */
    public Instant lastUpdatedAt() {
        try (var statement = connection.createStatement();
             ResultSet rows = statement.executeQuery(
                     "select max(updated_at) from timetable_entries")) {
            return rows.next() ? Rows.instant(rows, 1) : null;
        } catch (SQLException e) {
            throw new StoreException("Cannot read the timetable date: " + e.getMessage(), e);
        }
    }
}
