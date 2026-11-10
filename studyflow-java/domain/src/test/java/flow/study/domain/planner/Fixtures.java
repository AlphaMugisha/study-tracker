package flow.study.domain.planner;

import flow.study.domain.model.ActivityKind;
import flow.study.domain.model.Assignment;
import flow.study.domain.model.RevisionTask;
import flow.study.domain.model.TaskPriority;
import flow.study.domain.model.TaskStatus;
import flow.study.domain.tasks.AssignmentView;
import flow.study.domain.tasks.RevisionView;
import flow.study.domain.tasks.SubjectRef;
import flow.study.domain.timetable.ResolvedEntry;

import java.time.LocalDate;
import java.time.LocalDateTime;
import java.util.List;
import java.util.Map;

/** The minimal shapes the planner reads, mirroring the .mjs test helpers. */
final class Fixtures {
    private Fixtures() {}

    static final int HOUR = 60;
    static final LocalDate DUE = LocalDate.parse("2026-10-01");
    static final SubjectRef MATHS = new SubjectRef("sub-maths", "Maths", "chart-1");

    static AssignmentView hw(String id, String title, int minutes) {
        return hw(id, title, minutes, DUE, false, TaskPriority.MEDIUM, TaskStatus.NOT_STARTED);
    }

    static AssignmentView hw(String id, String title, int minutes, boolean overdue) {
        return hw(id, title, minutes, DUE, overdue, TaskPriority.MEDIUM, TaskStatus.NOT_STARTED);
    }

    static AssignmentView hw(String id, String title, int minutes, LocalDate due,
                             boolean overdue, TaskPriority priority, TaskStatus status) {
        Assignment row = new Assignment(id, "user", MATHS.id(), title, null, due, null,
                priority, minutes, status, null, null, null);
        // overdue is passed rather than derived: these tests set it directly so
        // that the ordering rules can be exercised without moving the clock.
        return new AssignmentView(row, MATHS, overdue,
                LocalDateTime.of(due, row.dueTimeOrEndOfDay()));
    }

    static RevisionView rev(String id, String title, int minutes) {
        RevisionTask row = new RevisionTask(id, "user", MATHS.id(), title, null, null,
                minutes, TaskPriority.MEDIUM, TaskStatus.NOT_STARTED, null, null, null);
        return new RevisionView(row, MATHS);
    }

    /** The shape the suggester returns; the planner reads only these fields. */
    static StudySuggestion sug(String subject, int minutes) {
        return sug(subject, minutes, subject + " is on tomorrow timetable.");
    }

    static StudySuggestion sug(String subject, int minutes, String reason) {
        return new StudySuggestion("sub-" + subject, subject, "chart-1", minutes, 50,
                subject + ", ready for tomorrow", List.of(reason), null, null);
    }

    static ResolvedEntry entry(String id, int day, int start, int end, ActivityKind type,
                               String subjectId, String subjectName) {
        return new ResolvedEntry(id, type, subjectName != null ? subjectName : id, null, null,
                subjectName, subjectId, "chart-1", null, day, start, end,
                flow.study.domain.timetable.Times.label(start),
                flow.study.domain.timetable.Times.label(end), end - start);
    }

    /** Defaults matching BASE in test-planner.mjs: 15:00 bell, 30 settle, 21:00 cutoff. */
    static EveningPlanner.Request plan(List<AssignmentView> homework,
                                       List<RevisionView> revision,
                                       List<StudySuggestion> suggestions,
                                       int studyUntilMinutes,
                                       int nowMinutes) {
        return new EveningPlanner.Request(
                java.util.OptionalInt.of(15 * HOUR), 30, studyUntilMinutes,
                homework, revision, suggestions, nowMinutes);
    }

    static EveningPlanner.Request plan(List<AssignmentView> homework) {
        return plan(homework, List.of(), List.of(), 21 * HOUR, 0);
    }

    static Map<String, Integer> noSessions() {
        return Map.of();
    }
}
