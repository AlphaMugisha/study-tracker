package flow.study.domain.tasks;

import flow.study.domain.model.Subject;

/** Just enough of a subject to label and colour a row. */
public record SubjectRef(String id, String name, String colorToken) {
    public static SubjectRef of(Subject subject) {
        return subject == null ? null
                : new SubjectRef(subject.id(), subject.name(), subject.colorToken());
    }
}
