package flow.study.domain.tasks;

import flow.study.domain.model.RevisionTask;
import flow.study.domain.model.TaskStatus;

public record RevisionView(RevisionTask row, SubjectRef subject) {
    public String id() { return row.id(); }
    public String title() { return row.title(); }
    public TaskStatus status() { return row.status(); }
    public int estimatedMinutes() { return row.estimatedMinutes(); }
    public String subjectId() { return row.subjectId(); }
    public String subjectName() { return subject == null ? null : subject.name(); }
    public boolean done() { return row.status() == TaskStatus.COMPLETED; }
}
