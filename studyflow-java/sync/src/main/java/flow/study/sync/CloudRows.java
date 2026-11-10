package flow.study.sync;

import com.fasterxml.jackson.databind.JsonNode;
import flow.study.domain.model.ActivityKind;
import flow.study.domain.model.Assignment;
import flow.study.domain.model.ExtractionConfidence;
import flow.study.domain.model.Profile;
import flow.study.domain.model.RevisionTask;
import flow.study.domain.model.Subject;
import flow.study.domain.model.TaskPriority;
import flow.study.domain.model.TaskStatus;
import flow.study.domain.model.TimetableEntry;
import flow.study.domain.model.TimetableSource;
import flow.study.domain.model.TimetableStatus;
import flow.study.domain.model.TimetableVersion;
import flow.study.domain.model.UserRole;

import java.time.Instant;
import java.time.LocalDate;
import java.time.LocalTime;
import java.time.OffsetDateTime;

/**
 * PostgREST JSON into domain records.
 *
 * Every enum goes through its own parse method, which throws on an unknown
 * label rather than defaulting. That is deliberate: an unrecognised value
 * means the cloud schema has moved ahead of this build, and quietly
 * substituting something plausible would put wrong data on her screen and
 * call it synced. A loud failure says "update the app" instead.
 */
final class CloudRows {
    private CloudRows() {}

    static Profile profile(JsonNode node) {
        return new Profile(
                text(node, "id"),
                text(node, "full_name") == null ? "" : text(node, "full_name"),
                UserRole.parse(text(node, "role")),
                text(node, "timezone") == null ? "UTC" : text(node, "timezone"),
                time(node, "study_until", LocalTime.of(21, 0)),
                node.path("settle_minutes").asInt(30),
                instant(node, "created_at"),
                instant(node, "updated_at"));
    }

    static Subject subject(JsonNode node) {
        return new Subject(
                text(node, "id"),
                text(node, "user_id"),
                text(node, "name"),
                text(node, "short_name"),
                text(node, "color_token") == null ? "chart-1" : text(node, "color_token"),
                instant(node, "created_at"),
                instant(node, "updated_at"));
    }

    static TimetableVersion timetableVersion(JsonNode node) {
        return new TimetableVersion(
                text(node, "id"),
                text(node, "user_id"),
                text(node, "name") == null ? "" : text(node, "name"),
                TimetableStatus.parse(text(node, "status")),
                TimetableSource.parse(text(node, "source_type")),
                text(node, "source_path"),
                date(node, "effective_from"),
                date(node, "effective_until"),
                instant(node, "confirmed_at"),
                instant(node, "created_at"),
                instant(node, "updated_at"));
    }

    static TimetableEntry timetableEntry(JsonNode node) {
        return new TimetableEntry(
                text(node, "id"),
                text(node, "user_id"),
                text(node, "timetable_version_id"),
                text(node, "subject_id"),
                ActivityKind.parse(text(node, "activity_type")),
                text(node, "title"),
                node.path("day_of_week").asInt(),
                time(node, "start_time", null),
                time(node, "end_time", null),
                text(node, "room"),
                text(node, "teacher"),
                text(node, "confidence") == null
                        ? ExtractionConfidence.HIGH
                        : ExtractionConfidence.parse(text(node, "confidence")),
                instant(node, "created_at"),
                instant(node, "updated_at"));
    }

    static Assignment assignment(JsonNode node) {
        return new Assignment(
                text(node, "id"),
                text(node, "user_id"),
                text(node, "subject_id"),
                text(node, "title"),
                text(node, "description"),
                date(node, "due_date"),
                time(node, "due_time", null),
                TaskPriority.parse(text(node, "priority")),
                node.path("estimated_minutes").asInt(30),
                TaskStatus.parse(text(node, "status")),
                instant(node, "completed_at"),
                instant(node, "created_at"),
                instant(node, "updated_at"));
    }

    static RevisionTask revisionTask(JsonNode node) {
        return new RevisionTask(
                text(node, "id"),
                text(node, "user_id"),
                text(node, "subject_id"),
                text(node, "title"),
                text(node, "description"),
                date(node, "scheduled_date"),
                node.path("estimated_minutes").asInt(30),
                TaskPriority.parse(text(node, "priority")),
                TaskStatus.parse(text(node, "status")),
                instant(node, "completed_at"),
                instant(node, "created_at"),
                instant(node, "updated_at"));
    }

    // -----------------------------------------------------------------------

    /** Null for JSON null as well as for absent, which Jackson distinguishes. */
    private static String text(JsonNode node, String field) {
        JsonNode value = node.get(field);
        return value == null || value.isNull() ? null : value.asText();
    }

    /**
     * Postgres timestamptz arrives with an offset, so it is read as an
     * OffsetDateTime and reduced to an instant. Parsing it as a LocalDateTime
     * and assuming UTC is the mistake that puts an evening of work on the
     * wrong day.
     */
    private static Instant instant(JsonNode node, String field) {
        String value = text(node, field);
        if (value == null) return null;
        try {
            return OffsetDateTime.parse(value).toInstant();
        } catch (RuntimeException e) {
            try {
                return Instant.parse(value);
            } catch (RuntimeException alsoFailed) {
                return null;
            }
        }
    }

    private static LocalDate date(JsonNode node, String field) {
        String value = text(node, field);
        if (value == null) return null;
        try {
            return LocalDate.parse(value);
        } catch (RuntimeException e) {
            return null;
        }
    }

    /** Postgres sends HH:MM:SS; a profile written by an older build may send HH:MM. */
    private static LocalTime time(JsonNode node, String field, LocalTime fallback) {
        String value = text(node, field);
        if (value == null) return fallback;
        try {
            return LocalTime.parse(value.length() == 5 ? value + ":00" : value);
        } catch (RuntimeException e) {
            return fallback;
        }
    }
}
