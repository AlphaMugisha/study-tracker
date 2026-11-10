package flow.study.domain.timetable;

import flow.study.domain.model.ActivityKind;
import flow.study.domain.model.Subject;
import flow.study.domain.model.TimetableEntry;

/** A timetable row flattened for display: subject joined, times pre-formatted. */
public record ResolvedEntry(
        String id,
        ActivityKind activityType,
        /** Subject name for a lesson, otherwise the own title of the entry. */
        String label,
        /** Secondary line: room, teacher, or the subject when a title exists. */
        String detail,
        /**
         * Who teaches it, kept apart from detail.
         *
         * detail is a display string that may or may not be the teacher
         * depending on what else the row has, so anything needing the teacher
         * as a fact cannot read it.
         */
        String teacher,
        String subjectName,
        /** Lets a lesson link through to the homework for that subject. */
        String subjectId,
        String colorToken,
        String room,
        int dayOfWeek,
        int startMinutes,
        int endMinutes,
        String startLabel,
        String endLabel,
        int durationMinutes) {

    /**
     * Flatten a stored row.
     *
     * A lesson is named by its subject; anything else by its own title. When
     * a lesson also carries a title, the title becomes the detail line --
     * otherwise the room, and failing that the teacher.
     */
    public static ResolvedEntry of(TimetableEntry row, Subject subject) {
        int start = Times.toMinutes(row.startTime());
        int end = Times.toMinutes(row.endTime());
        String subjectName = subject == null ? null : subject.name();

        String label = subjectName != null ? subjectName
                : row.title() != null ? row.title()
                : "Untitled";

        String detail;
        if (subjectName != null && row.title() != null) {
            detail = row.title();
        } else {
            detail = row.room() != null ? row.room() : row.teacher();
        }

        return new ResolvedEntry(
                row.id(),
                row.activityType(),
                label,
                detail,
                row.teacher(),
                subjectName,
                row.subjectId(),
                subject == null ? null : subject.colorToken(),
                row.room(),
                row.dayOfWeek(),
                start,
                end,
                Times.label(start),
                Times.label(end),
                end - start);
    }

    public boolean overlaps(ResolvedEntry other) {
        return dayOfWeek == other.dayOfWeek
                && startMinutes < other.endMinutes
                && other.startMinutes < endMinutes;
    }
}
